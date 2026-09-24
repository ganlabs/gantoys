import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { carregarToy } from '../testkit/index.js';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_MANUAIS = path.join(RAIZ, 'toys', 'help', 'manual');

const ARQUIVOS = readdirSync(DIR_MANUAIS).filter((nome) => nome.endsWith('.md')).sort();
const SLUGS = ARQUIVOS.map((nome) => nome.replace(/\.md$/, ''));

function manualEmDisco(slug) {
    return readFileSync(path.join(DIR_MANUAIS, `${slug}.md`), 'utf8');
}

/** Título `# ` do arquivo (mesma normalização que o renderizador faz no inline). */
function tituloDoMarkdown(md) {
    const achado = md.match(/^#\s+(.+?)\s*$/m);
    return limparInline(achado ? achado[1] : '');
}

function titulosDeSecao(md, nivel) {
    const re = new RegExp(`^#{${nivel}}\\s+(.+?)\\s*$`, 'gm');
    return [...md.matchAll(re)].map((achado) => limparInline(achado[1]));
}

function limparInline(texto) {
    return texto.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
}

/** Manuais sintéticos: mesmo caminho de um manual real, plantados antes do toy rodar. */
function plantarManuais(janela, extras) {
    const documento = janela.document;
    const grade = documento.getElementById('manualGrid');

    for (const [slug, extra] of Object.entries(extras)) {
        if (extra.card !== false) {
            const card = documento.createElement('button');
            card.className = 'tile manual-card';
            card.type = 'button';
            card.dataset.manual = slug;
            if (!extra.semIcone) {
                const icone = documento.createElement('i');
                icone.className = 'bi bi-journal-text';
                icone.setAttribute('aria-hidden', 'true');
                card.appendChild(icone);
            }
            const rotulo = documento.createElement('span');
            rotulo.className = 'manual-card-title';
            rotulo.textContent = slug;
            card.appendChild(rotulo);
            if (extra.semFoco) Object.defineProperty(card, 'focus', { value: undefined, configurable: true });
            grade.appendChild(card);
        }

        if (extra.md) {
            const bloco = documento.createElement('script');
            bloco.type = 'text/markdown';
            bloco.dataset.manual = slug;
            if (extra.titulo !== undefined) bloco.dataset.title = extra.titulo;
            bloco.textContent = `\n${extra.md}\n`;
            documento.body.appendChild(bloco);
        }
    }
}

async function abrirAjuda(t, extras = null) {
    const pagina = await carregarToy('help', extras ? { preparar: (janela) => plantarManuais(janela, extras) } : {});
    t.after(() => pagina.fechar());
    return pagina;
}

function slugsDaGrade(pagina) {
    return pagina.todos('#manualGrid [data-manual]').map((card) => card.dataset.manual);
}

function slugsDoIndice(pagina) {
    return pagina.todos('.manual-nav-item').map((botao) => botao.dataset.manual);
}

function slugsEmbutidos(pagina) {
    return pagina.todos('script[type="text/markdown"]').map((no) => no.dataset.manual);
}

function fecharPorEsc(pagina) {
    pagina.teclar('body', 'Escape');
}

// ---------------------------------------------------------------------------
// Grade, blocos embutidos e índice
// ---------------------------------------------------------------------------

test('Ajuda — cada card da grade casa com um bloco de manual embutido', async (t) => {
    const pagina = await abrirAjuda(t);

    const naGrade = slugsDaGrade(pagina);
    assert.equal(SLUGS.length, 17, 'a Ajuda publica um manual por arquivo de toys/help/manual');
    assert.equal(naGrade.length, SLUGS.length);
    assert.deepEqual([...naGrade].sort(), SLUGS, 'um card por arquivo de toys/help/manual');
    assert.deepEqual(slugsEmbutidos(pagina).sort(), SLUGS, 'um <script type="text/markdown"> por manual');
    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — o índice do popup repete a grade em ordem, com o mesmo ícone e título', async (t) => {
    const pagina = await abrirAjuda(t);

    const naGrade = slugsDaGrade(pagina);
    assert.deepEqual(slugsDoIndice(pagina), naGrade, 'mesma ordem da grade');

    for (const slug of naGrade) {
        const card = pagina.seletor(`#manualGrid [data-manual="${slug}"]`);
        const botao = pagina.seletor(`.manual-nav-item[data-manual="${slug}"]`);
        assert.equal(botao.querySelector('i').className, card.querySelector('i').className, `ícone de ${slug}`);
        assert.equal(botao.querySelector('i').getAttribute('aria-hidden'), 'true');
        assert.equal(botao.textContent, card.querySelector('.manual-card-title').textContent, `título de ${slug}`);
    }
});

// ---------------------------------------------------------------------------
// Abrir, trocar, fechar
// ---------------------------------------------------------------------------

test('Ajuda — abrir pelo card move cabeçalho, h1 e item ativo juntos', async (t) => {
    const pagina = await abrirAjuda(t);
    const artigo = pagina.seletor('#manualContent');

    assert.equal(pagina.texto('#manualTitle'), 'Manual');
    assert.deepEqual(pagina.todos('.manual-nav-item.active'), []);
    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay');
    assert.equal(pagina.documento.body.className, '');

    pagina.clicar('#manualGrid [data-manual="ganjuntar"]');

    assert.equal(pagina.texto('#manualTitle'), 'Juntar PDFs');
    assert.equal(pagina.texto('#manualContent h1'), 'Juntar PDFs');
    assert.deepEqual(pagina.todos('.manual-nav-item.active').map((b) => b.dataset.manual), ['ganjuntar']);
    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay open');
    assert.equal(pagina.documento.body.className, 'modal-aberto');
    assert.equal(artigo.scrollTop, 0);
    assert.equal(pagina.documento.activeElement, pagina.seletor('#manualClose'));
    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — o índice troca de manual sem fechar e zera o scroll do artigo', async (t) => {
    const pagina = await abrirAjuda(t);
    const artigo = pagina.seletor('#manualContent');

    pagina.clicar('#manualGrid [data-manual="ganjuntar"]');
    artigo.scrollTop = 240;
    assert.equal(artigo.scrollTop, 240);

    pagina.clicar('.manual-nav-item[data-manual="ganpdf"]');

    assert.equal(pagina.texto('#manualTitle'), 'Divisor de PDF');
    assert.equal(pagina.texto('#manualContent h1'), 'Divisor de PDF');
    assert.deepEqual(pagina.todos('.manual-nav-item.active').map((b) => b.dataset.manual), ['ganpdf']);
    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay open');
    assert.equal(artigo.scrollTop, 0);
    assert.equal(pagina.documento.activeElement, pagina.seletor('#manualClose'), 'abrir sempre deixa o foco no botão de fechar');
    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — Esc e o botão fecham o popup e devolvem o foco a quem abriu', async (t) => {
    const pagina = await abrirAjuda(t);
    const card = pagina.seletor('#manualGrid [data-manual="ganpdf"]');
    const overlay = pagina.seletor('#manualOverlay');

    pagina.clicar('#manualGrid [data-manual="ganpdf"]');
    fecharPorEsc(pagina);
    assert.equal(overlay.className, 'modal-overlay');
    assert.equal(pagina.documento.body.className, '');
    assert.equal(pagina.documento.activeElement, card);

    pagina.clicar('.manual-nav-item[data-manual="ganjuntar"]');
    const botaoDoIndice = pagina.seletor('.manual-nav-item[data-manual="ganjuntar"]');
    pagina.clicar('#manualClose');
    assert.equal(overlay.className, 'modal-overlay');
    assert.equal(pagina.documento.body.className, '');
    assert.equal(pagina.documento.activeElement, botaoDoIndice);
    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — a tecla que não é Esc não fecha o popup', async (t) => {
    const pagina = await abrirAjuda(t);

    pagina.clicar('#manualGrid [data-manual="ganjuntar"]');
    pagina.teclar('body', 'Enter');

    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay open');
    assert.deepEqual(pagina.todos('.manual-nav-item.active').map((b) => b.dataset.manual), ['ganjuntar']);
});

test('Ajuda — clique no fundo do overlay fecha; clique dentro do modal não', async (t) => {
    const pagina = await abrirAjuda(t);
    const overlay = pagina.seletor('#manualOverlay');
    const card = pagina.seletor('#manualGrid [data-manual="ganjuntar"]');

    pagina.clicar('#manualGrid [data-manual="ganjuntar"]');
    pagina.clicar('.modal-title');
    assert.equal(overlay.className, 'modal-overlay open', 'o modal ocupa o centro: clicar nele não fecha');

    // Clique nas coordenadas do fundo (4,4), fora da caixa do modal.
    overlay.dispatchEvent(new pagina.janela.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 4, clientY: 4 }));

    assert.equal(overlay.className, 'modal-overlay');
    assert.equal(pagina.documento.body.className, '');
    assert.equal(pagina.documento.activeElement, card);
    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — Esc com o popup já fechado não mexe na tela', async (t) => {
    const pagina = await abrirAjuda(t);

    fecharPorEsc(pagina);

    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay');
    assert.equal(pagina.documento.body.className, '');
    assert.equal(pagina.texto('#manualTitle'), 'Manual');
    assert.deepEqual(pagina.todos('.manual-nav-item.active'), []);
    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — clique no vão da grade ou do índice não abre nada', async (t) => {
    const pagina = await abrirAjuda(t);

    pagina.clicar('#manualGrid');
    pagina.clicar('#manualNav');

    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay');
    assert.equal(pagina.texto('#manualTitle'), 'Manual');
    assert.deepEqual(pagina.mensagens(), []);
});

// ---------------------------------------------------------------------------
// Integridade da página contra os arquivos de manual em disco
// ---------------------------------------------------------------------------

test('Ajuda — o manual renderizado traz exatamente os títulos de seção do .md em disco', async (t) => {
    const pagina = await abrirAjuda(t);

    const vistos = [];
    for (const slug of slugsDaGrade(pagina)) {
        const md = manualEmDisco(slug);
        pagina.clicar(`#manualGrid [data-manual="${slug}"]`);

        const titulo = tituloDoMarkdown(md);
        assert.equal(pagina.texto('#manualContent h1'), titulo, `h1 de ${slug}`);
        assert.equal(pagina.texto('#manualTitle'), titulo, `cabeçalho de ${slug}`);
        assert.equal(pagina.texto(`#manualGrid [data-manual="${slug}"] .manual-card-title`), titulo, `card de ${slug}`);
        assert.deepEqual(pagina.textos('#manualContent h2'), titulosDeSecao(md, 2), `h2 de ${slug}`);
        assert.deepEqual(pagina.textos('#manualContent h3'), titulosDeSecao(md, 3), `h3 de ${slug}`);
        vistos.push(slug);
    }

    assert.equal(vistos.length, SLUGS.length);
    assert.deepEqual([...vistos].sort(), SLUGS);
});

// ---------------------------------------------------------------------------
// Markdown: construções usadas nos manuais
// ---------------------------------------------------------------------------

const MD_ESTRUTURAS = [
    '# Manual de Teste',
    '',
    'Parágrafo com `código` e **negrito**, com <b>html cru</b> e & comercial.',
    'Segunda linha do mesmo parágrafo.',
    '',
    '## Seção dois',
    '',
    '### Seção três',
    '',
    '#### Nível quatro',
    '',
    '- item um',
    '- item **dois**',
    '    - subitem indentado',
    '',
    '1. primeiro',
    '3. segundo',
    '',
    '> citação',
    '> em duas linhas',
    '',
    '---',
    '',
    '```',
    'bloco',
    '  de código <tag> & "aspas"',
    '```',
    '',
    '[link](x.html) e **`negrito com código`**',
    '',
    '***',
    '',
    'Fim.',
].join('\n');

const ESPERADO_ESTRUTURAS = [
    '<h1>Manual de Teste</h1>',
    '<p>Parágrafo com <code>código</code> e <strong>negrito</strong>, com &lt;b&gt;html cru&lt;/b&gt; e &amp; comercial. Segunda linha do mesmo parágrafo.</p>',
    '<h2>Seção dois</h2>',
    '<h3>Seção três</h3>',
    '<h4>Nível quatro</h4>',
    '<ul>',
    '<li>item um</li>',
    '<li>item <strong>dois</strong></li>',
    '<li>subitem indentado</li>',
    '</ul>',
    '<ol>',
    '<li>primeiro</li>',
    '<li>segundo</li>',
    '</ol>',
    '<blockquote><p>citação em duas linhas</p></blockquote>',
    '<hr>',
    '<pre><code>bloco\n  de código &lt;tag&gt; &amp; "aspas"</code></pre>',
    '<p><a href="x.html">link</a> e <strong><code>negrito com código</code></strong></p>',
    '<hr>',
    '<p>Fim.</p>',
].join('\n');

const MD_INDENTADO = [
    '# Indentado',
    '',
    'Parágrafo normal.',
    '    continuação indentada.',
    '',
    '    # título indentado',
    '',
    '    - item indentado',
    '',
    'fim',
].join('\n');

const ESPERADO_INDENTADO = [
    '<h1>Indentado</h1>',
    '<p>Parágrafo normal.     continuação indentada.</p>',
    '<p>    # título indentado</p>',
    '<ul>',
    '<li>item indentado</li>',
    '</ul>',
    '<p>fim</p>',
].join('\n');

const MD_CERCA_ABERTA = ['# Cerca aberta', '', 'Texto antes.', '', '```', 'linha um', '  linha dois'].join('\n');

const ESPERADO_CERCA_ABERTA = [
    '<h1>Cerca aberta</h1>',
    '<p>Texto antes.</p>',
    '<pre><code>linha um\n  linha dois</code></pre>',
].join('\n');

test('Ajuda — o renderizador produz as tags de cada construção do Markdown', async (t) => {
    const pagina = await abrirAjuda(t, {
        estruturas: { md: MD_ESTRUTURAS, titulo: 'Manual de Teste' },
        indentado: { md: MD_INDENTADO, titulo: 'Indentado' },
        cercaAberta: { md: MD_CERCA_ABERTA, titulo: 'Cerca aberta' },
    });

    for (const [slug, esperado] of [
        ['estruturas', ESPERADO_ESTRUTURAS],
        ['indentado', ESPERADO_INDENTADO],
        ['cercaAberta', ESPERADO_CERCA_ABERTA],
    ]) {
        pagina.clicar(`#manualGrid [data-manual="${slug}"]`);

        assert.equal(pagina.html('#manualContent'), esperado, `markdown de ${slug}`);
        assert.equal(pagina.existe('#manualContent b'), false, 'o HTML cru do manual sai escapado');
        assert.equal(pagina.texto('#manualTitle'), pagina.seletor(`script[type="text/markdown"][data-manual="${slug}"]`).dataset.title);
    }

    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — manual sem data-title usa o slug no índice e no cabeçalho', async (t) => {
    const pagina = await abrirAjuda(t, {
        semTitulo: { md: '# Sem título embutido\n\nCorpo.' },
    });

    const botao = pagina.seletor('.manual-nav-item[data-manual="semTitulo"]');
    assert.equal(botao.textContent, 'semTitulo');

    pagina.clicar('#manualGrid [data-manual="semTitulo"]');
    assert.equal(pagina.texto('#manualTitle'), 'semTitulo');
    assert.equal(pagina.texto('#manualContent h1'), 'Sem título embutido');
});

test('Ajuda — card sem manual embutido não entra no índice nem abre', async (t) => {
    const pagina = await abrirAjuda(t, {
        orfao: { card: true },
    });

    assert.deepEqual(slugsDaGrade(pagina).slice(-1), ['orfao']);
    assert.equal(pagina.existe('.manual-nav-item[data-manual="orfao"]'), false);
    assert.equal(slugsDoIndice(pagina).length, SLUGS.length);

    pagina.clicar('#manualGrid [data-manual="orfao"]');

    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay');
    assert.equal(pagina.texto('#manualTitle'), 'Manual');
    assert.equal(pagina.documento.body.className, '');
});

test('Ajuda — card sem ícone entra no índice só com o título', async (t) => {
    const pagina = await abrirAjuda(t, {
        semIcone: { md: '# Sem ícone\n\nCorpo.', titulo: 'Sem ícone', semIcone: true },
    });

    const botao = pagina.seletor('.manual-nav-item[data-manual="semIcone"]');
    assert.equal(botao.querySelector('i'), null);
    assert.equal(botao.textContent, 'Sem ícone');
    assert.deepEqual(slugsDoIndice(pagina).slice(-1), ['semIcone']);
});

test('Ajuda — abrir por um card que não aceita foco ainda fecha sem erro', async (t) => {
    const pagina = await abrirAjuda(t, {
        semFoco: { md: '# Sem foco\n\nCorpo.', titulo: 'Sem foco', semFoco: true },
    });

    const card = pagina.seletor('#manualGrid [data-manual="semFoco"]');
    pagina.clicar('#manualGrid [data-manual="semFoco"]');
    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay open');

    fecharPorEsc(pagina);

    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay');
    assert.equal(pagina.documento.body.className, '');
    assert.notEqual(pagina.documento.activeElement, card);
    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — sem o índice na página o toy não arma nada', async (t) => {
    const pagina = await carregarToy('help', {
        preparar(janela) {
            janela.document.getElementById('manualNav').remove();
        },
    });
    t.after(() => pagina.fechar());

    pagina.clicar('#manualGrid [data-manual="ganjuntar"]');

    assert.equal(pagina.existe('#manualNav'), false);
    assert.equal(pagina.todos('.manual-nav-item').length, 0);
    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay');
    assert.equal(pagina.texto('#manualTitle'), 'Manual');
    assert.equal(pagina.documento.body.className, '');
    assert.deepEqual(pagina.mensagens(), []);
});

test('Ajuda — o popup funciona com o tema guardado e com a troca de tema do app', async (t) => {
    // Dentro do app a Ajuda leva tema salvo no carregamento e recebe novas
    // mensagens de tema com a página já aberta; o popup não pode sentir nada.
    const pagina = await carregarToy('help', {
        armazenamento: { theme: 'light', visual: 'japandi', gantoys_theme_css: '.marca{color:#fff}' },
    });
    t.after(() => pagina.fechar());

    const enviarTema = (dados) => pagina.janela.dispatchEvent(
        new pagina.janela.MessageEvent('message', { data: dados })
    );

    assert.equal(pagina.documento.documentElement.getAttribute('data-theme'), 'light');
    enviarTema({ type: 'theme', theme: 'dark', visual: 'material', css: '.a{}' });
    enviarTema({ type: 'theme' });
    enviarTema({ type: 'outro' });

    assert.equal(pagina.documento.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(pagina.documento.documentElement.getAttribute('data-visual'), 'material');
    assert.equal(pagina.documento.getElementById('gantoys-theme-inject').textContent, '.a{}');

    assert.equal(slugsDaGrade(pagina).length, SLUGS.length);
    pagina.clicar('#manualGrid [data-manual="ganjuntar"]');
    assert.equal(pagina.texto('#manualTitle'), 'Juntar PDFs');
    assert.equal(pagina.texto('#manualContent h1'), 'Juntar PDFs');

    fecharPorEsc(pagina);
    assert.equal(pagina.seletor('#manualOverlay').className, 'modal-overlay');
    assert.equal(pagina.documento.body.className, '');
    assert.deepEqual(pagina.mensagens(), []);
});
