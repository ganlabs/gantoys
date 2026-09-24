/**
 * Carrega uma página do projeto (app, toy ou bundle de teste) dentro do jsdom,
 * executando os scripts na ordem do documento e medindo cobertura.
 *
 * Por que não usar `runScripts: 'dangerously'`: o jsdom executaria os scripts
 * sem passar pela instrumentação e sem controle sobre `vendor/`. Aqui o HTML é
 * lido, os `<script>` são extraídos, o documento é parseado sem scripts
 * (`runScripts: 'outside-only'`) e cada script é executado por `vm.runInContext`
 * na ordem original — o que preserva a semântica do navegador, inclusive o
 * momento em que `DOMContentLoaded` dispara (os scripts rodam com o documento
 * ainda em `loading`).
 *
 * Blocos `<script type="text/markdown">` (manuais do toy de Ajuda) continuam no
 * DOM: não são executados, são dados.
 */

import { JSDOM, VirtualConsole } from 'jsdom';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { instrumentar } from './instrument.js';
import { aoFinalizar, coletar } from './coverage.js';
import { instalarAmbiente } from './ambiente.js';

export const RAIZ = path.resolve(import.meta.dirname, '..');

/**
 * Normaliza um valor vindo da página para objetos do realm do Node.
 *
 * Objetos criados dentro do jsdom têm outro `Object.prototype`, então
 * `assert.deepEqual` (strict) acusa "same structure but not reference-equal".
 * Passe o retorno de funções da página por aqui antes de comparar:
 *
 *   assert.deepEqual(puro(pagina.janela.runTool('x', texto, {})), { headers: [...], rows: [...] });
 */
export function puro(valor) {
    return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

// O jsdom recusa `localStorage` em origem opaca (`file://`), então a página roda
// em uma origem http fictícia. O esquema não entra em nenhuma decisão do código:
// o que importa é a resolução relativa, que continua igual à do projeto.
const ORIGEM = 'http://gan.localhost/';

const JANELAS_ABERTAS = new Set();
aoFinalizar(() => {
    for (const janela of JANELAS_ABERTAS) coletar(janela);
});

export function extrairScripts(html) {
    const scripts = [];
    const markup = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (todo, atributos, corpo) => {
        const tipo = (/\btype\s*=\s*["']([^"']+)["']/i.exec(atributos) || [])[1] || '';
        const ehJs = tipo === '' || /^(?:text\/javascript|application\/javascript|module)$/i.test(tipo);
        if (!ehJs) return todo;

        const src = (/\bsrc\s*=\s*["']([^"']+)["']/i.exec(atributos) || [])[1];
        if (src) scripts.push({ tipo: 'externo', src });
        else scripts.push({ tipo: 'inline', corpo });
        return '<!-- script controlado pelo harness -->';
    });
    return { markup, scripts };
}

function aguardarCarga(janela, limite = 2000) {
    return new Promise((resolve) => {
        if (janela.document.readyState === 'complete') {
            setTimeout(resolve, 0);
            return;
        }
        const temporizador = setTimeout(() => { janela.removeEventListener('load', aoCarregar); resolve(); }, limite);
        function aoCarregar() {
            clearTimeout(temporizador);
            resolve();
        }
        janela.addEventListener('load', aoCarregar, { once: true });
    });
}

/**
 * Compila os handlers inline (`onclick="fn()"`) dos elementos.
 *
 * O jsdom só compila atributo de evento quando roda os scripts por conta
 * própria; como aqui o HTML é parseado sem scripts, os handlers ficariam
 * inertes e o clique no botão do toy não faria nada — exatamente o caminho que
 * os testes precisam exercitar. Aqui o corpo do atributo é compilado no
 * contexto da página (para enxergar os globais do toy) e ligado ao evento.
 */
function compilarHandlersInline(janela, contexto, antesDe) {
    const ATRIBUTO = /^on([a-z]+)$/i;

    function compilar(elemento) {
        for (const atributo of [...elemento.attributes || []]) {
            const achado = ATRIBUTO.exec(atributo.name);
            if (!achado) continue;
            const corpo = atributo.value;
            if (!corpo || !corpo.trim()) continue;

            let manipulador;
            try {
                manipulador = vm.runInContext(
                    `(function (event) { ${corpo}\n })`,
                    contexto,
                    { filename: `${antesDe}#${atributo.name}` }
                );
            } catch (erro) {
                erro.message = `[handler ${atributo.name}] ${erro.message}`;
                throw erro;
            }

            elemento.addEventListener(achado[1], function (evento) {
                return manipulador.call(this, evento);
            });
        }
    }

    function compilarArvore(no) {
        if (no.nodeType !== 1) return;
        compilar(no);
        for (const descendente of no.querySelectorAll('*')) compilar(descendente);
    }

    compilarArvore(janela.document.documentElement);

    // Conteúdo criado depois (listas renderizadas pelo toy) também entra.
    new janela.MutationObserver((mutacoes) => {
        for (const mutacao of mutacoes) {
            for (const no of mutacao.addedNodes) compilarArvore(no);
        }
    }).observe(janela.document.documentElement, { childList: true, subtree: true });
}

export async function carregarPagina(relativo, opcoes = {}) {
    const arquivo = path.resolve(RAIZ, relativo);
    const html = readFileSync(arquivo, 'utf8');
    const { markup, scripts } = extrairScripts(html);

    const registros = [];
    const virtualConsole = new VirtualConsole();
    for (const nivel of ['error', 'warn', 'info', 'log', 'debug']) {
        virtualConsole.on(nivel, (...argumentos) => {
            registros.push({ nivel, texto: argumentos.map((valor) => String(valor)).join(' ') });
        });
    }
    if (opcoes.console === 'repassar') virtualConsole.sendTo(console);

    const dom = new JSDOM(markup, {
        url: `${ORIGEM}${relativo}`,
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole,
    });

    const janela = dom.window;
    const registro = instalarAmbiente(janela, opcoes);
    for (const [chave, valor] of Object.entries(opcoes.armazenamento || {})) {
        janela.localStorage.setItem(chave, String(valor));
    }
    for (const [nome, valor] of Object.entries(opcoes.globais || {})) janela[nome] = valor;
    if (typeof opcoes.preparar === 'function') opcoes.preparar(janela, registro);

    const ignorados = [];
    const contexto = dom.getInternalVMContext();
    const vendorLiberado = opcoes.vendor || [];

    for (const [indice, script] of scripts.entries()) {
        let codigo;
        let chave;
        let vendor = false;

        if (script.tipo === 'externo') {
            if (/^(?:https?:)?\/\//i.test(script.src)) {
                ignorados.push(script.src);
                continue;
            }
            const absoluto = path.resolve(path.dirname(arquivo), script.src);
            if (!existsSync(absoluto)) {
                ignorados.push(script.src);
                continue;
            }
            chave = path.relative(RAIZ, absoluto).split(path.sep).join('/');
            vendor = chave.startsWith('vendor/');
            if (vendor && !vendorLiberado.some((marca) => chave.startsWith(marca))) {
                ignorados.push(chave);
                continue;
            }
            codigo = readFileSync(absoluto, 'utf8');
        } else {
            chave = `${relativo}#script-${indice}`;
            codigo = script.corpo;
            if (!codigo.trim()) continue;
        }

        const fonte = opcoes.cobertura === false || vendor ? codigo : instrumentar(codigo, chave);
        try {
            vm.runInContext(fonte, contexto, { filename: chave });
        } catch (erro) {
            erro.message = `[${chave}] ${erro.message}`;
            throw erro;
        }
    }

    await aguardarCarga(janela);
    compilarHandlersInline(janela, contexto, relativo);
    JANELAS_ABERTAS.add(janela);

    const documento = janela.document;

    function elemento(seletor) {
        const encontrado = documento.querySelector(seletor);
        if (!encontrado) throw new Error(`Elemento não encontrado: ${seletor}`);
        return encontrado;
    }

    function eventos(nome) {
        const criar = {
            input: () => new janela.Event('input', { bubbles: true }),
            change: () => new janela.Event('change', { bubbles: true }),
            click: () => new janela.MouseEvent('click', { bubbles: true, cancelable: true }),
            keydown: (tecla) => new janela.KeyboardEvent('keydown', { key: tecla, bubbles: true, cancelable: true }),
        };
        return criar[nome];
    }

    const api = {
        relativo,
        arquivo,
        dom,
        janela,
        documento,
        registro,
        console: registros,
        ignorados,
        seletor: elemento,
        todos: (seletor) => Array.from(documento.querySelectorAll(seletor)),
        existe: (seletor) => Boolean(documento.querySelector(seletor)),
        texto: (seletor) => elemento(seletor).textContent.trim(),
        textos: (seletor) => Array.from(documento.querySelectorAll(seletor)).map((no) => no.textContent.trim()),
        html: (seletor) => elemento(seletor).innerHTML,
        atributo: (seletor, nome) => elemento(seletor).getAttribute(nome),
        clicar(seletor) {
            elemento(seletor).click();
        },
        digitar(seletor, valor) {
            const campo = elemento(seletor);
            campo.value = String(valor);
            campo.dispatchEvent(eventos('input')());
            campo.dispatchEvent(eventos('change')());
        },
        selecionar(seletor, valor) {
            const campo = elemento(seletor);
            campo.value = String(valor);
            campo.dispatchEvent(eventos('input')());
            campo.dispatchEvent(eventos('change')());
        },
        marcar(seletor) {
            elemento(seletor).click();
        },
        teclar(seletor, tecla) {
            elemento(seletor).dispatchEvent(eventos('keydown')(tecla));
        },
        disparar(seletor, tipo) {
            elemento(seletor).dispatchEvent(eventos(tipo)());
        },
        script(codigo, chave = `${relativo}#eval`) {
            return vm.runInContext(codigo, contexto, { filename: chave });
        },
        tick(ms = 0) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        },
        async aguardar(condicao, { descricao = 'condição', timeout = 3000, intervalo = 5 } = {}) {
            const limite = Date.now() + timeout;
            // Primeiro deixa a fila do toy drenar (promessas e timers de 0 ms):
            // sem isso, uma condição já verdadeira poderia ser lida antes de o
            // toy terminar de refletir a ação na tela.
            await new Promise((resolve) => setTimeout(resolve, 0));
            for (;;) {
                if (await condicao()) return true;
                if (Date.now() > limite) throw new Error(`Tempo esgotado aguardando ${descricao}.`);
                await new Promise((resolve) => setTimeout(resolve, intervalo));
            }
        },
        aguardarTexto(seletor, esperado, opcoes = {}) {
            return api.aguardar(
                () => {
                    const no = documento.querySelector(seletor);
                    return no && no.textContent.trim() === esperado;
                },
                { descricao: `${seletor} = ${JSON.stringify(esperado)}`, ...opcoes }
            );
        },
        mensagens: (nivel) => (nivel ? registros.filter((linha) => linha.nivel === nivel) : registros),
        cobertura() {
            coletar(janela);
            return janela.__gancov__ || {};
        },
        fechar() {
            coletar(janela);
            JANELAS_ABERTAS.delete(janela);
            janela.close();
        },
    };

    return api;
}
