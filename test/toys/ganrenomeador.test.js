import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp, carregarToy, montarArvore } from '../../testkit/index.js';

/** Zera os temporizadores longos do toy (60 s e 2 min) para os avisos de
 *  inatividade serem observáveis sem espera real. */
function comTimersCurtos(janela) {
    const original = janela.setTimeout.bind(janela);
    janela.setTimeout = (fn, ms = 0, ...resto) => original(fn, Math.min(ms, 20), ...resto);
}

async function abrir(t, opcoes = {}) {
    const app = await carregarApp();
    const pagina = await carregarToy('ganrenomeador', opcoes);
    t.after(() => {
        pagina.fechar();
        app.fechar();
    });
    const ponte = app.conectarToy(pagina);
    return { app, pagina, ponte };
}

async function escolherPasta(ctx, arvore) {
    const { app, pagina, ponte } = ctx;
    app.enfileirarPasta(arvore);
    pagina.clicar('#folderButton');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo de pasta aberto' });
    await ponte.confirmarPasta();
    await pagina.aguardar(() => pagina.texto('#folderName') === arvore.nome, { descricao: `nome da pasta ${arvore.nome}` });
}

async function visualizar(ctx, titulo) {
    const { pagina, ponte } = ctx;
    const respostasAntes = ponte.respostas.filter((mensagem) => mensagem.type === 'gantoys-renamer-result').length;
    pagina.clicar('#previewButton');
    await pagina.aguardar(
        () =>
            ponte.respostas.filter((mensagem) => mensagem.type === 'gantoys-renamer-result').length > respostasAntes &&
            pagina.texto('#previewTitle') === titulo,
        { descricao: `prévia "${titulo}"` }
    );
}

async function renomear(pagina) {
    pagina.clicar('#renameButton');
    await pagina.aguardar(() => pagina.seletor('#report').classList.contains('visible'), { descricao: 'relatório da operação' });
}

/** `[[nome atual, novo nome], ...]` da prévia. */
function previa(pagina) {
    return pagina.todos('#previewList .report-row').map((linha) => [linha.children[0].textContent, linha.children[1].textContent]);
}

/** `[[estado, mensagem], ...]` do relatório da operação. */
function relatorio(pagina) {
    return pagina.todos('#reportList .report-row').map((linha) => [
        linha.querySelector('.report-status').textContent,
        linha.lastElementChild.textContent,
    ]);
}

function alertasDe(pagina) {
    const recebidos = [];
    pagina.janela.alert = (mensagem) => recebidos.push(mensagem);
    return recebidos;
}

test('ganrenomeador — tela inicial: sem pasta, sem padrão e tudo desabilitado', async (t) => {
    const { pagina } = await abrir(t);

    assert.equal(pagina.texto('#folderName'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#folderName').classList.contains('ready'), false);
    assert.equal(pagina.seletor('#preset').value, '');
    assert.equal(pagina.seletor('#preset').options[0].textContent, 'Personalizado');
    assert.equal(pagina.seletor('#pattern').value, '');
    assert.equal(pagina.seletor('#pattern').placeholder, 'Ex.: Integral - *.pdf');
    assert.equal(pagina.seletor('#replacement').value, '');
    assert.equal(pagina.seletor('#replacement').placeholder, 'Ex.: Integra_$1.pdf');
    assert.equal(pagina.seletor('#normalizeExtension').checked, false);
    assert.equal(pagina.seletor('#includeSubfolders').checked, false);
    assert.equal(pagina.seletor('#previewButton').disabled, true);
    assert.equal(pagina.seletor('#renameButton').disabled, true);
    assert.equal(pagina.texto('#previewTitle'), 'Prévia da renomeação');
    assert.equal(pagina.todos('#previewList .report-row').length, 0);
    assert.equal(pagina.seletor('#preview').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#summary').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#report').classList.contains('visible'), false);
    assert.equal(pagina.texto('#statTotal'), '0');
    assert.equal(pagina.texto('#statChanged'), '0');
    assert.equal(pagina.texto('#statFailed'), '0');

    pagina.disparar('#renameButton', 'click');
    await pagina.tick(0);
    assert.equal(pagina.seletor('#report').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#summary').classList.contains('visible'), false);
    assert.equal(pagina.texto('#statTotal'), '0');
});

test('ganrenomeador — presets preenchem padrão e substituição e somem ao editar', async (t) => {
    const { pagina } = await abrir(t);

    pagina.selecionar('#preset', 'integral');
    assert.equal(pagina.seletor('#pattern').value, 'Integral - *.pdf');
    assert.equal(pagina.seletor('#replacement').value, 'Integral_$1.pdf');

    pagina.selecionar('#preset', 'inicial');
    assert.equal(pagina.seletor('#pattern').value, 'Inicial - *.pdf');
    assert.equal(pagina.seletor('#replacement').value, 'Inicial_$1.pdf');

    pagina.selecionar('#preset', 'docs-inicial');
    assert.equal(pagina.seletor('#pattern').value, 'Docs Inicial - *.pdf');
    assert.equal(pagina.seletor('#replacement').value, 'Docs_$1.pdf');

    pagina.digitar('#pattern', 'Outro - *');
    assert.equal(pagina.seletor('#preset').value, '');
    assert.equal(pagina.seletor('#replacement').value, 'Docs_$1.pdf');

    pagina.selecionar('#preset', 'integral');
    pagina.digitar('#replacement', 'X$1.pdf');
    assert.equal(pagina.seletor('#preset').value, '');
    assert.equal(pagina.seletor('#pattern').value, 'Integral - *.pdf');

    pagina.selecionar('#preset', '');
    assert.equal(pagina.seletor('#preset').value, '');
    assert.equal(pagina.seletor('#pattern').value, 'Integral - *.pdf');
    assert.equal(pagina.seletor('#replacement').value, 'X$1.pdf');
    assert.equal(pagina.seletor('#previewButton').disabled, true);
});

test('ganrenomeador — Visualizar exige pasta e padrão; Renomear exige prévia com linhas', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { 'Integral - 1.pdf': 'A' });

    pagina.digitar('#pattern', 'Integral - *.pdf');
    pagina.digitar('#replacement', 'Integral_$1.pdf');
    assert.equal(pagina.seletor('#previewButton').disabled, true);

    await escolherPasta(ctx, origem);
    assert.equal(pagina.texto('#folderName'), 'Origem');
    assert.equal(pagina.seletor('#folderName').classList.contains('ready'), true);
    assert.equal(pagina.seletor('#previewButton').disabled, false);
    assert.equal(pagina.seletor('#renameButton').disabled, true);

    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 1');
    assert.equal(pagina.seletor('#renameButton').disabled, false);

    pagina.digitar('#pattern', '');
    assert.equal(pagina.seletor('#previewButton').disabled, true);
    assert.equal(pagina.seletor('#renameButton').disabled, true);
});

test('ganrenomeador — prévia pelo preset Integral mostra a contagem e a linha exatas', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        'Integral - 0001234-56.2026.8.00.0000.pdf': 'A',
        'Inicial - 999.pdf': 'B',
        'outro.txt': 'C',
    });

    await escolherPasta(ctx, origem);
    pagina.selecionar('#preset', 'integral');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 3');

    assert.equal(pagina.texto('#previewTitle'), 'Prévia da renomeação — 1 arquivo(s) de 3');
    assert.deepEqual(previa(pagina), [
        ['Integral - 0001234-56.2026.8.00.0000.pdf', 'Integral_0001234-56.2026.8.00.0000.pdf'],
    ]);
    assert.equal(pagina.texto('#statTotal'), '0');
    assert.equal(pagina.seletor('#summary').classList.contains('visible'), false);

    await renomear(pagina);

    assert.deepEqual(origem.caminhos(), [
        'Inicial - 999.pdf',
        'Integral_0001234-56.2026.8.00.0000.pdf',
        'outro.txt',
    ]);
    assert.equal(origem.conteudo('Integral_0001234-56.2026.8.00.0000.pdf'), 'A');
    assert.deepEqual(relatorio(pagina), [
        ['RENOMEADO', 'Integral - 0001234-56.2026.8.00.0000.pdf → Integral_0001234-56.2026.8.00.0000.pdf'],
    ]);
    assert.equal(pagina.texto('#statTotal'), '1');
    assert.equal(pagina.texto('#statChanged'), '1');
    assert.equal(pagina.texto('#statFailed'), '0');
    assert.equal(pagina.seletor('#summary').classList.contains('visible'), true);
    assert.equal(pagina.seletor('#renameButton').disabled, true);
    assert.equal(pagina.seletor('#previewButton').disabled, false);
    assert.deepEqual(previa(pagina), [
        ['Integral - 0001234-56.2026.8.00.0000.pdf', 'Integral_0001234-56.2026.8.00.0000.pdf'],
    ]);
});

test('ganrenomeador — Incluir subpastas amplia a varredura e renomeia dentro da subpasta', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        'Integral - 1.pdf': 'R',
        'sub/Integral - 2.pdf': 'S',
    });
    await escolherPasta(ctx, origem);
    pagina.digitar('#pattern', 'Integral - *.pdf');
    pagina.digitar('#replacement', 'Integral_$1.pdf');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 1');

    assert.equal(pagina.texto('#previewTitle'), 'Prévia da renomeação — 1 arquivo(s) de 1');
    assert.deepEqual(previa(pagina), [['Integral - 1.pdf', 'Integral_1.pdf']]);

    pagina.marcar('#includeSubfolders');
    assert.equal(pagina.seletor('#includeSubfolders').checked, true);
    assert.equal(pagina.seletor('#preview').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#renameButton').disabled, true);
    await visualizar(ctx, 'Prévia da renomeação — 2 arquivo(s) de 2');

    assert.equal(pagina.texto('#previewTitle'), 'Prévia da renomeação — 2 arquivo(s) de 2');
    assert.deepEqual(previa(pagina), [
        ['Integral - 1.pdf', 'Integral_1.pdf'],
        ['sub/Integral - 2.pdf', 'Integral_2.pdf'],
    ]);

    await renomear(pagina);

    assert.deepEqual(origem.caminhos(), ['Integral_1.pdf', 'sub/Integral_2.pdf']);
    assert.equal(origem.conteudo('Integral_1.pdf'), 'R');
    assert.equal(origem.conteudo('sub/Integral_2.pdf'), 'S');
    assert.deepEqual(relatorio(pagina), [
        ['RENOMEADO', 'Integral - 1.pdf → Integral_1.pdf'],
        ['RENOMEADO', 'sub/Integral - 2.pdf → Integral_2.pdf'],
    ]);
    assert.equal(pagina.texto('#statTotal'), '2');
    assert.equal(pagina.texto('#statChanged'), '2');
    assert.equal(pagina.texto('#statFailed'), '0');
});

test('ganrenomeador — ? casa exatamente a quantidade de caracteres e $n segue a ordem dos curingas', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        'Doc 12.pdf': 'A',
        'Doc 123.pdf': 'B',
        'A-B.pdf': 'C',
    });

    await escolherPasta(ctx, origem);
    pagina.digitar('#pattern', 'Doc ??.pdf');
    pagina.digitar('#replacement', 'Doc_$1.pdf');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 3');

    assert.equal(pagina.texto('#previewTitle'), 'Prévia da renomeação — 1 arquivo(s) de 3');
    assert.deepEqual(previa(pagina), [['Doc 12.pdf', 'Doc_12.pdf']]);

    pagina.digitar('#pattern', '*-*.pdf');
    pagina.digitar('#replacement', '$2_$1.pdf');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 3');

    assert.deepEqual(previa(pagina), [['A-B.pdf', 'B_A.pdf']]);

    await renomear(pagina);

    assert.deepEqual(origem.caminhos(), ['B_A.pdf', 'Doc 12.pdf', 'Doc 123.pdf']);
    assert.equal(origem.conteudo('B_A.pdf'), 'C');
    assert.deepEqual(relatorio(pagina), [['RENOMEADO', 'A-B.pdf → B_A.pdf']]);
});

test('ganrenomeador — curingas do padrão não valem como metacaracteres de expressão', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        'Prova (1).PDF': 'A',
        'Prova 1.PDF': 'B',
    });

    await escolherPasta(ctx, origem);
    pagina.digitar('#pattern', 'Prova (1).PDF');
    pagina.digitar('#replacement', 'Prova (1)-ok.PDF');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 2');

    assert.equal(pagina.texto('#previewTitle'), 'Prévia da renomeação — 1 arquivo(s) de 2');
    assert.deepEqual(previa(pagina), [['Prova (1).PDF', 'Prova (1)-ok.PDF']]);

    await renomear(pagina);

    assert.deepEqual(origem.caminhos(), ['Prova (1)-ok.PDF', 'Prova 1.PDF']);
    assert.equal(origem.conteudo('Prova (1)-ok.PDF'), 'A');
});

test('ganrenomeador — nome final igual ao atual fica fora da prévia até normalizar a extensão', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        'DOCUMENTO.PDF': 'A',
        'sem_ponto': 'B',
    });

    await escolherPasta(ctx, origem);
    pagina.digitar('#pattern', 'DOCUMENTO.PDF');
    pagina.digitar('#replacement', 'DOCUMENTO.PDF');
    await visualizar(ctx, 'Prévia da renomeação — 0 arquivo(s) de 2');

    assert.equal(pagina.texto('#previewTitle'), 'Prévia da renomeação — 0 arquivo(s) de 2');
    assert.deepEqual(previa(pagina), []);
    assert.equal(pagina.seletor('#preview').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#renameButton').disabled, true);

    pagina.marcar('#normalizeExtension');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 2');

    assert.equal(pagina.texto('#previewTitle'), 'Prévia da renomeação — 1 arquivo(s) de 2');
    assert.deepEqual(previa(pagina), [['DOCUMENTO.PDF', 'DOCUMENTO.pdf']]);

    await renomear(pagina);

    assert.deepEqual(origem.caminhos(), ['DOCUMENTO.pdf', 'sem_ponto']);
    assert.equal(origem.conteudo('DOCUMENTO.pdf'), 'A');
    assert.deepEqual(relatorio(pagina), [['RENOMEADO', 'DOCUMENTO.PDF → DOCUMENTO.pdf']]);
});

test('ganrenomeador — dois arquivos para o mesmo nome: o primeiro renomeia e o segundo falha', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        'a.pdf': 'A',
        'b.pdf': 'B',
    });

    await escolherPasta(ctx, origem);
    pagina.digitar('#pattern', '*.pdf');
    pagina.digitar('#replacement', 'padrao.pdf');
    await visualizar(ctx, 'Prévia da renomeação — 2 arquivo(s) de 2');

    assert.deepEqual(previa(pagina), [
        ['a.pdf', 'padrao.pdf'],
        ['b.pdf', 'padrao.pdf'],
    ]);

    await renomear(pagina);

    assert.deepEqual(origem.caminhos(), ['b.pdf', 'padrao.pdf']);
    assert.equal(origem.conteudo('padrao.pdf'), 'A');
    assert.deepEqual(relatorio(pagina), [
        ['RENOMEADO', 'a.pdf → padrao.pdf'],
        ['ERRO', 'b.pdf: já existe um arquivo com esse nome'],
    ]);
    assert.equal(pagina.texto('#statTotal'), '2');
    assert.equal(pagina.texto('#statChanged'), '1');
    assert.equal(pagina.texto('#statFailed'), '1');
});

test('ganrenomeador — plano descartado no app faz a renomeação avisar que a prévia expirou', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina } = ctx;
    const origem = montarArvore('Origem', { 'Integral - 1.pdf': 'A' });
    const alertas = alertasDe(pagina);

    await escolherPasta(ctx, origem);
    pagina.selecionar('#preset', 'integral');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 1');

    app.script('GAN_TOYS_RENAME_PLANS.clear();');
    pagina.clicar('#renameButton');
    await pagina.aguardar(() => alertas.length === 1, { descricao: 'alerta de prévia expirada' });

    assert.deepEqual(alertas, [
        'Não foi possível renomear os arquivos: A prévia expirou. Gere uma nova prévia antes de renomear.',
    ]);
    assert.deepEqual(origem.caminhos(), ['Integral - 1.pdf']);
    assert.equal(pagina.seletor('#report').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#summary').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#previewButton').disabled, false);
    assert.equal(pagina.seletor('#renameButton').disabled, false);
});

test('ganrenomeador — mudar o padrão descarta a prévia e volta a exigir Visualizar', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;
    const origem = montarArvore('Origem', { 'Integral - 1.pdf': 'A' });

    await escolherPasta(ctx, origem);
    pagina.selecionar('#preset', 'integral');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 1');
    assert.equal(pagina.seletor('#renameButton').disabled, false);

    pagina.digitar('#pattern', 'Integral - *');
    pagina.digitar('#replacement', 'Novo_$1');
    assert.equal(pagina.seletor('#preview').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#report').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#summary').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#previewButton').disabled, false);
    assert.equal(pagina.seletor('#renameButton').disabled, true);

    pagina.clicar('#renameButton');
    await pagina.tick(0);
    assert.deepEqual(origem.caminhos(), ['Integral - 1.pdf']);
    assert.deepEqual(
        ponte.enviados.filter((mensagem) => mensagem.type === 'gantoys-renamer-request').map((mensagem) => mensagem.action),
        ['preview']
    );

    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 1');
    assert.deepEqual(previa(pagina), [['Integral - 1.pdf', 'Novo_1.pdf']]);
});

test('ganrenomeador — pasta indisponível no app faz a prévia avisar e não abre nada', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina } = ctx;
    const origem = montarArvore('Origem', { 'Integral - 1.pdf': 'A' });
    const alertas = alertasDe(pagina);

    await escolherPasta(ctx, origem);
    pagina.selecionar('#preset', 'integral');
    app.script('GAN_TOYS_DIRECTORY_HANDLES.clear();');
    pagina.clicar('#previewButton');
    await pagina.aguardar(() => alertas.length === 1, { descricao: 'alerta de pasta indisponível' });

    assert.deepEqual(alertas, [
        'Não foi possível gerar a prévia: A pasta selecionada não está mais disponível. Selecione-a novamente.',
    ]);
    assert.equal(pagina.seletor('#preview').classList.contains('visible'), false);
    assert.equal(pagina.todos('#previewList .report-row').length, 0);
    assert.equal(pagina.seletor('#renameButton').disabled, true);
    assert.equal(pagina.seletor('#previewButton').disabled, false);
});

test('ganrenomeador — cancelar o seletor de pasta não muda nada e não alerta', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina, ponte } = ctx;
    const alertas = alertasDe(pagina);

    app.enfileirarPasta(montarArvore('Origem', {}));
    pagina.clicar('#folderButton');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo aberto' });
    await ponte.cancelarPasta();

    assert.deepEqual(alertas, []);
    assert.equal(pagina.texto('#folderName'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#previewButton').disabled, true);
    assert.equal(pagina.seletor('#renameButton').disabled, true);
});

test('ganrenomeador — erro do seletor de pasta aparece no alerta', async (t) => {
    const { pagina, ponte } = await abrir(t);
    const alertas = alertasDe(pagina);

    pagina.clicar('#folderButton');
    await pagina.aguardar(() => ponte.enviados.some((mensagem) => mensagem.type === 'gantoys-directory-picker-request'), {
        descricao: 'pedido de pasta enviado',
    });
    const pedido = ponte.enviados.filter((mensagem) => mensagem.type === 'gantoys-directory-picker-request').at(-1);
    pagina.janela.dispatchEvent(
        new pagina.janela.MessageEvent('message', {
            data: {
                type: 'gantoys-directory-picker-result',
                requestId: pedido.requestId,
                error: { name: 'NotAllowedError', message: 'Permissão negada pela política do navegador.' },
            },
        })
    );

    await pagina.aguardar(() => alertas.length === 1, { descricao: 'alerta de erro do seletor' });
    assert.deepEqual(alertas, ['Permissão negada pela política do navegador.']);
    assert.equal(pagina.texto('#folderName'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#previewButton').disabled, true);

    pagina.clicar('#folderButton');
    await pagina.aguardar(() => ponte.enviados.filter((m) => m.type === 'gantoys-directory-picker-request').length === 2, {
        descricao: 'segundo pedido de pasta',
    });
    const segundo = ponte.enviados.filter((m) => m.type === 'gantoys-directory-picker-request').at(-1);
    pagina.janela.dispatchEvent(
        new pagina.janela.MessageEvent('message', {
            data: {
                type: 'gantoys-directory-picker-result',
                requestId: segundo.requestId,
                error: { name: 'NotAllowedError', message: '' },
            },
        })
    );

    await pagina.aguardar(() => alertas.length === 2, { descricao: 'alerta sem mensagem do erro' });
    assert.deepEqual(alertas, [
        'Permissão negada pela política do navegador.',
        'Não foi possível selecionar a pasta.',
    ]);
});

test('ganrenomeador — seleção de pasta sem resposta é interrompida com o aviso do toy', async (t) => {
    const { pagina } = await abrir(t, { preparar: comTimersCurtos });
    const alertas = alertasDe(pagina);

    pagina.clicar('#folderButton');
    await pagina.aguardar(() => alertas.length === 1, { descricao: 'alerta de seleção sem resposta' });

    assert.deepEqual(alertas, ['A seleção de pasta não respondeu.']);
    assert.equal(pagina.texto('#folderName'), 'Nenhuma pasta selecionada');
});

test('ganrenomeador — prévia sem resposta é interrompida com o aviso do toy', async (t) => {
    const ctx = await abrir(t, { preparar: comTimersCurtos });
    const { pagina, ponte } = ctx;
    const origem = montarArvore('Origem', { 'Integral - 1.pdf': 'A' });
    const alertas = alertasDe(pagina);

    await escolherPasta(ctx, origem);
    pagina.selecionar('#preset', 'integral');
    ponte.desconectar();
    pagina.clicar('#previewButton');
    await pagina.aguardar(() => alertas.length === 1, { descricao: 'alerta de prévia sem resposta' });

    assert.deepEqual(alertas, ['Não foi possível gerar a prévia: A operação de renomeação não respondeu.']);
    assert.equal(pagina.seletor('#preview').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#renameButton').disabled, true);
    assert.equal(pagina.seletor('#previewButton').disabled, false);
});

test('ganrenomeador — renomeação sem resposta é interrompida com o aviso do toy', async (t) => {
    const ctx = await abrir(t, { preparar: comTimersCurtos });
    const { pagina, ponte } = ctx;
    const origem = montarArvore('Origem', { 'Integral - 1.pdf': 'A' });
    const alertas = alertasDe(pagina);

    await escolherPasta(ctx, origem);
    pagina.selecionar('#preset', 'integral');
    await visualizar(ctx, 'Prévia da renomeação — 1 arquivo(s) de 1');
    ponte.desconectar();
    pagina.clicar('#renameButton');
    await pagina.aguardar(() => alertas.length === 1, { descricao: 'alerta de renomeação sem resposta' });

    assert.deepEqual(alertas, ['Não foi possível renomear os arquivos: A operação de renomeação não respondeu.']);
    assert.deepEqual(origem.caminhos(), ['Integral - 1.pdf']);
    assert.equal(pagina.seletor('#report').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#renameButton').disabled, false);
});

test('ganrenomeador — pedidos sem payload usam os padrões do toy', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;
    const origem = montarArvore('Origem', { 'Integral - 1.pdf': 'A' });
    const alertas = alertasDe(pagina);

    await assert.rejects(pagina.janela.requestShellRenamer('apply'), {
        message: 'A prévia expirou. Gere uma nova prévia antes de renomear.',
    });
    assert.deepEqual(alertas, []);
    assert.deepEqual(origem.caminhos(), ['Integral - 1.pdf']);

    ctx.app.enfileirarPasta(origem);
    const pedidoDePasta = pagina.janela.pickDirectoryFromGanToys();
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo aberto sem modo explícito' });
    assert.equal(ponte.enviados.filter((m) => m.type === 'gantoys-directory-picker-request').at(-1).mode, 'readwrite');
    await ponte.confirmarPasta();
    assert.equal((await pedidoDePasta).name, 'Origem');
    assert.equal(origem.modoUsado, 'readwrite');
});
