import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

const AVISO_ARQUIVO = 'Por favor, selecione um arquivo PDF válido.';
const AVISO_TAMANHO = 'Por favor, insira um tamanho máximo válido.';
const AVISO_ERRO = 'Ocorreu um erro ao processar o arquivo. Detalhes no console.';

// Páginas com este texto pseudoaleatório (sempre o mesmo) somam ~3 KB cada, o
// que deixa os limites de divisão longe uns dos outros e o teste determinístico.
const RUIDO = `
    let semente = 987654321;
    const proximo = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente; };
    const barulho = (tamanho) => { let saida = ''; while (saida.length < tamanho) saida += proximo().toString(36); return saida.slice(0, tamanho); };
`;

const LADOS = (quantidade) => Array.from({ length: quantidade }, (_, i) => [300 + i * 10, 400 + i * 10]);

/**
 * O pdf-lib do toy compara os bytes com o `instanceof` do realm da página; o
 * `File` do jsdom é o que entrega um ArrayBuffer desse mesmo realm.
 */
function arquivoPdf(pagina, bytes, nome) {
    return new pagina.janela.File([bytes], nome, { type: 'application/pdf' });
}

async function criarPdf(pagina, lados) {
    pagina.janela.__ganLados = JSON.stringify(lados);
    const bytes = await pagina.script(`(async () => {
        const doc = await PDFLib.PDFDocument.create();
        for (const [largura, altura] of JSON.parse(window.__ganLados)) doc.addPage([largura, altura]);
        return Array.from(await doc.save());
    })()`);
    return Uint8Array.from(bytes);
}

/** PDF de `quantidade` páginas, cada uma com ~3 KB de conteúdo incompressível. */
async function criarPdfGrande(pagina, quantidade) {
    pagina.janela.__ganQuantidade = quantidade;
    const bytes = await pagina.script(`(async () => {
        ${RUIDO}
        const doc = await PDFLib.PDFDocument.create();
        const fonte = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
        for (let i = 0; i < window.__ganQuantidade; i++) {
            const folha = doc.addPage([300 + i * 10, 400 + i * 10]);
            folha.drawText(barulho(3000), { x: 10, y: 10, size: 8, font: fonte });
        }
        return Array.from(await doc.save());
    })()`);
    return Uint8Array.from(bytes);
}

function selecionarArquivo(pagina, arquivo) {
    Object.defineProperty(pagina.seletor('#file-input'), 'files', { value: [arquivo], configurable: true });
    pagina.disparar('#file-input', 'change');
}

function eventoDe(pagina, tipo, extra = {}) {
    const evento = new pagina.janela.Event(tipo, { bubbles: true, cancelable: true });
    for (const [chave, valor] of Object.entries(extra)) Object.defineProperty(evento, chave, { value: valor });
    return evento;
}

/** Nomes, tamanhos e páginas das partes listadas, com os bytes lidos dos Blobs. */
async function partes(pagina) {
    const lista = [];
    for (const link of pagina.todos('#file-list a')) {
        const href = link.getAttribute('href');
        const blob = pagina.registro.urls.get(href);
        pagina.janela.__ganBlob = blob;
        const lados = await pagina.script(`(async () => {
            const pdf = await PDFLib.PDFDocument.load(await window.__ganBlob.arrayBuffer());
            return pdf.getPages().map((pagina) => [Math.round(pagina.getWidth()), Math.round(pagina.getHeight())]);
        })()`);
        lista.push({
            nome: link.getAttribute('download'),
            texto: link.textContent.trim(),
            tipo: blob.type,
            bytes: blob.size,
            paginas: Array.from(lados, (par) => [Number(par[0]), Number(par[1])]),
        });
    }
    return lista;
}

async function abrirToy(t) {
    const pagina = await carregarToy('ganpdf');
    t.after(() => pagina.fechar());
    return pagina;
}

/** Seleciona o PDF, ajusta o limite, processa e espera o bloco de resultado. */
async function processar(pagina, arquivo, mb) {
    selecionarArquivo(pagina, arquivo);
    pagina.seletor('#max-size').value = String(mb);
    pagina.clicar('#process-btn');
    await pagina.aguardar(() => !pagina.seletor('#results-section').classList.contains('hidden'), {
        descricao: 'bloco de resultado',
        timeout: 20000,
    });
}

test('ganpdf — estado inicial: sem arquivo, sem resultado e processamento desabilitado', async (t) => {
    const pagina = await abrirToy(t);

    assert.equal(pagina.seletor('#process-btn').disabled, true);
    assert.equal(pagina.texto('#process-btn'), 'Processar Arquivo');
    assert.equal(pagina.html('#file-name'), 'Arraste seu PDF ou <strong>clique aqui</strong>');
    assert.equal(pagina.texto('#file-size-info'), '');
    assert.equal(pagina.seletor('#max-size').value, '3.0');
    assert.equal(pagina.seletor('#max-size').getAttribute('min'), '0.1');
    assert.equal(pagina.seletor('#max-size').getAttribute('step'), '0.1');
    assert.equal(pagina.seletor('#max-size').getAttribute('placeholder'), 'Ex: 3.0');
    assert.equal(pagina.seletor('#status-section').classList.contains('visible'), false);
    assert.equal(pagina.texto('#status-message'), 'Aguardando...');
    assert.equal(pagina.seletor('#progress-bar').style.width, '');
    assert.equal(pagina.seletor('#results-section').classList.contains('hidden'), true);
    assert.equal(pagina.texto('#summary-text'), '');
    assert.equal(pagina.todos('#file-list a').length, 0);

    // Processar sem arquivo escolhido não faz nada: nem troca o status, nem mostra o resultado.
    pagina.disparar('#process-btn', 'click');
    await pagina.tick(20);
    assert.equal(pagina.texto('#status-message'), 'Aguardando...');
    assert.equal(pagina.seletor('#status-section').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#results-section').classList.contains('hidden'), true);

    // Baixar o ZIP sem nenhuma parte também não faz nada.
    pagina.clicar('#download-btn');
    await pagina.tick(20);
    assert.deepEqual(pagina.registro.downloads, []);
});

test('ganpdf — escolher o arquivo mostra nome e tamanho e habilita o botão', async (t) => {
    const pagina = await abrirToy(t);

    selecionarArquivo(pagina, arquivoPdf(pagina, await criarPdfGrande(pagina, 5), 'contrato aluguel.pdf'));

    assert.equal(pagina.html('#file-name'), '<strong>contrato aluguel.pdf</strong> selecionado');
    assert.equal(pagina.texto('#file-size-info'), 'Tamanho Original: 0.01 MB');
    assert.equal(pagina.seletor('#process-btn').disabled, false);
});

test('ganpdf — arquivo que não é PDF é recusado com aviso e a seleção é limpa', async (t) => {
    const avisos = [];
    const pagina = await carregarToy('ganpdf', { preparar: (janela) => { janela.alert = (mensagem) => avisos.push(mensagem); } });
    t.after(() => pagina.fechar());

    selecionarArquivo(pagina, new pagina.janela.File(['nada de pdf'], 'nota.txt', { type: 'text/plain' }));

    assert.deepEqual(avisos, [AVISO_ARQUIVO]);
    assert.equal(pagina.html('#file-name'), 'Arraste seu PDF ou <strong>clique aqui</strong>');
    assert.equal(pagina.texto('#file-size-info'), '');
    assert.equal(pagina.seletor('#process-btn').disabled, true);
    assert.equal(pagina.seletor('#file-input').value, '');
});

test('ganpdf — clicar na área abre o seletor e arrastar arquivo seleciona', async (t) => {
    const pagina = await abrirToy(t);

    let aberturas = 0;
    pagina.seletor('#file-input').addEventListener('click', () => { aberturas += 1; });
    pagina.clicar('#drop-zone');
    assert.equal(aberturas, 1);

    pagina.seletor('#drop-zone').dispatchEvent(eventoDe(pagina, 'dragover'));
    assert.equal(pagina.seletor('#drop-zone').classList.contains('dragover'), true);
    pagina.seletor('#drop-zone').dispatchEvent(eventoDe(pagina, 'dragleave'));
    assert.equal(pagina.seletor('#drop-zone').classList.contains('dragover'), false);

    const bytes = await criarPdf(pagina, [[300, 300]]);
    pagina.seletor('#drop-zone').dispatchEvent(eventoDe(pagina, 'dragover'));
    pagina.seletor('#drop-zone').dispatchEvent(eventoDe(pagina, 'drop', {
        dataTransfer: { files: [arquivoPdf(pagina, bytes, 'relatorio.pdf')] },
    }));

    assert.equal(pagina.html('#file-name'), '<strong>relatorio.pdf</strong> selecionado');
    assert.equal(pagina.seletor('#process-btn').disabled, false);
    assert.equal(pagina.seletor('#drop-zone').classList.contains('dragover'), false);

    // Soltar sem arquivo nenhum mantém a seleção anterior.
    pagina.seletor('#drop-zone').dispatchEvent(eventoDe(pagina, 'drop', { dataTransfer: { files: [] } }));
    assert.equal(pagina.html('#file-name'), '<strong>relatorio.pdf</strong> selecionado');
});

test('ganpdf — limite inválido avisa e não inicia o processamento', async (t) => {
    const avisos = [];
    const pagina = await carregarToy('ganpdf', { preparar: (janela) => { janela.alert = (mensagem) => avisos.push(mensagem); } });
    t.after(() => pagina.fechar());

    selecionarArquivo(pagina, arquivoPdf(pagina, await criarPdf(pagina, [[300, 300], [310, 310]])));

    for (const valor of ['0', '-2', '', 'abc']) {
        pagina.seletor('#max-size').value = valor;
        pagina.clicar('#process-btn');
        await pagina.tick(20);
    }

    assert.deepEqual(avisos, [AVISO_TAMANHO, AVISO_TAMANHO, AVISO_TAMANHO, AVISO_TAMANHO]);
    assert.equal(pagina.texto('#status-message'), 'Aguardando...');
    assert.equal(pagina.seletor('#status-section').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#results-section').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#process-btn').disabled, false, 'o botão continua disponível depois do aviso');
});

test('ganpdf — PDF menor que o limite vira uma única parte com todas as páginas', async (t) => {
    const pagina = await abrirToy(t);

    selecionarArquivo(pagina, arquivoPdf(pagina, await criarPdf(pagina, [[300, 400], [301, 401], [302, 402]]), 'relatorio.pdf'));
    pagina.clicar('#process-btn');

    // O status e a barra andam antes do primeiro await.
    assert.equal(pagina.seletor('#process-btn').disabled, true);
    assert.equal(pagina.seletor('#status-section').classList.contains('visible'), true);
    assert.equal(pagina.texto('#status-message'), 'Lendo arquivo original...');
    assert.equal(pagina.seletor('#progress-bar').style.width, '5%');
    assert.equal(pagina.seletor('#results-section').classList.contains('hidden'), true);

    await pagina.aguardarTexto('#status-message', 'Concluído!', { timeout: 20000 });
    await pagina.aguardar(() => !pagina.seletor('#results-section').classList.contains('hidden'), { descricao: 'resultado' });

    assert.equal(pagina.seletor('#progress-bar').style.width, '100%');
    assert.equal(pagina.seletor('#status-section').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#process-btn').disabled, false);
    assert.equal(pagina.texto('#summary-text'), 'O arquivo foi dividido em 1 parte(s) menores que 3 MB.');

    const lista = await partes(pagina);
    assert.deepEqual(lista.map((parte) => parte.nome), ['relatorio_parte_1.pdf']);
    assert.deepEqual(lista[0].paginas, [[300, 400], [301, 401], [302, 402]]);
    assert.equal(lista[0].tipo, 'application/pdf');
    assert.equal(lista[0].texto, 'relatorio_parte_1.pdf (0.00 MB)');
});

test('ganpdf — divide em ordem, fechando cada parte no último bloco que cabe no limite', async (t) => {
    const pagina = await abrirToy(t);
    const lados = LADOS(5);

    // 0.007 MB = 7340 bytes: cabem duas páginas por parte (~3,5 KB cada), nunca três.
    await processar(pagina, arquivoPdf(pagina, await criarPdfGrande(pagina, 5), 'relatorio.pdf'), 0.007);

    const lista = await partes(pagina);
    assert.deepEqual(lista.map((parte) => parte.nome), [
        'relatorio_parte_1.pdf',
        'relatorio_parte_2.pdf',
        'relatorio_parte_3.pdf',
    ]);
    assert.deepEqual(lista.map((parte) => parte.paginas), [
        [lados[0], lados[1]],
        [lados[2], lados[3]],
        [lados[4]],
    ]);
    // Cada parte respeita o limite e nenhuma página se perde nem se repete.
    for (const parte of lista) assert.equal(parte.bytes <= 0.007 * 1024 * 1024, true);
    assert.deepEqual(lista.flatMap((parte) => parte.paginas), lados);
    assert.equal(pagina.texto('#summary-text'), 'O arquivo foi dividido em 3 parte(s) menores que 0.007 MB.');
    assert.deepEqual(lista.map((parte) => parte.texto), [
        'relatorio_parte_1.pdf (0.01 MB)',
        'relatorio_parte_2.pdf (0.01 MB)',
        'relatorio_parte_3.pdf (0.00 MB)',
    ]);
});

test('ganpdf — limite menor que uma página: cada página vira uma parte, mesmo passando do limite', async (t) => {
    const pagina = await abrirToy(t);
    const lados = LADOS(5);

    // 0.0029 MB = 3041 bytes: menor que uma página sozinha (~3,5 KB).
    await processar(pagina, arquivoPdf(pagina, await criarPdfGrande(pagina, 5), 'relatorio.pdf'), 0.0029);

    const lista = await partes(pagina);
    assert.deepEqual(lista.map((parte) => parte.nome), [
        'relatorio_parte_1.pdf',
        'relatorio_parte_2.pdf',
        'relatorio_parte_3.pdf',
        'relatorio_parte_4.pdf',
        'relatorio_parte_5.pdf',
    ]);
    assert.deepEqual(lista.map((parte) => parte.paginas), lados.map((par) => [par]));
    for (const parte of lista) assert.equal(parte.bytes > 0.0029 * 1024 * 1024, true, 'página sozinha acima do limite sai do mesmo jeito');
    assert.equal(pagina.texto('#summary-text'), 'O arquivo foi dividido em 5 parte(s) menores que 0.0029 MB.');
});

test('ganpdf — nomes das partes usam o nome do arquivo sem a extensão', async (t) => {
    const pagina = await abrirToy(t);

    await processar(pagina, arquivoPdf(pagina, await criarPdfGrande(pagina, 5), 'Petição Inicial.pdf'), 0.007);

    assert.deepEqual(pagina.todos('#file-list a').map((no) => no.getAttribute('download')), [
        'Petição Inicial_parte_1.pdf',
        'Petição Inicial_parte_2.pdf',
        'Petição Inicial_parte_3.pdf',
    ]);
});

test('ganpdf — baixar o ZIP entrega NOME_dividido.zip com todas as partes e libera a URL depois', async (t) => {
    const pagina = await abrirToy(t);
    const lados = LADOS(5);

    await processar(pagina, arquivoPdf(pagina, await criarPdfGrande(pagina, 5), 'relatorio.pdf'), 0.007);
    assert.equal(pagina.registro.urls.size, 3, 'uma URL por parte');

    pagina.clicar('#download-btn');
    await pagina.aguardar(() => pagina.registro.downloads.length === 1, { descricao: 'download do ZIP' });

    const download = pagina.registro.downloads[0];
    assert.equal(download.nome, 'relatorio_dividido.zip');
    const zip = pagina.registro.urls.get(download.href);
    assert.equal(zip.type, 'application/zip');
    assert.equal(pagina.registro.urls.size, 4);
    assert.deepEqual(
        pagina.todos('a[download]').filter((no) => !pagina.seletor('#file-list').contains(no)),
        [],
        'o link auxiliar do ZIP sai do documento'
    );

    // ZIP de verdade, aberto com o JSZip real: as mesmas partes, com as mesmas páginas.
    pagina.janela.__ganBlob = zip;
    const conteudo = await pagina.script(`(async () => {
        const arquivo = await JSZip.loadAsync(await window.__ganBlob.arrayBuffer());
        const entradas = [];
        for (const nome of Object.keys(arquivo.files)) {
            const pdf = await PDFLib.PDFDocument.load(await arquivo.files[nome].async('uint8array'));
            entradas.push([nome, pdf.getPages().map((pagina) => [Math.round(pagina.getWidth()), Math.round(pagina.getHeight())])]);
        }
        return entradas;
    })()`);
    assert.deepEqual(
        Array.from(conteudo, (entrada) => [entrada[0], Array.from(entrada[1], (par) => [Number(par[0]), Number(par[1])])]),
        [
            ['relatorio_parte_1.pdf', [lados[0], lados[1]]],
            ['relatorio_parte_2.pdf', [lados[2], lados[3]]],
            ['relatorio_parte_3.pdf', [lados[4]]],
        ]
    );

    await pagina.tick(1200);
    assert.equal(pagina.registro.urls.has(download.href), false);
});

test('ganpdf — PDF ilegível avisa, volta a barra para 0% e reabilita o botão', async (t) => {
    const avisos = [];
    const pagina = await carregarToy('ganpdf', { preparar: (janela) => { janela.alert = (mensagem) => avisos.push(mensagem); } });
    t.after(() => pagina.fechar());

    selecionarArquivo(pagina, arquivoPdf(pagina, new TextEncoder().encode('isto não é um PDF de verdade'), 'quebrado.pdf'));
    pagina.seletor('#max-size').value = '3.0';
    pagina.clicar('#process-btn');

    await pagina.aguardarTexto('#status-message', 'Erro no processamento.', { timeout: 20000 });

    assert.deepEqual(avisos, [AVISO_ERRO]);
    assert.equal(pagina.seletor('#progress-bar').style.width, '0%');
    assert.equal(pagina.seletor('#status-section').classList.contains('visible'), true);
    assert.equal(pagina.seletor('#results-section').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#process-btn').disabled, false);
    assert.equal(pagina.todos('#file-list a').length, 0);
    assert.equal(pagina.mensagens('error').length, 1);
    assert.match(pagina.mensagens('error')[0].texto, /^Error: /);
});

test('ganpdf — cancelar o seletor de arquivo não muda a seleção', async (t) => {
    const pagina = await abrirToy(t);

    // Lista vazia: o usuário fechou o diálogo sem escolher nada.
    Object.defineProperty(pagina.seletor('#file-input'), 'files', { value: [], configurable: true });
    pagina.disparar('#file-input', 'change');
    await pagina.tick(20);

    assert.equal(pagina.html('#file-name'), 'Arraste seu PDF ou <strong>clique aqui</strong>');
    assert.equal(pagina.texto('#file-size-info'), '');
    assert.equal(pagina.seletor('#process-btn').disabled, true);
    assert.equal(pagina.texto('#status-message'), 'Aguardando...');
});

test('ganpdf — processar de novo substitui as partes anteriores', async (t) => {
    const pagina = await abrirToy(t);

    await processar(pagina, arquivoPdf(pagina, await criarPdfGrande(pagina, 5), 'relatorio.pdf'), 3.0);
    assert.equal(pagina.texto('#summary-text'), 'O arquivo foi dividido em 1 parte(s) menores que 3 MB.');
    assert.deepEqual(pagina.todos('#file-list a').map((no) => no.getAttribute('download')), ['relatorio_parte_1.pdf']);

    pagina.seletor('#max-size').value = '0.007';
    pagina.clicar('#process-btn');
    await pagina.aguardarTexto('#summary-text', 'O arquivo foi dividido em 3 parte(s) menores que 0.007 MB.', { timeout: 20000 });

    assert.deepEqual(pagina.todos('#file-list a').map((no) => no.getAttribute('download')), [
        'relatorio_parte_1.pdf',
        'relatorio_parte_2.pdf',
        'relatorio_parte_3.pdf',
    ]);
    assert.deepEqual((await partes(pagina)).map((parte) => parte.paginas), [
        [LADOS(5)[0], LADOS(5)[1]],
        [LADOS(5)[2], LADOS(5)[3]],
        [LADOS(5)[4]],
    ]);
});
