/**
 * Golden de comportamento dos toys de texto.
 *
 * Os oito toys de transformação carregam o mesmo kit. Antes de consolidar esse
 * kit em `toys/shared/kit.js`, o comportamento atual é congelado aqui: uma
 * entrada por caso, aplicada pela INTERFACE REAL (textarea + botão + campos) e
 * registrada como a tabela que a tela mostra (cabeçalhos, linhas e resumo).
 *
 * É o guarda-chuva de regressão desses toys: qualquer mudança de resultado —
 * ordem, separador, maiúsculas, valor vazio, linha descartada — aparece como
 * diferença contra o golden.
 *
 * Regravar (só quando a mudança de comportamento for intencional):
 *   GANTOYS_ATUALIZAR_GOLDEN=1 node --test test/toys/texto-corpus.test.js
 */

import { carregarToy } from './toy.js';

/** Casos por toy: `entrada` vai para o textarea, `campos` ajusta os controles antes de rodar. */
export const CASOS = {
    ganclassificadorvara: [
        { entrada: '1ª VARA CÍVEL DA COMARCA DE SÃO PAULO/SP' },
        { entrada: 'JUIZADO ESPECIAL CÍVEL DA COMARCA DE CAMPINAS/SP' },
        { entrada: 'VARA DO TRABALHO DE CAMPINAS/SP' },
        { entrada: '2ª VARA DE FAMÍLIA E SUCESSÕES DA COMARCA DO RIO DE JANEIRO/RJ' },
        { entrada: 'VARA ÚNICA DA COMARCA DE UBERLÂNDIA/MG' },
        { entrada: 'texto solto\n\n  ' },
        { entrada: '' },
    ],
    ganconverterrito: [
        { entrada: 'VC' },
        { entrada: 'JEC' },
        { entrada: 'vc\njec\noutro' },
        { entrada: '' },
    ],
    ganextratorvalores: [
        { entrada: 'R$ 1.234,56' },
        { entrada: '1234.56' },
        { entrada: '1,234.56' },
        { entrada: '10,00' },
        { entrada: 'texto|99,90' },
        { entrada: 'abc\n\n  7' },
    ],
    gannormalizadordocumentos: [
        { entrada: '12345678901' },
        { entrada: '12.345.678/0001-99' },
        { entrada: '111.222.333-44|extra' },
        { entrada: '123' },
        { entrada: 'abc' },
        { entrada: '' },
    ],
    gannormalizadornomes: [
        { entrada: 'João da Silva|123' },
        { entrada: 'MARIA\tAutor' },
        { entrada: 'ACME LTDA\tSEM ADV\tSEM OAB\tSEM UF' },
        { entrada: 'José;sufixo' },
        { entrada: '  João   da Silva  ' },
        { entrada: 'A\tB\tC' },
    ],
    gannormalizadoriris: [
        { entrada: 'IRIS00998585' },
        { entrada: 'iris-000123' },
        { entrada: 'IRIS 0025' },
        { entrada: 'IRIS000' },
        { entrada: '000123' },
        { entrada: 'IRISIRIS001\nIRIS PASTA 01' },
    ],
    ganresolvercarteirareu: [
        { entrada: 'MERCADO LIVRE VC' },
        { entrada: 'ML JEC' },
        { entrada: 'BRK RECIFE' },
        { entrada: 'PROLAGOS' },
        { entrada: 'NATURGY' },
        { entrada: 'desconhecido total' },
        { entrada: '' },
    ],
    ganremovedorsufixouf: [
        { entrada: 'PROC-1-PI' },
        { entrada: 'A-B-C\nsem-sufixo' },
        { entrada: 'PROC-1-PI', campos: { '#toolInput': 'PROC-1-PI', '[name="mode"]': 'replace', '[name="replacement"]': 'X' } },
        { entrada: 'arquivo.pdf\noutro.txt', campos: { '#toolInput': 'arquivo.pdf\noutro.txt', '[name="pattern"]': '*.pdf' } },
    ],
};

/** Aplica os campos extras do caso (por seletor) antes de processar. */
function aplicarCampos(pagina, campos = {}) {
    for (const [seletor, valor] of Object.entries(campos)) {
        if (seletor === '#toolInput') continue;
        const elemento = pagina.seletor(seletor);
        if (elemento.tagName === 'SELECT' || elemento.tagName === 'INPUT' || elemento.tagName === 'TEXTAREA') {
            pagina.selecionar(seletor, valor);
        }
    }
}

/** Devolve os controles do toy ao estado inicial entre um caso e outro. */
function resetarCampos(pagina) {
    for (const campo of pagina.todos('#settings input, #settings select, #settings textarea')) {
        if (campo.type === 'checkbox' || campo.type === 'radio') campo.checked = campo.defaultChecked;
        else campo.value = campo.defaultValue;
        campo.dispatchEvent(new pagina.janela.Event('change', { bubbles: true }));
    }
    pagina.digitar('#toolInput', '');
}

/** Roda um caso pela interface e devolve exatamente o que a tela mostrou. */
function capturarCaso(pagina, caso) {
    resetarCampos(pagina);
    aplicarCampos(pagina, caso.campos);
    pagina.digitar('#toolInput', caso.entrada);
    pagina.clicar('#runButton');

    const cabecalhos = pagina.textos('.results-table thead th');
    const linhas = pagina.todos('.results-table tbody tr').map((linha) => (
        Array.from(linha.querySelectorAll('td')).map((celula) => celula.textContent.trim())
    ));

    return {
        entrada: caso.entrada,
        campos: caso.campos
            ? Object.fromEntries(Object.entries(caso.campos).filter(([seletor]) => seletor !== '#toolInput'))
            : {},
        resumo: pagina.existe('#resultSummary') ? pagina.texto('#resultSummary') : '',
        erro: pagina.existe('#errorMessage') && !pagina.seletor('#errorMessage').classList.contains('hidden')
            ? pagina.texto('#errorMessage')
            : '',
        cabecalhos,
        linhas,
    };
}

/** Coleta o comportamento atual de todos os toys com golden definido. */
export async function coletarGoldens() {
    const saida = {};
    for (const [slug, casos] of Object.entries(CASOS)) {
        const pagina = await carregarToy(slug);
        try {
            saida[slug] = casos.map((caso) => capturarCaso(pagina, caso));
        } finally {
            pagina.fechar();
        }
    }
    return saida;
}
