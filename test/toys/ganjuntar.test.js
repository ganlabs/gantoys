import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    carregarToy,
    enfileirarPastas,
    montarArvore,
    desativarSeletorDePasta,
    falharSeletorDePasta,
} from '../../testkit/index.js';

const AVISO_VAZIO = 'Nenhum PDF encontrado na pasta selecionada.';
const AVISO_SELETOR = 'showDirectoryPicker indisponível, usando o seletor de pasta do navegador:';

/**
 * O `pdf-lib` do toy compara os bytes com o `instanceof Uint8Array` do realm da
 * página. O `File` do Node devolveria um ArrayBuffer de outro realm e o PDF
 * seria recusado; usar a classe do jsdom faz a leitura chegar no formato que o
 * toy espera (é o mesmo File que o navegador entrega).
 */
function lerArquivosComoOPagina(pagina, t) {
    const anterior = globalThis.File;
    globalThis.File = pagina.janela.File;
    t.after(() => { globalThis.File = anterior; });
}

/** Cria um PDF de verdade dentro da página e devolve os bytes no realm do Node. */
async function criarPdf(pagina, lados) {
    pagina.janela.__ganLados = JSON.stringify(lados);
    const bytes = await pagina.script(`(async () => {
        const doc = await PDFLib.PDFDocument.create();
        for (const [largura, altura] of JSON.parse(window.__ganLados)) doc.addPage([largura, altura]);
        return Array.from(await doc.save());
    })()`);
    return Uint8Array.from(bytes);
}

/** Tamanho de cada página (largura, altura) do PDF entregue, carregado de volta. */
async function paginasDoPdf(pagina, fonte) {
    pagina.janela.__ganFonte = fonte;
    const lados = await pagina.script(`(async () => {
        const fonte = window.__ganFonte;
        const bytes = typeof fonte.arrayBuffer === 'function' ? await fonte.arrayBuffer() : Uint8Array.from(fonte);
        const pdf = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        return pdf.getPages().map((pagina) => [Math.round(pagina.getWidth()), Math.round(pagina.getHeight())]);
    })()`);
    // As listas vêm do realm da página: copiar para o realm do Node deixa a comparação exata válida.
    return Array.from(lados, (par) => [Number(par[0]), Number(par[1])]);
}

/** Trechos visíveis de cada item da seção Resultados. */
function resultados(pagina) {
    return {
        nomes: pagina.textos('#resultsList .result-name'),
        estados: pagina.textos('#resultsList .result-status'),
        metas: pagina.textos('#resultsList .result-meta'),
        links: pagina.todos('#resultsList .result-name').map((no) => no.getAttribute('href')),
        itens: pagina.todos('#resultsList .result-item').map((no) => no.className),
    };
}

async function abrirToy(t, opcoes = {}) {
    const pagina = await carregarToy('ganjuntar', opcoes);
    t.after(() => pagina.fechar());
    return pagina;
}

/** Árvore padrão: subpastas fora de ordem, arquivos fora de ordem e ruído. */
async function arvorePadrao(pagina) {
    return montarArvore('Origem', {
        'Zeta/z2.pdf': await criarPdf(pagina, [[910, 910]]),
        'Zeta/z1.pdf': await criarPdf(pagina, [[900, 900]]),
        'Ávila/b.pdf': await criarPdf(pagina, [[100, 100], [110, 110]]),
        'Ávila/a.pdf': await criarPdf(pagina, [[120, 120]]),
        'Ávila/Integral_antigo.pdf': await criarPdf(pagina, [[130, 130]]),
        'Beta/b.pdf': await criarPdf(pagina, [[200, 200]]),
        'Vazia/nota.txt': 'sem PDF aqui',
        'Vazia/fundo/x.pdf': await criarPdf(pagina, [[140, 140]]),
        'solta.pdf': await criarPdf(pagina, [[700, 700]]),
    });
}

/** Arquivos entregues pelo seletor clássico (sem File System Access API). */
async function arquivosClassicos(pagina, caminhos) {
    pagina.janela.__ganCaminhos = JSON.stringify(caminhos);
    return pagina.script(`(() => {
        const arquivos = JSON.parse(window.__ganCaminhos).map((caminho) => {
            const arquivo = new File([Uint8Array.from(caminho.bytes)], caminho.nome, { type: caminho.tipo || 'application/pdf' });
            Object.defineProperty(arquivo, 'webkitRelativePath', { value: caminho.caminho });
            return arquivo;
        });
        const lista = arquivos.slice();
        lista.item = (indice) => arquivos[indice];
        return lista;
    })()`);
}

function definirArquivos(pagina, arquivos) {
    Object.defineProperty(pagina.seletor('#folderInput'), 'files', { value: arquivos, configurable: true });
    pagina.disparar('#folderInput', 'change');
}

test('ganjuntar — estado inicial: nada selecionado, resultado escondido e botão de juntar desabilitado', async (t) => {
    const pagina = await abrirToy(t);

    assert.equal(pagina.texto('#folderBtn'), 'Selecionar Pasta');
    assert.equal(pagina.seletor('#folderBtn').classList.contains('selected'), false);
    assert.equal(pagina.seletor('#mergeBtn').disabled, true);
    assert.equal(pagina.texto('#mergeBtn'), 'Juntar PDFs');
    assert.equal(pagina.seletor('#folderInfo').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#subfoldersList').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#results').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#progressContainer').classList.contains('visible'), false);
    assert.equal(pagina.texto('#folderCount'), '0');
    assert.equal(pagina.texto('#pdfCount'), '0');
    assert.equal(pagina.texto('#progressCurrent'), '-');
    assert.equal(pagina.texto('#progressPercent'), '0%');
    assert.equal(pagina.texto('#progressDetail'), '-');
    assert.equal(pagina.seletor('#progressFill').style.width, '');
    assert.equal(pagina.seletor('#folderInput').hasAttribute('webkitdirectory'), true);
    assert.equal(pagina.seletor('#folderInput').getAttribute('accept'), '.pdf,application/pdf');

    // Chamar a união sem nenhuma pasta selecionada não produz nada.
    pagina.disparar('#mergeBtn', 'click');
    await pagina.tick(20);
    assert.equal(pagina.seletor('#results').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#progressContainer').classList.contains('visible'), false);
});

test('ganjuntar — agrupa por subpasta, ordena em pt-BR, ignora Integral_ e descarta subpastas sem PDF', async (t) => {
    const pagina = await abrirToy(t);
    const origem = await arvorePadrao(pagina);
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.texto('#pdfCount') === '5', { descricao: 'contadores preenchidos' });

    assert.equal(pagina.texto('#folderPath'), 'Origem');
    assert.equal(pagina.texto('#folderBtn'), 'Origem');
    assert.equal(pagina.seletor('#folderBtn').classList.contains('selected'), true);
    assert.equal(pagina.seletor('#folderInfo').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#folderCount'), '3');
    assert.equal(pagina.texto('#pdfCount'), '5');
    assert.equal(pagina.seletor('#mergeBtn').disabled, false);

    assert.equal(pagina.seletor('#subfoldersList').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#subfoldersList .section-title'), 'Subpastas');
    assert.deepEqual(pagina.textos('#subfoldersList .tile span:first-child'), ['Ávila', 'Beta', 'Zeta']);
    assert.deepEqual(pagina.textos('#subfoldersList .tile .badge'), ['2', '1', '2']);

    // Nada foi gravado só por selecionar a pasta.
    assert.deepEqual(origem.escritas, []);
});

test('ganjuntar — grava <subpasta>.pdf na raiz, com as páginas na ordem dos arquivos e o rótulo de progresso', async (t) => {
    const pagina = await abrirToy(t);
    lerArquivosComoOPagina(pagina, t);
    const origem = await arvorePadrao(pagina);
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.texto('#pdfCount') === '5', { descricao: 'contadores preenchidos' });

    pagina.clicar('#mergeBtn');

    // O processamento começa antes do primeiro await: a barra aparece e o botão trava.
    assert.equal(pagina.seletor('#progressContainer').classList.contains('visible'), true);
    assert.equal(pagina.seletor('#mergeBtn').disabled, true);
    assert.equal(pagina.seletor('#results').classList.contains('hidden'), true);
    assert.equal(pagina.texto('#progressCurrent'), 'Ávila');
    assert.equal(pagina.texto('#progressDetail'), '0/2 PDFs');

    await pagina.aguardar(() => !pagina.seletor('#results').classList.contains('hidden'), { descricao: 'resultados' });

    // Barra de progresso em repouso depois do fim.
    assert.equal(pagina.seletor('#progressContainer').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#mergeBtn').disabled, false);
    assert.equal(pagina.texto('#progressCurrent'), 'Zeta');
    assert.equal(pagina.texto('#progressPercent'), '100%');
    assert.equal(pagina.texto('#progressDetail'), '2/2 - z2.pdf');
    assert.equal(pagina.seletor('#progressFill').style.width, '100%');

    // Um arquivo por subpasta, na raiz da pasta escolhida, na ordem das subpastas.
    assert.deepEqual(origem.escritas, ['Ávila.pdf', 'Beta.pdf', 'Zeta.pdf']);
    assert.deepEqual(origem.caminhos(), [
        'Beta.pdf',
        'Beta/b.pdf',
        'Vazia/fundo/x.pdf',
        'Vazia/nota.txt',
        'Zeta.pdf',
        'Zeta/z1.pdf',
        'Zeta/z2.pdf',
        'solta.pdf',
        'Ávila.pdf',
        'Ávila/Integral_antigo.pdf',
        'Ávila/a.pdf',
        'Ávila/b.pdf',
    ]);

    // O PDF gravado é um PDF válido, com as páginas dos arquivos em ordem alfabética.
    assert.deepEqual(await paginasDoPdf(pagina, origem.paraObjeto()['Ávila.pdf']), [[120, 120], [100, 100], [110, 110]]);
    assert.deepEqual(await paginasDoPdf(pagina, origem.paraObjeto()['Beta.pdf']), [[200, 200]]);
    assert.deepEqual(await paginasDoPdf(pagina, origem.paraObjeto()['Zeta.pdf']), [[900, 900], [910, 910]]);

    const saida = resultados(pagina);
    assert.deepEqual(saida.nomes, ['Ávila.pdf', 'Beta.pdf', 'Zeta.pdf']);
    assert.deepEqual(saida.estados, ['OK', 'OK', 'OK']);
    assert.deepEqual(saida.metas, ['3 páginas', '1 páginas', '2 páginas']);
    assert.deepEqual(saida.itens, ['result-item ok', 'result-item ok', 'result-item ok']);

    // O link de cada resultado aponta para um Blob de PDF com o mesmo conteúdo gravado.
    for (const [indice, nome] of ['Ávila.pdf', 'Beta.pdf', 'Zeta.pdf'].entries()) {
        const blob = pagina.registro.urls.get(saida.links[indice]);
        assert.equal(blob.type, 'application/pdf');
        assert.deepEqual(await paginasDoPdf(pagina, blob), await paginasDoPdf(pagina, origem.paraObjeto()[nome]));
    }
});

test('ganjuntar — cancelar o seletor não muda nada e um erro do seletor cai no seletor clássico', async (t) => {
    const avisos = [];
    const pagina = await abrirToy(t, { preparar: (janela) => { janela.alert = (mensagem) => avisos.push(mensagem); } });
    lerArquivosComoOPagina(pagina, t);

    falharSeletorDePasta(pagina, 'AbortError', 'Seleção cancelada.');
    pagina.clicar('#folderBtn');
    await pagina.tick(20);

    assert.deepEqual(avisos, []);
    assert.deepEqual(pagina.mensagens('warn'), []);
    assert.equal(pagina.seletor('#folderInfo').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#mergeBtn').disabled, true);
    assert.equal(pagina.texto('#folderCount'), '0');

    // Falha que não é cancelamento: aviso no console e seletor clássico no lugar.
    falharSeletorDePasta(pagina, 'SecurityError', 'Bloqueado pela permissions policy.');
    let aberturas = 0;
    pagina.seletor('#folderInput').addEventListener('click', () => { aberturas += 1; });
    pagina.clicar('#folderBtn');
    await pagina.tick(20);

    assert.equal(aberturas, 1);
    assert.equal(pagina.mensagens('warn').length, 1);
    assert.equal(
        pagina.mensagens('warn')[0].texto,
        `${AVISO_SELETOR} SecurityError: Bloqueado pela permissions policy.`
    );

    const arquivos = await arquivosClassicos(pagina, [
        { nome: 'a.pdf', caminho: 'Raiz/sub/a.pdf', bytes: Array.from(await criarPdf(pagina, [[300, 300]])) },
    ]);
    definirArquivos(pagina, arquivos);

    assert.equal(pagina.texto('#folderPath'), 'Raiz (modo offline)');
    assert.equal(pagina.texto('#pdfCount'), '1');
    assert.equal(pagina.seletor('#mergeBtn').disabled, false);
});

test('ganjuntar — modo offline: agrupa pelo caminho relativo, monta os PDFs e oferece o link', async (t) => {
    const pagina = await abrirToy(t);
    desativarSeletorDePasta(pagina);

    const sub = [
        { nome: 'b.pdf', caminho: 'Raiz/sub/b.pdf', bytes: null },
        { nome: 'a.pdf', caminho: 'Raiz/sub/a.pdf', bytes: null },
        { nome: 'Integral_x.pdf', caminho: 'Raiz/sub/Integral_x.pdf', bytes: null },
        { nome: 'nota.txt', caminho: 'Raiz/sub/nota.txt', tipo: 'text/plain', bytes: null },
        { nome: 'solta.pdf', caminho: 'Raiz/solta.pdf', bytes: null },
        { nome: 'c.pdf', caminho: 'Raiz/outra/c.pdf', bytes: null },
        { nome: 'f.pdf', caminho: 'Raiz/outra/fundo/f.pdf', bytes: null },
    ];
    const lados = {
        'b.pdf': [[200, 200], [210, 210]],
        'a.pdf': [[220, 220]],
        'Integral_x.pdf': [[230, 230]],
        'solta.pdf': [[240, 240]],
        'c.pdf': [[250, 250]],
        'f.pdf': [[260, 260]],
    };
    for (const arquivo of sub) {
        if (arquivo.tipo === 'text/plain') arquivo.bytes = Array.from(new TextEncoder().encode('nada'));
        else arquivo.bytes = Array.from(await criarPdf(pagina, lados[arquivo.nome]));
    }

    let aberturas = 0;
    pagina.seletor('#folderInput').addEventListener('click', () => { aberturas += 1; });
    pagina.clicar('#folderBtn');

    assert.equal(aberturas, 1, 'sem File System Access API o toy abre o seletor clássico de pasta');
    assert.equal('showDirectoryPicker' in pagina.janela, false);

    definirArquivos(pagina, await arquivosClassicos(pagina, sub));

    assert.equal(pagina.texto('#folderPath'), 'Raiz (modo offline)');
    assert.equal(pagina.texto('#folderBtn'), 'Raiz');
    assert.equal(pagina.seletor('#folderInfo').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#folderCount'), '3');
    assert.equal(pagina.texto('#pdfCount'), '5');
    assert.deepEqual(pagina.textos('#subfoldersList .tile span:first-child'), ['outra', 'Raiz', 'sub']);
    assert.deepEqual(pagina.textos('#subfoldersList .tile .badge'), ['2', '1', '2']);
    assert.equal(pagina.seletor('#folderInput').value, '');
    assert.equal(pagina.seletor('#mergeBtn').disabled, false);

    pagina.clicar('#mergeBtn');
    await pagina.aguardar(() => !pagina.seletor('#results').classList.contains('hidden'), { descricao: 'resultados offline' });

    const saida = resultados(pagina);
    assert.deepEqual(saida.nomes, ['outra.pdf', 'Raiz.pdf', 'sub.pdf']);
    assert.deepEqual(saida.estados, ['OK', 'OK', 'OK']);
    assert.deepEqual(saida.metas, ['2 páginas', '1 páginas', '3 páginas']);

    // Sem File System Access API o PDF sai só como link: os bytes estão no registro de Blobs.
    assert.deepEqual(await paginasDoPdf(pagina, pagina.registro.urls.get(saida.links[0])), [[250, 250], [260, 260]]);
    assert.deepEqual(await paginasDoPdf(pagina, pagina.registro.urls.get(saida.links[1])), [[240, 240]]);
    assert.deepEqual(await paginasDoPdf(pagina, pagina.registro.urls.get(saida.links[2])), [[220, 220], [200, 200], [210, 210]]);
    assert.equal(pagina.registro.urls.get(saida.links[2]).type, 'application/pdf');
    assert.deepEqual(pagina.mensagens(), []);
});

test('ganjuntar — arquivos soltos, sem caminho relativo, viram um grupo com o nome genérico', async (t) => {
    const pagina = await abrirToy(t);
    desativarSeletorDePasta(pagina);

    pagina.janela.__ganSoltos = JSON.stringify([Array.from(await criarPdf(pagina, [[500, 500]])), Array.from(await criarPdf(pagina, [[510, 510]]))]);
    const arquivos = await pagina.script(`(() => {
        const bytes = JSON.parse(window.__ganSoltos).map((linha) => Uint8Array.from(linha));
        return [new File([bytes[0]], 'y.pdf', { type: 'application/pdf' }), new File([bytes[1]], 'x.pdf', { type: 'application/pdf' })];
    })()`);

    definirArquivos(pagina, arquivos);

    assert.equal(pagina.texto('#folderPath'), 'Pasta selecionada (modo offline)');
    assert.equal(pagina.texto('#folderBtn'), 'Pasta selecionada');
    assert.equal(pagina.texto('#folderCount'), '1');
    assert.equal(pagina.texto('#pdfCount'), '2');
    assert.deepEqual(pagina.textos('#subfoldersList .tile span:first-child'), ['Pasta selecionada']);
    assert.deepEqual(pagina.textos('#subfoldersList .tile .badge'), ['2']);

    pagina.clicar('#mergeBtn');
    await pagina.aguardar(() => !pagina.seletor('#results').classList.contains('hidden'), { descricao: 'resultados' });

    const saida = resultados(pagina);
    assert.deepEqual(saida.nomes, ['Pasta selecionada.pdf']);
    assert.deepEqual(saida.metas, ['2 páginas']);
    // Ordem alfabética dos arquivos: x.pdf antes de y.pdf.
    assert.deepEqual(await paginasDoPdf(pagina, pagina.registro.urls.get(saida.links[0])), [[510, 510], [500, 500]]);
});

test('ganjuntar — seleção clássica sem nenhum PDF avisa e não mexe na tela', async (t) => {
    const avisos = [];
    const pagina = await abrirToy(t, { preparar: (janela) => { janela.alert = (mensagem) => avisos.push(mensagem); } });
    desativarSeletorDePasta(pagina);

    // Lista de arquivos ausente (o toy trata como lista vazia).
    Object.defineProperty(pagina.seletor('#folderInput'), 'files', { value: undefined, configurable: true });
    pagina.disparar('#folderInput', 'change');
    // Lista vazia.
    definirArquivos(pagina, []);
    // Só arquivos que o toy descarta (não-PDF e Integral_).
    definirArquivos(pagina, await arquivosClassicos(pagina, [
        { nome: 'nota.txt', caminho: 'Raiz/sub/nota.txt', tipo: 'text/plain', bytes: [1, 2] },
        { nome: 'Integral_antigo.pdf', caminho: 'Raiz/sub/Integral_antigo.pdf', bytes: Array.from(await criarPdf(pagina, [[300, 300]])) },
    ]));

    assert.deepEqual(avisos, [AVISO_VAZIO, AVISO_VAZIO, AVISO_VAZIO]);
    assert.equal(pagina.seletor('#folderInfo').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#subfoldersList').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#mergeBtn').disabled, true);
    assert.equal(pagina.texto('#folderCount'), '0');
    assert.equal(pagina.texto('#pdfCount'), '0');
    assert.equal(pagina.texto('#folderBtn'), 'Selecionar Pasta');
});

test('ganjuntar — pasta sem nenhuma subpasta com PDF mantém a união desabilitada', async (t) => {
    const pagina = await abrirToy(t);
    const origem = montarArvore('SoArquivos', {
        'raiz.pdf': await criarPdf(pagina, [[300, 300]]),
        'Vazia/nota.txt': 'nada',
    });
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.seletor('#folderInfo').classList.contains('hidden') === false, { descricao: 'cartão da pasta' });

    assert.equal(pagina.texto('#folderCount'), '0');
    assert.equal(pagina.texto('#pdfCount'), '0');
    assert.equal(pagina.seletor('#subfoldersList').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#mergeBtn').disabled, true);

    pagina.clicar('#mergeBtn');
    await pagina.tick(20);
    assert.equal(pagina.seletor('#results').classList.contains('hidden'), true);
    assert.deepEqual(origem.escritas, []);
});

test('ganjuntar — subpasta ilegível é pulada com aviso e as outras continuam', async (t) => {
    const pagina = await abrirToy(t);
    const origem = montarArvore('Origem', {
        'Boa/b.pdf': await criarPdf(pagina, [[300, 300]]),
        'Boa/a.pdf': await criarPdf(pagina, [[310, 310]]),
        'Quebrada/x.pdf': await criarPdf(pagina, [[320, 320]]),
    });
    origem.raiz.filhos.get('Quebrada').filhos = null;
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.texto('#pdfCount') === '2', { descricao: 'contadores' });

    assert.equal(pagina.texto('#folderCount'), '1');
    assert.equal(pagina.texto('#pdfCount'), '2');
    assert.deepEqual(pagina.textos('#subfoldersList .tile span:first-child'), ['Boa']);
    assert.deepEqual(pagina.mensagens('warn').map((linha) => linha.texto), ['Não foi possível ler subpasta: Quebrada']);
});

test('ganjuntar — PDF inválido na subpasta é ignorado com aviso e os válidos continuam juntos', async (t) => {
    const pagina = await abrirToy(t);
    lerArquivosComoOPagina(pagina, t);
    const origem = montarArvore('Origem', {
        'Alfa/ruim.pdf': 'isto não é um PDF',
        'Alfa/bom.pdf': await criarPdf(pagina, [[400, 400], [410, 410]]),
    });
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.texto('#pdfCount') === '2', { descricao: 'contadores' });
    pagina.clicar('#mergeBtn');
    await pagina.aguardar(() => !pagina.seletor('#results').classList.contains('hidden'), { descricao: 'resultados' });

    const avisos = pagina.mensagens('warn').map((linha) => linha.texto);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /^Erro ao processar ruim\.pdf: /);
    assert.equal(pagina.texto('#pdfCount'), '2');
    assert.deepEqual(resultados(pagina).metas, ['2 páginas']);
    assert.deepEqual(await paginasDoPdf(pagina, origem.paraObjeto()['Alfa.pdf']), [[400, 400], [410, 410]]);
});

test('ganjuntar — falha ao gravar uma subpasta vira item Falha sem interromper as outras', async (t) => {
    const pagina = await abrirToy(t);
    lerArquivosComoOPagina(pagina, t);
    const origem = montarArvore('Origem', {
        'Alfa/a.pdf': await criarPdf(pagina, [[400, 400], [410, 410]]),
        'Beta/b.pdf': await criarPdf(pagina, [[500, 500]]),
    });
    const gravarOriginal = origem.handle.getFileHandle.bind(origem.handle);
    origem.handle.getFileHandle = async (nome, opcoes) => {
        if (nome === 'Beta.pdf') throw new Error('Disco cheio (teste).');
        return gravarOriginal(nome, opcoes);
    };
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.texto('#pdfCount') === '2', { descricao: 'contadores' });
    pagina.clicar('#mergeBtn');
    await pagina.aguardar(() => !pagina.seletor('#results').classList.contains('hidden'), { descricao: 'resultados' });

    const saida = resultados(pagina);
    assert.deepEqual(saida.nomes, ['Alfa.pdf', 'Beta']);
    assert.deepEqual(saida.estados, ['OK', 'Falha']);
    assert.deepEqual(saida.metas, ['2 páginas', 'Disco cheio (teste).']);
    assert.deepEqual(saida.itens, ['result-item ok', 'result-item fail']);
    assert.deepEqual(origem.escritas, ['Alfa.pdf']);
    assert.deepEqual(pagina.mensagens('error').map((linha) => linha.texto), ['Erro ao processar Beta: Error: Disco cheio (teste).']);
    assert.equal(pagina.seletor('#mergeBtn').disabled, false);
    assert.equal(pagina.texto('#progressPercent'), '100%');
});

test('ganjuntar — pedido de permissão de escrita é feito quando o navegador pede, e a seleção segue', async (t) => {
    const pagina = await abrirToy(t);
    const origem = await arvorePadrao(pagina);
    let pedidos = 0;
    origem.handle.queryPermission = async () => 'prompt';
    origem.handle.requestPermission = async () => { pedidos += 1; return 'granted'; };
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.texto('#pdfCount') === '5', { descricao: 'contadores' });

    assert.equal(pedidos, 1);
    assert.equal(pagina.texto('#folderPath'), 'Origem');
    assert.equal(pagina.seletor('#mergeBtn').disabled, false);
});

test('ganjuntar — repetir a união regrava os mesmos arquivos e a chamada durante o processamento é ignorada', async (t) => {
    const pagina = await abrirToy(t);
    lerArquivosComoOPagina(pagina, t);
    const origem = await arvorePadrao(pagina);
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.texto('#pdfCount') === '5', { descricao: 'contadores' });

    pagina.clicar('#mergeBtn');
    pagina.janela.mergePdfs();
    await pagina.aguardar(() => !pagina.seletor('#results').classList.contains('hidden'), { descricao: 'primeira união' });

    assert.deepEqual(origem.escritas, ['Ávila.pdf', 'Beta.pdf', 'Zeta.pdf']);
    assert.deepEqual(resultados(pagina).nomes, ['Ávila.pdf', 'Beta.pdf', 'Zeta.pdf']);

    pagina.clicar('#mergeBtn');
    await pagina.aguardar(() => origem.escritas.length === 6, { descricao: 'segunda união' });

    assert.deepEqual(origem.escritas, ['Ávila.pdf', 'Beta.pdf', 'Zeta.pdf', 'Ávila.pdf', 'Beta.pdf', 'Zeta.pdf']);
    assert.deepEqual(resultados(pagina).nomes, ['Ávila.pdf', 'Beta.pdf', 'Zeta.pdf']);
    assert.deepEqual(resultados(pagina).metas, ['3 páginas', '1 páginas', '2 páginas']);
    assert.equal(pagina.seletor('#results').classList.contains('hidden'), false);
});

test('ganjuntar — subpasta única com um PDF só gera uma parte e a lista de subpastas mostra o total', async (t) => {
    const pagina = await abrirToy(t);
    lerArquivosComoOPagina(pagina, t);
    const origem = montarArvore('Única', {
        'Somente/único.pdf': await criarPdf(pagina, [[600, 600]]),
    });
    enfileirarPastas(pagina, origem);

    pagina.clicar('#folderBtn');
    await pagina.aguardar(() => pagina.texto('#pdfCount') === '1', { descricao: 'contadores' });
    assert.equal(pagina.texto('#folderCount'), '1');
    assert.deepEqual(pagina.textos('#subfoldersList .tile span:first-child'), ['Somente']);
    assert.deepEqual(pagina.textos('#subfoldersList .tile .badge'), ['1']);

    pagina.clicar('#mergeBtn');
    await pagina.aguardar(() => !pagina.seletor('#results').classList.contains('hidden'), { descricao: 'resultados' });

    assert.deepEqual(origem.escritas, ['Somente.pdf']);
    assert.deepEqual(resultados(pagina).nomes, ['Somente.pdf']);
    assert.deepEqual(resultados(pagina).metas, ['1 páginas']);
    assert.deepEqual(await paginasDoPdf(pagina, origem.paraObjeto()['Somente.pdf']), [[600, 600]]);
});
