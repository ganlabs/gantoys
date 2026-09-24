import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy, carregarApp, montarArvore, criarPdfjsFake, criarTesseractFake } from '../../testkit/index.js';

const CNJ = '0000001-02.2025.8.26.0100';
const NOME = `processo ${CNJ}.pdf`;

// Páginas usadas no dublê do pdf.js (o texto é o que o algoritmo lê).
const PAGINA_SISTEMA = 'PÁGINA DE SEPARAÇÃO\nDocumento gerado automaticamente pelo sistema.';
const PAGINA_INICIAL = 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL DA COMARCA\n\n'
    + 'A autora, já qualificada nos autos, vem propor a presente ação de cobrança em face da ré.';
const PAGINA_FECHAMENTO = 'Ante o exposto, requer a procedência integral dos pedidos.\n'
    + 'Pede deferimento.\nSão Paulo, 10 de janeiro de 2025.\nAdvogado\nOAB/SP 123.456';
const PAGINA_PROCURACAO = 'PROCURAÇÃO AD JUDICIA\n\nOutorgante: Maria da Silva\n'
    + 'Outorgado: Advogado inscrito na OAB/SP sob o nº 123.456\nPoderes: representar em juízo.';
const PAGINA_NEUTRA = 'Laudo médico emitido em 10/01/2025 descrevendo o quadro clínico, os exames realizados, '
    + 'as medicações em uso e as recomendações de acompanhamento ambulatorial regular pelo paciente, '
    + 'assinado pelo profissional responsável com o respectivo registro no conselho de classe.';
const OCR_INICIAL = 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA VARA ÚNICA\n'
    + 'Documento digitalizado pela secretaria do juízo para conferência.';
const OCR_VAZIO = 'página digitalizada sem texto reconhecível';
const FILLER = 'Texto corrido do documento com informações processuais relevantes para a análise do caso, '
    + 'incluindo datas, valores e demais detalhes necessários ao julgamento da demanda apresentada em juízo.';
const FECHAMENTO_SEM_OAB = `Ante o exposto, pede deferimento.\n${FILLER}`;

function dados(valor) {
    return JSON.parse(JSON.stringify(valor));
}

// pdf.js falso que troca de páginas a cada arquivo do lote.
function pdfjsPorArquivo(lotes) {
    let indice = 0;
    return {
        GlobalWorkerOptions: { workerSrc: '' },
        version: 'fake',
        getDocument(fonte) {
            const alvo = lotes[Math.min(indice, lotes.length - 1)];
            indice += 1;
            return alvo.getDocument(fonte);
        },
    };
}

async function abrirNovoDiv(t, opcoes = {}) {
    const destino = opcoes.destino || montarArvore('Destino');
    const pdfjsLib = opcoes.pdfjsLib || criarPdfjsFake(opcoes.paginas || [PAGINA_NEUTRA, PAGINA_NEUTRA]);
    const globais = { pdfjsLib };
    if (opcoes.tesseract) globais.Tesseract = opcoes.tesseract;

    const app = await carregarApp();
    const pagina = await carregarToy('gannovodiv', { globais });
    t.after(() => { pagina.fechar(); app.fechar(); });

    app.enfileirarPasta(destino);
    pagina.app = app;
    pagina.destino = destino;
    pagina.ponte = app.conectarToy(pagina);
    pagina.totalPaginas = (opcoes.paginas || []).length || (pagina.janela.document ? 2 : 2);

    const alertas = [];
    pagina.janela.alert = (mensagem) => { alertas.push(String(mensagem)); };
    pagina.janela.confirm = () => true;
    pagina.alertas = alertas;

    if (opcoes.tesseract) pagina.tesseract = opcoes.tesseract;
    return pagina;
}

/** PDF real (pdf-lib) com uma página por texto; a página i tem largura 100+i. */
async function pdfDeTeste(pagina, quantidade) {
    const bytes = await pagina.script(`(async () => {
        const doc = await PDFLib.PDFDocument.create();
        for (let i = 0; i < ${quantidade}; i++) doc.addPage([100 + i, 200]);
        return Array.from(await doc.save());
    })()`);
    return new Uint8Array(bytes);
}

async function arquivoDeTeste(pagina, nome, quantidade) {
    return new pagina.janela.File([await pdfDeTeste(pagina, quantidade)], nome, { type: 'application/pdf' });
}

function selecionar(pagina, arquivos) {
    Object.defineProperty(pagina.seletor('#fileInput'), 'files', { value: arquivos, configurable: true });
    pagina.disparar('#fileInput', 'change');
}

/** Lê um PDF gravado na pasta de destino e devolve os tamanhos das páginas. */
async function tamanhosGravados(pagina, nome) {
    const bytes = pagina.destino.paraObjeto()[nome];
    if (!bytes) throw new Error(`PDF ausente na pasta de destino: ${nome}`);
    pagina.janela.__bytesDoTeste = Array.from(bytes);
    return dados(await pagina.script(`(async () => {
        const doc = await PDFLib.PDFDocument.load(new Uint8Array(__bytesDoTeste));
        return doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
    })()`));
}

function espionarBlobs(pagina) {
    const blobs = [];
    const original = pagina.janela.URL.createObjectURL.bind(pagina.janela.URL);
    pagina.janela.URL.createObjectURL = (blob) => { blobs.push(blob); return original(blob); };
    return blobs;
}

async function processar(pagina) {
    pagina.clicar('#btnProcess');
    await pagina.aguardar(() => pagina.ponte.modalDePastaAberto(), { descricao: 'diálogo de pasta' });
    await pagina.ponte.confirmarPasta();
    await pagina.aguardar(() => pagina.seletor('#doneSection').classList.contains('hidden') === false, {
        descricao: 'fim do processamento',
        timeout: 8000,
    });
}

/** Roda a heurística do toy com um documento montado só para esta chamada. */
async function detectar(pagina, paginas) {
    pagina.janela.pdfjsLib = criarPdfjsFake(paginas);
    pagina.janela.__bytesDoTeste = new Uint8Array(0);
    return dados(await pagina.script('detectInicialRange(__bytesDoTeste)'));
}

function celulasDaLinha(pagina, indice) {
    return pagina.todos(`#reportTbody tr:nth-child(${indice + 1}) td`)
        .map((celula) => celula.textContent.replace(/\s+/g, ' ').trim());
}

test('NovoDiv — a tela nasce no passo 1, sem fila, relatório e destinos', async (t) => {
    const pagina = await abrirNovoDiv(t);

    assert.equal(pagina.texto('#fileBadge'), '0 arquivos na fila');
    assert.equal(pagina.seletor('#fileBadge').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#actionUpload').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#stepUpload').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#stepDashboard').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#doneSection').classList.contains('hidden'), true);
    assert.equal(pagina.texto('#statusText'), 'Preparando ambiente...');
    assert.equal(pagina.texto('#progressText'), '0%');
    assert.equal(pagina.seletor('#progressBar').style.width, '');
    assert.equal(pagina.texto('#miniLog'), '> Aguardando...');
    assert.deepEqual(pagina.textos('#stepper .step-number'), ['1', '2', '3']);
    assert.deepEqual(pagina.textos('#stepper .step-label'), ['Arquivos', 'Processamento', 'Auditoria']);
    assert.equal(pagina.seletor('#stepIndicator1').className, 'step active');
    assert.equal(pagina.seletor('#modalOverlay').classList.contains('open'), false);
    assert.equal(pagina.seletor('#pdfModal').classList.contains('open'), false);
    assert.equal(pagina.html('#reportTbody'), '');
});

test('NovoDiv — seleção sem PDF válido e sem CNJ no nome é recusada com o aviso', async (t) => {
    const pagina = await abrirNovoDiv(t);

    selecionar(pagina, [{ name: 'foto.png', type: 'image/png', size: 3 }]);
    assert.deepEqual(pagina.alertas, ['Nenhum PDF válido selecionado.']);
    assert.equal(pagina.seletor('#fileBadge').classList.contains('hidden'), true);

    selecionar(pagina, [await arquivoDeTeste(pagina, 'contrato.pdf', 2), await arquivoDeTeste(pagina, `Inicial_${CNJ}.pdf`, 2)]);
    assert.deepEqual(pagina.alertas.slice(1), ['Nenhum PDF Integral encontrado. Certifique-se de que o nome contém o número CNJ.']);
    assert.equal(pagina.texto('#fileBadge'), '0 arquivos na fila');
});

test('NovoDiv — arrastar e soltar arquivos enche a fila e mostra a contagem', async (t) => {
    const pagina = await abrirNovoDiv(t);

    const arrastar = (tipo) => pagina.seletor('#dropZone').dispatchEvent(
        new pagina.janela.Event(tipo, { bubbles: true, cancelable: true })
    );
    arrastar('dragover');
    assert.equal(pagina.seletor('#dropZone').classList.contains('dragover'), true);
    arrastar('dragleave');
    assert.equal(pagina.seletor('#dropZone').classList.contains('dragover'), false);

    // Clicar na área abre o seletor de arquivos do navegador.
    pagina.clicar('#dropZone');
    assert.equal(pagina.seletor('#fileInput').type, 'file');

    const evento = new pagina.janela.Event('drop', { bubbles: true, cancelable: true });
    evento.dataTransfer = { files: [await arquivoDeTeste(pagina, NOME, 2)] };
    pagina.seletor('#dropZone').dispatchEvent(evento);

    assert.equal(pagina.seletor('#dropZone').classList.contains('dragover'), false);
    assert.equal(pagina.texto('#fileBadge'), '1 arquivo(s) na fila');
    assert.equal(pagina.seletor('#fileBadge').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#actionUpload').classList.contains('hidden'), false);
});

test('NovoDiv — cancelar a escolha de pasta não inicia o processamento', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);

    pagina.clicar('#btnProcess');
    await pagina.aguardar(() => pagina.ponte.modalDePastaAberto(), { descricao: 'diálogo de pasta' });

    await pagina.ponte.cancelarPasta();
    assert.deepEqual(pagina.alertas, ['É necessário selecionar uma pasta de destino para salvar os PDFs.']);
    assert.equal(pagina.seletor('#stepUpload').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#stepDashboard').classList.contains('hidden'), true);
    assert.deepEqual(pagina.destino.caminhos(), []);
});

test('NovoDiv — pasta que não responde dentro do limite cancela o processamento', async (t) => {
    const pagina = await abrirNovoDiv(t);
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 2)]);

    const setTimeoutOriginal = pagina.janela.setTimeout;
    const limites = [];
    pagina.janela.setTimeout = (fn, ms) => {
        if (ms === 120000) { limites.push(ms); fn(); return 0; }
        return setTimeoutOriginal(fn, ms);
    };

    pagina.clicar('#btnProcess');
    await pagina.tick(20);

    assert.deepEqual(limites, [120000]);
    assert.deepEqual(pagina.alertas, ['É necessário selecionar uma pasta de destino para salvar os PDFs.']);
    assert.equal(pagina.seletor('#stepDashboard').classList.contains('hidden'), true);
    assert.deepEqual(pagina.ponte.tipos(), ['gantoys-directory-picker-request']);
    assert.deepEqual(pagina.destino.caminhos(), []);
});

test('NovoDiv — grava Inicial e Docs com o intervalo detectado e monta o relatório', async (t) => {
    const paginas = [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO];
    const pagina = await abrirNovoDiv(t, { paginas });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);

    assert.equal(pagina.registro.downloads.length, 0);
    await processar(pagina);

    assert.deepEqual(pagina.destino.caminhos(), [`Docs_${CNJ}.pdf`, `Inicial_${CNJ}.pdf`]);
    assert.deepEqual(await tamanhosGravados(pagina, `Inicial_${CNJ}.pdf`), [[101, 200], [102, 200]]);
    assert.deepEqual(await tamanhosGravados(pagina, `Docs_${CNJ}.pdf`), [[100, 200], [103, 200]]);

    assert.equal(pagina.texto('#statusText'), 'Extrações concluídas!');
    assert.equal(pagina.texto('#dashTitle'), 'Análise Finalizada');
    assert.equal(pagina.seletor('#progressBar').style.width, '100%');
    assert.equal(pagina.texto('#progressText'), '100%');
    assert.equal(pagina.texto('#miniLog'), '> Salvo com sucesso.');
    assert.deepEqual(pagina.textos('.summary .stat strong'), ['1', '1', '0', '0']);
    assert.equal(pagina.seletor('#stepIndicator3').className, 'step active');
    assert.equal(pagina.seletor('#progressSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#doneSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#doneMessage'), 'Os resultados foram guardados em Destino.');

    assert.equal(pagina.todos('#reportTbody tr').length, 1);
    assert.deepEqual(celulasDaLinha(pagina, 0), [NOME, '2 a 3 (2p)', 'Inicial Docs Corrigir', 'OK']);
    assert.equal(pagina.seletor('#reportTbody .badge').className, 'badge badge-ok');
    assert.deepEqual(pagina.textos('#reportTbody td:nth-child(3) button'), ['Inicial', 'Docs', 'Corrigir']);
    assert.deepEqual(pagina.mensagens('log').map((m) => m.texto).slice(0, 4), [
        'Destino selecionado: Destino',
        `Lendo bytes de ${NOME}...`,
        'Detectando limites...',
        'Separando PDF (2 a 3)...',
    ]);
});

test('NovoDiv — heurística sem confiança marca a linha como Revisar e avisa na tela', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_NEUTRA, PAGINA_NEUTRA] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 2)]);

    await processar(pagina);

    assert.deepEqual(pagina.destino.caminhos(), [`Inicial_${CNJ}.pdf`]);
    assert.deepEqual(await tamanhosGravados(pagina, `Inicial_${CNJ}.pdf`), [[100, 200], [101, 200]]);
    assert.deepEqual(pagina.textos('.summary .stat strong'), ['1', '0', '1', '0']);
    assert.equal(
        pagina.seletor('#doneMessage').innerHTML,
        'Os resultados foram guardados em <strong>Destino</strong>.<br>'
        + '<span style="color:var(--toy-warning); font-weight:bold;">'
        + 'Atenção: 1 processo(s) geraram dúvidas algorítmicas e requerem revisão humana.</span>'
    );
    assert.deepEqual(celulasDaLinha(pagina, 0), [NOME, '1 a 2 (2p)', 'Inicial Corrigir', 'Revisar']);
    assert.equal(pagina.seletor('#reportTbody .badge').className, 'badge badge-warn');
});

test('NovoDiv — arquivo sem início detectado entra como Erro e o lote continua', async (t) => {
    const pagina = await abrirNovoDiv(t, {
        pdfjsLib: pdfjsPorArquivo([
            criarPdfjsFake([PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO]),
            criarPdfjsFake(['página 1', 'página 2']),
        ]),
        tesseract: criarTesseractFake([OCR_VAZIO]),
    });
    selecionar(pagina, [await arquivoDeTeste(pagina, `bom ${CNJ}.pdf`, 4), await arquivoDeTeste(pagina, `ruim ${CNJ}.pdf`, 2)]);

    await processar(pagina);

    assert.deepEqual(pagina.destino.caminhos(), [`Docs_${CNJ}.pdf`, `Inicial_${CNJ}.pdf`]);
    assert.deepEqual(pagina.textos('.summary .stat strong'), ['2', '1', '0', '1']);
    assert.deepEqual(celulasDaLinha(pagina, 1), ['ruim ' + CNJ + '.pdf', '-', '-', 'Erro: Não detectou início (mesmo com OCR)']);
    assert.equal(pagina.seletor('#reportTbody tr:nth-child(2) .badge').className, 'badge badge-fail');
    assert.equal(pagina.texto('#miniLog'), '> ERRO: Não detectou início (mesmo com OCR)');
    assert.deepEqual(pagina.tesseract.registro.workers, ['por']);
    assert.equal(pagina.tesseract.registro.reconhecimentos, 2);
    assert.equal(pagina.tesseract.registro.terminados, 1);
});

test('NovoDiv — sem o tesseract da CDN o arquivo que precisa de OCR morre como Erro', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: ['página 1', 'página 2'] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 2)]);

    await processar(pagina);

    assert.deepEqual(pagina.destino.caminhos(), []);
    assert.deepEqual(pagina.textos('.summary .stat strong'), ['1', '0', '0', '1']);
    assert.deepEqual(celulasDaLinha(pagina, 0), [NOME, '-', '-', 'Erro: Tesseract is not defined']);

    // A correção de um processo que falhou abre sem intervalo detectado.
    pagina.janela.openManualSplit(CNJ);
    await pagina.aguardar(() => pagina.seletor('#customViewer').style.display === 'flex', { descricao: 'editor do processo com erro' });
    assert.equal(pagina.seletor('#manualStart').value, '1');
    assert.equal(pagina.seletor('#manualEnd').value, '1');
    assert.equal(pagina.texto('#lblTotalPages'), '2');
});

test('NovoDiv — texto fraco com OCR de emergência encontra o início e marca a revisão', async (t) => {
    const tesseract = criarTesseractFake([OCR_INICIAL]);
    const pagina = await abrirNovoDiv(t, { paginas: ['página 1', 'página 2', 'página 3'], tesseract });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 3)]);

    await processar(pagina);

    assert.deepEqual(pagina.destino.caminhos(), [`Inicial_${CNJ}.pdf`]);
    assert.deepEqual(await tamanhosGravados(pagina, `Inicial_${CNJ}.pdf`), [[100, 200], [101, 200], [102, 200]]);
    // Uma leitura acha o início; depois o toy relê as páginas 2 e 3 atrás do fechamento.
    assert.equal(tesseract.registro.reconhecimentos, 3);
    assert.equal(tesseract.registro.terminados, 1);
    assert.deepEqual(pagina.textos('.summary .stat strong'), ['1', '0', '1', '0']);
    assert.deepEqual(celulasDaLinha(pagina, 0), [NOME, '1 a 3 (3p)', 'Inicial Corrigir', 'Revisar']);
    assert.deepEqual(pagina.mensagens('log').map((m) => m.texto), [
        'Destino selecionado: Destino',
        `Lendo bytes de ${NOME}...`,
        'Detectando limites...',
        '   [!] Imagem sem texto detectada. Iniciando OCR de emergência...',
        '   > Lendo pág 1 com OCR...',
        '   > Lendo pág 2 com OCR...',
        '   > Lendo pág 3 com OCR...',
        'Separando PDF (1 a 3)...',
        'Salvo com sucesso.',
    ]);
});

test('NovoDiv — sem permissão de escrita o erro do app aparece na linha do relatório', async (t) => {
    const destino = montarArvore('Destino');
    destino.negarPermissao = true;
    const pagina = await abrirNovoDiv(t, {
        destino,
        paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO],
    });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);

    await processar(pagina);

    assert.deepEqual(pagina.destino.caminhos(), []);
    assert.deepEqual(pagina.textos('.summary .stat strong'), ['1', '0', '0', '1']);
    assert.deepEqual(celulasDaLinha(pagina, 0), [
        NOME,
        '-',
        '-',
        'Erro: É necessário conceder permissão de escrita na pasta de destino.',
    ]);
});

test('NovoDiv — o relatório abre, exporta CSV com as colunas exatas e fecha nos botões', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);

    const blobs = espionarBlobs(pagina);
    pagina.clicar('#btnViewReport');
    assert.equal(pagina.seletor('#modalOverlay').classList.contains('open'), true);
    pagina.clicar('#btnCloseModal');
    assert.equal(pagina.seletor('#modalOverlay').classList.contains('open'), false);
    pagina.clicar('#btnViewReport');
    pagina.clicar('#modalOverlay');
    assert.equal(pagina.seletor('#modalOverlay').classList.contains('open'), false);

    pagina.clicar('#btnExportCsv');
    assert.equal(pagina.registro.downloads.length, 1);
    assert.match(pagina.registro.downloads[0].nome, /^NovoDiv_Relatorio_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/);

    const csv = new Uint8Array(await blobs[0].arrayBuffer());
    assert.deepEqual([...csv.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(
        new TextDecoder().decode(csv.slice(3)),
        'Arquivo;CNJ;Pagina_Inicial;Pagina_Final;Total_Paginas_Peticao;Status;Precisa_Revisao;Flags;Mensagem_Erro\n'
        + `"${NOME}";${CNJ};2;3;2;OK;NÃO;;`
    );
});

test('NovoDiv — CSV de revisão e de erro sai com os campos citados', async (t) => {
    const pagina = await abrirNovoDiv(t, {
        pdfjsLib: pdfjsPorArquivo([
            criarPdfjsFake([PAGINA_NEUTRA, PAGINA_NEUTRA]),
            criarPdfjsFake(['página 1', 'página 2']),
        ]),
    });
    selecionar(pagina, [await arquivoDeTeste(pagina, `revisar ${CNJ}.pdf`, 2), await arquivoDeTeste(pagina, `erro ${CNJ}.pdf`, 2)]);

    await processar(pagina);

    const blobs = espionarBlobs(pagina);
    pagina.clicar('#btnExportCsv');
    const csv = new Uint8Array(await blobs[0].arrayBuffer());
    assert.deepEqual([...csv.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(
        new TextDecoder().decode(csv.slice(3)),
        'Arquivo;CNJ;Pagina_Inicial;Pagina_Final;Total_Paginas_Peticao;Status;Precisa_Revisao;Flags;Mensagem_Erro\n'
        + `"revisar ${CNJ}.pdf";${CNJ};1;2;2;REVISAR;SIM;"review";\n`
        + `"erro ${CNJ}.pdf";${CNJ};;;;ERRO;NÃO;;"Tesseract is not defined"`
    );
});

test('NovoDiv — exportar sem processar nada não baixa arquivo', async (t) => {
    const pagina = await abrirNovoDiv(t);

    pagina.clicar('#btnExportCsv');
    assert.deepEqual(pagina.registro.downloads, []);
});

test('NovoDiv — visualizar Inicial e Docs abre o PDF gravado no visualizador nativo', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);
    await pagina.tick(0);

    pagina.clicar('#reportTbody button:nth-child(1)');
    await pagina.aguardar(() => pagina.seletor('#pdfModal').classList.contains('open'), { descricao: 'modal do visualizador' });

    assert.equal(pagina.texto('#pdfModalName'), `Inicial_${CNJ}.pdf`);
    assert.equal(pagina.seletor('#pdfViewer').style.display, 'block');
    assert.equal(pagina.seletor('#customViewer').style.display, 'none');
    assert.equal(pagina.seletor('#manualSplitControls').classList.contains('hidden'), true);
    assert.match(pagina.atributo('#pdfViewer', 'src'), /^blob:/);
    assert.deepEqual([...pagina.registro.urls.values()].map((blob) => blob.type), ['application/pdf']);

    // Abrir outro PDF troca a URL e libera a anterior.
    pagina.clicar('#reportTbody button:nth-child(2)');
    await pagina.aguardar(() => pagina.texto('#pdfModalName') === `Docs_${CNJ}.pdf`, { descricao: 'visualizador dos docs' });
    assert.equal(pagina.registro.urls.size, 1);

    // Clicar fora do modal também fecha.
    pagina.clicar('#pdfModal');
    assert.equal(pagina.seletor('#pdfModal').classList.contains('open'), false);
    assert.equal(pagina.atributo('#pdfViewer', 'src'), '');
    assert.equal(pagina.registro.urls.size, 0);
});

test('NovoDiv — arquivo gerado apagado da pasta faz o visualizador avisar o erro', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);
    await pagina.tick(0);

    await pagina.destino.handle.removeEntry(`Inicial_${CNJ}.pdf`);
    pagina.clicar('#reportTbody button:nth-child(1)');
    await pagina.aguardar(() => pagina.alertas.length === 1, { descricao: 'erro de leitura' });

    assert.deepEqual(pagina.alertas, [
        `Não foi possível carregar o PDF gerado: O arquivo ou diretório "Inicial_${CNJ}.pdf" não existe.`,
    ]);
    assert.equal(pagina.seletor('#pdfModal').classList.contains('open'), false);
});

test('NovoDiv — Corrigir abre o editor com o intervalo detectado e a divisão manual sobrescreve', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);
    await pagina.tick(0);

    // Antes do primeiro render o zoom parte do ajuste padrão (1.0) e o render é ignorado.
    pagina.clicar('#btnZoomFit');
    pagina.clicar('#btnZoomOut');
    assert.equal(pagina.texto('#btnZoomFit'), 'Fit');

    pagina.clicar('#reportTbody button:nth-child(3)');
    await pagina.aguardar(() => pagina.seletor('#customViewer').style.display === 'flex', { descricao: 'editor aberto' });

    assert.equal(pagina.texto('#pdfModalName'), NOME);
    assert.equal(pagina.seletor('#manualSplitControls').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#pdfViewer').style.display, 'none');
    assert.equal(pagina.seletor('#manualStart').value, '2');
    assert.equal(pagina.seletor('#manualEnd').value, '3');
    assert.equal(pagina.texto('#lblTotalPages'), '4');
    assert.equal(pagina.seletor('#inpCurrentPage').value, '2');
    assert.equal(pagina.texto('#btnZoomFit'), 'Fit');

    // Zoom: sem zoom manual o rótulo é Fit; depois passa a mostrar o percentual.
    pagina.clicar('#btnZoomOut');
    await pagina.aguardar(() => pagina.texto('#btnZoomFit') === '40%', { descricao: 'zoom reduzido a partir do Fit' });
    pagina.clicar('#btnZoomFit');
    await pagina.aguardar(() => pagina.texto('#btnZoomFit') === 'Fit', { descricao: 'ajuste à tela' });
    pagina.clicar('#btnZoomIn');
    await pagina.aguardar(() => pagina.texto('#btnZoomFit') !== 'Fit', { descricao: 'zoom manual' });
    assert.equal(pagina.texto('#btnZoomFit'), '10%');
    pagina.clicar('#btnZoomOut');
    await pagina.aguardar(() => pagina.texto('#btnZoomFit') === '40%', { descricao: 'zoom reduzido' });
    pagina.clicar('#btnZoomFit');
    await pagina.aguardar(() => pagina.texto('#btnZoomFit') === 'Fit', { descricao: 'ajuste à tela' });

    // Marcar início/fim copia a página exibida.
    pagina.digitar('#inpCurrentPage', '3');
    await pagina.aguardar(() => pagina.seletor('#inpCurrentPage').value === '3', { descricao: 'página 3 no campo' });
    pagina.clicar('#btnMarkStart');
    assert.equal(pagina.seletor('#manualStart').value, '3');
    pagina.clicar('#btnMarkEnd');
    assert.equal(pagina.seletor('#manualEnd').value, '3');

    // Fora do documento o campo é ignorado.
    pagina.digitar('#inpCurrentPage', '9');
    await pagina.tick(20);
    assert.equal(pagina.seletor('#inpCurrentPage').value, '9');
    assert.equal(pagina.seletor('#manualEnd').value, '3');

    pagina.digitar('#manualStart', '1');
    pagina.digitar('#manualEnd', '2');
    pagina.clicar('#btnManualSplit');
    await pagina.aguardar(() => pagina.alertas.length === 1, { descricao: 'divisão manual' });

    assert.deepEqual(pagina.alertas, ['Divisão manual concluída e sobrescrita com sucesso!']);
    assert.deepEqual(await tamanhosGravados(pagina, `Inicial_${CNJ}.pdf`), [[100, 200], [101, 200]]);
    assert.deepEqual(await tamanhosGravados(pagina, `Docs_${CNJ}.pdf`), [[102, 200], [103, 200]]);
    assert.deepEqual(celulasDaLinha(pagina, 0), [NOME, '1 a 2 (2p)', 'Inicial Docs Corrigir', 'OK']);
    assert.equal(pagina.seletor('#pdfModal').classList.contains('open'), false);
    assert.equal(pagina.texto('#btnManualSplit'), 'Dividir');
});

test('NovoDiv — divisão manual com intervalo inválido é recusada', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);
    await pagina.tick(0);

    // Sem correção aberta o botão Dividir não faz nada.
    pagina.clicar('#btnManualSplit');
    assert.deepEqual(pagina.alertas, []);

    pagina.clicar('#reportTbody button:nth-child(3)');
    await pagina.aguardar(() => pagina.seletor('#customViewer').style.display === 'flex', { descricao: 'editor aberto' });

    pagina.digitar('#manualStart', '');
    pagina.clicar('#btnManualSplit');
    assert.deepEqual(pagina.alertas, ['Intervalo de páginas inválido.']);

    pagina.digitar('#manualStart', '3');
    pagina.digitar('#manualEnd', '1');
    pagina.clicar('#btnManualSplit');
    assert.deepEqual(pagina.alertas, ['Intervalo de páginas inválido.', 'Intervalo de páginas inválido.']);
    assert.deepEqual(await tamanhosGravados(pagina, `Inicial_${CNJ}.pdf`), [[101, 200], [102, 200]]);
    assert.equal(pagina.texto('#btnManualSplit'), 'Dividir');
});

test('NovoDiv — falha ao gravar na correção manual mostra o erro da divisão', async (t) => {
    const destino = montarArvore('Destino');
    const pagina = await abrirNovoDiv(t, {
        destino,
        paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO],
    });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);
    await pagina.tick(0);

    pagina.clicar('#reportTbody button:nth-child(3)');
    await pagina.aguardar(() => pagina.seletor('#customViewer').style.display === 'flex', { descricao: 'editor aberto' });

    destino.negarPermissao = true;
    pagina.clicar('#btnManualSplit');
    await pagina.aguardar(() => pagina.alertas.length === 1, { descricao: 'erro da divisão' });

    assert.deepEqual(pagina.alertas, ['Erro na divisão: É necessário conceder permissão de escrita na pasta de destino.']);
    assert.equal(pagina.seletor('#btnManualSplit').disabled, false);
    assert.equal(pagina.texto('#btnManualSplit'), 'Dividir');
    assert.deepEqual(await tamanhosGravados(pagina, `Inicial_${CNJ}.pdf`), [[101, 200], [102, 200]]);
});

test('NovoDiv — a roda do mouse troca de página no editor, com pausa, impulso e intervalo', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);
    await pagina.tick(0);

    let agora = 1_000_000;
    pagina.janela.Date.now = () => agora;
    const girarSemEspera = (opcoes) => pagina.seletor('#customViewer').dispatchEvent(
        new pagina.janela.WheelEvent('wheel', { bubbles: true, cancelable: true, ...opcoes })
    );
    const girar = async (opcoes) => {
        girarSemEspera(opcoes);
        await pagina.tick(20);
    };

    // Sem PDF aberto o giro é ignorado.
    await girar({ deltaY: 200 });
    assert.equal(pagina.seletor('#inpCurrentPage').value, '');

    pagina.clicar('#reportTbody button:nth-child(3)');
    await pagina.aguardar(() => pagina.seletor('#inpCurrentPage').value === '2', { descricao: 'editor na página 2' });

    // Gesto de zoom do sistema é ignorado.
    await girar({ deltaY: 200, ctrlKey: true });
    assert.equal(pagina.seletor('#inpCurrentPage').value, '2');

    // Giro novo: a primeira rodada já vale uma página.
    await girar({ deltaY: 200 });
    await pagina.aguardar(() => pagina.seletor('#inpCurrentPage').value === '3', { descricao: 'roda para baixo' });

    // Mesmo gesto: impulso fraco não troca de página.
    agora += 10;
    await girar({ deltaY: 100 });
    assert.equal(pagina.seletor('#inpCurrentPage').value, '3');

    // Impulso suficiente, mas dentro do intervalo mínimo entre trocas.
    agora += 10;
    await girar({ deltaY: 300 });
    assert.equal(pagina.seletor('#inpCurrentPage').value, '3');

    // Passado o intervalo, o impulso acumulado rende outra página.
    agora += 200;
    await girar({ deltaY: 200 });
    await pagina.aguardar(() => pagina.seletor('#inpCurrentPage').value === '4', { descricao: 'última página' });

    // Na última página, girar para baixo não passa do fim.
    agora += 200;
    await girar({ deltaY: 150 });
    assert.equal(pagina.seletor('#inpCurrentPage').value, '4');

    // deltaY zero conta como impulso mínimo (e, sem sinal positivo, sobe uma página).
    agora += 200;
    await girar({ deltaY: 0 });
    await pagina.aguardar(() => pagina.seletor('#inpCurrentPage').value === '3', { descricao: 'deltaY zero' });

    // Giro para cima volta outra página.
    agora += 200;
    await girar({ deltaY: -150 });
    await pagina.aguardar(() => pagina.seletor('#inpCurrentPage').value === '2', { descricao: 'roda para cima' });

    // Na primeira página, girar para cima não sai do documento.
    pagina.digitar('#inpCurrentPage', '1');
    await pagina.aguardar(() => pagina.seletor('#inpCurrentPage').value === '1', { descricao: 'primeira página' });
    agora += 200;
    await girar({ deltaY: -150 });
    assert.equal(pagina.seletor('#inpCurrentPage').value, '1');

    // Durante a renderização o giro é descartado: só a primeira rodada vale.
    agora += 200;
    girarSemEspera({ deltaY: 150 });
    girarSemEspera({ deltaY: 150 });
    await pagina.tick(20);
    await pagina.aguardar(() => pagina.seletor('#inpCurrentPage').value === '2', { descricao: 'uma página por gesto' });
});

test('NovoDiv — heurística: tabela de documentos divididos', async (t) => {
    const pagina = await abrirNovoDiv(t, { tesseract: criarTesseractFake([OCR_VAZIO]) });

    const cenarios = [
        {
            nome: 'identificador PJe muda -> fim por identificador',
            paginas: [PAGINA_SISTEMA, `${PAGINA_INICIAL}\nNum. 100 - Pág. 1`, `Num. 100 - Pág. 2\n${FILLER}`, `Num. 200 - Pág. 1\n${FILLER}`],
            esperado: { start: 2, end: 3, confidence: 3, flags: [], total: 4 },
        },
        {
            nome: 'Projudi e eproc também identificam documento',
            paginas: [PAGINA_INICIAL, `Id. 45 - Pág. 9\n${FILLER}`, `Evento 12, PETICAO,\n${FILLER}`],
            esperado: { start: 1, end: 2, confidence: 3, flags: [], total: 3 },
        },
        {
            nome: 'fechamento com OAB confirmado por documento novo',
            paginas: [PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO],
            esperado: { start: 1, end: 2, confidence: 3, flags: [], total: 3 },
        },
        {
            nome: 'fechamento sem OAB confirmado por página de sistema',
            paginas: [PAGINA_INICIAL, FECHAMENTO_SEM_OAB, PAGINA_SISTEMA],
            esperado: { start: 1, end: 2, confidence: 2, flags: ['review'], total: 3 },
        },
        {
            nome: 'fechamento isolado, sem OAB e sem página seguinte',
            paginas: [PAGINA_INICIAL, FECHAMENTO_SEM_OAB],
            esperado: { start: 1, end: 2, confidence: 1, flags: ['review'], total: 2 },
        },
        {
            nome: 'fechamento com OAB na última página fecha pelos sinais',
            paginas: [PAGINA_INICIAL, PAGINA_FECHAMENTO],
            esperado: { start: 1, end: 2, confidence: 2, flags: ['review'], total: 2 },
        },
        {
            nome: 'sem sinal de fim a Inicial vai até o fim do arquivo',
            paginas: [PAGINA_INICIAL, PAGINA_NEUTRA, PAGINA_NEUTRA],
            esperado: { start: 1, end: 3, confidence: 2, flags: ['review'], total: 3 },
        },
        {
            nome: 'início por fallback (sem saudação a juízo)',
            paginas: [PAGINA_NEUTRA, PAGINA_NEUTRA],
            esperado: { start: 1, end: 2, confidence: 0, flags: ['review'], total: 2 },
        },
        {
            nome: 'PROCON: notificação abre o processo e vai até o fim',
            paginas: [`TERMO DE NOTIFICAÇÃO\n${FILLER}`, PAGINA_NEUTRA],
            esperado: { start: 1, end: 2, confidence: 2, flags: ['PROCON', 'review'] },
        },
        {
            nome: 'PROCON: troca de identificador fecha a notificação',
            paginas: [`TERMO DE NOTIFICAÇÃO\n${FILLER}`, `Num. 7 - Pág. 1\n${FILLER}`, `Num. 8 - Pág. 1\n${FILLER}`],
            esperado: { start: 1, end: 2, confidence: 3, flags: ['PROCON', 'review'] },
        },
        {
            nome: 'PROCON: página de sistema fecha a notificação',
            paginas: [`TERMO DE NOTIFICAÇÃO\n${FILLER}`, PAGINA_SISTEMA],
            esperado: { start: 1, end: 1, confidence: 3, flags: ['PROCON', 'review'] },
        },
        {
            nome: 'PROCON: documento novo fecha a notificação',
            paginas: [`TERMO DE NOTIFICAÇÃO\n${FILLER}`, PAGINA_PROCURACAO],
            esperado: { start: 1, end: 1, confidence: 3, flags: ['PROCON', 'review'] },
        },
        {
            nome: 'PROCON: notificação pelo número do atendimento',
            paginas: [`${FILLER}\nNOTIFICAÇÃO de abertura\nNúmero do Atendimento: 123`, PAGINA_NEUTRA],
            esperado: { start: 1, end: 2, confidence: 2, flags: ['PROCON', 'review'] },
        },
        {
            nome: 'eproc: INIC1 desloca o início e TERMO2 assume',
            paginas: [
                `Evento 5, INIC1,\n${FILLER}`,
                PAGINA_INICIAL,
                `Evento 9, TERMO2,\n${FILLER}`,
                PAGINA_FECHAMENTO,
                PAGINA_PROCURACAO,
            ],
            esperado: { start: 3, end: 4, confidence: 2, flags: ['TERMO2', 'review'], total: 5 },
        },
        {
            nome: 'fechamento com OAB confirmado por página de sistema',
            paginas: [PAGINA_INICIAL, PAGINA_FECHAMENTO, 'Classe: Procedimento Comum\nÓrgão julgador: 1ª Vara Cível'],
            esperado: { start: 1, end: 2, confidence: 3, flags: [], total: 3 },
        },
        {
            nome: 'eproc: INIC1 confirma o início por fallback',
            paginas: [`Evento 5, INIC1,\n${PAGINA_NEUTRA}`, PAGINA_NEUTRA],
            esperado: { start: 1, end: 2, confidence: 1, flags: ['review'], total: 2 },
        },
        {
            nome: 'eproc: páginas de sistema no meio não quebram o INIC1',
            paginas: [PAGINA_NEUTRA, `Evento 5, INIC1,\n${FILLER}`, PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_NEUTRA],
            esperado: { start: 2, end: 5, confidence: 2, flags: ['review'], total: 5 },
        },
        {
            nome: 'primeira candidata curta cede para a seguinte',
            paginas: [
                PAGINA_INICIAL,
                `Num. 50 - Pág. 1\n${FILLER}`,
                PAGINA_SISTEMA,
                `${PAGINA_INICIAL}\nNum. 60 - Pág. 1`,
                PAGINA_SISTEMA,
                `Num. 70 - Pág. 1\n${FILLER}`,
            ],
            esperado: { start: 4, end: 5, confidence: 2, flags: ['review'], total: 6 },
        },
        {
            nome: 'Inicial com mais de 60 páginas perde um ponto',
            paginas: [PAGINA_INICIAL, ...new Array(60).fill(PAGINA_NEUTRA), PAGINA_FECHAMENTO],
            esperado: { start: 1, end: 62, confidence: 2, flags: ['review'], total: 62 },
        },
        {
            nome: 'QR-CODE fecha pelo conteúdo da página seguinte',
            paginas: [PAGINA_INICIAL, PAGINA_NEUTRA, `QR-CODE para conferência\n${FILLER}`],
            esperado: { start: 1, end: 2, confidence: 3, flags: [], total: 3 },
        },
        {
            nome: 'sem início nem com OCR o arquivo volta com erro',
            paginas: ['página 1', 'página 2'],
            esperado: { start: null, end: null, error: 'Não detectou início (mesmo com OCR)' },
        },
    ];

    for (const cenario of cenarios) {
        assert.deepEqual(await detectar(pagina, cenario.paginas), cenario.esperado, cenario.nome);
    }
});

test('NovoDiv — heurística: reconhecedores de página, documento e fechamento', async (t) => {
    const pagina = await abrirNovoDiv(t);
    const { isSystemPage, isNewDocByContent, isRealClosing, extractDocId, hasPetitionEndSignal } = pagina.janela;

    const LONGO = `${PAGINA_NEUTRA} ${PAGINA_NEUTRA}`;
    assert.equal(isSystemPage(''), true);
    assert.equal(isSystemPage('curto demais'), true);
    assert.equal(isSystemPage(`PÁGINA DE SEPARAÇÃO\n${FILLER}`), true);
    assert.equal(isSystemPage(`Gerada automaticamente pelo sistema\n${FILLER}`), true);
    assert.equal(isSystemPage(`Nº do processo 0000001-02.2025.8.26.0100\n${FILLER}`), true);
    assert.equal(isSystemPage(`Data de autuação: 10/01/2025\n${FILLER}`), true);
    assert.equal(isSystemPage(`Classe: Procedimento Comum\n${FILLER}`), true);
    assert.equal(isSystemPage(`Órgão julgador: 1ª Vara\n${FILLER}`), true);
    assert.equal(isSystemPage(`Assunto: Cobrança\n${FILLER}`), true);
    assert.equal(isSystemPage(`Número: 123\n${FILLER}`), true);
    assert.equal(isSystemPage(`PROCEDIMENTO DO JUIZADO ESPECIAL\n${FILLER}`), true);
    assert.equal(isSystemPage(`JEF Previdenciária\n${FILLER}`), true);
    assert.equal(isSystemPage(`Benefício Prev.\n${FILLER}`), true);
    assert.equal(isSystemPage(`PROCESSO em andamento\n${FILLER}`), true);
    assert.equal(isSystemPage(`PROCESSO em andamento\n${LONGO}`), false);
    assert.equal(isSystemPage(PAGINA_NEUTRA), false);

    assert.equal(isNewDocByContent(''), false);
    assert.equal(isNewDocByContent(PAGINA_NEUTRA), false);
    assert.equal(isNewDocByContent('PROCURAÇÃO AD JUDICIA'), true);
    assert.equal(isNewDocByContent('P R O C U R A C A O'), true);
    assert.equal(isNewDocByContent('Resumo da conta'), true);
    assert.equal(isNewDocByContent('CREDNET demonstrativo'), true);
    assert.equal(isNewDocByContent('SERASA consulta'), true);
    assert.equal(isNewDocByContent('SPC Brasil negativa'), true);
    assert.equal(isNewDocByContent('Calculadora de débitos'), true);
    assert.equal(isNewDocByContent('INSS extrato'), true);
    assert.equal(isNewDocByContent('QR-CODE do documento'), true);
    assert.equal(isNewDocByContent('fls. 42 do processo'), true);
    assert.equal(isNewDocByContent('Processo: 1234'), true);
    assert.equal(isNewDocByContent('TERMO DE NOTIFICAÇÃO'), true);
    assert.equal(isNewDocByContent('Para conferir o original, acesse'), true);
    assert.equal(isNewDocByContent('Carteira de Trabalho digital'), true);
    assert.equal(isNewDocByContent('RG do autor'), true);
    assert.equal(isNewDocByContent('Cédula de Identidade'), true);
    assert.equal(isNewDocByContent('COMPROVANTE de residência'), true);
    assert.equal(isNewDocByContent('DECLARAÇÃO de pobreza'), true);
    assert.equal(isNewDocByContent('Termo de Audiência'), true);
    assert.equal(isNewDocByContent('CERTIDÃO de intimação'), true);
    assert.equal(isNewDocByContent('Documento comum\nPÁGINA DE SEPARAÇÃO\nmais conteúdo'), true);

    assert.equal(isRealClosing('Pede deferimento.'), true);
    assert.equal(isRealClosing('Pede-se deferimento.'), true);
    assert.equal(isRealClosing('pede e espera deferimento'), true);
    assert.equal(isRealClosing('Confia e espera deferimento'), true);
    assert.equal(isRealClosing('Confia no deferimento'), true);
    assert.equal(isRealClosing('P. Deferimento'), true);
    assert.equal(isRealClosing('Termos em que'), true);
    assert.equal(isRealClosing('Nestes termos'), true);
    assert.equal(isRealClosing('Nesses termos'), true);
    assert.equal(isRealClosing('Dá-se a causa o valor de R$ 1.000'), true);
    assert.equal(isRealClosing('Sendo assim'), true);
    assert.equal(isRealClosing('a consumidora requer que seja deferido'), true);
    assert.equal(isRealClosing('VALOR DA CAUSA: R$ 1.000'), true);
    assert.equal(isRealClosing('Pede deferimento do pedido'), false);
    assert.equal(isRealClosing('Nada consta'), false);

    assert.deepEqual(dados(extractDocId('Num. 123 - Pág. 4')), ['pje', '123']);
    assert.deepEqual(dados(extractDocId('Id. 45 - Pág. 2')), ['projudi', '45']);
    assert.deepEqual(dados(extractDocId('Evento 12, PETICAO,')), ['eproc', 'PETICAO']);
    assert.deepEqual(dados(extractDocId('texto qualquer')), [null, null]);
    assert.deepEqual(dados(extractDocId(`${'x'.repeat(1600)}\nNum. 9 - Pág. 1`)), [null, null]);

    assert.equal(hasPetitionEndSignal('Advogado\nOAB/SP 123.456'), true);
    assert.equal(hasPetitionEndSignal('Defensoria Pública do Estado'), true);
    assert.equal(hasPetitionEndSignal('Valor: R$ 1.000,00'), true);
    assert.equal(hasPetitionEndSignal('fls. 42'), true);
    assert.equal(hasPetitionEndSignal('valor da causa'), true);
    assert.equal(hasPetitionEndSignal(PAGINA_NEUTRA), false);
    assert.equal(hasPetitionEndSignal(`OAB/SP 123\n${new Array(25).fill(FILLER).join('\n')}`), true);
    assert.equal(hasPetitionEndSignal(`Pede deferimento.\n${new Array(25).fill(FILLER).join('\n')}`), false);
});

test('NovoDiv — OCR de emergência relê só as páginas sem texto e fecha no OAB', async (t) => {
    const OCR_FECHAMENTO = 'Ante o exposto, pede deferimento.\nOAB/SP 123.456';
    const tesseract = criarTesseractFake([OCR_INICIAL, OCR_FECHAMENTO]);
    const pagina = await abrirNovoDiv(t, {
        paginas: ['página 1', 'texto médio de segunda página com mais de cinquenta caracteres', 'página 3'],
        tesseract,
    });

    // A segunda página já tem texto suficiente: nenhuma releitura dela.
    assert.deepEqual(await detectar(pagina, ['página 1', 'texto médio de segunda página com mais de cinquenta caracteres', 'página 3']), {
        start: 1,
        end: 3,
        confidence: 1,
        flags: ['OCR', 'review'],
        total: 3,
    });

    assert.equal(tesseract.registro.reconhecimentos, 2);
    assert.equal(tesseract.registro.terminados, 1);
    assert.deepEqual(pagina.mensagens('log').map((m) => m.texto), [
        '   [!] Imagem sem texto detectada. Iniciando OCR de emergência...',
        '   > Lendo pág 1 com OCR...',
        '   > Lendo pág 3 com OCR...',
    ]);
});

test('NovoDiv — visualizador e correção não fazem nada antes de escolher a pasta', async (t) => {
    const pagina = await abrirNovoDiv(t);

    pagina.janela.viewPdf('Inicial', CNJ);
    pagina.janela.openManualSplit(CNJ);

    assert.equal(pagina.seletor('#pdfModal').classList.contains('open'), false);
    assert.deepEqual(pagina.alertas, []);
    assert.deepEqual(pagina.registro.urls.size, 0);
});

test('NovoDiv — falha ao abrir a correção e processo fora da memória avisam o usuário', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);
    await pagina.tick(0);

    // A leitura do PDF para correção falha: o toy avisa sem travar a tela.
    pagina.janela.pdfjsLib = criarPdfjsFake(['página'], { falharCarga: 'PDF corrompido' });
    pagina.clicar('#reportTbody button:nth-child(3)');
    await pagina.aguardar(() => pagina.alertas.length === 1, { descricao: 'erro ao abrir a correção' });
    assert.deepEqual(pagina.alertas, ['Erro ao abrir PDF para edição visual: PDF corrompido']);
    assert.equal(pagina.seletor('#customViewer').style.display, 'flex');

    // Depois de limpar a fila o processo não está mais na memória.
    pagina.clicar('#btnRestart');
    pagina.clicar('#reportTbody button:nth-child(3)');
    assert.deepEqual(pagina.alertas, [
        'Erro ao abrir PDF para edição visual: PDF corrompido',
        'Arquivo original não encontrado na memória.',
    ]);
    assert.equal(pagina.seletor('#pdfModal').classList.contains('open'), true);
});

test('NovoDiv — Refazer seleção e Novo Processamento zeram a tela', async (t) => {
    const pagina = await abrirNovoDiv(t, { paginas: [PAGINA_SISTEMA, PAGINA_INICIAL, PAGINA_FECHAMENTO, PAGINA_PROCURACAO] });
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);

    pagina.clicar('#btnClear');
    assert.equal(pagina.seletor('#stepUpload').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#stepDashboard').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#doneSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#progressSection').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#fileBadge').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#actionUpload').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#fileInput').value, '');
    assert.deepEqual(pagina.textos('.summary .stat strong'), ['0', '0', '0', '0']);
    assert.equal(pagina.seletor('#progressBar').style.width, '0%');
    assert.equal(pagina.texto('#progressText'), '0%');
    assert.equal(pagina.seletor('#stepIndicator1').className, 'step active');
    assert.equal(pagina.seletor('#stepIndicator3').className, 'step');

    // Sem dados, exportar não faz nada.
    pagina.clicar('#btnExportCsv');
    assert.deepEqual(pagina.registro.downloads, []);

    // Novo Processamento faz o mesmo caminho.
    pagina.app.enfileirarPasta(pagina.destino);
    selecionar(pagina, [await arquivoDeTeste(pagina, NOME, 4)]);
    await processar(pagina);
    pagina.clicar('#btnRestart');
    assert.equal(pagina.seletor('#stepUpload').classList.contains('hidden'), false);
    assert.deepEqual(pagina.textos('.summary .stat strong'), ['0', '0', '0', '0']);
});
