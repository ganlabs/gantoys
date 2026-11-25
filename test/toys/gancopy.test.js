import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp, carregarToy, montarArvore } from '../../testkit/index.js';

const PROCESSO = '0001234-56.2026.8.00.0000';
const OUTRO = '0009999-11.2026.8.00.0000';

/** Zera os temporizadores longos do toy (60 s e 2 min) para os avisos de
 *  inatividade serem observáveis sem espera real. */
function comTimersCurtos(janela) {
    const original = janela.setTimeout.bind(janela);
    janela.setTimeout = (fn, ms = 0, ...resto) => original(fn, Math.min(ms, 20), ...resto);
}

async function abrir(t, opcoes = {}, opcoesApp = {}) {
    const app = await carregarApp(opcoesApp);
    const pagina = await carregarToy('gancopy', opcoes);
    t.after(() => {
        pagina.fechar();
        app.fechar();
    });
    const ponte = app.conectarToy(pagina);
    return { app, pagina, ponte };
}

async function escolherPasta(ctx, botao, arvore, nomeExibido = arvore.nome) {
    const { app, pagina, ponte } = ctx;
    app.enfileirarPasta(arvore);
    pagina.clicar(botao);
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: `diálogo de pasta aberto por ${botao}` });
    await ponte.confirmarPasta();
    await pagina.aguardar(() => pagina.seletor(`${botao}-name`).textContent === nomeExibido, {
        descricao: `nome da pasta ${nomeExibido} em ${botao}`,
    });
}

async function copiar(pagina, botao, resumo) {
    pagina.clicar(botao);
    await pagina.aguardar(() => pagina.seletor(resumo).classList.contains('visible'), {
        descricao: `resumo visível em ${resumo}`,
    });
}

/** `[[estado, mensagem], ...]` de uma das listas do relatório. */
function linhas(pagina, lista) {
    return pagina.todos(`${lista} .report-row`).map((linha) => [
        linha.querySelector('.report-status').textContent,
        linha.lastElementChild.textContent,
    ]);
}

function alertasDe(pagina) {
    const recebidos = [];
    pagina.janela.alert = (mensagem) => recebidos.push(mensagem);
    return recebidos;
}

test('gancopy — tela inicial: pastas vazias, botões desabilitados e listas limpas', async (t) => {
    const { pagina } = await abrir(t);

    assert.equal(pagina.texto('#santander-source-name'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.texto('#santander-destination-name'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#santander-processes').value, '');
    assert.equal(pagina.seletor('#santander-processes').placeholder, 'Um processo por linha\nEx.: 12345\nou 0001234-56.2026.8.00.0000');
    assert.equal(pagina.texto('#santander-count'), '0 processos');
    assert.equal(pagina.seletor('#santander-copy').disabled, true);
    assert.equal(pagina.texto('#santander-progress-text'), 'Preparando cópia...');
    assert.equal(pagina.texto('#santander-progress-value'), '0%');
    assert.equal(pagina.seletor('#santander-progress').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#santander-summary').classList.contains('visible'), false);
    assert.equal(pagina.todos('#santander-report-list .report-row').length, 0);
    assert.equal(pagina.todos('#santander-notcopied-list .report-row').length, 0);
    assert.equal(pagina.seletor('#santander-notcopied-copy').disabled, true);
    assert.equal(pagina.texto('#santander-notcopied-copy'), 'Copiar lista');

    assert.equal(pagina.seletor('#panel-santander').hidden, false);
    assert.equal(pagina.seletor('#panel-bradesco').hidden, true);
    assert.equal(pagina.atributo('#tab-santander', 'aria-selected'), 'true');
    assert.equal(pagina.atributo('#tab-bradesco', 'aria-selected'), 'false');

    assert.equal(pagina.texto('#bradesco-process-count'), '0 processos');
    assert.equal(pagina.texto('#bradesco-client-count'), '0 pastas');
    assert.equal(pagina.texto('#bradesco-validation'), 'Informe os processos e as pastas cliente.');
    assert.equal(pagina.seletor('#bradesco-validation').classList.contains('error'), false);
    assert.equal(pagina.seletor('#bradesco-copy').disabled, true);
    assert.equal(pagina.seletor('#bradesco-notcopied-copy').disabled, true);
});

test('gancopy — as abas trocam painel, rótulo e seleção', async (t) => {
    const { pagina } = await abrir(t);

    pagina.clicar('#tab-bradesco');
    assert.equal(pagina.seletor('#panel-santander').hidden, true);
    assert.equal(pagina.seletor('#panel-bradesco').hidden, false);
    assert.equal(pagina.atributo('#tab-santander', 'aria-selected'), 'false');
    assert.equal(pagina.atributo('#tab-bradesco', 'aria-selected'), 'true');

    pagina.clicar('#tab-santander');
    assert.equal(pagina.seletor('#panel-santander').hidden, false);
    assert.equal(pagina.seletor('#panel-bradesco').hidden, true);
    assert.equal(pagina.atributo('#tab-santander', 'aria-selected'), 'true');
    assert.equal(pagina.atributo('#tab-bradesco', 'aria-selected'), 'false');
});

test('gancopy — a cópia da aba Arquivo exige origem, destino e processo', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`sub/${PROCESSO}.pdf`]: 'A' });
    const destino = montarArvore('Destino', {});

    pagina.digitar('#santander-processes', `  ${PROCESSO}  \n\n   \n12345\n`);
    assert.equal(pagina.texto('#santander-count'), '2 processos');
    assert.equal(pagina.seletor('#santander-copy').disabled, true);

    await escolherPasta(ctx, '#santander-source', origem);
    assert.equal(pagina.texto('#santander-source-name'), 'Origem');
    assert.equal(pagina.seletor('#santander-source-name').classList.contains('ready'), true);
    assert.equal(pagina.seletor('#santander-copy').disabled, true);

    await escolherPasta(ctx, '#santander-destination', destino);
    assert.equal(pagina.texto('#santander-destination-name'), 'Destino');
    assert.equal(pagina.seletor('#santander-copy').disabled, false);

    pagina.digitar('#santander-processes', '\n \n');
    assert.equal(pagina.texto('#santander-count'), '0 processos');
    assert.equal(pagina.seletor('#santander-copy').disabled, true);

    pagina.digitar('#santander-processes', PROCESSO);
    assert.equal(pagina.texto('#santander-count'), '1 processo');
    assert.equal(pagina.seletor('#santander-copy').disabled, false);
});

test('gancopy — cópia por processo preserva o nome e grava o conteúdo no destino', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        [`sub/${PROCESSO}.pdf`]: 'conteúdo do processo',
        'sub/outro documento.txt': 'não interessa',
    });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), [`${PROCESSO}.pdf`]);
    assert.equal(destino.conteudo(`${PROCESSO}.pdf`), 'conteúdo do processo');
    assert.deepEqual(destino.escritas, [`${PROCESSO}.pdf`]);

    assert.equal(pagina.texto('#santander-progress-text'), 'Cópia concluída.');
    assert.equal(pagina.texto('#santander-progress-value'), '100%');
    assert.equal(pagina.seletor('#santander-progress-bar').style.width, '100%');
    assert.equal(pagina.texto('#santander-total'), '1');
    assert.equal(pagina.texto('#santander-success'), '1');
    assert.equal(pagina.texto('#santander-failure'), '0');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [['COPIADO', `sub/${PROCESSO}.pdf`]]);
    assert.equal(pagina.seletor('#santander-report').classList.contains('visible'), true);
    assert.equal(pagina.seletor('#santander-notcopied').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#santander-notcopied-copy').disabled, true);
    assert.equal(pagina.seletor('#santander-copy').disabled, false);
});

test('gancopy — seleciona pastas sem nome e copia arquivo sem randomUUID no toy e no app', async (t) => {
    const preparar = (janela) => {
        Object.defineProperty(janela.crypto, 'randomUUID', { value: undefined, configurable: true });
    };
    const ctx = await abrir(t, { preparar }, { preparar });
    const { app, pagina } = ctx;
    const alertas = alertasDe(pagina);
    const origem = montarArvore('', { [`sub/${PROCESSO}.pdf`]: 'conteúdo do processo' });
    const destino = montarArvore('', {});

    assert.equal(pagina.janela.crypto.randomUUID, undefined);
    assert.equal(app.janela.crypto.randomUUID, undefined);
    await escolherPasta(ctx, '#santander-source', origem, 'Pasta selecionada');
    await escolherPasta(ctx, '#santander-destination', destino, 'Pasta selecionada');
    pagina.digitar('#santander-processes', PROCESSO);
    assert.equal(pagina.seletor('#santander-copy').disabled, false);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), [`${PROCESSO}.pdf`]);
    assert.equal(destino.conteudo(`${PROCESSO}.pdf`), 'conteúdo do processo');
    assert.deepEqual(destino.escritas, [`${PROCESSO}.pdf`]);
    assert.equal(pagina.texto('#santander-progress-text'), 'Cópia concluída.');
    assert.equal(pagina.texto('#santander-success'), '1');
    assert.equal(pagina.texto('#santander-failure'), '0');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [['COPIADO', `sub/${PROCESSO}.pdf`]]);
    assert.deepEqual(alertas, []);
});

test('gancopy — processo só de dígitos casa pelo número e copia todos os arquivos que o atendem', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        [`a/${PROCESSO}.pdf`]: 'A',
        [`b/${PROCESSO} - recurso.pdf`]: 'B',
        [`c/${OUTRO}.pdf`]: 'C',
    });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', '00012345620268000000');
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), [`${PROCESSO} - recurso.pdf`, `${PROCESSO}.pdf`]);
    assert.equal(destino.conteudo(`${PROCESSO}.pdf`), 'A');
    assert.equal(destino.conteudo(`${PROCESSO} - recurso.pdf`), 'B');
    assert.equal(pagina.texto('#santander-total'), '2');
    assert.equal(pagina.texto('#santander-success'), '2');
    assert.equal(pagina.texto('#santander-failure'), '0');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [
        ['COPIADO', `a/${PROCESSO}.pdf`],
        ['COPIADO', `b/${PROCESSO} - recurso.pdf`],
    ]);
});

test('gancopy — processo pontuado localiza arquivo despontuado no Santander e no Bradesco', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const cnjCru = '00012345620268000000';
    const origem = montarArvore('Origem', {
        [`a/${cnjCru}.pdf`]: 'conteúdo despontuado',
    });
    const destino = montarArvore('Destino', {});

    // Santander: processo pontuado encontra arquivo com nome despontuado
    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), [`${cnjCru}.pdf`]);
    assert.equal(destino.conteudo(`${cnjCru}.pdf`), 'conteúdo despontuado');
    assert.equal(pagina.texto('#santander-total'), '1');
    assert.equal(pagina.texto('#santander-success'), '1');

    // Bradesco: processo pontuado encontra PDF despontuado e renomeia
    pagina.clicar('#tab-bradesco');
    const destinoBradesco = montarArvore('DestinoBradesco', {});
    await escolherPasta(ctx, '#bradesco-source', origem);
    await escolherPasta(ctx, '#bradesco-destination', destinoBradesco);
    pagina.digitar('#bradesco-processes', PROCESSO);
    pagina.digitar('#bradesco-clients', 'Pasta Alpha');
    await copiar(pagina, '#bradesco-copy', '#bradesco-summary');

    assert.deepEqual(destinoBradesco.caminhos(), ['INICIAL Pasta Alpha.pdf']);
    assert.equal(destinoBradesco.conteudo('INICIAL Pasta Alpha.pdf'), 'conteúdo despontuado');
    assert.equal(pagina.texto('#bradesco-success'), '1');
});

test('gancopy — processo com texto casa por trecho do caminho, ignorando maiúsculas', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        'a/Contrato Social 2026.pdf': 'contrato',
        'a/Procuracao.pdf': 'procuração',
    });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', 'contrato social');
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), ['Contrato Social 2026.pdf']);
    assert.equal(destino.conteudo('Contrato Social 2026.pdf'), 'contrato');
    assert.equal(pagina.texto('#santander-total'), '1');
    assert.equal(pagina.texto('#santander-success'), '1');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [['COPIADO', 'a/Contrato Social 2026.pdf']]);
});

test('gancopy — arquivo igual no destino vira IGUAL, não é regravado e alimenta Copiar lista', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'mesmo conteúdo' });
    const destino = montarArvore('Destino', { [`${PROCESSO}.pdf`]: 'mesmo conteúdo' });

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.escritas, []);
    assert.equal(pagina.texto('#santander-total'), '1');
    assert.equal(pagina.texto('#santander-success'), '0');
    assert.equal(pagina.texto('#santander-failure'), '1');
    assert.equal(pagina.seletor('#santander-report').classList.contains('visible'), false);
    assert.equal(pagina.seletor('#santander-notcopied').classList.contains('visible'), true);
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['IGUAL', `${PROCESSO}.pdf: já existe no destino com o mesmo conteúdo`],
    ]);
    assert.equal(pagina.texto('#santander-progress-text'), 'Cópia concluída.');

    const botao = '#santander-notcopied-copy';
    assert.equal(pagina.seletor(botao).disabled, false);
    pagina.clicar(botao);
    await pagina.aguardar(() => pagina.texto(botao) === 'Copiado', { descricao: 'rótulo Copiado' });
    assert.deepEqual(pagina.registro.clipboard.escritas, [PROCESSO]);

    await pagina.tick(1800);
    await pagina.aguardar(() => pagina.texto(botao) === 'Copiar lista', { descricao: 'rótulo restaurado' });
});

test('gancopy — arquivo diferente no destino é sobrescrito e vira ATUALIZADO', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`sub/${PROCESSO}.pdf`]: 'versão nova' });
    const destino = montarArvore('Destino', { [`${PROCESSO}.pdf`]: 'versão antiga' });

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.equal(destino.conteudo(`${PROCESSO}.pdf`), 'versão nova');
    assert.deepEqual(destino.escritas, [`${PROCESSO}.pdf`]);
    assert.equal(pagina.texto('#santander-total'), '1');
    assert.equal(pagina.texto('#santander-success'), '1');
    assert.equal(pagina.texto('#santander-failure'), '0');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [
        ['ATUALIZADO', `sub/${PROCESSO}.pdf (sobrescrito)`],
    ]);
});

test('gancopy — processo sem arquivo vira NÃO LOCALIZADO com a mensagem e a lista', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`a/${OUTRO}.pdf`]: 'B' });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', `${PROCESSO}\n${OUTRO}\n${PROCESSO}`);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.equal(pagina.texto('#santander-total'), '1');
    assert.equal(pagina.texto('#santander-success'), '1');
    assert.equal(pagina.texto('#santander-failure'), '2');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [['COPIADO', `a/${OUTRO}.pdf`]]);
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['NÃO LOCALIZADO', `${PROCESSO}: nenhum arquivo localizado na origem.`],
        ['NÃO LOCALIZADO', `${PROCESSO}: nenhum arquivo localizado na origem.`],
    ]);

    pagina.clicar('#santander-notcopied-copy');
    await pagina.aguardar(() => pagina.texto('#santander-notcopied-copy') === 'Copiado', { descricao: 'rótulo Copiado' });
    assert.deepEqual(pagina.registro.clipboard.escritas, [PROCESSO]);
});

test('gancopy — nenhum arquivo encontrado zera o total e troca o texto da barra', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`a/${OUTRO}.pdf`]: 'B' });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.equal(pagina.texto('#santander-progress-text'), 'Nenhum arquivo correspondente foi encontrado.');
    assert.equal(pagina.texto('#santander-progress-value'), '100%');
    assert.equal(pagina.texto('#santander-total'), '0');
    assert.equal(pagina.texto('#santander-success'), '0');
    assert.equal(pagina.texto('#santander-failure'), '1');
    assert.equal(pagina.seletor('#santander-report').classList.contains('visible'), false);
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['NÃO LOCALIZADO', `${PROCESSO}: nenhum arquivo localizado na origem.`],
    ]);
});

test('gancopy — repetir a cópia limpa o resultado anterior e reaproveita o arquivo igual', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`sub/${PROCESSO}.pdf`]: 'conteúdo' });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');
    assert.equal(pagina.texto('#santander-success'), '1');

    await copiar(pagina, '#santander-copy', '#santander-summary');
    assert.deepEqual(destino.escritas, [`${PROCESSO}.pdf`]);
    assert.equal(pagina.texto('#santander-total'), '1');
    assert.equal(pagina.texto('#santander-success'), '0');
    assert.equal(pagina.texto('#santander-failure'), '1');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), []);
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['IGUAL', `sub/${PROCESSO}.pdf: já existe no destino com o mesmo conteúdo`],
    ]);
});

test('gancopy — Bradesco pareia processo e pasta cliente linha a linha', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        [`sub/${PROCESSO}.pdf`]: 'A',
        [`origem/${OUTRO}.pdf`]: 'B',
        'ignorar/0008888-22.2026.8.00.0000.txt': 'C',
    });
    const destino = montarArvore('Destino', {});

    pagina.clicar('#tab-bradesco');
    await escolherPasta(ctx, '#bradesco-source', origem);
    await escolherPasta(ctx, '#bradesco-destination', destino);
    pagina.digitar('#bradesco-processes', `${PROCESSO}\n${OUTRO}`);
    pagina.digitar('#bradesco-clients', '45678\n99001');
    assert.equal(pagina.texto('#bradesco-process-count'), '2 processos');
    assert.equal(pagina.texto('#bradesco-client-count'), '2 pastas');
    assert.equal(pagina.texto('#bradesco-validation'), '2 correspondência(s) pronta(s) para cópia.');
    assert.equal(pagina.seletor('#bradesco-validation').classList.contains('error'), false);
    assert.equal(pagina.seletor('#bradesco-copy').disabled, false);

    await copiar(pagina, '#bradesco-copy', '#bradesco-summary');

    assert.deepEqual(destino.caminhos(), ['INICIAL 45678.pdf', 'INICIAL 99001.pdf']);
    assert.equal(destino.conteudo('INICIAL 45678.pdf'), 'A');
    assert.equal(destino.conteudo('INICIAL 99001.pdf'), 'B');
    assert.equal(pagina.texto('#bradesco-progress-text'), 'Cópia concluída.');
    assert.equal(pagina.texto('#bradesco-total'), '2');
    assert.equal(pagina.texto('#bradesco-success'), '2');
    assert.equal(pagina.texto('#bradesco-failure'), '0');
    assert.deepEqual(linhas(pagina, '#bradesco-report-list'), [
        ['COPIADO', `${PROCESSO} → INICIAL 45678.pdf`],
        ['COPIADO', `${OUTRO} → INICIAL 99001.pdf`],
    ]);
    assert.equal(pagina.seletor('#bradesco-notcopied').classList.contains('visible'), false);
});

test('gancopy — Bradesco marca IGUAL e ATUALIZADO pelo conteúdo já existente', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        [`${PROCESSO}.pdf`]: 'mesmo',
        [`${OUTRO}.pdf`]: 'novo',
    });
    const destino = montarArvore('Destino', {
        'INICIAL 45678.pdf': 'mesmo',
        'INICIAL 99001.pdf': 'antigo',
    });

    pagina.clicar('#tab-bradesco');
    await escolherPasta(ctx, '#bradesco-source', origem);
    await escolherPasta(ctx, '#bradesco-destination', destino);
    pagina.digitar('#bradesco-processes', `${PROCESSO}\n${OUTRO}`);
    pagina.digitar('#bradesco-clients', '45678\n99001');
    await copiar(pagina, '#bradesco-copy', '#bradesco-summary');

    assert.equal(destino.conteudo('INICIAL 99001.pdf'), 'novo');
    assert.deepEqual(destino.escritas, ['INICIAL 99001.pdf']);
    assert.equal(pagina.texto('#bradesco-total'), '2');
    assert.equal(pagina.texto('#bradesco-success'), '1');
    assert.equal(pagina.texto('#bradesco-failure'), '1');
    assert.deepEqual(linhas(pagina, '#bradesco-report-list'), [
        ['ATUALIZADO', `${OUTRO} → INICIAL 99001.pdf (sobrescrito)`],
    ]);
    assert.deepEqual(linhas(pagina, '#bradesco-notcopied-list'), [
        ['IGUAL', `${PROCESSO} → INICIAL 45678.pdf: já existe no destino com o mesmo conteúdo`],
    ]);

    pagina.clicar('#bradesco-notcopied-copy');
    await pagina.aguardar(() => pagina.texto('#bradesco-notcopied-copy') === 'Copiado', { descricao: 'rótulo Copiado' });
    assert.deepEqual(pagina.registro.clipboard.escritas, [PROCESSO]);
});

test('gancopy — Bradesco valida as duas listas e o botão só habilita com elas pareadas', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    const destino = montarArvore('Destino', {});

    pagina.clicar('#tab-bradesco');
    await escolherPasta(ctx, '#bradesco-source', origem);
    await escolherPasta(ctx, '#bradesco-destination', destino);

    pagina.digitar('#bradesco-processes', '111');
    pagina.digitar('#bradesco-clients', '1');
    assert.equal(pagina.texto('#bradesco-process-count'), '1 processo');
    assert.equal(pagina.texto('#bradesco-client-count'), '1 pasta');
    assert.equal(pagina.texto('#bradesco-validation'), '1 correspondência(s) pronta(s) para cópia.');
    assert.equal(pagina.seletor('#bradesco-copy').disabled, false);

    pagina.digitar('#bradesco-processes', '111\n222');
    pagina.digitar('#bradesco-clients', '1');
    assert.equal(pagina.texto('#bradesco-validation'), 'As listas precisam ter a mesma quantidade: 2 processo(s) e 1 pasta(s).');
    assert.equal(pagina.seletor('#bradesco-validation').classList.contains('error'), true);
    assert.equal(pagina.seletor('#bradesco-copy').disabled, true);

    pagina.digitar('#bradesco-clients', '');
    assert.equal(pagina.texto('#bradesco-validation'), 'As listas precisam ter a mesma quantidade: 2 processo(s) e 0 pasta(s).');
    assert.equal(pagina.seletor('#bradesco-validation').classList.contains('error'), true);

    pagina.digitar('#bradesco-clients', '1\n2');
    assert.equal(pagina.texto('#bradesco-validation'), '2 correspondência(s) pronta(s) para cópia.');
    assert.equal(pagina.seletor('#bradesco-validation').classList.contains('error'), false);
    assert.equal(pagina.seletor('#bradesco-copy').disabled, false);

    pagina.digitar('#bradesco-processes', '');
    pagina.digitar('#bradesco-clients', '');
    assert.equal(pagina.texto('#bradesco-process-count'), '0 processos');
    assert.equal(pagina.texto('#bradesco-client-count'), '0 pastas');
    assert.equal(pagina.texto('#bradesco-validation'), 'Informe os processos e as pastas cliente.');
    assert.equal(pagina.seletor('#bradesco-validation').classList.contains('error'), false);
    assert.equal(pagina.seletor('#bradesco-copy').disabled, true);
});

test('gancopy — Bradesco ignora arquivo não PDF e avisa o processo sem PDF', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        [`a/${PROCESSO}.pdf`]: 'A',
        [`b/${OUTRO}.txt`]: 'B',
    });
    const destino = montarArvore('Destino', {});

    pagina.clicar('#tab-bradesco');
    await escolherPasta(ctx, '#bradesco-source', origem);
    await escolherPasta(ctx, '#bradesco-destination', destino);
    pagina.digitar('#bradesco-processes', `${PROCESSO}\n${OUTRO}`);
    pagina.digitar('#bradesco-clients', '45678\n99001');
    await copiar(pagina, '#bradesco-copy', '#bradesco-summary');

    assert.deepEqual(destino.caminhos(), ['INICIAL 45678.pdf']);
    assert.equal(pagina.texto('#bradesco-total'), '2');
    assert.equal(pagina.texto('#bradesco-success'), '1');
    assert.equal(pagina.texto('#bradesco-failure'), '1');
    assert.deepEqual(linhas(pagina, '#bradesco-notcopied-list'), [
        ['NÃO LOCALIZADO', `${OUTRO}: nenhum PDF localizado.`],
    ]);
});

test('gancopy — cancelar o seletor de pasta preserva a escolha e não alerta', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina, ponte } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    const alertas = alertasDe(pagina);

    app.enfileirarPasta(origem);
    pagina.clicar('#santander-source');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo aberto' });
    await ponte.cancelarPasta();
    assert.equal(pagina.texto('#santander-source-name'), 'Nenhuma pasta selecionada');
    assert.deepEqual(alertas, []);

    await escolherPasta(ctx, '#santander-source', origem);
    app.enfileirarPasta(montarArvore('Outra', {}));
    pagina.clicar('#santander-source');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'segundo diálogo aberto' });
    await ponte.cancelarPasta();
    assert.equal(pagina.texto('#santander-source-name'), 'Origem');
    assert.deepEqual(alertas, []);
    assert.equal(pagina.seletor('#santander-copy').disabled, true);
});

test('gancopy — erro do seletor de pasta aparece no alerta e mantém a pasta atual', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;
    const alertas = alertasDe(pagina);

    pagina.clicar('#santander-source');
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
    assert.equal(pagina.texto('#santander-source-name'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#santander-copy').disabled, true);

    pagina.clicar('#santander-source');
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

test('gancopy — seletor indisponível no app fecha o diálogo e alerta no toy', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;
    const alertas = alertasDe(pagina);

    pagina.clicar('#santander-source');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo aberto' });
    await ponte.confirmarPasta();

    assert.equal(ponte.modalDePastaAberto(), false);
    assert.deepEqual(alertas, ['Não foi possível abrir o seletor de pastas. Nenhuma pasta preparada no teste.']);
    assert.equal(pagina.texto('#santander-source-name'), 'Nenhuma pasta selecionada');
});

test('gancopy — pastas indisponíveis na hora da cópia viram ERRO com a mensagem do app', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    app.script('GAN_TOYS_DIRECTORY_HANDLES.clear();');

    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.equal(pagina.texto('#santander-progress-text'), 'Não foi possível concluir a cópia.');
    assert.equal(pagina.texto('#santander-progress-value'), '100%');
    assert.equal(pagina.texto('#santander-total'), '0');
    assert.equal(pagina.texto('#santander-success'), '0');
    assert.equal(pagina.texto('#santander-failure'), '1');
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['ERRO', 'Selecione novamente as pastas de origem e destino.'],
    ]);
    assert.equal(pagina.seletor('#santander-notcopied-copy').disabled, true);
    assert.equal(pagina.seletor('#santander-copy').disabled, false);
});

test('gancopy — permissão negada na origem vira ERRO sem copiar nada', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    origem.negarPermissao = true;
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), []);
    assert.equal(pagina.texto('#santander-progress-text'), 'Não foi possível concluir a cópia.');
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['ERRO', 'É necessário conceder permissão de leitura na origem e escrita no destino.'],
    ]);
});

test('gancopy — falha da área de transferência copia pelo caminho alternativo', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`a/${OUTRO}.pdf`]: 'A' });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    pagina.registro.clipboard.falha = 'área de transferência bloqueada';
    const doFallback = [];
    const execCommandOriginal = pagina.documento.execCommand;
    pagina.documento.execCommand = (comando) => {
        const campo = pagina.documento.querySelector('textarea[readonly]');
        doFallback.push(campo ? campo.value : null);
        return execCommandOriginal(comando);
    };
    pagina.clicar('#santander-notcopied-copy');
    await pagina.aguardar(() => pagina.texto('#santander-notcopied-copy') === 'Copiado', { descricao: 'rótulo Copiado' });

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.deepEqual(doFallback, [PROCESSO]);
});

test('gancopy — copiar lista sem pendências não escreve nada', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.equal(pagina.texto('#santander-notcopied-copy'), 'Copiar lista');
    assert.equal(pagina.seletor('#santander-notcopied-copy').disabled, true);
    pagina.disparar('#santander-notcopied-copy', 'click');
    await pagina.tick(0);

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.deepEqual(pagina.registro.execCommand, []);
    assert.equal(pagina.texto('#santander-notcopied-copy'), 'Copiar lista');
});

test('gancopy — cópia sem resposta é interrompida com o aviso do toy', async (t) => {
    const ctx = await abrir(t, { preparar: comTimersCurtos });
    const { pagina, ponte } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    const destino = montarArvore('Destino', {});

    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    ponte.desconectar();
    const pedidos = [];
    pagina.janela.addEventListener('message', (evento) => {
        if (evento.data && evento.data.type === 'gantoys-copy-request') pedidos.push(evento.data);
    });

    pagina.clicar('#santander-copy');
    await pagina.aguardar(() => pedidos.length === 1, { descricao: 'pedido de cópia enviado' });
    const enviar = (data) => pagina.janela.dispatchEvent(new pagina.janela.MessageEvent('message', { data }));
    enviar(null);
    enviar({ type: 'gantoys-copy-result', requestId: 'outro-pedido', result: { total: 0, results: [] } });
    enviar({ type: 'gantoys-copy-progress', requestId: pedidos[0].requestId });

    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.equal(pagina.texto('#santander-progress-text'), 'Não foi possível concluir a cópia.');
    assert.equal(pagina.texto('#santander-total'), '0');
    assert.equal(pagina.texto('#santander-failure'), '1');
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [['ERRO', 'A operação de cópia não respondeu.']]);
    assert.deepEqual(destino.caminhos(), []);
});

test('gancopy — falha na aba Bradesco vira ERRO sem copiar nada', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    const destino = montarArvore('Destino', {});

    pagina.clicar('#tab-bradesco');
    await escolherPasta(ctx, '#bradesco-source', origem);
    await escolherPasta(ctx, '#bradesco-destination', destino);
    pagina.digitar('#bradesco-processes', PROCESSO);
    pagina.digitar('#bradesco-clients', '45678');
    app.script('GAN_TOYS_DIRECTORY_HANDLES.clear();');

    await copiar(pagina, '#bradesco-copy', '#bradesco-summary');

    assert.deepEqual(destino.caminhos(), []);
    assert.equal(pagina.texto('#bradesco-progress-text'), 'Não foi possível concluir a cópia.');
    assert.equal(pagina.texto('#bradesco-progress-value'), '100%');
    assert.equal(pagina.texto('#bradesco-total'), '0');
    assert.equal(pagina.texto('#bradesco-success'), '0');
    assert.equal(pagina.texto('#bradesco-failure'), '1');
    assert.deepEqual(linhas(pagina, '#bradesco-notcopied-list'), [
        ['ERRO', 'Selecione novamente as pastas de origem e destino.'],
    ]);
    assert.equal(pagina.seletor('#bradesco-notcopied-copy').disabled, true);
});

test('gancopy — barra com total zero e estado desconhecido no relatório', async (t) => {
    const { pagina } = await abrir(t);

    pagina.janela.setProgress('santander', 0, 0, 'Procurando e copiando arquivos...');
    assert.equal(pagina.seletor('#santander-progress').classList.contains('visible'), true);
    assert.equal(pagina.texto('#santander-progress-text'), 'Procurando e copiando arquivos...');
    assert.equal(pagina.texto('#santander-progress-value'), '0%');
    assert.equal(pagina.seletor('#santander-progress-bar').style.width, '0%');

    pagina.janela.renderReport('santander', 'notcopied', [{ status: 'inesperado', message: 'sem estado conhecido' }]);
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [['ERRO', 'sem estado conhecido']]);
    assert.equal(pagina.seletor('#santander-notcopied').classList.contains('visible'), true);
});

test('gancopy — a opção Mover troca o botão, os rótulos e o texto da barra', async (t) => {
    const { pagina } = await abrir(t);

    assert.equal(pagina.seletor('#santander-move').checked, false);
    assert.equal(pagina.texto('#santander-copy'), 'Copiar arquivos');
    assert.equal(pagina.texto('#santander-success-label'), 'Copiados');
    assert.equal(pagina.texto('#santander-failure-label'), 'Não copiados');
    assert.equal(pagina.texto('#santander-report-title'), 'Copiados');
    assert.equal(pagina.texto('#santander-notcopied-title'), 'Não copiados');

    pagina.marcar('#santander-move');
    assert.equal(pagina.seletor('#santander-move').checked, true);
    assert.equal(pagina.texto('#santander-copy'), 'Mover arquivos');
    assert.equal(pagina.texto('#santander-success-label'), 'Movidos');
    assert.equal(pagina.texto('#santander-failure-label'), 'Não movidos');
    assert.equal(pagina.texto('#santander-report-title'), 'Movidos');
    assert.equal(pagina.texto('#santander-notcopied-title'), 'Não movidos');

    pagina.marcar('#santander-move');
    assert.equal(pagina.texto('#santander-copy'), 'Copiar arquivos');
    assert.equal(pagina.texto('#santander-success-label'), 'Copiados');
    assert.equal(pagina.texto('#santander-notcopied-title'), 'Não copiados');
});

test('gancopy — marcar Mover mantém a origem escolhida, já aberta em escrita', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });

    await escolherPasta(ctx, '#santander-source', origem);
    assert.equal(origem.modoUsado, 'readwrite', 'a origem já é aberta em leitura e escrita');
    pagina.digitar('#santander-processes', PROCESSO);
    assert.equal(pagina.seletor('#santander-copy').disabled, true, 'sem destino, o botão segue desabilitado');

    pagina.marcar('#santander-move');
    assert.equal(pagina.texto('#santander-source-name'), 'Origem', 'a pasta de origem continua selecionada');
    assert.equal(pagina.seletor('#santander-source-name').classList.contains('ready'), true);
    assert.equal(pagina.seletor('#santander-copy').disabled, true, 'ainda falta a pasta de destino');

    await escolherPasta(ctx, '#santander-destination', montarArvore('Destino', {}));
    assert.equal(pagina.seletor('#santander-copy').disabled, false);
});

test('gancopy — Mover grava no destino e remove o arquivo da origem', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', {
        [`sub/${PROCESSO}.pdf`]: 'conteúdo',
        'sub/outro documento.txt': 'fica',
    });
    const destino = montarArvore('Destino', {});

    pagina.marcar('#santander-move');
    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), [`${PROCESSO}.pdf`]);
    assert.equal(destino.conteudo(`${PROCESSO}.pdf`), 'conteúdo');
    assert.deepEqual(origem.caminhos(), ['sub/outro documento.txt']);
    assert.equal(pagina.texto('#santander-progress-text'), 'Movimentação concluída.');
    assert.equal(pagina.texto('#santander-total'), '1');
    assert.equal(pagina.texto('#santander-success'), '1');
    assert.equal(pagina.texto('#santander-failure'), '0');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [['MOVIDO', `sub/${PROCESSO}.pdf (movido)`]]);
    assert.equal(pagina.seletor('#santander-report').classList.contains('visible'), true);
});

test('gancopy — Mover com arquivo idêntico no destino só remove da origem', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'mesmo conteúdo' });
    const destino = montarArvore('Destino', { [`${PROCESSO}.pdf`]: 'mesmo conteúdo' });

    pagina.marcar('#santander-move');
    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.escritas, [], 'o destino já tinha o conteúdo e não é regravado');
    assert.deepEqual(origem.caminhos(), []);
    assert.equal(pagina.texto('#santander-success'), '1');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [
        ['MOVIDO', `${PROCESSO}.pdf (movido; já havia o mesmo conteúdo no destino)`],
    ]);
});

test('gancopy — Mover sobrescreve o destino diferente e marca ATUALIZADO', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`sub/${PROCESSO}.pdf`]: 'versão nova' });
    const destino = montarArvore('Destino', { [`${PROCESSO}.pdf`]: 'versão antiga' });

    pagina.marcar('#santander-move');
    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.equal(destino.conteudo(`${PROCESSO}.pdf`), 'versão nova');
    assert.deepEqual(destino.escritas, [`${PROCESSO}.pdf`]);
    assert.deepEqual(origem.caminhos(), []);
    assert.equal(pagina.texto('#santander-success'), '1');
    assert.deepEqual(linhas(pagina, '#santander-report-list'), [
        ['ATUALIZADO', `sub/${PROCESSO}.pdf (sobrescrito e movido)`],
    ]);
});

test('gancopy — Mover com origem e destino na mesma pasta não apaga nada', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const pasta = montarArvore('Pasta', { [`${PROCESSO}.pdf`]: 'A' });

    pagina.marcar('#santander-move');
    await escolherPasta(ctx, '#santander-source', pasta);
    await escolherPasta(ctx, '#santander-destination', pasta);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(pasta.caminhos(), [`${PROCESSO}.pdf`]);
    assert.equal(pagina.texto('#santander-success'), '0');
    assert.equal(pagina.texto('#santander-failure'), '1');
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['IGUAL', `${PROCESSO}.pdf: origem e destino são o mesmo arquivo`],
    ]);
});

test('gancopy — Mover avisa quando o arquivo não pode ser removido da origem', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const base = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    const origem = {
        nome: 'Origem',
        handle: {
            ...base.handle,
            async removeEntry() {
                const erro = new Error('O arquivo está em uso.');
                erro.name = 'NoModificationAllowedError';
                throw erro;
            },
        },
        caminhos: base.caminhos,
    };
    const destino = montarArvore('Destino', {});

    pagina.marcar('#santander-move');
    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), [`${PROCESSO}.pdf`], 'o destino já recebeu o arquivo');
    assert.deepEqual(origem.caminhos(), [`${PROCESSO}.pdf`], 'a origem continua com o arquivo');
    assert.equal(pagina.texto('#santander-success'), '0');
    assert.equal(pagina.texto('#santander-failure'), '1');
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['ERRO', `${PROCESSO}.pdf: não foi possível remover da origem: O arquivo está em uso.`],
    ]);
});

test('gancopy — Mover sem permissão de escrita na origem falha sem tocar no destino', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const origem = montarArvore('Origem', { [`${PROCESSO}.pdf`]: 'A' });
    origem.negarPermissao = true;
    const destino = montarArvore('Destino', {});

    pagina.marcar('#santander-move');
    await escolherPasta(ctx, '#santander-source', origem);
    await escolherPasta(ctx, '#santander-destination', destino);
    pagina.digitar('#santander-processes', PROCESSO);
    await copiar(pagina, '#santander-copy', '#santander-summary');

    assert.deepEqual(destino.caminhos(), []);
    assert.deepEqual(origem.caminhos(), [`${PROCESSO}.pdf`]);
    assert.equal(pagina.texto('#santander-progress-text'), 'Não foi possível concluir a movimentação.');
    assert.deepEqual(linhas(pagina, '#santander-notcopied-list'), [
        ['ERRO', 'É necessário conceder permissão de leitura na origem e escrita no destino (e na origem para mover).'],
    ]);
});
