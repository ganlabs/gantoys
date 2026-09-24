import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy, criarJspdfFake, criarPdfjsFake } from '../../testkit/index.js';

// Arquivo no contrato da File API: o teste controla nome, tipo, tamanho e bytes
// (os bytes só são alocados quando o toy realmente pede o conteúdo).
function arquivoPdf(nome, tamanho, preenchimento = 7) {
    return {
        name: nome,
        type: 'application/pdf',
        size: tamanho,
        async arrayBuffer() { return new Uint8Array(tamanho).fill(preenchimento).buffer; },
    };
}

// Coisas que vêm do contexto da página (outro realm) precisam ser copiadas para
// comparar com deepEqual.
function dados(valor) {
    return JSON.parse(JSON.stringify(valor));
}

function arquivoNaoPdf(nome) {
    return { name: nome, type: 'image/png', size: 12, async arrayBuffer() { return new ArrayBuffer(0); } };
}

async function abrirCompressor(t, opcoes = {}) {
    const jspdf = opcoes.jspdf || criarJspdfFake();
    const pdfjsLib = opcoes.pdfjsLib || criarPdfjsFake(opcoes.paginas || ['página 1']);
    const pagina = await carregarToy('gancompressor', { globais: { jspdf, pdfjsLib } });
    t.after(() => pagina.fechar());
    pagina.jspdf = jspdf;
    pagina.pdfjsLib = pdfjsLib;
    return pagina;
}

// Os botões do toy são acionados pelo clique real (os handlers `onclick` inline
// são compilados pelo harness).
function processar(pagina) {
    pagina.clicar('#btnProcessar');
}

function selecionar(pagina, arquivos) {
    Object.defineProperty(pagina.seletor('#pdfInput'), 'files', { value: arquivos, configurable: true });
    pagina.disparar('#pdfInput', 'change');
}

function observarToDataURL(pagina) {
    const chamadas = [];
    const prototipo = pagina.janela.HTMLCanvasElement.prototype;
    const original = prototipo.toDataURL;
    prototipo.toDataURL = function toDataURL(tipo, qualidade) {
        chamadas.push({ tipo, qualidade, largura: this.width, altura: this.height });
        return original.call(this, tipo, qualidade);
    };
    return chamadas;
}

function criarPortao() {
    let abrir;
    const promessa = new Promise((resolve) => { abrir = resolve; });
    return { promessa, abrir };
}

// pdf.js falso do harness com um portão por página: o render só resolve quando o
// teste abre o portão, o que permite ler o progresso entre uma página e outra.
function pdfjsComPortoes(paginas, portoes) {
    const fake = criarPdfjsFake(paginas);
    const getDocumentOriginal = fake.getDocument.bind(fake);
    fake.getDocument = (fonte) => {
        const tarefa = getDocumentOriginal(fonte);
        tarefa.promise = tarefa.promise.then((doc) => {
            const getPageOriginal = doc.getPage.bind(doc);
            doc.getPage = async (numero) => {
                const page = await getPageOriginal(numero);
                const renderOriginal = page.render.bind(page);
                page.render = (contexto) => {
                    const tarefaRender = renderOriginal(contexto);
                    const portao = portoes[numero - 1];
                    if (portao) {
                        const original = tarefaRender.promise;
                        tarefaRender.promise = portao.promessa.then(() => original);
                    }
                    return tarefaRender;
                };
                return page;
            };
            return doc;
        });
        return tarefa;
    };
    return fake;
}

// pdf.js falso que troca de comportamento a cada arquivo do lote: cada
// getDocument consome o próximo dublê da lista (o último se repete).
function pdfjsPorArquivo(lotes) {
    const registro = { documentos: 0, leituras: [] };
    let indice = 0;
    return {
        GlobalWorkerOptions: { workerSrc: '' },
        version: 'fake',
        registro,
        getDocument(fonte) {
            const posicao = Math.min(indice, lotes.length - 1);
            indice += 1;
            const tarefa = lotes[posicao].getDocument(fonte);
            tarefa.promise = tarefa.promise.then((doc) => {
                registro.documentos += 1;
                const getPageOriginal = doc.getPage.bind(doc);
                doc.getPage = async (numero) => {
                    const page = await getPageOriginal(numero);
                    const renderOriginal = page.render.bind(page);
                    page.render = (contexto) => {
                        registro.leituras.push({ arquivo: posicao, pagina: numero });
                        return renderOriginal(contexto);
                    };
                    return page;
                };
                return doc;
            });
            return tarefa;
        },
    };
}

function conteudoBaixado(pagina, nome) {
    const download = pagina.registro.downloads.find((item) => item.nome === nome);
    if (!download) throw new Error(`Download não encontrado: ${nome}`);
    return pagina.registro.urls.get(download.href);
}

test('Compressor — a tela nasce na etapa 1, com a fila vazia e 0.6 / 150 marcados', async (t) => {
    const pagina = await abrirCompressor(t);

    assert.equal(pagina.seletor('#uploadSection').style.display, '');
    assert.equal(pagina.seletor('#settingsSection').style.display, 'none');
    assert.equal(pagina.seletor('#resultSection').style.display, 'none');
    assert.equal(pagina.seletor('#progressGlobalSection').classList.contains('visible'), false);
    assert.equal(pagina.texto('#progressGlobalText'), '0 / 0 concluídos');
    assert.equal(pagina.todos('#filesListContainer .file-item').length, 0);
    assert.equal(pagina.todos('#toastContainer .toast').length, 0);
    assert.equal(pagina.seletor('input[name="qualidade"]:checked').value, '0.6');
    assert.equal(pagina.seletor('input[name="dpi"]:checked').value, '150');
    assert.equal(pagina.seletor('#btnProcessar').disabled, false);
    assert.equal(pagina.seletor('#btnLimpar').disabled, false);
    assert.equal(pagina.existe('#renderCanvas'), true);
});

test('Compressor — seleção vazia (diálogo cancelado) não muda nada na tela', async (t) => {
    const pagina = await abrirCompressor(t);

    selecionar(pagina, []);

    assert.equal(pagina.todos('#toastContainer .toast').length, 0);
    assert.equal(pagina.seletor('#uploadSection').style.display, '');
    assert.equal(pagina.seletor('#settingsSection').style.display, 'none');
});

test('Compressor — lote só com não-PDFs é recusado com o aviso, sem trocar de etapa', async (t) => {
    const pagina = await abrirCompressor(t);

    selecionar(pagina, [arquivoNaoPdf('foto.png'), arquivoNaoPdf('scan.jpg')]);

    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Aviso']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-body'), ['Selecione arquivos PDF válidos.']);
    assert.equal(pagina.seletor('#toastContainer .toast').className, 'toast warn');
    assert.equal(pagina.seletor('#uploadSection').style.display, '');
    assert.equal(pagina.seletor('#settingsSection').style.display, 'none');
});

test('Compressor — entre PDFs e não-PDFs só os PDFs entram na fila, com nome, tamanho e Aguardando', async (t) => {
    const pagina = await abrirCompressor(t);

    selecionar(pagina, [arquivoNaoPdf('foto.png'), arquivoPdf('contrato.pdf', 2048), arquivoPdf('peticao.pdf', 5242880)]);

    assert.equal(pagina.seletor('#uploadSection').style.display, 'none');
    assert.equal(pagina.seletor('#settingsSection').style.display, 'block');
    assert.deepEqual(pagina.textos('.file-item-name'), ['contrato.pdf', 'peticao.pdf']);
    assert.deepEqual(pagina.textos('.file-item-status'), ['Original: 2 KB', 'Original: 5 MB']);
    assert.deepEqual(pagina.textos('#filesListContainer .badge'), ['Aguardando', 'Aguardando']);
    assert.equal(pagina.seletor('#badge-0').className, 'badge');
    assert.equal(pagina.atributo('.file-item-name', 'title'), 'contrato.pdf');
    assert.equal(pagina.seletor('#progress-container-0').classList.contains('hidden'), true);
    assert.equal(pagina.todos('#toastContainer .toast').length, 0);
});

test('Compressor — o lote mostra o progresso página a página e baixa um arquivo por PDF', async (t) => {
    const portao1 = criarPortao();
    const portao2 = criarPortao();
    const paginas = ['página 1', 'página 2'];
    const pagina = await abrirCompressor(t, {
        pdfjsLib: pdfjsComPortoes(paginas, [portao1, portao2]),
    });
    const dataUrls = observarToDataURL(pagina);

    selecionar(pagina, [arquivoPdf('contrato.pdf', 5000)]);
    pagina.marcar('input[name="qualidade"][value="0.8"]');
    pagina.marcar('input[name="dpi"][value="300"]');
    processar(pagina);

    await pagina.tick(0);
    assert.equal(pagina.seletor('#btnProcessar').disabled, true);
    assert.equal(pagina.seletor('#btnLimpar').disabled, true);
    assert.equal(pagina.seletor('#progressGlobalSection').classList.contains('visible'), true);
    assert.equal(pagina.texto('#badge-0'), 'Processando...');
    assert.equal(pagina.seletor('#badge-0').className, 'badge badge-accent');
    assert.equal(pagina.seletor('#progress-container-0').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#progress-fill-0').style.width, '0%');

    portao1.abrir();
    await pagina.tick(0);
    assert.equal(pagina.seletor('#progress-fill-0').style.width, '50%');

    portao2.abrir();
    await pagina.aguardar(() => pagina.seletor('#btnProcessar').disabled === false, { descricao: 'fim do lote' });

    assert.deepEqual(dataUrls, [
        { tipo: 'image/jpeg', qualidade: 0.8, largura: 2479, altura: 3508 },
        { tipo: 'image/jpeg', qualidade: 0.8, largura: 2479, altura: 3508 },
    ]);
    assert.deepEqual(dados(pagina.jspdf.registro.instancias[0].opcoes), {
        orientation: 'portrait',
        unit: 'pt',
        format: [595, 842],
        compress: true,
    });
    assert.equal(pagina.jspdf.registro.instancias.length, 1);
    assert.equal(pagina.jspdf.registro.instancias[0].paginas.length, 2);
    assert.deepEqual(dados(pagina.jspdf.registro.instancias[0].paginas.map((p) => p.imagens.length)), [1, 1]);

    assert.equal(pagina.texto('#badge-0'), 'Concluído');
    assert.equal(pagina.seletor('#badge-0').className, 'badge badge-ok');
    assert.equal(pagina.seletor('#progress-container-0').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#progress-fill-0').style.width, '100%');
    assert.equal(pagina.texto('#progressGlobalText'), '1 / 1 concluídos');
    assert.equal(pagina.seletor('#progressGlobalFill').style.width, '100%');
    assert.equal(pagina.seletor('#resultSection').style.display, 'block');
    assert.equal(pagina.seletor('#btnProcessar').disabled, false);
    assert.equal(
        pagina.html('#file-size-0'),
        'Original: 4.88 KB <i class="bi bi-arrow-right file-item-arrow"></i> Final: 25 Bytes '
        + '<span class="file-item-delta" style="color: var(--toy-success); font-weight: bold;">(Redução de 99.5%)</span>'
    );

    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), ['contrato_comprimido.pdf']);
    assert.equal(await conteudoBaixado(pagina, 'contrato_comprimido.pdf').text(), '{"paginas":2,"imagens":2}');
    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Sucesso']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-body'), ['Processamento do lote concluído!']);
    assert.equal(pagina.seletor('#toastContainer .toast').className, 'toast ok');
});

test('Compressor — qualidade, DPI e orientação seguem a escolha, com uma página de saída por página de entrada', async (t) => {
    const paginas = [
        { texto: 'retrato' },
        { texto: 'paisagem', largura: 842, altura: 595 },
        { texto: 'retrato 2' },
    ];
    const pagina = await abrirCompressor(t, { paginas });
    const dataUrls = observarToDataURL(pagina);

    selecionar(pagina, [arquivoPdf('autos.pdf', 1024)]);
    pagina.marcar('input[name="qualidade"][value="0.4"]');
    processar(pagina);
    await pagina.aguardar(() => pagina.seletor('#btnProcessar').disabled === false, { descricao: 'fim do lote' });

    assert.deepEqual(dataUrls, [
        { tipo: 'image/jpeg', qualidade: 0.4, largura: 1239, altura: 1754 },
        { tipo: 'image/jpeg', qualidade: 0.4, largura: 1754, altura: 1239 },
        { tipo: 'image/jpeg', qualidade: 0.4, largura: 1239, altura: 1754 },
    ]);
    assert.deepEqual(dados(pagina.pdfjsLib.registro.renderizacoes.map((r) => [r.pagina, r.viewport.scale])), [
        [1, 150 / 72],
        [2, 150 / 72],
        [3, 150 / 72],
    ]);

    const documento = pagina.jspdf.registro.instancias[0];
    assert.equal(documento.opcoes.orientation, 'portrait');
    assert.deepEqual(dados(documento.opcoes.format), [595, 842]);
    assert.deepEqual(dados(documento.paginas.map((p) => p.formato)), [
        null,
        [842, 595],
        [595, 842],
    ]);
    assert.deepEqual(dados(documento.paginas.map((p) => p.orientacao)), [
        null,
        'landscape',
        'portrait',
    ]);
    assert.deepEqual(dados(documento.paginas.map((p) => p.imagens.map((i) => [i.tipo, i.x, i.y, i.largura, i.altura]))), [
        [['JPEG', 0, 0, 595, 842]],
        [['JPEG', 0, 0, 842, 595]],
        [['JPEG', 0, 0, 595, 842]],
    ]);
    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), ['autos_comprimido.pdf']);
    assert.equal(await conteudoBaixado(pagina, 'autos_comprimido.pdf').text(), '{"paginas":3,"imagens":3}');
    assert.equal(
        pagina.html('#file-size-0'),
        'Original: 1 KB <i class="bi bi-arrow-right file-item-arrow"></i> Final: 25 Bytes '
        + '<span class="file-item-delta" style="color: var(--toy-success); font-weight: bold;">(Redução de 97.6%)</span>'
    );
});

test('Compressor — PDF que não diminui mantém o original, com o rótulo de já otimizado', async (t) => {
    const pagina = await abrirCompressor(t);

    selecionar(pagina, [arquivoPdf('pequeno.pdf', 10, 9), arquivoPdf('vazio.pdf', 0), arquivoPdf('semextensao', 10, 5)]);
    processar(pagina);
    await pagina.aguardar(() => pagina.seletor('#btnProcessar').disabled === false, { descricao: 'fim do lote' });

    assert.equal(
        pagina.html('#file-size-0'),
        'Original: 10 Bytes <i class="bi bi-arrow-right file-item-arrow"></i> Final: Mantido '
        + '<span class="file-item-delta" style="color: var(--toy-warning); font-weight: bold;">(Já otimizado. Original mantido)</span>'
    );
    assert.equal(
        pagina.html('#file-size-1'),
        'Original: 0 Bytes <i class="bi bi-arrow-right file-item-arrow"></i> Final: Mantido '
        + '<span class="file-item-delta" style="color: var(--toy-warning); font-weight: bold;">(Já otimizado. Original mantido)</span>'
    );
    assert.deepEqual(pagina.textos('#filesListContainer .badge'), ['Concluído', 'Concluído', 'Concluído']);
    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), [
        'pequeno_comprimido.pdf',
        'vazio_comprimido.pdf',
        'semextensao_comprimido.pdf',
    ]);
    assert.deepEqual([...new Uint8Array(await conteudoBaixado(pagina, 'pequeno_comprimido.pdf').arrayBuffer())], new Array(10).fill(9));
    assert.equal((await conteudoBaixado(pagina, 'vazio_comprimido.pdf').arrayBuffer()).byteLength, 0);
    assert.deepEqual([...new Uint8Array(await conteudoBaixado(pagina, 'semextensao_comprimido.pdf').arrayBuffer())], new Array(10).fill(5));
    assert.equal(pagina.texto('#progressGlobalText'), '3 / 3 concluídos');
});

test('Compressor — PDF inválido e falha de render no meio do lote: item Erro, aviso e lote segue', async (t) => {
    const pdfjsLib = pdfjsPorArquivo([
        criarPdfjsFake(['ok']),
        criarPdfjsFake(['protegido'], { falharCarga: 'PDF protegido' }),
        criarPdfjsFake(['p1', 'p2', 'p3'], { falharEm: 2 }),
    ]);
    const pagina = await abrirCompressor(t, { pdfjsLib });

    selecionar(pagina, [arquivoPdf('a.pdf', 500), arquivoPdf('b.pdf', 500), arquivoPdf('c.pdf', 500)]);
    processar(pagina);
    await pagina.aguardar(() => pagina.seletor('#btnProcessar').disabled === false, { descricao: 'fim do lote' });

    assert.deepEqual(pagina.textos('#filesListContainer .badge'), ['Concluído', 'Erro', 'Erro']);
    assert.deepEqual(pagina.todos('#filesListContainer .badge').map((b) => b.className), [
        'badge badge-ok',
        'badge badge-fail',
        'badge badge-fail',
    ]);
    assert.equal(pagina.seletor('#progress-fill-2').style.width, '33%');
    assert.equal(pagina.seletor('#progress-container-2').classList.contains('hidden'), true);
    assert.equal(pagina.texto('#progressGlobalText'), '1 / 3 concluídos');
    assert.equal(pagina.seletor('#progressGlobalFill').style.width, '100%');
    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), ['a_comprimido.pdf']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Erro', 'Erro', 'Sucesso']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-body'), [
        'Falha ao comprimir b.pdf',
        'Falha ao comprimir c.pdf',
        'Processamento do lote concluído!',
    ]);
    assert.deepEqual(pagina.mensagens('error').map((m) => m.texto), [
        'Erro comprimindo arquivo b.pdf Error: PDF protegido',
        'Erro comprimindo arquivo c.pdf Error: Falha ao renderizar a página 2',
    ]);
    assert.deepEqual(pdfjsLib.registro.leituras, [
        { arquivo: 0, pagina: 1 },
        { arquivo: 2, pagina: 1 },
        { arquivo: 2, pagina: 2 },
    ]);
    assert.equal(pagina.seletor('#resultSection').style.display, 'block');

    // Novo clique sem limpar a fila: todos os itens já estão Concluído/Erro, o
    // lote não lê PDF nenhum de novo e o progresso geral fica como estava.
    processar(pagina);
    await pagina.aguardar(() => pagina.seletor('#btnProcessar').disabled === false, { descricao: 'fim do segundo lote' });

    assert.equal(pagina.texto('#progressGlobalText'), '1 / 3 concluídos');
    assert.equal(pagina.seletor('#progressGlobalFill').style.width, '100%');
    assert.deepEqual(pagina.textos('#filesListContainer .badge'), ['Concluído', 'Erro', 'Erro']);
    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), ['a_comprimido.pdf']);
    assert.deepEqual(pdfjsLib.registro.leituras, [
        { arquivo: 0, pagina: 1 },
        { arquivo: 2, pagina: 1 },
        { arquivo: 2, pagina: 2 },
    ]);
    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Erro', 'Erro', 'Sucesso', 'Sucesso']);
});

test('Compressor — sem rádio marcado o lote cai na qualidade 0.6 e em 150 DPI', async (t) => {
    const pagina = await abrirCompressor(t);
    const dataUrls = observarToDataURL(pagina);

    selecionar(pagina, [arquivoPdf('sem-radio.pdf', 5000)]);
    pagina.todos('input[name="qualidade"]').forEach((radio) => { radio.checked = false; });
    pagina.todos('input[name="dpi"]').forEach((radio) => { radio.checked = false; });
    processar(pagina);
    await pagina.aguardar(() => pagina.seletor('#btnProcessar').disabled === false, { descricao: 'fim do lote' });

    assert.deepEqual(dataUrls, [{ tipo: 'image/jpeg', qualidade: 0.6, largura: 1239, altura: 1754 }]);
    assert.equal(pagina.pdfjsLib.registro.renderizacoes[0].viewport.scale, 150 / 72);
});

test('Compressor — Limpar e Recomeçar volta à etapa 1 e zera a fila, a barra e a conclusão', async (t) => {
    const pagina = await abrirCompressor(t);

    selecionar(pagina, [arquivoPdf('a.pdf', 5000)]);
    processar(pagina);
    await pagina.aguardar(() => pagina.seletor('#btnProcessar').disabled === false, { descricao: 'fim do lote' });
    assert.equal(pagina.seletor('#resultSection').style.display, 'block');

    pagina.clicar('#btnLimpar');

    assert.equal(pagina.seletor('#uploadSection').style.display, 'block');
    assert.equal(pagina.seletor('#settingsSection').style.display, 'none');
    assert.equal(pagina.seletor('#resultSection').style.display, 'none');
    assert.equal(pagina.seletor('#progressGlobalSection').classList.contains('visible'), false);
    assert.equal(pagina.todos('#filesListContainer .file-item').length, 0);
    assert.equal(pagina.seletor('#pdfInput').value, '');
    assert.equal(pagina.seletor('#btnProcessar').disabled, false);
    assert.equal(pagina.seletor('#btnLimpar').disabled, false);
});

test('Compressor — tamanhos aparecem em Bytes, KB, MB e GB', async (t) => {
    const pagina = await abrirCompressor(t);

    selecionar(pagina, [
        arquivoPdf('a.pdf', 3221225472),
        arquivoPdf('b.pdf', 5242880),
        arquivoPdf('c.pdf', 2048),
        arquivoPdf('d.pdf', 10),
        arquivoPdf('e.pdf', 0),
    ]);

    assert.deepEqual(pagina.textos('.file-item-status'), [
        'Original: 3 GB',
        'Original: 5 MB',
        'Original: 2 KB',
        'Original: 10 Bytes',
        'Original: 0 Bytes',
    ]);
});

test('Compressor — o aviso rápido aparece, expira sozinho e tolera tom padrão e contêiner ausente', async (t) => {
    const pagina = await abrirCompressor(t);

    selecionar(pagina, [arquivoNaoPdf('foto.png')]);
    assert.equal(pagina.seletor('#toastContainer .toast').className, 'toast warn');

    await pagina.tick(50);
    assert.equal(pagina.seletor('#toastContainer .toast').classList.contains('show'), true);

    await pagina.tick(3400);
    assert.equal(pagina.todos('#toastContainer .toast').length, 0);

    // Sem tom o toast usa a classe base do shared.
    pagina.janela.showToast('Aviso', 'Sem tom');
    assert.equal(pagina.seletor('#toastContainer .toast').className, 'toast');
    assert.deepEqual(pagina.textos('#toastContainer .toast-title'), ['Aviso']);
    assert.deepEqual(pagina.textos('#toastContainer .toast-body'), ['Sem tom']);

    // Sem o contêiner de toasts, o aviso é descartado em silêncio.
    pagina.seletor('#toastContainer').remove();
    pagina.janela.showToast('Aviso', 'Sem contêiner');
    assert.equal(pagina.existe('#toastContainer'), false);
});

test('Compressor — item tirado da fila no meio do lote: o PDF sai e o lote conclui sem quebrar', async (t) => {
    const portao = criarPortao();
    const pagina = await abrirCompressor(t, { pdfjsLib: pdfjsComPortoes(['página 1'], [portao]) });

    selecionar(pagina, [arquivoPdf('sumido.pdf', 5000)]);
    processar(pagina);
    await pagina.tick(0);
    assert.equal(pagina.seletor('#badge-0').className, 'badge badge-accent');

    pagina.seletor('#file-item-0').remove();
    portao.abrir();
    await pagina.aguardar(() => pagina.seletor('#btnProcessar').disabled === false, { descricao: 'fim do lote' });

    assert.equal(pagina.existe('#file-item-0'), false);
    assert.deepEqual(pagina.registro.downloads.map((item) => item.nome), ['sumido_comprimido.pdf']);
    assert.equal(pagina.texto('#progressGlobalText'), '1 / 1 concluídos');
    assert.equal(pagina.seletor('#progressGlobalFill').style.width, '100%');
    assert.deepEqual(pagina.mensagens('error').map((m) => m.texto), []);
});

test('Compressor — comprimirPDF monta o PDF mesmo sem callback de progresso', async (t) => {
    const paginas = ['retrato', { texto: 'paisagem', largura: 842, altura: 595 }];
    const pagina = await abrirCompressor(t, { paginas });
    const dataUrls = observarToDataURL(pagina);

    const bytes = await pagina.janela.comprimirPDF(arquivoPdf('direto.pdf', 900), 0.6, 2, null);

    assert.equal(new TextDecoder().decode(new Uint8Array(bytes)), '{"paginas":2,"imagens":2}');
    assert.deepEqual(dataUrls, [
        { tipo: 'image/jpeg', qualidade: 0.6, largura: 1190, altura: 1684 },
        { tipo: 'image/jpeg', qualidade: 0.6, largura: 1684, altura: 1190 },
    ]);
    const documento = pagina.jspdf.registro.instancias[0];
    assert.equal(documento.paginas.length, 2);
    assert.deepEqual(documento.operacoes.filter((op) => op === 'addImage').length, 2);
    assert.deepEqual(pagina.registro.downloads, []);
});
