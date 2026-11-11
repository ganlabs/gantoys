import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp, carregarToy, montarArvore } from '../../testkit/index.js';

const PROCESSO = '0001234-56.2026.8.00.0000';
const OUTRO = '0009999-11.2026.8.00.0000';
const CNJ_CRU = '00012345620268000000';

/** `[[estado, mensagem], ...]` de uma das listas do relatório. */
function linhas(pagina, lista) {
    return pagina.todos(`${lista} .report-row`).map((linha) => [
        linha.querySelector('.report-status').textContent,
        linha.lastElementChild.textContent,
    ]);
}

async function abrir(t, opcoes = {}) {
    const app = await carregarApp();
    const pagina = await carregarToy('ganapagadorcnj', opcoes);
    t.after(() => {
        pagina.fechar();
        app.fechar();
    });
    const ponte = app.conectarToy(pagina);
    return { app, pagina, ponte };
}

/** Zera os temporizadores longos do toy (60 s e 2 min) para os avisos de
 *  inatividade serem observáveis sem espera real. */
function comTimersCurtos(janela) {
    const original = janela.setTimeout.bind(janela);
    janela.setTimeout = (fn, ms = 0, ...resto) => original(fn, Math.min(ms, 20), ...resto);
}

function alertasDe(pagina) {
    const recebidos = [];
    pagina.janela.alert = (mensagem) => recebidos.push(mensagem);
    return recebidos;
}

async function escolherPasta(ctx, arvore) {
    const { app, pagina, ponte } = ctx;
    app.enfileirarPasta(arvore);
    pagina.clicar('#cnj-source');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo de pasta aberto' });
    await ponte.confirmarPasta();
    await pagina.aguardar(() => pagina.seletor('#cnj-source-name').textContent === arvore.nome, {
        descricao: `nome da pasta ${arvore.nome}`,
    });
}

async function apagar(pagina) {
    pagina.clicar('#cnj-delete');
    await pagina.aguardar(() => pagina.seletor('#cnj-summary').classList.contains('visible'), {
        descricao: 'resumo visível',
    });
}

test('ganapagadorcnj — tela inicial: pasta vazia, botão desabilitado e listas limpas', async (t) => {
    const { pagina } = await abrir(t);

    assert.equal(pagina.texto('#cnj-source-name'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#cnj-processes').value, '');
    assert.equal(pagina.texto('#cnj-count'), '0 CNJs');
    assert.equal(pagina.seletor('#cnj-delete').disabled, true);
    assert.equal(pagina.texto('#cnj-progress-text'), 'Preparando exclusão...');
    assert.equal(pagina.texto('#cnj-progress-value'), '0%');
    assert.equal(pagina.seletor('#cnj-progress').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#cnj-summary').classList.contains('visible'), false);
    assert.equal(pagina.todos('#cnj-report-list .report-row').length, 0);
    assert.equal(pagina.todos('#cnj-notdeleted-list .report-row').length, 0);
    assert.equal(pagina.seletor('#cnj-notdeleted-copy').disabled, true);
    assert.equal(pagina.texto('#cnj-notdeleted-copy'), 'Copiar lista');
});

test('ganapagadorcnj — a exclusão exige pasta e ao menos um CNJ', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`${PROCESSO}.pdf`]: 'A' });

    pagina.digitar('#cnj-processes', `  ${PROCESSO}  \n\n   \n12345\n`);
    assert.equal(pagina.texto('#cnj-count'), '2 CNJs');
    assert.equal(pagina.seletor('#cnj-delete').disabled, true);

    await escolherPasta(ctx, pasta);
    assert.equal(pagina.texto('#cnj-source-name'), 'Documentos');
    assert.equal(pagina.seletor('#cnj-source-name').classList.contains('ready'), true);
    assert.equal(pagina.seletor('#cnj-delete').disabled, false);
    assert.equal(pasta.modoUsado, 'readwrite', 'a pasta precisa ser aberta em leitura e escrita');

    pagina.digitar('#cnj-processes', '\n \n');
    assert.equal(pagina.texto('#cnj-count'), '0 CNJs');
    assert.equal(pagina.seletor('#cnj-delete').disabled, true);

    pagina.digitar('#cnj-processes', PROCESSO);
    assert.equal(pagina.texto('#cnj-count'), '1 CNJ');
    assert.equal(pagina.seletor('#cnj-delete').disabled, false);
});

test('ganapagadorcnj — apaga arquivos que contêm o CNJ e preserva os demais', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', {
        [`sub/${PROCESSO}.pdf`]: 'A',
        [`${PROCESSO} - recurso.pdf`]: 'B',
        'sub/outro documento.txt': 'não interessa',
        'contrato.pdf': 'também não',
    });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    await apagar(pagina);

    assert.deepEqual(pasta.caminhos(), ['contrato.pdf', 'sub/outro documento.txt']);
    assert.equal(pagina.texto('#cnj-progress-text'), 'Exclusão concluída.');
    assert.equal(pagina.texto('#cnj-progress-value'), '100%');
    assert.equal(pagina.seletor('#cnj-progress-bar').style.width, '100%');
    assert.equal(pagina.texto('#cnj-total'), '2');
    assert.equal(pagina.texto('#cnj-success'), '2');
    assert.equal(pagina.texto('#cnj-failure'), '0');
    assert.deepEqual(linhas(pagina, '#cnj-report-list'), [
        ['APAGADO', `sub/${PROCESSO}.pdf`],
        ['APAGADO', `${PROCESSO} - recurso.pdf`],
    ]);
    assert.equal(pagina.seletor('#cnj-report').classList.contains('visible'), true);
    assert.equal(pagina.seletor('#cnj-notdeleted').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#cnj-notdeleted-copy').disabled, true);
    assert.equal(pagina.seletor('#cnj-delete').disabled, false);
});

test('ganapagadorcnj — CNJ pontuado localiza arquivo sem pontuação e vice-versa', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', {
        [`a/${CNJ_CRU}.pdf`]: 'despontuado',
        [`b/${PROCESSO} - recurso.pdf`]: 'pontuado',
        'c/0007777-88.2026.8.00.0000.pdf': 'outro',
    });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    await apagar(pagina);

    assert.deepEqual(pasta.caminhos(), ['c/0007777-88.2026.8.00.0000.pdf']);
    assert.equal(pagina.texto('#cnj-total'), '2');
    assert.equal(pagina.texto('#cnj-success'), '2');

    const segunda = montarArvore('Documentos2', { [`x/${PROCESSO}.pdf`]: 'pontuado' });
    await escolherPasta(ctx, segunda);
    pagina.digitar('#cnj-processes', CNJ_CRU);
    await apagar(pagina);

    assert.deepEqual(segunda.caminhos(), []);
    assert.equal(pagina.texto('#cnj-success'), '1');
});

test('ganapagadorcnj — CNJ sem arquivo vira NÃO LOCALIZADO e alimenta Copiar lista', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`a/${OUTRO}.pdf`]: 'B' });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', `${PROCESSO}\n${OUTRO}\n${PROCESSO}`);
    await apagar(pagina);

    assert.equal(pagina.texto('#cnj-total'), '1');
    assert.equal(pagina.texto('#cnj-success'), '1');
    assert.equal(pagina.texto('#cnj-failure'), '2');
    assert.deepEqual(linhas(pagina, '#cnj-report-list'), [['APAGADO', `a/${OUTRO}.pdf`]]);
    assert.deepEqual(linhas(pagina, '#cnj-notdeleted-list'), [
        ['NÃO LOCALIZADO', `${PROCESSO}: nenhum arquivo localizado.`],
        ['NÃO LOCALIZADO', `${PROCESSO}: nenhum arquivo localizado.`],
    ]);

    const botao = '#cnj-notdeleted-copy';
    assert.equal(pagina.seletor(botao).disabled, false);
    pagina.clicar(botao);
    await pagina.aguardar(() => pagina.texto(botao) === 'Copiado', { descricao: 'rótulo Copiado' });
    assert.deepEqual(pagina.registro.clipboard.escritas, [PROCESSO]);

    await pagina.tick(1800);
    await pagina.aguardar(() => pagina.texto(botao) === 'Copiar lista', { descricao: 'rótulo restaurado' });
});

test('ganapagadorcnj — nenhum arquivo encontrado zera o total e troca o texto da barra', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`a/${OUTRO}.pdf`]: 'B' });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    await apagar(pagina);

    assert.deepEqual(pasta.caminhos(), [`a/${OUTRO}.pdf`]);
    assert.equal(pagina.texto('#cnj-progress-text'), 'Nenhum arquivo correspondente foi encontrado.');
    assert.equal(pagina.texto('#cnj-progress-value'), '100%');
    assert.equal(pagina.texto('#cnj-total'), '0');
    assert.equal(pagina.texto('#cnj-success'), '0');
    assert.equal(pagina.texto('#cnj-failure'), '1');
    assert.equal(pagina.seletor('#cnj-report').classList.contains('visible'), false);
    assert.deepEqual(linhas(pagina, '#cnj-notdeleted-list'), [
        ['NÃO LOCALIZADO', `${PROCESSO}: nenhum arquivo localizado.`],
    ]);
});

test('ganapagadorcnj — repetir a exclusão limpa o resultado anterior', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`sub/${PROCESSO}.pdf`]: 'A' });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    await apagar(pagina);
    assert.equal(pagina.texto('#cnj-success'), '1');

    await apagar(pagina);
    assert.equal(pagina.texto('#cnj-total'), '0');
    assert.equal(pagina.texto('#cnj-success'), '0');
    assert.equal(pagina.texto('#cnj-failure'), '1');
    assert.equal(pagina.seletor('#cnj-report').classList.contains('visible'), false);
    assert.deepEqual(linhas(pagina, '#cnj-report-list'), []);
    assert.deepEqual(linhas(pagina, '#cnj-notdeleted-list'), [
        ['NÃO LOCALIZADO', `${PROCESSO}: nenhum arquivo localizado.`],
    ]);
});

test('ganapagadorcnj — pasta sem permissão de escrita encerra com erro na barra', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`${PROCESSO}.pdf`]: 'A' });
    pasta.negarPermissao = true;

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    await apagar(pagina);

    assert.deepEqual(pasta.caminhos(), [`${PROCESSO}.pdf`], 'nada pode ser apagado sem permissão');
    assert.equal(pagina.texto('#cnj-progress-text'), 'Não foi possível concluir a exclusão.');
    assert.equal(pagina.texto('#cnj-total'), '0');
    assert.equal(pagina.texto('#cnj-failure'), '1');
    assert.deepEqual(linhas(pagina, '#cnj-notdeleted-list'), [
        ['ERRO', 'É necessário conceder permissão de escrita na pasta.'],
    ]);
});

test('ganapagadorcnj — só arquivos são removidos: subpastas vazias permanecem', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`sub/${PROCESSO}.pdf`]: 'A' });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    await apagar(pagina);

    assert.deepEqual(pasta.caminhos(), []);
    assert.ok(pasta.handle, 'a raiz continua disponível');
});

test('ganapagadorcnj — cancelar o seletor de pasta preserva a escolha e não alerta', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina, ponte } = ctx;
    const pasta = montarArvore('Documentos', { [`${PROCESSO}.pdf`]: 'A' });
    const alertas = alertasDe(pagina);

    app.enfileirarPasta(pasta);
    pagina.clicar('#cnj-source');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo aberto' });
    await ponte.cancelarPasta();
    assert.equal(pagina.texto('#cnj-source-name'), 'Nenhuma pasta selecionada');
    assert.deepEqual(alertas, []);

    await escolherPasta(ctx, pasta);
    app.enfileirarPasta(montarArvore('Outra', {}));
    pagina.clicar('#cnj-source');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'segundo diálogo aberto' });
    await ponte.cancelarPasta();
    assert.equal(pagina.texto('#cnj-source-name'), 'Documentos');
    assert.deepEqual(alertas, []);
    assert.equal(pagina.seletor('#cnj-delete').disabled, true);
});

test('ganapagadorcnj — erro do seletor de pasta aparece no alerta e mantém a pasta atual', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;
    const alertas = alertasDe(pagina);

    pagina.clicar('#cnj-source');
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
    assert.equal(pagina.texto('#cnj-source-name'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#cnj-delete').disabled, true);

    pagina.clicar('#cnj-source');
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

test('ganapagadorcnj — seletor indisponível no app fecha o diálogo e alerta no toy', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;
    const alertas = alertasDe(pagina);

    pagina.clicar('#cnj-source');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo aberto' });
    await ponte.confirmarPasta();

    assert.equal(ponte.modalDePastaAberto(), false);
    assert.deepEqual(alertas, ['Não foi possível abrir o seletor de pastas. Nenhuma pasta preparada no teste.']);
    assert.equal(pagina.texto('#cnj-source-name'), 'Nenhuma pasta selecionada');
});

test('ganapagadorcnj — pasta indisponível na hora de apagar vira ERRO com a mensagem do app', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`${PROCESSO}.pdf`]: 'A' });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    app.script('GAN_TOYS_DIRECTORY_HANDLES.clear();');

    await apagar(pagina);

    assert.deepEqual(pasta.caminhos(), [`${PROCESSO}.pdf`]);
    assert.equal(pagina.texto('#cnj-progress-text'), 'Não foi possível concluir a exclusão.');
    assert.equal(pagina.texto('#cnj-progress-value'), '100%');
    assert.equal(pagina.texto('#cnj-total'), '0');
    assert.equal(pagina.texto('#cnj-failure'), '1');
    assert.deepEqual(linhas(pagina, '#cnj-notdeleted-list'), [
        ['ERRO', 'A pasta selecionada não está mais disponível. Selecione-a novamente.'],
    ]);
    assert.equal(pagina.seletor('#cnj-notdeleted-copy').disabled, true);
    assert.equal(pagina.seletor('#cnj-delete').disabled, false);
});

test('ganapagadorcnj — falha da área de transferência copia pelo caminho alternativo', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`a/${OUTRO}.pdf`]: 'A' });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    await apagar(pagina);

    pagina.registro.clipboard.falha = 'área de transferência bloqueada';
    const doFallback = [];
    const execCommandOriginal = pagina.documento.execCommand;
    pagina.documento.execCommand = (comando) => {
        const campo = pagina.documento.querySelector('textarea[readonly]');
        doFallback.push(campo ? campo.value : null);
        return execCommandOriginal(comando);
    };
    pagina.clicar('#cnj-notdeleted-copy');
    await pagina.aguardar(() => pagina.texto('#cnj-notdeleted-copy') === 'Copiado', { descricao: 'rótulo Copiado' });

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.deepEqual(doFallback, [PROCESSO]);
});

test('ganapagadorcnj — copiar lista sem pendências não escreve nada', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Documentos', { [`${PROCESSO}.pdf`]: 'A' });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    await apagar(pagina);

    assert.equal(pagina.texto('#cnj-notdeleted-copy'), 'Copiar lista');
    assert.equal(pagina.seletor('#cnj-notdeleted-copy').disabled, true);
    pagina.disparar('#cnj-notdeleted-copy', 'click');
    await pagina.tick(0);

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.deepEqual(pagina.registro.execCommand, []);
    assert.equal(pagina.texto('#cnj-notdeleted-copy'), 'Copiar lista');
});

test('ganapagadorcnj — seleção de pasta sem resposta é interrompida com o aviso do toy', async (t) => {
    const { pagina } = await abrir(t, { preparar: comTimersCurtos });
    const alertas = alertasDe(pagina);

    pagina.clicar('#cnj-source');
    await pagina.aguardar(() => alertas.length === 1, { descricao: 'alerta de seleção sem resposta' });

    assert.deepEqual(alertas, ['A seleção de pasta não respondeu.']);
    assert.equal(pagina.texto('#cnj-source-name'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#cnj-delete').disabled, true);
});

test('ganapagadorcnj — exclusão sem resposta é interrompida com o aviso do toy', async (t) => {
    const ctx = await abrir(t, { preparar: comTimersCurtos });
    const { pagina, ponte } = ctx;
    const pasta = montarArvore('Documentos', { [`${PROCESSO}.pdf`]: 'A' });

    await escolherPasta(ctx, pasta);
    pagina.digitar('#cnj-processes', PROCESSO);
    ponte.desconectar();
    const pedidos = [];
    pagina.janela.addEventListener('message', (evento) => {
        if (evento.data && evento.data.type === 'gantoys-delete-request') pedidos.push(evento.data);
    });

    pagina.clicar('#cnj-delete');
    await pagina.aguardar(() => pedidos.length === 1, { descricao: 'pedido de exclusão enviado' });
    const enviar = (data) => pagina.janela.dispatchEvent(new pagina.janela.MessageEvent('message', { data }));
    enviar(null);
    enviar({ type: 'gantoys-delete-result', requestId: 'outro-pedido', result: { total: 0, results: [] } });
    enviar({ type: 'gantoys-delete-progress', requestId: pedidos[0].requestId });

    await apagar(pagina);

    assert.equal(pagina.texto('#cnj-progress-text'), 'Não foi possível concluir a exclusão.');
    assert.equal(pagina.texto('#cnj-total'), '0');
    assert.equal(pagina.texto('#cnj-failure'), '1');
    assert.deepEqual(linhas(pagina, '#cnj-notdeleted-list'), [['ERRO', 'A operação de exclusão não respondeu.']]);
    assert.deepEqual(pasta.caminhos(), [`${PROCESSO}.pdf`]);
});

test('ganapagadorcnj — barra com total zero e estado desconhecido no relatório', async (t) => {
    const { pagina } = await abrir(t);

    pagina.janela.setProgress(0, 0, 'Procurando e apagando arquivos...');
    assert.equal(pagina.seletor('#cnj-progress').classList.contains('visible'), true);
    assert.equal(pagina.texto('#cnj-progress-text'), 'Procurando e apagando arquivos...');
    assert.equal(pagina.texto('#cnj-progress-value'), '0%');
    assert.equal(pagina.seletor('#cnj-progress-bar').style.width, '0%');

    pagina.janela.renderReport('notdeleted', [{ status: 'inesperado', message: 'sem estado conhecido' }]);
    assert.deepEqual(linhas(pagina, '#cnj-notdeleted-list'), [['ERRO', 'sem estado conhecido']]);
    assert.equal(pagina.seletor('#cnj-notdeleted').classList.contains('visible'), true);
});
