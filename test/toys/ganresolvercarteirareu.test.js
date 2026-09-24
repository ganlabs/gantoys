import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

const ML_JC = ['Mercado Livre - Mercado Livre - JC', 'REU A DEFINIR'];
const AGUAS_RIO_4 = ['Saneamento - Águas do Rio 4', 'AGUAS DO RIO 4 SPE S.A.'];
const BRK_RECIFE = ['Saneamento - BRK', 'BRK AMBIENTAL – REGIÃO METROPOLITANA DO RECIFE/GOIANA SPE S.A.'];

async function abrir(t) {
    const pagina = await carregarToy('ganresolvercarteirareu');
    t.after(() => pagina.fechar());
    return pagina;
}

function processar(pagina, texto) {
    pagina.digitar('#toolInput', texto);
    pagina.clicar('#runButton');
}

test('REU — a tela nasce sem ajustes, com o resultado escondido e o campo vazio', async (t) => {
    const pagina = await abrir(t);

    assert.equal(pagina.seletor('#settings').classList.contains('hidden'), true);
    assert.equal(pagina.html('#settings'), '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#toolInput').placeholder, 'Cole os dados aqui...');
    assert.equal(pagina.texto('#inputHint'), 'Cole os dados, um por linha.');
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('REU — apelido exato da tabela fixa resolve a carteira e o réu', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, ['ml', 'ML VC', 'mljec', 'cejusc', 'brk recife', 'mercado pago', 'naturgy', 'banco bradesco'].join('\n'));

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '8 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table th'), ['Consulta', 'Carteira', 'Réu']);
    assert.deepEqual(pagina.textos('.results-table td'), [
        'ml', ...ML_JC,
        'ML VC', ...ML_JC,
        'mljec', 'Mercado Livre - Mercado Livre - JEC', 'REU A DEFINIR',
        'cejusc', 'Mercado Livre - Mercado Livre - JEC', 'REU A DEFINIR',
        'brk recife', ...BRK_RECIFE,
        'mercado pago', 'Mercado Livre', 'MERCADO PAGO INSTITUICAO DE PAGAMENTO LTDA',
        'naturgy', 'Naturgy - Naturgy', 'CEG RIO S.A.',
        'banco bradesco', 'Bradesco - Indenizatória', 'BANCO BRADESCO SA'
    ]);
    assert.equal(pagina.todos('.results-table tbody tr').length, 8);
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
});

test('REU — nome do réu contido na consulta vale antes da pontuação por palavras', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        'AGUAS DO RIO 4 SPE S.A.',
        'Processo contra MERCADOLIVRE.COM ATIVIDADES DE INTERNET LTDA.',
        'execução de BRK AMBIENTAL BLUMENAU S.A'
    ].join('\n'));

    assert.deepEqual(pagina.textos('.results-table td'), [
        'AGUAS DO RIO 4 SPE S.A.', ...AGUAS_RIO_4,
        'Processo contra MERCADOLIVRE.COM ATIVIDADES DE INTERNET LTDA.',
        'Mercado Livre', 'MERCADOLIVRE.COM ATIVIDADES DE INTERNET LTDA.',
        'execução de BRK AMBIENTAL BLUMENAU S.A',
        'Saneamento - BRK', 'BRK AMBIENTAL BLUMENAU S.A'
    ]);
});

test('REU — pontuação por palavras escolhe a carteira mais parecida e empate fica com a primeira', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, ['brk blumenau extra', 'saneamento', 'rio4'].join('\n'));

    assert.deepEqual(pagina.textos('.results-table td'), [
        'brk blumenau extra', 'Saneamento - BRK', 'BRK AMBIENTAL BLUMENAU S.A',
        'saneamento', ...AGUAS_RIO_4,
        'rio4', ...AGUAS_RIO_4
    ]);
});

test('REU — consulta sem correspondência sai com as células vazias e sem erro', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, ['zzz', '-', 'carteira inexistente'].join('\n'));

    assert.equal(pagina.texto('#resultSummary'), '3 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table td'), [
        'zzz', '', '',
        '-', '', '',
        'carteira inexistente', '', ''
    ]);
    assert.equal(pagina.todos('.results-table tbody tr').length, 3);
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
});

test('REU — linhas em branco não geram itens e repetir o processamento substitui o resultado', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '  ml  \n\n   \n');
    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(pagina.textos('.results-table td'), ['ml', ...ML_JC]);

    processar(pagina, 'zzz\nml\nzzz');
    assert.equal(pagina.texto('#resultSummary'), '3 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table td'), [
        'zzz', '', '',
        'ml', ...ML_JC,
        'zzz', '', ''
    ]);
});

test('REU — entrada vazia mostra 0 linhas, tabela sem registros e cópia sem efeito', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '\n   \n');

    assert.equal(pagina.texto('#resultSummary'), '0 linhas processadas.');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.deepEqual(pagina.textos('.results-table th'), ['Consulta', 'Carteira', 'Réu']);
    assert.equal(pagina.todos('.results-table tbody tr').length, 0);

    pagina.clicar('#copyButton');
    await pagina.tick(10);

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('REU — copiar leva os pares carteira/réu em TSV, sem cabeçalho nem a consulta', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'ml\nzzz\nbrk recife');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, [
        `${ML_JC.join('\t')}\n\t\n${BRK_RECIFE.join('\t')}`
    ]);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('REU — falha da área de transferência usa a cópia alternativa e ainda mostra Copiado', async (t) => {
    const pagina = await abrir(t);
    pagina.registro.clipboard.falha = 'permissão negada';

    processar(pagina, 'ml');
    pagina.clicar('#copyButton');

    await pagina.aguardarTexto('#copyButton', 'Copiado');
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.registro.execCommand.length, 1, 'a cópia alternativa usa execCommand');
    assert.equal(pagina.todos('textarea').length, 1, 'a caixa temporária é removida do corpo');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('REU — Limpar esvazia a entrada, esconde a seção e devolve o foco', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'ml');
    pagina.clicar('#clearButton');

    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.html('#results'), '');
    assert.equal(pagina.documento.activeElement, pagina.seletor('#toolInput'));

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);

    processar(pagina, 'ml');
    assert.deepEqual(pagina.texto('#resultSummary'), '1 linha processada.');
});
