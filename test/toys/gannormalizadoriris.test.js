import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

async function abrir(t) {
    const pagina = await carregarToy('gannormalizadoriris');
    t.after(() => pagina.fechar());
    return pagina;
}

function processar(pagina, texto) {
    pagina.digitar('#toolInput', texto);
    pagina.clicar('#runButton');
}

test('IRIS — a tela nasce no estado inicial, sem ajustes e com o resultado escondido', async (t) => {
    const pagina = await abrir(t);

    assert.equal(pagina.seletor('#settings').classList.contains('hidden'), true);
    assert.equal(pagina.html('#settings'), '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#toolInput').placeholder, 'Cole os dados aqui...');
    assert.equal(pagina.texto('#inputHint'), 'Cole os dados, um por linha. Exemplo: IRIS00998585.');
    assert.equal(pagina.texto('#resultSummary'), '');
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
    assert.equal(pagina.texto('#runButton'), 'Processar');
    assert.equal(pagina.texto('#clearButton'), 'Limpar');
    assert.equal(pagina.todos('.results-table').length, 0);
});

test('IRIS — remove o prefixo e os zeros à esquerda, preservando o resto do texto', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        'IRIS00998585',
        'iris-000123',
        'IRIS 0025',
        'IRIS000',
        '000123',
        'IRIS1000',
        'IRIS PASTA 01',
        'IRISIRIS001',
        'iris:0007',
        'iris_00x',
        'IRIS/00042',
        'IRIS',
        'SEM PREFIXO'
    ].join('\n'));

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '13 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table th'), ['Normalizado']);
    assert.deepEqual(pagina.textos('.results-table td'), [
        '998585',
        '123',
        '25',
        '0',
        '123',
        '1000',
        'PASTA 01',
        'IRIS001',
        '7',
        '0x',
        '42',
        '',
        'SEM PREFIXO'
    ]);
});

test('IRIS — só zeros vira zero, zeros no meio ficam e o separador é opcional', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, ['IRIS0000', 'IRIS1000', 'IRIS00', 'IRIS-000', 'IRIS0', 'IRIS  -  007'].join('\n'));

    assert.deepEqual(pagina.textos('.results-table td'), ['0', '1000', '0', '0', '0', '7']);
});

test('IRIS — uma linha dá o resumo no singular e a entrada vazia zera a tabela', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'IRIS00099');
    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(pagina.textos('.results-table td'), ['99']);

    processar(pagina, '\n   \n');
    assert.equal(pagina.texto('#resultSummary'), '0 linhas processadas.');
    assert.equal(pagina.todos('.results-table th').length, 1);
    assert.deepEqual(pagina.textos('.results-table td'), []);
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
});

test('IRIS — processar de novo substitui o resultado anterior e a linha vazia é descartada', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'IRIS001\n\nIRIS002\n   \nIRIS001');
    assert.equal(pagina.texto('#resultSummary'), '3 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table td'), ['1', '2', '1']);

    processar(pagina, '  IRIS 0007  ');
    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(pagina.textos('.results-table td'), ['7']);
    assert.equal(pagina.todos('.results-table td').length, 1);
});

test('IRIS — copiar leva a coluna normalizada, sem cabeçalho, e volta o rótulo', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'IRIS00998585\niris-000123\nIRIS000');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['998585\n123\n0']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('IRIS — falha da área de transferência cai na cópia por seleção e ainda mostra Copiado', async (t) => {
    const pagina = await abrir(t);
    pagina.registro.clipboard.falha = 'permissão negada';

    processar(pagina, 'IRIS00042');
    pagina.clicar('#copyButton');

    await pagina.aguardarTexto('#copyButton', 'Copiado');
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.registro.execCommand.length, 1, 'a cópia alternativa usa execCommand');
    assert.equal(pagina.todos('textarea').length, 1, 'a caixa temporária é removida do corpo');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('IRIS — copiar sem resultado não escreve nada', async (t) => {
    const pagina = await abrir(t);

    pagina.clicar('#copyButton');
    await pagina.tick(10);

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.deepEqual(pagina.registro.execCommand, []);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('IRIS — Limpar esvazia a entrada, esconde a seção e devolve o foco ao campo', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'IRIS0001');
    pagina.clicar('#clearButton');

    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.html('#results'), '');
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
    assert.equal(pagina.documento.activeElement, pagina.seletor('#toolInput'));

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
});
