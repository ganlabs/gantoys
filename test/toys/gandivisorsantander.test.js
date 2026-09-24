import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy, criarPdfjsFake } from '../../testkit/index.js';

const CNJ = '5710472-75.2025.8.09.0051';
const CNJ_CRU = '57104727520258090051';
const SUFIXO = ` - ${CNJ}`;
const PAGINAS_PADRAO = ['primeira página', 'segunda página', 'terceira página'];

function dados(valor) {
    return JSON.parse(JSON.stringify(valor));
}

// O pdf.js é dublê: o número de páginas do documento vem das páginas que o teste
// monta no dublê, e o PDF real (pdf-lib) é criado com a mesma quantidade, para a
// cópia das páginas ser exercitada de verdade.
async function abrirDivisor(t, opcoes = {}) {
    const paginas = opcoes.paginas || PAGINAS_PADRAO;
    const pdfjsLib = opcoes.pdfjsLib || criarPdfjsFake(paginas);
    const pagina = await carregarToy('gandivisorsantander', { globais: { pdfjsLib } });
    t.after(() => pagina.fechar());
    pagina.totalPaginas = paginas.length;
    pagina.pdfjsLib = pdfjsLib;

    const alertas = [];
    const confirms = [];
    let resposta = true;
    pagina.janela.alert = (mensagem) => { alertas.push(String(mensagem)); };
    pagina.janela.confirm = (mensagem) => { confirms.push(String(mensagem)); return resposta; };
    pagina.alertas = alertas;
    pagina.confirms = confirms;
    pagina.responderConfirm = (valor) => { resposta = valor; };
    return pagina;
}

/** PDF real com uma página por índice; a página i tem largura 100+i. */
async function pdfDeTeste(pagina, quantidade) {
    const bytes = await pagina.script(`(async () => {
        const doc = await PDFLib.PDFDocument.create();
        for (let i = 0; i < ${quantidade}; i++) doc.addPage([100 + i, 200]);
        return Array.from(await doc.save());
    })()`);
    return new Uint8Array(bytes);
}

/** Tamanhos das páginas de um PDF gerado, na ordem — prova da divisão feita. */
async function tamanhosDoBlob(pagina, blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    pagina.janela.__bytesDoTeste = Array.from(bytes);
    const tamanhos = await pagina.script(`(async () => {
        const doc = await PDFLib.PDFDocument.load(new Uint8Array(__bytesDoTeste));
        return doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
    })()`);
    return dados(tamanhos);
}

function arquivoDe(pagina, nome, bytes) {
    return new pagina.janela.File([bytes], nome, { type: 'application/pdf' });
}

function selecionar(pagina, arquivos) {
    Object.defineProperty(pagina.seletor('#pdfInput'), 'files', { value: arquivos, configurable: true });
    pagina.disparar('#pdfInput', 'change');
}

/** Carrega um PDF do lote e espera a primeira página aparecer no visualizador. */
async function carregarUm(pagina, nome) {
    const bytes = await pdfDeTeste(pagina, pagina.totalPaginas);
    selecionar(pagina, [arquivoDe(pagina, nome, bytes)]);
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === `Página 1 de ${pagina.totalPaginas}`, {
        descricao: 'primeira página',
    });
}

function blobsBaixados(pagina) {
    return pagina.registro.downloads.map((item) => ({
        nome: item.nome,
        blob: pagina.registro.urls.get(item.href),
    }));
}

function textoPlano(pagina, seletor) {
    return pagina.texto(seletor).replace(/\s+/g, ' ');
}

function esperarResultado(pagina, timeout = 5000) {
    return pagina.aguardar(() => pagina.seletor('#resultSection').style.display === 'block', {
        descricao: 'seção de resultado',
        timeout,
    });
}

function esperarFimDoLote(pagina, timeout = 8000) {
    return pagina.aguardar(() => pagina.seletor('#processSection').style.display === 'block', {
        descricao: 'fim do lote',
        timeout,
    });
}

test('Divisor Santander — a tela nasce na etapa 1, no modo Automático e sem fila', async (t) => {
    const pagina = await abrirDivisor(t);

    assert.equal(pagina.seletor('#viewerSection').style.display, 'none');
    assert.equal(pagina.seletor('#processSection').style.display, 'none');
    assert.equal(pagina.seletor('#progressSection').style.display, 'none');
    assert.equal(pagina.seletor('#resultSection').style.display, 'none');
    assert.equal(pagina.seletor('#divisionPreview').style.display, 'none');
    assert.equal(pagina.texto('#zoomLevel'), '150%');
    assert.equal(pagina.texto('#pageIndicator'), 'Página 1 de 1');
    assert.equal(pagina.texto('#pageCount'), 'de 0');
    assert.equal(pagina.seletor('input[name="modoDivisao"]:checked').value, 'auto');
    assert.equal(pagina.seletor('#modoDivisaoAuto').style.display, 'grid');
    assert.equal(pagina.seletor('#modoDivisaoPersonalizado').style.display, 'none');
    assert.equal(pagina.seletor('#actionButtonsAuto').style.display, '');
    assert.equal(pagina.seletor('#actionButtonsCustom').style.display, 'none');
    assert.equal(pagina.seletor('#cnjWarning').style.display, 'none');
    assert.equal(pagina.texto('#detectedCNJ'), '-');
    assert.equal(pagina.html('#filesQueue'), '');
    assert.equal(pagina.todos('#toastContainer .toast').length, 0);
});

test('Divisor Santander — seleção cancelada não faz nada e só não-PDFs é recusada', async (t) => {
    const pagina = await abrirDivisor(t);

    selecionar(pagina, []);
    assert.deepEqual(pagina.alertas, []);
    assert.equal(pagina.seletor('#viewerSection').style.display, 'none');

    selecionar(pagina, [{ name: 'foto.png', type: 'image/png', size: 3 }]);
    assert.deepEqual(pagina.alertas, ['Por favor, selecione arquivos PDF válidos.']);
    assert.equal(pagina.seletor('#viewerSection').style.display, 'none');
    assert.equal(pagina.html('#filesQueue'), '');
});

test('Divisor Santander — PDF junto com não-PDF avisa os ignorados e só o PDF entra na fila', async (t) => {
    const pagina = await abrirDivisor(t);

    const bytes = await pdfDeTeste(pagina, pagina.totalPaginas);
    selecionar(pagina, [
        { name: 'foto.png', type: 'image/png', size: 3 },
        arquivoDe(pagina, `autos ${CNJ}.pdf`, bytes),
        { name: 'planilha.xlsx', type: 'application/vnd.ms-excel', size: 5 },
    ]);

    assert.deepEqual(pagina.alertas, ['2 arquivo(s) não-PDF foram ignorados.']);
    await pagina.aguardar(() => pagina.texto('#currentFileNumber') === '1/1', { descricao: 'lote de 1 arquivo' });
    assert.equal(pagina.texto('#currentFileName'), `autos ${CNJ}.pdf`);
});

test('Divisor Santander — CNJ do nome vira selo, resumo do lote e preview padrão', async (t) => {
    const pagina = await abrirDivisor(t);

    await carregarUm(pagina, `processo ${CNJ}.pdf`);

    assert.equal(pagina.seletor('#viewerSection').style.display, 'block');
    assert.equal(pagina.seletor('#processSection').style.display, 'none');
    assert.equal(pagina.texto('#currentFileNumber'), '1/1');
    assert.equal(pagina.texto('#currentFileName'), `processo ${CNJ}.pdf`);
    assert.equal(pagina.texto('#detectedCNJ'), CNJ);
    assert.equal(pagina.seletor('#detectedCNJ .badge').className, 'badge badge-ok');
    assert.equal(pagina.seletor('#cnjWarning').style.display, 'none');
    assert.equal(pagina.texto('#pageCount'), 'de 3');
    assert.equal(pagina.seletor('#pageNumber').max, '3');
    assert.equal(pagina.seletor('#inicioInicial').value, '1');
    assert.equal(pagina.seletor('#fimInicial').value, '3');

    assert.deepEqual(pagina.textos('#filesQueue .stat strong'), ['1', '0', '1', '1/1', `processo ${CNJ}.pdf`]);
    assert.deepEqual(pagina.textos('#filesQueue .stat span'), ['Total', 'Processados', 'Faltando', 'Em andamento', 'Arquivo atual']);
    assert.equal(pagina.seletor('#filesQueue').classList.contains('visible'), true);

    assert.equal(pagina.seletor('#divisionPreview').style.display, 'block');
    assert.equal(textoPlano(pagina, '#previewInicial'), `Páginas 1-3 3 página(s) Inicial${SUFIXO}.pdf`);
    assert.equal(textoPlano(pagina, '#previewDocs'), 'Nenhuma página (Todas as páginas estão na "Inicial")');
    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Arquivo carregado']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-body'), [`Pronto para marcar e dividir: processo ${CNJ}.pdf`]);
});

test('Divisor Santander — nome com 20 dígitos crus é formatado; nome sem CNJ pede o número', async (t) => {
    const cru = await abrirDivisor(t);
    await carregarUm(cru, `${CNJ_CRU}.pdf`);
    assert.equal(cru.texto('#detectedCNJ'), CNJ);
    assert.equal(cru.seletor('#cnjWarning').style.display, 'none');

    const semCnj = await abrirDivisor(t);
    await carregarUm(semCnj, 'peticao sem numero.pdf');
    assert.equal(semCnj.texto('#detectedCNJ'), 'Não detectado');
    assert.equal(semCnj.seletor('#detectedCNJ .badge').className, 'badge badge-fail');
    assert.equal(semCnj.seletor('#cnjWarning').style.display, 'block');
    assert.equal(semCnj.seletor('#cnjManual').value, '');
    assert.equal(semCnj.seletor('#cnjManual').placeholder, '57104727520258090051 ou formatado');
    assert.equal(textoPlano(semCnj, '#previewInicial'), 'Páginas 1-3 3 página(s) Inicial.pdf');
});

test('Divisor Santander — navegação respeita a primeira e a última página', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    assert.equal(pagina.seletor('#btnFirstPage').disabled, true);
    assert.equal(pagina.seletor('#btnPrevPage').disabled, true);
    assert.equal(pagina.seletor('#btnNextPage').disabled, false);
    assert.equal(pagina.seletor('#btnLastPage').disabled, false);

    pagina.clicar('#btnNextPage');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 2 de 3', { descricao: 'página 2' });
    assert.equal(pagina.seletor('#pageNumber').value, '2');
    assert.equal(pagina.seletor('#btnFirstPage').disabled, false);
    assert.equal(pagina.seletor('#btnPrevPage').disabled, false);

    pagina.clicar('#btnLastPage');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 3 de 3', { descricao: 'página 3' });
    assert.equal(pagina.seletor('#btnNextPage').disabled, true);
    assert.equal(pagina.seletor('#btnLastPage').disabled, true);

    pagina.clicar('#btnFirstPage');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 1 de 3', { descricao: 'volta para a página 1' });
    assert.equal(pagina.seletor('#btnFirstPage').disabled, true);

    pagina.digitar('#pageNumber', '2');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 2 de 3', { descricao: 'página 2 pelo campo' });

    // Fora do intervalo: o pedido é ignorado.
    pagina.digitar('#pageNumber', '9');
    await pagina.tick(20);
    assert.equal(pagina.texto('#pageIndicator'), 'Página 2 de 3');
    assert.equal(pagina.seletor('#pageNumber').value, '9');
    assert.equal(pagina.seletor('#btnNextPage').disabled, false);

    pagina.clicar('#btnPrevPage');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 1 de 3', { descricao: 'página anterior' });

    // Pedido durante a renderização fica pendente e é atendido no fim.
    pagina.clicar('#btnNextPage');
    pagina.clicar('#btnLastPage');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 3 de 3', { descricao: 'página pendente' });
    assert.equal(pagina.seletor('#pageNumber').value, '3');
    assert.equal(pagina.seletor('#btnNextPage').disabled, true);
});

test('Divisor Santander — zoom anda de 25 em 25 e trava entre 50% e 300%', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    pagina.clicar('#btnZoomIn');
    await pagina.aguardar(() => pagina.texto('#zoomLevel') === '175%', { descricao: 'zoom 175%' });
    assert.equal(dados(pagina.pdfjsLib.registro.renderizacoes.at(-1).viewport.scale), 1.75);

    pagina.clicar('#btnZoomOut');
    await pagina.aguardar(() => pagina.texto('#zoomLevel') === '150%', { descricao: 'zoom 150%' });

    for (let i = 0; i < 8; i += 1) pagina.clicar('#btnZoomIn');
    await pagina.aguardar(() => pagina.texto('#zoomLevel') === '300%', { descricao: 'zoom máximo' });

    for (let i = 0; i < 12; i += 1) pagina.clicar('#btnZoomOut');
    await pagina.aguardar(() => pagina.texto('#zoomLevel') === '50%', { descricao: 'zoom mínimo' });
    assert.equal(dados(pagina.pdfjsLib.registro.renderizacoes.at(-1).viewport.scale), 0.5);
});

test('Divisor Santander — marcar atual como 1ª/última alimenta o preview com o CNJ', async (t) => {
    const pagina = await abrirDivisor(t, { paginas: ['a', 'b', 'c', 'd', 'e'] });
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    pagina.clicar('#btnNextPage');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 2 de 5', { descricao: 'página 2' });
    pagina.clicar('button[onclick="definirInicio()"]');
    assert.equal(pagina.seletor('#inicioInicial').value, '2');

    pagina.clicar('#btnNextPage');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 3 de 5', { descricao: 'página 3' });
    pagina.clicar('button[onclick="definirFim()"]');
    assert.equal(pagina.seletor('#fimInicial').value, '3');

    assert.equal(textoPlano(pagina, '#previewInicial'), `Páginas 2-3 2 página(s) Inicial${SUFIXO}.pdf`);
    assert.equal(textoPlano(pagina, '#previewDocs'), `Páginas 1-1 + 4-5 3 página(s) Docs Inicial${SUFIXO}.pdf`);
    assert.equal(pagina.seletor('#inicioInicial').style.borderColor, '');

    // Só páginas depois da inicial.
    pagina.digitar('#inicioInicial', '1');
    assert.equal(textoPlano(pagina, '#previewDocs'), `Páginas 4-5 2 página(s) Docs Inicial${SUFIXO}.pdf`);

    // Inicial cobrindo tudo: nada sobra para os Docs.
    pagina.digitar('#fimInicial', '5');
    assert.equal(textoPlano(pagina, '#previewDocs'), 'Nenhuma página (Todas as páginas estão na "Inicial")');

    // Só páginas antes da inicial.
    pagina.digitar('#inicioInicial', '4');
    assert.equal(textoPlano(pagina, '#previewDocs'), `Páginas 1-3 3 página(s) Docs Inicial${SUFIXO}.pdf`);
});

test('Divisor Santander — intervalo invertido marca os campos e não recalcula o preview', async (t) => {
    const pagina = await abrirDivisor(t, { paginas: ['a', 'b', 'c', 'd'] });
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    pagina.digitar('#inicioInicial', '3');
    pagina.digitar('#fimInicial', '2');

    assert.equal(pagina.seletor('#inicioInicial').style.borderColor, 'var(--toy-danger)');
    assert.equal(pagina.seletor('#fimInicial').style.borderColor, 'var(--toy-danger)');
    // O preview congela no último estado válido (3-4, calculado antes da inversão).
    assert.equal(textoPlano(pagina, '#previewInicial'), `Páginas 3-4 2 página(s) Inicial${SUFIXO}.pdf`);

    pagina.digitar('#fimInicial', '4');
    assert.equal(pagina.seletor('#inicioInicial').style.borderColor, '');
    assert.equal(pagina.seletor('#fimInicial').style.borderColor, '');
    assert.equal(textoPlano(pagina, '#previewInicial'), `Páginas 3-4 2 página(s) Inicial${SUFIXO}.pdf`);
});

test('Divisor Santander — o modo Personalizado troca os painéis e as ações da tela', async (t) => {
    const pagina = await abrirDivisor(t);

    pagina.marcar('input[name="modoDivisao"][value="custom"]');

    assert.equal(pagina.seletor('#modoDivisaoAuto').style.display, 'none');
    assert.equal(pagina.seletor('#modoDivisaoPersonalizado').style.display, 'grid');
    assert.equal(pagina.seletor('#actionButtonsAuto').style.display, 'none');
    assert.equal(pagina.seletor('#actionButtonsCustom').style.display, '');

    pagina.marcar('input[name="modoDivisao"][value="auto"]');
    assert.equal(pagina.seletor('#modoDivisaoAuto').style.display, 'grid');
    assert.equal(pagina.seletor('#modoDivisaoPersonalizado').style.display, 'none');
    assert.equal(pagina.seletor('#actionButtonsAuto').style.display, '');
    assert.equal(pagina.seletor('#actionButtonsCustom').style.display, 'none');
});

test('Divisor Santander — adicionar divisão recusa nome vazio, ordem invertida, página fora da faixa e nome inválido', async (t) => {
    const pagina = await abrirDivisor(t, { paginas: ['a', 'b', 'c', 'd'] });
    await carregarUm(pagina, `autos ${CNJ}.pdf`);
    pagina.marcar('input[name="modoDivisao"][value="custom"]');

    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    assert.deepEqual(pagina.alertas, ['Digite um nome para o arquivo!']);

    pagina.digitar('#customFileName', 'Procuração');
    pagina.digitar('#customInicio', '3');
    pagina.digitar('#customFim', '2');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    assert.deepEqual(pagina.alertas.slice(1), ['A página inicial não pode ser maior que a final!']);

    pagina.digitar('#customFim', '5');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    assert.deepEqual(pagina.alertas.slice(2), ['Páginas devem estar entre 1 e 4!']);

    pagina.digitar('#customFim', '2');
    pagina.digitar('#customInicio', '1');
    pagina.digitar('#customFileName', 'Contrato/cópia');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    assert.deepEqual(pagina.alertas.slice(3), ['O nome do arquivo contém caracteres inválidos!\n\nNão use: < > : " / \\ | ? *']);
    assert.equal(pagina.seletor('#customDivisionsList').style.display, 'none');

    pagina.digitar('#customFileName', 'Procuração');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    assert.deepEqual(pagina.alertas.slice(4), ['Divisão adicionada!\n\nProcuração\nPáginas 1-2 (2 páginas)']);
});

test('Divisor Santander — a lista de divisões mostra nome, páginas e total, e some ao remover/limpar', async (t) => {
    const pagina = await abrirDivisor(t, { paginas: ['a', 'b', 'c', 'd'] });
    await carregarUm(pagina, `autos ${CNJ}.pdf`);
    pagina.marcar('input[name="modoDivisao"][value="custom"]');

    pagina.clicar('#btnNextPage');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 2 de 4', { descricao: 'página 2' });
    pagina.clicar('button[onclick="marcarPaginaAtualCustom(\'inicio\')"]');
    assert.equal(pagina.seletor('#customInicio').value, '2');
    pagina.clicar('button[onclick="marcarPaginaAtualCustom(\'fim\')"]');
    assert.equal(pagina.seletor('#customFim').value, '2');

    pagina.digitar('#customFileName', 'Procuração');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    assert.deepEqual(pagina.alertas, ['Divisão adicionada!\n\nProcuração\nPáginas 2-2 (1 páginas)']);
    assert.equal(pagina.seletor('#customFileName').value, '');
    assert.equal(pagina.seletor('#customInicio').value, '1');
    assert.equal(pagina.seletor('#customFim').value, '1');
    assert.equal(pagina.seletor('#customDivisionsList').style.display, 'block');
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile .badge'), ['#1']);
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile strong'), [`Procuração${SUFIXO}.pdf`]);
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile .hint'), ['Páginas 2-2 (1 página)']);
    assert.equal(textoPlano(pagina, '#divisionsListContainer .notice'), 'Total: 1 divisão | 1 página');

    pagina.digitar('#customFileName', 'Contestação');
    pagina.digitar('#customInicio', '3');
    pagina.digitar('#customFim', '4');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile .badge'), ['#1', '#2']);
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile strong'), [`Procuração${SUFIXO}.pdf`, `Contestação${SUFIXO}.pdf`]);
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile .hint'), ['Páginas 2-2 (1 página)', 'Páginas 3-4 (2 páginas)']);
    assert.equal(textoPlano(pagina, '#divisionsListContainer .notice'), 'Total: 2 divisões | 3 páginas');

    // Os botões da lista nascem com o innerHTML: deixa o harness ligar os handlers.
    await pagina.tick(0);

    // Remover: o cancelamento mantém a lista.
    pagina.responderConfirm(false);
    pagina.clicar('#divisionsListContainer button[title="Remover"]');
    assert.deepEqual(pagina.confirms, ['Deseja remover esta divisão?']);
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile .badge'), ['#1', '#2']);

    pagina.responderConfirm(true);
    pagina.clicar('#divisionsListContainer button[title="Remover"]');
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile .badge'), ['#1']);
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile strong'), [`Contestação${SUFIXO}.pdf`]);

    // Limpar: o cancelamento mantém a lista.
    pagina.responderConfirm(false);
    pagina.clicar('#actionButtonsCustom button[onclick="limparDivisoesCustom()"]');
    assert.deepEqual(pagina.confirms, [
        'Deseja remover esta divisão?',
        'Deseja remover esta divisão?',
        'Deseja limpar todas as divisões criadas?',
    ]);
    assert.equal(pagina.seletor('#customDivisionsList').style.display, 'block');

    pagina.responderConfirm(true);
    pagina.clicar('#actionButtonsCustom button[onclick="limparDivisoesCustom()"]');
    assert.equal(pagina.seletor('#customDivisionsList').style.display, 'none');
    assert.equal(pagina.html('#divisionsListContainer'), '');
});

test('Divisor Santander — Dividir gera Inicial e Docs com as páginas exatas e conclui o lote', async (t) => {
    const pagina = await abrirDivisor(t, { paginas: ['a', 'b', 'c', 'd', 'e'] });
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    pagina.digitar('#inicioInicial', '2');
    pagina.digitar('#fimInicial', '2');
    pagina.clicar('#btnProcessar');

    assert.equal(pagina.seletor('#btnProcessar').disabled, true);
    assert.equal(pagina.texto('#btnProcessar'), 'Processando...');
    assert.equal(pagina.texto('#progressText'), 'Lendo arquivo...');
    assert.equal(pagina.seletor('#progressFill').style.width, '10%');
    assert.equal(pagina.seletor('#progressSection').style.display, 'block');
    assert.equal(pagina.seletor('#resultSection').style.display, 'none');
    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Arquivo carregado', 'Iniciando Divisão']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-body').at(-1), `Processando: autos ${CNJ}.pdf`);

    await pagina.aguardar(() => pagina.registro.downloads.length === 2, { descricao: 'os dois PDFs' });

    const baixados = blobsBaixados(pagina);
    assert.deepEqual(baixados.map((item) => item.nome), [`Inicial${SUFIXO}.pdf`, `Docs Inicial${SUFIXO}.pdf`]);
    assert.deepEqual(await tamanhosDoBlob(pagina, baixados[0].blob), [[101, 200]]);
    assert.deepEqual(await tamanhosDoBlob(pagina, baixados[1].blob), [[100, 200], [102, 200], [103, 200], [104, 200]]);

    await esperarResultado(pagina);
    assert.equal(pagina.seletor('#progressSection').style.display, 'none');
    assert.equal(pagina.texto('#progressText'), 'Concluído!');
    assert.equal(pagina.seletor('#progressFill').style.width, '100%');
    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Arquivo 1/1 processado! 2 PDF(s) baixado(s) com sucesso! Todos os arquivos foram processados!'
    );
    assert.equal(pagina.seletor('#btnProcessar').disabled, false);
    assert.equal(pagina.texto('#btnProcessar'), 'Dividir e baixar PDFs');
    assert.deepEqual(pagina.textos('#filesQueue .stat strong'), ['1', '1', '0', '1/1', `autos ${CNJ}.pdf`]);

    // Depois do intervalo o lote finaliza e volta para a etapa inicial.
    await esperarFimDoLote(pagina);
    assert.equal(pagina.seletor('#viewerSection').style.display, 'none');
    assert.equal(pagina.seletor('#progressSection').style.display, 'none');
    assert.equal(pagina.seletor('#resultSection').style.display, 'block');
    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Processamento concluído! Estatísticas: Total de arquivos: 1 Processados com sucesso: 1 Erros: 0 Ignorados: 0'
        + ' Os arquivos foram baixados para sua pasta Downloads. Você pode organizá-los na pasta de sua preferência.'
    );
});

test('Divisor Santander — sem páginas fora da Inicial sai só um PDF', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    pagina.clicar('#btnProcessar');
    await pagina.aguardar(() => pagina.registro.downloads.length === 1, { descricao: 'o PDF da Inicial' });

    const baixados = blobsBaixados(pagina);
    assert.deepEqual(baixados.map((item) => item.nome), [`Inicial${SUFIXO}.pdf`]);
    assert.deepEqual(await tamanhosDoBlob(pagina, baixados[0].blob), [[100, 200], [101, 200], [102, 200]]);

    await esperarResultado(pagina);
    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Arquivo 1/1 processado! 1 PDF(s) baixado(s) com sucesso! Todos os arquivos foram processados!'
    );
});

test('Divisor Santander — sem CNJ os arquivos saem sem sufixo', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, 'peticao.pdf');

    pagina.digitar('#inicioInicial', '2');
    pagina.digitar('#fimInicial', '3');
    pagina.clicar('#btnProcessar');
    await pagina.aguardar(() => pagina.registro.downloads.length === 2, { descricao: 'os dois PDFs' });

    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), ['Inicial.pdf', 'Docs Inicial.pdf']);
});

test('Divisor Santander — modo Personalizado sem CNJ e com campos vazios usa o documento inteiro', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, 'peticao.pdf');
    pagina.marcar('input[name="modoDivisao"][value="custom"]');

    pagina.digitar('#customFileName', 'Petição');
    pagina.digitar('#customInicio', '');
    pagina.digitar('#customFim', '');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    assert.equal(pagina.alertas.at(-1), 'Divisão adicionada!\n\nPetição\nPáginas 1-3 (3 páginas)');
    assert.deepEqual(pagina.textos('#divisionsListContainer .tile strong'), ['Petição.pdf']);

    pagina.clicar('#btnProcessarCustom');
    await pagina.aguardar(() => pagina.registro.downloads.length === 1, { descricao: 'a divisão personalizada' });
    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), ['Petição.pdf']);
    assert.deepEqual(await tamanhosDoBlob(pagina, blobsBaixados(pagina)[0].blob), [[100, 200], [101, 200], [102, 200]]);
});

test('Divisor Santander — dividir com os campos vazios usa a primeira e a última página', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    pagina.digitar('#inicioInicial', '');
    pagina.digitar('#fimInicial', '');
    assert.equal(textoPlano(pagina, '#previewInicial'), `Páginas 1-3 3 página(s) Inicial${SUFIXO}.pdf`);
    assert.equal(textoPlano(pagina, '#previewDocs'), 'Nenhuma página (Todas as páginas estão na "Inicial")');

    pagina.clicar('#btnProcessar');
    await pagina.aguardar(() => pagina.registro.downloads.length === 1, { descricao: 'o PDF da Inicial' });

    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), [`Inicial${SUFIXO}.pdf`]);
    assert.deepEqual(await tamanhosDoBlob(pagina, blobsBaixados(pagina)[0].blob), [[100, 200], [101, 200], [102, 200]]);
});

test('Divisor Santander — PDF que não abre entra como Erro e o lote finaliza', async (t) => {
    const pagina = await abrirDivisor(t, { pdfjsLib: criarPdfjsFake(['página'], { falharCarga: 'PDF corrompido' }) });

    selecionar(pagina, [arquivoDe(pagina, `ruim ${CNJ}.pdf`, new Uint8Array([1, 2, 3]))]);
    await pagina.aguardar(() => pagina.alertas.length === 1, { descricao: 'alerta de arquivo inválido' });

    assert.deepEqual(pagina.alertas, [`Erro ao carregar PDF!\n\nArquivo: ruim ${CNJ}.pdf\n\nPDF corrompido`]);
    assert.deepEqual(pagina.mensagens('error').map((m) => m.texto), ['Erro ao carregar PDF: Error: PDF corrompido']);
    assert.deepEqual(pagina.textos('#filesQueue .stat strong'), ['1', '1', '0', '1/1', `ruim ${CNJ}.pdf`]);
    assert.equal(pagina.seletor('#viewerSection').style.display, 'none');
    assert.equal(pagina.seletor('#resultSection').style.display, 'block');
    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Processamento concluído! Estatísticas: Total de arquivos: 1 Processados com sucesso: 0 Erros: 1 Ignorados: 0'
        + ' Os arquivos foram baixados para sua pasta Downloads. Você pode organizá-los na pasta de sua preferência.'
    );
    assert.deepEqual(pagina.registro.downloads, []);
});

test('Divisor Santander — aviso rápido com tom padrão e sem contêiner de toasts', async (t) => {
    const pagina = await abrirDivisor(t);

    pagina.janela.showToast('Aviso', 'Sem tom');
    assert.equal(pagina.seletor('#toastContainer .toast').className, 'toast');
    assert.deepEqual(pagina.textos('#toastContainer .toast-body'), ['Sem tom']);

    await pagina.tick(50);
    assert.equal(pagina.seletor('#toastContainer .toast').classList.contains('show'), true);

    // O aviso padrão dura 2,2s e some sozinho.
    await pagina.tick(2400);
    assert.equal(pagina.todos('#toastContainer .toast').length, 0);

    // Fila vazia: o resumo é o inicial.
    pagina.janela.atualizarStatusFila(0, 'Concluído');
    assert.deepEqual(pagina.textos('#filesQueue .stat strong'), ['0', '0', '0', '0/0', '-']);

    pagina.seletor('#toastContainer').remove();
    pagina.janela.showToast('Aviso', 'Sem contêiner');
    assert.equal(pagina.existe('#toastContainer'), false);
});

test('Divisor Santander — intervalo invertido ao dividir é recusado sem baixar nada', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    pagina.digitar('#inicioInicial', '3');
    pagina.digitar('#fimInicial', '1');
    pagina.clicar('#btnProcessar');

    assert.deepEqual(pagina.alertas, ['Erro: A primeira página não pode ser maior que a última página!']);
    assert.deepEqual(pagina.registro.downloads, []);
    assert.equal(pagina.seletor('#progressSection').style.display, 'none');
    assert.equal(pagina.seletor('#btnProcessar').disabled, false);
});

test('Divisor Santander — PDF ilegível vira Erro no lote e o próximo arquivo é oferecido', async (t) => {
    const pagina = await abrirDivisor(t);
    const bytes = await pdfDeTeste(pagina, pagina.totalPaginas);
    selecionar(pagina, [
        arquivoDe(pagina, `quebrado ${CNJ}.pdf`, new Uint8Array([1, 2, 3, 4])),
        arquivoDe(pagina, `segundo ${CNJ}.pdf`, bytes),
    ]);
    await pagina.aguardar(() => pagina.texto('#currentFileNumber') === '1/2', { descricao: 'primeiro arquivo' });

    // O arquivo abre no pdf.js (que é dublê), mas falha no pdf-lib real na hora de cortar.
    pagina.responderConfirm(false);
    pagina.clicar('#btnProcessar');
    await pagina.aguardar(() => pagina.alertas.length === 1, { descricao: 'alerta de erro' });

    assert.equal(pagina.alertas[0].startsWith('Erro ao processar PDF!\n\nDetalhes: '), true);
    assert.deepEqual(pagina.confirms, ['Erro ao processar arquivo!\n\nDeseja continuar com o próximo arquivo?']);
    assert.deepEqual(pagina.registro.downloads, []);
    assert.equal(pagina.seletor('#progressSection').style.display, 'none');
    assert.equal(pagina.texto('#btnProcessar'), 'Dividir e baixar PDFs');
    assert.deepEqual(pagina.textos('#filesQueue .stat strong'), ['2', '1', '1', '2/2', `quebrado ${CNJ}.pdf`]);
    assert.equal(pagina.mensagens('error').length, 1);
    assert.equal(pagina.mensagens('error')[0].texto.startsWith('Erro ao processar PDF:'), true);
});

test('Divisor Santander — erro confirmado segue para o próximo arquivo do lote', async (t) => {
    const pagina = await abrirDivisor(t);
    const bytes = await pdfDeTeste(pagina, pagina.totalPaginas);
    selecionar(pagina, [
        arquivoDe(pagina, `quebrado ${CNJ}.pdf`, new Uint8Array([1, 2, 3, 4])),
        arquivoDe(pagina, `segundo ${CNJ}.pdf`, bytes),
    ]);
    await pagina.aguardar(() => pagina.texto('#currentFileNumber') === '1/2', { descricao: 'primeiro arquivo' });

    pagina.responderConfirm(true);
    pagina.clicar('#btnProcessar');
    await pagina.aguardar(() => pagina.texto('#currentFileName') === `segundo ${CNJ}.pdf`, { descricao: 'segundo arquivo' });

    assert.equal(pagina.texto('#currentFileNumber'), '2/2');
    assert.equal(pagina.seletor('#pageCount').textContent.trim(), 'de 3');
    assert.deepEqual(pagina.textos('#filesQueue .stat strong'), ['2', '1', '1', '2/2', `segundo ${CNJ}.pdf`]);
});

test('Divisor Santander — lote de dois PDFs divide os dois e finaliza', async (t) => {
    const pagina = await abrirDivisor(t);
    const bytes = await pdfDeTeste(pagina, pagina.totalPaginas);
    selecionar(pagina, [arquivoDe(pagina, `primeiro ${CNJ}.pdf`, bytes), arquivoDe(pagina, `segundo ${CNJ}.pdf`, bytes)]);
    await pagina.aguardar(() => pagina.texto('#currentFileNumber') === '1/2', { descricao: 'primeiro arquivo' });

    pagina.digitar('#inicioInicial', '1');
    pagina.digitar('#fimInicial', '1');
    pagina.clicar('#btnProcessar');
    await esperarResultado(pagina);
    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Arquivo 1/2 processado! 2 PDF(s) baixado(s) com sucesso! Carregando próximo arquivo...'
    );

    await pagina.aguardar(() => pagina.texto('#currentFileNumber') === '2/2', { descricao: 'segundo arquivo' });
    assert.equal(pagina.texto('#currentFileName'), `segundo ${CNJ}.pdf`);
    assert.equal(pagina.seletor('#inicioInicial').value, '1');
    assert.equal(pagina.seletor('#fimInicial').value, '3');

    pagina.clicar('#btnProcessar');
    await esperarFimDoLote(pagina);

    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), [
        `Inicial${SUFIXO}.pdf`,
        `Docs Inicial${SUFIXO}.pdf`,
        `Inicial${SUFIXO}.pdf`,
    ]);
    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Processamento concluído! Estatísticas: Total de arquivos: 2 Processados com sucesso: 2 Erros: 0 Ignorados: 0'
        + ' Os arquivos foram baixados para sua pasta Downloads. Você pode organizá-los na pasta de sua preferência.'
    );
    assert.deepEqual(pagina.textos('#filesQueue .stat strong'), ['2', '2', '0', '2/2', `segundo ${CNJ}.pdf`]);
});

test('Divisor Santander — Limpar e recomeçar zera a tela quando confirmado', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, `autos ${CNJ}.pdf`);
    assert.equal(pagina.seletor('#viewerSection').style.display, 'block');

    pagina.responderConfirm(false);
    pagina.clicar('#actionButtonsAuto button[onclick="limparTudo()"]');
    assert.deepEqual(pagina.confirms, ['Deseja limpar tudo e recomeçar?\n\nTodos os arquivos serão removidos da fila.']);
    assert.equal(pagina.seletor('#viewerSection').style.display, 'block');
    assert.deepEqual(pagina.alertas, []);

    pagina.responderConfirm(true);
    pagina.clicar('#actionButtonsAuto button[onclick="limparTudo()"]');
    assert.deepEqual(pagina.alertas, ['Tudo limpo! Selecione novos PDFs para começar.']);
    assert.equal(pagina.seletor('#viewerSection').style.display, 'none');
    assert.equal(pagina.seletor('#processSection').style.display, 'none');
    assert.equal(pagina.seletor('#divisionPreview').style.display, 'none');
    assert.equal(pagina.seletor('#pdfInput').value, '');
    assert.equal(pagina.seletor('#filesQueue').classList.contains('visible'), false);
    assert.equal(pagina.texto('#zoomLevel'), '150%');
});

test('Divisor Santander — a busca acha páginas, ignora termo vazio e recusa sem PDF', async (t) => {
    const pagina = await abrirDivisor(t, { paginas: ['início do processo', 'termo buscado aqui', 'mais termo buscado'] });
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    pagina.clicar('button[onclick="buscarNoPDF()"]');
    assert.deepEqual(pagina.alertas, ['Digite uma palavra para buscar!']);
    assert.equal(pagina.texto('#searchResults'), '');

    pagina.digitar('#searchText', 'inexistente');
    pagina.clicar('button[onclick="buscarNoPDF()"]');
    await pagina.aguardar(() => pagina.texto('#searchResults') === 'Palavra não encontrada', { descricao: 'busca sem resultado' });
    assert.deepEqual(pagina.alertas.at(-1), 'Palavra não encontrada no documento.');

    // Enter no campo dispara a mesma busca.
    pagina.digitar('#searchText', 'termo buscado');
    pagina.seletor('#searchText').dispatchEvent(new pagina.janela.KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
    await pagina.aguardar(() => pagina.texto('#searchResults').endsWith('2, 3'), { descricao: 'busca com resultado' });
    assert.equal(pagina.texto('#searchResults'), '2 página(s) encontrada(s): 2, 3');
    assert.equal(pagina.alertas.at(-1), 'Encontrado em 2 página(s)!\n\nPáginas: 2, 3');
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 2 de 3', { descricao: 'primeira ocorrência' });

    // Sem PDF carregado (depois de limpar) a busca é recusada.
    pagina.responderConfirm(true);
    pagina.clicar('#actionButtonsAuto button[onclick="limparTudo()"]');
    pagina.digitar('#searchText', 'termo');
    pagina.clicar('button[onclick="buscarNoPDF()"]');
    assert.deepEqual(pagina.alertas.at(-1), 'Nenhum PDF carregado!');
});

test('Divisor Santander — CNJ manual aceita colado e cru, e recusa formato inválido', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, 'peticao.pdf');

    pagina.clicar('button[onclick="aplicarCNJManual()"]');
    assert.deepEqual(pagina.alertas, ['Digite o número CNJ!']);

    pagina.digitar('#cnjManual', '123');
    pagina.clicar('button[onclick="aplicarCNJManual()"]');
    assert.deepEqual(pagina.alertas.slice(1), [
        'Formato CNJ inválido!\n\nFormato esperado: 0000000-00.0000.0.00.0000\nOu: 20 dígitos sem pontuação',
    ]);

    pagina.digitar('#cnjManual', CNJ_CRU);
    pagina.clicar('button[onclick="aplicarCNJManual()"]');
    assert.deepEqual(pagina.alertas.slice(2), [
        `CNJ formatado automaticamente:\n\n${CNJ_CRU}\n↓\n${CNJ}`,
        `CNJ aplicado com sucesso!\n\n${CNJ}\n\nOs PDFs serão nomeados com este número.`,
    ]);
    assert.equal(pagina.texto('#detectedCNJ'), `${CNJ} (manual)`);
    assert.equal(pagina.seletor('#cnjWarning').style.display, 'none');
    assert.equal(textoPlano(pagina, '#previewInicial'), `Páginas 1-3 3 página(s) Inicial${SUFIXO}.pdf`);
});

test('Divisor Santander — Processar todas as divisões grava um PDF por divisão e limpa a lista', async (t) => {
    const pagina = await abrirDivisor(t, { paginas: ['a', 'b', 'c', 'd'] });
    await carregarUm(pagina, `autos ${CNJ}.pdf`);
    pagina.marcar('input[name="modoDivisao"][value="custom"]');

    pagina.clicar('#btnProcessarCustom');
    assert.deepEqual(pagina.alertas, ['Nenhuma divisão criada!\n\nCrie ao menos uma divisão antes de processar.']);
    assert.deepEqual(pagina.registro.downloads, []);

    pagina.digitar('#customFileName', 'Procuração');
    pagina.digitar('#customInicio', '1');
    pagina.digitar('#customFim', '2');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    pagina.digitar('#customFileName', 'Contestação');
    pagina.digitar('#customInicio', '3');
    pagina.digitar('#customFim', '4');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');

    pagina.clicar('#btnProcessarCustom');
    assert.equal(pagina.seletor('#btnProcessarCustom').disabled, true);
    assert.equal(pagina.texto('#btnProcessarCustom'), 'Processando...');
    assert.equal(pagina.texto('#progressText'), 'Lendo arquivo...');
    assert.equal(pagina.seletor('#progressFill').style.width, '5%');

    await pagina.aguardar(() => pagina.registro.downloads.length === 2, { descricao: 'as duas divisões' });
    const baixados = blobsBaixados(pagina);
    assert.deepEqual(baixados.map((item) => item.nome), [`Procuração${SUFIXO}.pdf`, `Contestação${SUFIXO}.pdf`]);
    assert.deepEqual(await tamanhosDoBlob(pagina, baixados[0].blob), [[100, 200], [101, 200]]);
    assert.deepEqual(await tamanhosDoBlob(pagina, baixados[1].blob), [[102, 200], [103, 200]]);

    await esperarResultado(pagina);
    assert.equal(pagina.texto('#progressText'), 'Concluído!');
    assert.equal(pagina.seletor('#progressFill').style.width, '100%');
    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Arquivo 1/1 processado! 2 PDF(s) criado(s) com sucesso! Todos os arquivos foram processados!'
    );
    assert.equal(pagina.seletor('#btnProcessarCustom').disabled, false);
    assert.equal(pagina.texto('#btnProcessarCustom'), 'Processar todas as divisões');
    assert.equal(pagina.seletor('#customDivisionsList').style.display, 'none');
    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Arquivo carregado', 'Processando Divisões', 'Lote concluído']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-body').slice(-2), [
        'Processando 2 divisão(ões)...',
        'Todos os arquivos do lote foram processados.',
    ]);
});

test('Divisor Santander — divisões personalizadas com PDF ilegível devolvem o erro do processamento', async (t) => {
    const pagina = await abrirDivisor(t);
    selecionar(pagina, [arquivoDe(pagina, `quebrado ${CNJ}.pdf`, new Uint8Array([1, 2, 3, 4]))]);
    await pagina.aguardar(() => pagina.texto('#currentFileNumber') === '1/1', { descricao: 'arquivo carregado' });
    pagina.marcar('input[name="modoDivisao"][value="custom"]');

    pagina.digitar('#customFileName', 'Petição');
    pagina.digitar('#customInicio', '1');
    pagina.digitar('#customFim', '1');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');

    pagina.clicar('#btnProcessarCustom');
    await pagina.aguardar(() => pagina.alertas.length === 2, { descricao: 'alerta de erro' });

    assert.equal(pagina.alertas[0], 'Divisão adicionada!\n\nPetição\nPáginas 1-1 (1 páginas)');
    assert.equal(pagina.alertas[1].startsWith('Erro ao processar divisões!\n\n'), true);
    assert.deepEqual(pagina.registro.downloads, []);
    assert.equal(pagina.seletor('#progressSection').style.display, 'none');
    assert.equal(pagina.texto('#btnProcessarCustom'), 'Processar todas as divisões');
    assert.equal(pagina.seletor('#customDivisionsList').style.display, 'block');
    assert.equal(pagina.mensagens('error')[0].texto.startsWith('Erro ao processar divisões:'), true);
});

test('Divisor Santander — lote personalizado de 2 arquivos carrega o próximo sozinho', async (t) => {
    const pagina = await abrirDivisor(t);
    const bytes = await pdfDeTeste(pagina, pagina.totalPaginas);
    selecionar(pagina, [arquivoDe(pagina, `primeiro ${CNJ}.pdf`, bytes), arquivoDe(pagina, `segundo ${CNJ}.pdf`, bytes)]);
    await pagina.aguardar(() => pagina.texto('#currentFileNumber') === '1/2', { descricao: 'primeiro arquivo' });
    pagina.marcar('input[name="modoDivisao"][value="custom"]');

    pagina.digitar('#customFileName', 'Petição');
    pagina.digitar('#customInicio', '1');
    pagina.digitar('#customFim', '1');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    pagina.clicar('#btnProcessarCustom');
    await pagina.aguardar(() => pagina.textos('#toastContainer .toast-title').includes('Divisões geradas'), { descricao: 'fim do primeiro arquivo' });

    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Arquivo 1/2 processado! 1 PDF(s) criado(s) com sucesso! Carregando próximo arquivo...'
    );
    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Arquivo carregado', 'Processando Divisões', 'Divisões geradas']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-body').slice(-2), [
        'Processando 1 divisão(ões)...',
        'Arquivo 1/2 concluído. Carregando o próximo...',
    ]);
    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), [`Petição${SUFIXO}.pdf`]);

    // Passado o intervalo, o próximo arquivo do lote entra no visualizador.
    await pagina.aguardar(() => pagina.texto('#currentFileNumber') === '2/2', { descricao: 'segundo arquivo' });
    assert.equal(pagina.texto('#currentFileName'), `segundo ${CNJ}.pdf`);
    assert.equal(pagina.seletor('#customDivisionsList').style.display, 'none');

    // O último arquivo do lote fecha com o aviso de lote concluído.
    pagina.digitar('#customFileName', 'Sentença');
    pagina.digitar('#customInicio', '2');
    pagina.digitar('#customFim', '3');
    pagina.clicar('button[onclick="adicionarDivisaoCustom()"]');
    pagina.clicar('#btnProcessarCustom');
    await pagina.aguardar(() => pagina.textos('#toastContainer .toast-title').includes('Lote concluído'), { descricao: 'lote concluído' });

    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), [`Petição${SUFIXO}.pdf`, `Sentença${SUFIXO}.pdf`]);
    assert.equal(
        textoPlano(pagina, '#resultMessage'),
        'Arquivo 2/2 processado! 1 PDF(s) criado(s) com sucesso! Todos os arquivos foram processados!'
    );
    assert.deepEqual(pagina.textos('#filesQueue .stat strong'), ['2', '2', '0', '2/2', `segundo ${CNJ}.pdf`]);
});

test('Divisor Santander — a roda do mouse troca uma página por impulso, com pausa e intervalo', async (t) => {
    const pagina = await abrirDivisor(t);
    await carregarUm(pagina, `autos ${CNJ}.pdf`);

    let agora = 1_000_000;
    pagina.janela.Date.now = () => agora;

    const girarSemEspera = (opcoes) => pagina.seletor('#pdfCanvas').dispatchEvent(
        new pagina.janela.WheelEvent('wheel', { bubbles: true, cancelable: true, ...opcoes })
    );
    const girar = async (opcoes) => {
        girarSemEspera(opcoes);
        await pagina.tick(10);
    };

    // Gesto de zoom do sistema é ignorado.
    await girar({ deltaY: 120, ctrlKey: true });
    assert.equal(pagina.texto('#pageIndicator'), 'Página 1 de 3');

    // Giro novo: a primeira rodada já vale uma página.
    await girar({ deltaY: 120 });
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 2 de 3', { descricao: 'roda para baixo' });

    // Mesmo gesto: impulso fraco não troca de página.
    agora += 10;
    await girar({ deltaY: 100 });
    assert.equal(pagina.texto('#pageIndicator'), 'Página 2 de 3');

    // Impulso suficiente, mas dentro do intervalo mínimo entre trocas.
    agora += 10;
    await girar({ deltaY: 300 });
    assert.equal(pagina.texto('#pageIndicator'), 'Página 2 de 3');

    // Passado o intervalo, o impulso acumulado rende uma página.
    agora += 200;
    await girar({ deltaY: 200 });
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 3 de 3', { descricao: 'terceira página' });

    // Na última página, girar para baixo não passa do fim.
    agora += 200;
    await girar({ deltaY: 150 });
    assert.equal(pagina.texto('#pageIndicator'), 'Página 3 de 3');

    // Giro para cima volta uma página.
    agora += 200;
    await girar({ deltaY: -150 });
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 2 de 3', { descricao: 'roda para cima' });

    // deltaY zero conta como impulso mínimo e troca de página.
    agora += 200;
    await girar({ deltaY: 0 });
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 3 de 3', { descricao: 'deltaY zero' });

    // Na primeira página, girar para cima não sai do documento.
    while (pagina.texto('#pageIndicator') !== 'Página 1 de 3') {
        agora += 200;
        await girar({ deltaY: -150 });
    }
    agora += 200;
    await girar({ deltaY: -150 });
    assert.equal(pagina.texto('#pageIndicator'), 'Página 1 de 3');

    // Durante a renderização o giro é descartado: só a primeira rodada vale.
    agora += 200;
    girarSemEspera({ deltaY: 150 });
    girarSemEspera({ deltaY: 150 });
    await pagina.tick(20);
    await pagina.aguardar(() => pagina.texto('#pageIndicator') === 'Página 2 de 3', { descricao: 'uma página por gesto' });
    assert.equal(pagina.seletor('#pageNumber').value, '2');
});

test('Divisor Santander — formatarCNJ reescreve os 20 dígitos e recusa o resto', async (t) => {
    const pagina = await abrirDivisor(t);

    assert.equal(pagina.janela.formatarCNJ(CNJ_CRU), CNJ);
    assert.equal(pagina.janela.formatarCNJ('5710472-75.2025.8.09.0051'), CNJ);
    assert.equal(pagina.janela.formatarCNJ('123'), null);
    assert.equal(pagina.janela.formatarCNJ(''), null);
});
