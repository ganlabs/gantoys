import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

async function abrir(t) {
    const pagina = await carregarToy('gannormalizadornomes');
    t.after(() => pagina.fechar());
    return pagina;
}

function processar(pagina, texto) {
    pagina.digitar('#toolInput', texto);
    pagina.clicar('#runButton');
}

test('NOMES — a tela nasce sem ajustes, com o resultado escondido e o campo vazio', async (t) => {
    const pagina = await abrir(t);

    assert.equal(pagina.seletor('#settings').classList.contains('hidden'), true);
    assert.equal(pagina.html('#settings'), '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#toolInput').placeholder, 'Cole os dados aqui...');
    assert.equal(pagina.texto('#inputHint'), 'Cole os dados, um por linha.');
    assert.equal(pagina.texto('#resultSummary'), '');
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('NOMES — acentos, maiúsculas, espaços das pontas e os três marcadores internos', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        '  João da Silva  ',
        'José  Carlos',
        'sem oab',
        'SEM ADV',
        'Sem Uf',
        'sem oab extra',
        'ação'
    ].join('\n'));

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '7 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table th'), ['Normalizado']);
    assert.deepEqual(pagina.textos('.results-table td'), [
        'JOAO DA SILVA',
        'JOSE  CARLOS',
        '0',
        'SEM ADVOGADO',
        'TJ',
        'SEM OAB EXTRA',
        'ACAO'
    ]);
});

test('NOMES — preserva dígitos, sublinhado, hífen, ponto e vírgula e espaços internos', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        'Rua_1 - sala-2;bloco#3',
        'MARIA;SILVA',
        'Nome & Cia. Ltda',
        '@joao (SP)',
        'valor 12,50'
    ].join('\n'));

    assert.deepEqual(pagina.textos('.results-table td'), [
        'RUA_1 - SALA-2;BLOCO3',
        'MARIA;SILVA',
        'NOME  CIA LTDA',
        'JOAO SP',
        'VALOR 1250'
    ]);
});

test('NOMES — o trecho depois do primeiro | da célula é descartado e o ; segue inteiro', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        'João da Silva|123',
        'MARIA|SILVA;ANA|extra',
        'pedro|'
    ].join('\n'));

    assert.deepEqual(pagina.textos('.results-table td'), ['JOAO DA SILVA', 'MARIA', 'PEDRO']);
});

test('NOMES — colunas por tabulação, cabeçalhos numerados e preenchimento com vazio', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'joão\tsilva\t123\nana\n\tB');

    assert.equal(pagina.texto('#resultSummary'), '3 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table th'), ['Normalizado 1', 'Normalizado 2', 'Normalizado 3']);
    assert.deepEqual(pagina.textos('.results-table td'), [
        'JOAO', 'SILVA', '123',
        'ANA', '', '',
        '', 'B', ''
    ]);
});

test('NOMES — uma única coluna gera o cabeçalho Normalizado e a célula vazia continua vazia', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'maria\n\n   \n');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(pagina.textos('.results-table th'), ['Normalizado']);
    assert.deepEqual(pagina.textos('.results-table td'), ['MARIA']);
});

test('NOMES — entrada vazia mostra 0 linhas, tabela sem registros e cópia sem efeito', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '\n   \n');

    assert.equal(pagina.texto('#resultSummary'), '0 linhas processadas.');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.deepEqual(pagina.textos('.results-table th'), ['Normalizado']);
    assert.equal(pagina.todos('.results-table tbody tr').length, 0);

    pagina.clicar('#copyButton');
    await pagina.tick(10);

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('NOMES — copiar leva todas as colunas em TSV, sem cabeçalho, e confirma no rótulo', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'joão\tsilva\nana\t\nsem oab\tsp');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['JOAO\tSILVA\nANA\t\n0\tSP']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('NOMES — falha da área de transferência usa a cópia alternativa e ainda mostra Copiado', async (t) => {
    const pagina = await abrir(t);
    pagina.registro.clipboard.falha = 'permissão negada';

    processar(pagina, 'joão');
    pagina.clicar('#copyButton');

    await pagina.aguardarTexto('#copyButton', 'Copiado');
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.registro.execCommand.length, 1, 'a cópia alternativa usa execCommand');
    assert.equal(pagina.todos('textarea').length, 1, 'a caixa temporária é removida do corpo');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('NOMES — repetir o processamento substitui o resultado e Limpar volta ao estado inicial', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'joão');
    processar(pagina, 'maria\njosé\nmaria');
    assert.equal(pagina.texto('#resultSummary'), '3 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table td'), ['MARIA', 'JOSE', 'MARIA']);

    pagina.clicar('#clearButton');

    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.html('#results'), '');
    assert.equal(pagina.documento.activeElement, pagina.seletor('#toolInput'));

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);

    processar(pagina, 'ana');
    assert.deepEqual(pagina.texto('#resultSummary'), '1 linha processada.');
});
