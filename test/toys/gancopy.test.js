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

async function abrir(t, opcoes = {}) {
    const app = await carregarApp();
    const pagina = await carregarToy('gancopy', opcoes);
    t.after(() => {
        pagina.fechar();
        app.fechar();
    });
    const ponte = app.conectarToy(pagina);
    return { app, pagina, ponte };
}

async function escolherPasta(ctx, botao, arvore) {
    const { app, pagina, ponte } = ctx;
    app.enfileirarPasta(arvore);
    pagina.clicar(botao);
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: `diálogo de pasta aberto por ${botao}` });
    await ponte.confirmarPasta();
    await pagina.aguardar(() => pagina.seletor(`${botao}-name`).textContent === arvore.nome, {
        descricao: `nome da pasta ${arvore.nome} em ${botao}`,
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

test('gancopy — seletor indisponível no app mantém o diálogo aberto e não alerta no toy', async (t) => {
    const ctx = await abrir(t);
    const { app, pagina, ponte } = ctx;
    const alertas = alertasDe(pagina);

    pagina.clicar('#santander-source');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: 'diálogo aberto' });
    await ponte.confirmarPasta();

    assert.equal(app.texto('#directoryPickerMessage'), 'Não foi possível abrir o seletor de pastas. Nenhuma pasta preparada no teste.');
    assert.equal(ponte.modalDePastaAberto(), true);
    assert.deepEqual(alertas, []);
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

test('gancopy — seleção de pasta sem resposta é interrompida com o aviso do toy', async (t) => {
    const { pagina } = await abrir(t, { preparar: comTimersCurtos });
    const alertas = alertasDe(pagina);

    pagina.clicar('#santander-source');
    await pagina.aguardar(() => alertas.length === 1, { descricao: 'alerta de seleção sem resposta' });

    assert.deepEqual(alertas, ['A seleção de pasta não respondeu.']);
    assert.equal(pagina.texto('#santander-source-name'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#santander-copy').disabled, true);
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
