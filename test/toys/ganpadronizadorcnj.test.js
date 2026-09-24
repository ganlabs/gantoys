import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

const LINHA_DESPONTUADA = '00000018920238260100';
const LINHA_PONTUADA = '0000001-89.2023.8.26.0100';

async function abrirToy(t) {
    const pagina = await carregarToy('ganpadronizadorcnj');
    t.after(() => pagina.fechar());
    return pagina;
}

test('CNJ — a seção de resultado nasce escondida e o campo começa vazio', async (t) => {
    const pagina = await abrirToy(t);

    assert.equal(pagina.existe('#resultsSection'), true);
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#processInput').value, '');
    assert.equal(pagina.seletor('#processInput').placeholder, `${LINHA_DESPONTUADA}\n0000002-90.2024.8.26.0100`);
    assert.equal(pagina.seletor('input[name="mode"]:checked').value, 'pontuar');
    assert.equal(pagina.texto('#resultSummary'), '0 processos convertidos');
});

test('CNJ — pontua dígitos crus e despontua o formato pontuado', async (t) => {
    const pagina = await abrirToy(t);

    pagina.digitar('#processInput', `${LINHA_DESPONTUADA}\n00000029020248260100`);
    pagina.clicar('#processBtn');

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '2 de 2 linhas convertidas.');
    assert.deepEqual(pagina.textos('.result-value'), [LINHA_PONTUADA, '0000002-90.2024.8.26.0100']);
    assert.deepEqual(pagina.textos('.result-status'), ['OK', 'OK']);
    assert.deepEqual(pagina.textos('.result-meta'), [
        `Original: ${LINHA_DESPONTUADA}`,
        'Convertido para formato pontuado.',
        'Original: 00000029020248260100',
        'Convertido para formato pontuado.',
    ]);
    assert.equal(pagina.existe('.result-item.fail'), false);
    assert.equal(pagina.seletor('#emptyState').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#copyBtn').disabled, false);

    pagina.marcar('input[name="mode"][value="despontuar"]');
    pagina.clicar('#processBtn');

    assert.equal(pagina.texto('#resultSummary'), '2 de 2 linhas convertidas.');
    assert.deepEqual(pagina.textos('.result-value'), [LINHA_DESPONTUADA, '00000029020248260100']);
    assert.deepEqual(pagina.textos('.result-meta'), [
        `Original: ${LINHA_DESPONTUADA}`,
        'Convertido para formato despontuado.',
        'Original: 00000029020248260100',
        'Convertido para formato despontuado.',
    ]);
});

test('CNJ — a máscara corta os 20 dígitos por posição, sem recalcular o verificador', async (t) => {
    const pagina = await abrirToy(t);

    // 1234567 (sequencial) - 89 (verificador) . 2024 . 8 . 26 . 0100
    pagina.digitar('#processInput', '12345678920248260100');
    pagina.clicar('#processBtn');

    assert.deepEqual(pagina.textos('.result-value'), ['1234567-89.2024.8.26.0100']);
});

test('CNJ — linha sem 20 dígitos é recusada com o motivo, mantendo o texto digitado', async (t) => {
    const pagina = await abrirToy(t);

    pagina.digitar('#processInput', '000000189202382601\nabc-123');
    pagina.clicar('#processBtn');

    assert.equal(pagina.texto('#resultSummary'), '0 de 2 linhas convertidas.');
    assert.deepEqual(pagina.textos('.result-status'), ['Inválido', 'Inválido']);
    assert.deepEqual(pagina.textos('.result-value'), ['000000189202382601', 'abc-123']);
    assert.deepEqual(pagina.textos('.result-meta.error'), [
        'Linha inválida: o CNJ precisa ter 20 dígitos.',
        'Linha inválida: o CNJ precisa ter 20 dígitos.',
    ]);
    assert.equal(pagina.todos('.result-item.fail').length, 2);
    assert.equal(pagina.seletor('#copyBtn').disabled, false, 'as linhas recusadas também entram na cópia');
});

test('CNJ — separadores são descartados antes da contagem de dígitos', async (t) => {
    const pagina = await abrirToy(t);

    pagina.digitar('#processInput', '0000001-89.2023.8.26.0100');
    pagina.clicar('#processBtn');

    assert.deepEqual(pagina.textos('.result-value'), [LINHA_PONTUADA]);
    assert.deepEqual(pagina.textos('.result-status'), ['OK']);
});

test('CNJ — linhas em branco e espaços das pontas não geram itens', async (t) => {
    const pagina = await abrirToy(t);

    pagina.digitar('#processInput', `   ${LINHA_DESPONTUADA}   \n\n   \n`);
    pagina.clicar('#processBtn');

    assert.equal(pagina.texto('#resultSummary'), '1 de 1 linhas convertidas.');
    assert.deepEqual(pagina.textos('.result-value'), [LINHA_PONTUADA]);
    assert.deepEqual(pagina.textos('.result-meta'), [
        `Original: ${LINHA_DESPONTUADA}`,
        'Convertido para formato pontuado.',
    ]);
});

test('CNJ — lista vazia mostra o aviso e desabilita a cópia', async (t) => {
    const pagina = await abrirToy(t);

    pagina.digitar('#processInput', `${LINHA_DESPONTUADA}`);
    pagina.clicar('#processBtn');
    assert.equal(pagina.seletor('#copyBtn').disabled, false);

    pagina.digitar('#processInput', '\n   \n');
    pagina.clicar('#processBtn');

    assert.equal(pagina.texto('#resultSummary'), 'Nenhuma linha para processar.');
    assert.equal(pagina.seletor('#emptyState').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#copyBtn').disabled, true);
    assert.equal(pagina.todos('.result-item').length, 0);
});

test('CNJ — sem modo marcado a conversão cai no pontuado', async (t) => {
    const pagina = await abrirToy(t);

    for (const radio of pagina.todos('input[name="mode"]')) radio.checked = false;
    pagina.digitar('#processInput', LINHA_DESPONTUADA);
    pagina.clicar('#processBtn');

    assert.deepEqual(pagina.textos('.result-value'), [LINHA_PONTUADA]);
});

test('CNJ — copiar leva as linhas de saída na ordem da entrada e confirma no rótulo', async (t) => {
    const pagina = await abrirToy(t);

    pagina.digitar('#processInput', `${LINHA_DESPONTUADA}\nlixo\n00000029020248260100`);
    pagina.clicar('#processBtn');
    pagina.clicar('#copyBtn');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, [`${LINHA_PONTUADA}\nlixo\n0000002-90.2024.8.26.0100`]);
    assert.equal(pagina.texto('#copyBtn'), 'Copiado');

    await pagina.aguardarTexto('#copyBtn', 'Copiar para a Memória', { timeout: 2500 });
});

test('CNJ — falha da área de transferência aparece no rótulo e volta ao normal', async (t) => {
    const pagina = await abrirToy(t);
    pagina.registro.clipboard.falha = 'permissão negada';

    pagina.digitar('#processInput', LINHA_DESPONTUADA);
    pagina.clicar('#processBtn');
    pagina.clicar('#copyBtn');

    await pagina.aguardarTexto('#copyBtn', 'Falha ao copiar');
    assert.deepEqual(pagina.registro.clipboard.escritas, []);

    await pagina.aguardarTexto('#copyBtn', 'Copiar para a Memória', { timeout: 2500 });
});

test('CNJ — copiar sem resultado não escreve nada', async (t) => {
    const pagina = await abrirToy(t);

    pagina.clicar('#copyBtn');
    await pagina.tick(10);

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.texto('#copyBtn'), 'Copiar para a Memória');
});
