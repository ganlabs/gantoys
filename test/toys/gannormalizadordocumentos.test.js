import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

async function abrir(t) {
    const pagina = await carregarToy('gannormalizadordocumentos');
    t.after(() => pagina.fechar());
    return pagina;
}

function processar(pagina, texto) {
    pagina.digitar('#toolInput', texto);
    pagina.clicar('#runButton');
}

test('DOC — a tela nasce sem ajustes, com o resultado escondido e o campo vazio', async (t) => {
    const pagina = await abrir(t);

    assert.equal(pagina.seletor('#settings').classList.contains('hidden'), true);
    assert.equal(pagina.html('#settings'), '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#toolInput').placeholder, 'Cole os dados aqui...');
    assert.equal(pagina.texto('#inputHint'), 'Cole os dados, um por linha.');
    assert.equal(pagina.texto('#resultSummary'), '');
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
    assert.equal(pagina.documento.querySelectorAll('table').length, 0);
});

test('DOC — 11 dígitos viram CPF, 14 viram CNPJ e o resto sai INVÁLIDO com os dígitos', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        '12345678901',
        '12.345.678/0001-95',
        '123',
        '123456789012345',
        'abc'
    ].join('\n'));

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '5 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table th'), ['Tipo', 'Normalizado']);
    assert.deepEqual(pagina.textos('.results-table td'), [
        'CPF', '123.456.789-01',
        'CNPJ', '12.345.678/0001-95',
        'INVÁLIDO', '123',
        'INVÁLIDO', '123456789012345',
        'INVÁLIDO', ''
    ]);
    assert.equal(pagina.todos('.results-table tbody tr').length, 5);
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
});

test('DOC — a linha é cortada no primeiro | e a pontuação é remontada do zero', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        '111.111.111-11|resto ignorado',
        '00.000.000/0000-00|CNPJ com barra no meio',
        '999|nota fiscal',
        '12345678901|12345678901'
    ].join('\n'));

    assert.deepEqual(pagina.textos('.results-table td'), [
        'CPF', '111.111.111-11',
        'CNPJ', '00.000.000/0000-00',
        'INVÁLIDO', '999',
        'CPF', '123.456.789-01'
    ]);
});

test('DOC — linhas em branco e espaços das pontas não geram itens', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '   12345678901   \n\n   \n12.345.678/0001-95\n');

    assert.equal(pagina.texto('#resultSummary'), '2 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table td'), ['CPF', '123.456.789-01', 'CNPJ', '12.345.678/0001-95']);
});

test('DOC — repetir o processamento com linhas duplicadas substitui o resultado anterior', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '12345678901');
    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(pagina.textos('.results-table td'), ['CPF', '123.456.789-01']);

    processar(pagina, '12345678901\n12345678901\nabc');
    assert.equal(pagina.texto('#resultSummary'), '3 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table td'), [
        'CPF', '123.456.789-01',
        'CPF', '123.456.789-01',
        'INVÁLIDO', ''
    ]);
});

test('DOC — entrada vazia mostra 0 linhas, tabela sem registros e cópia sem efeito', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '\n   \n');

    assert.equal(pagina.texto('#resultSummary'), '0 linhas processadas.');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.deepEqual(pagina.textos('.results-table th'), ['Tipo', 'Normalizado']);
    assert.equal(pagina.todos('.results-table tbody tr').length, 0);

    pagina.clicar('#copyButton');
    await pagina.tick(10);

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('DOC — copiar leva só a coluna normalizada, sem cabeçalho nem tipo, e confirma no rótulo', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '12345678901\nsem documento\n12.345.678/0001-95');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['123.456.789-01\n\n12.345.678/0001-95']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('DOC — falha da área de transferência usa a cópia alternativa e ainda mostra Copiado', async (t) => {
    const pagina = await abrir(t);
    pagina.registro.clipboard.falha = 'permissão negada';

    processar(pagina, '12345678901');
    pagina.clicar('#copyButton');

    await pagina.aguardarTexto('#copyButton', 'Copiado');
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.registro.execCommand.length, 1, 'a cópia alternativa usa execCommand');
    assert.equal(pagina.todos('textarea').length, 1, 'a caixa temporária é removida do corpo');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('DOC — Limpar esvazia a entrada, esconde a seção e devolve o foco', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '12345678901');
    pagina.clicar('#clearButton');

    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.html('#results'), '');
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
    assert.equal(pagina.documento.activeElement, pagina.seletor('#toolInput'));

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);

    processar(pagina, '12345678901');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.deepEqual(pagina.textos('.results-table td'), ['CPF', '123.456.789-01']);
});
