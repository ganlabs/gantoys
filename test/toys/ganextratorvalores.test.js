import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

async function abrir(t) {
    const pagina = await carregarToy('ganextratorvalores');
    t.after(() => pagina.fechar());
    return pagina;
}

function cabecalhos(pagina) {
    return pagina.textos('table.results-table thead th');
}

function linhas(pagina) {
    return pagina.todos('table.results-table tbody tr')
        .map((tr) => Array.from(tr.children).map((td) => td.textContent));
}

function processar(pagina, texto) {
    pagina.digitar('#toolInput', texto);
    pagina.clicar('#runButton');
}

test('Extrator de Valores — a seção de resultado e os ajustes nascem escondidos', async (t) => {
    const pagina = await abrir(t);

    assert.equal(pagina.documento.title, 'Extrator de Valores');
    assert.equal(pagina.texto('h1'), 'Extrator de Valores');
    assert.equal(pagina.texto('.brand p'), 'Extraia e normalize valores monetários para o padrão brasileiro.');
    assert.equal(pagina.texto('#inputHint'), 'Cole os dados, um por linha.');
    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#toolInput').placeholder, 'Cole os dados aqui...');
    assert.equal(pagina.texto('#runButton'), 'Processar');
    assert.equal(pagina.texto('#clearButton'), 'Limpar');
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
    assert.equal(pagina.seletor('#copyButton').disabled, false);

    assert.equal(pagina.seletor('#settings').classList.contains('hidden'), true);
    assert.equal(pagina.todos('#settings [name]').length, 0);

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
    assert.equal(pagina.texto('#resultSummary'), '');
    assert.equal(pagina.html('#results'), '');
});

test('Extrator de Valores — cada formato de moeda vira um número no padrão brasileiro', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        'R$ 1.234,56',
        'R$ 5.000,00',
        '1234.56',
        '1234,56',
        '1,234.56',
        'R$ .50',
        'R$ 0,99',
        '1.000.000,00',
        '1.234',
        '1.234.567',
        'abc',
        '- R$ 10,00',
    ].join('\n'));

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '12 linhas processadas.');
    assert.deepEqual(cabecalhos(pagina), ['Extraído']);
    assert.deepEqual(linhas(pagina), [
        ['1234,56'],
        ['5000'],
        ['1234,56'],
        ['1234,56'],
        ['1234,56'],
        [',50'],
        ['0,99'],
        ['1000000'],
        ['1,234'],
        ['1,234,567'],
        [''],
        ['-10'],
    ]);
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
});

test('Extrator de Valores — só o trecho antes do primeiro | é aproveitado', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        'Valor: R$ 12.345,67 | observação',
        'R$ 1.234,50 | 9.999,99',
        'R$ 10,00|R$ 20,00',
    ].join('\n'));

    assert.equal(pagina.texto('#resultSummary'), '3 linhas processadas.');
    assert.deepEqual(linhas(pagina), [['12345,67'], ['1234,50'], ['10']]);
});

test('Extrator de Valores — o resumo fica no singular com uma única linha', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '  R$ 10,00  ');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['10']]);
    assert.deepEqual(cabecalhos(pagina), ['Extraído']);
});

test('Extrator de Valores — linhas vazias e espaços das pontas não entram na tabela', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '  R$ 1.000,00  \n\n   \n\t\n');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['1000']]);
});

test('Extrator de Valores — entrada vazia mostra zero linhas e não copia nada', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '');
    assert.equal(pagina.texto('#resultSummary'), '0 linhas processadas.');
    assert.deepEqual(linhas(pagina), []);
    assert.deepEqual(cabecalhos(pagina), ['Extraído']);

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('Extrator de Valores — reprocessar troca a tabela inteira e a cópia segue a última execução', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'R$ 1.234,56\nR$ 5.000,00');
    assert.deepEqual(linhas(pagina), [['1234,56'], ['5000']]);

    processar(pagina, 'R$ 2.499,90');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['2499,90']]);

    pagina.clicar('#copyButton');
    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['2499,90']);
});

test('Extrator de Valores — Limpar apaga a entrada, esconde o resultado e devolve o foco', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'R$ 1.234,56');
    pagina.clicar('#copyButton');
    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });

    pagina.clicar('#clearButton');

    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.html('#results'), '');
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
    assert.equal(pagina.documento.activeElement, pagina.seletor('#toolInput'));

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, ['1234,56']);
});

test('Extrator de Valores — copiar leva só a coluna Extraído, sem cabeçalho', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'R$ 1.234,56\nR$ 5.000,00\nabc');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['1234,56\n5000\n']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');
    assert.deepEqual(pagina.registro.execCommand, []);

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('Extrator de Valores — área de transferência bloqueada cai no caminho alternativo', async (t) => {
    const pagina = await abrir(t);
    pagina.registro.clipboard.falha = 'permissão negada';
    // No navegador de verdade `select()` também move o foco para o campo; o jsdom
    // só marca a seleção, então o foco é completado aqui para a cópia alternativa
    // ficar legível pelo registro de `document.execCommand`.
    pagina.script(`(() => {
        const selecionar = HTMLTextAreaElement.prototype.select;
        HTMLTextAreaElement.prototype.select = function () {
            this.focus();
            return selecionar.apply(this, arguments);
        };
    })()`);

    processar(pagina, 'R$ 1.234,56');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.execCommand.length === 1, { descricao: 'cópia alternativa' });
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.deepEqual(pagina.registro.execCommand, ['1234,56']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');
    assert.equal(pagina.todos('body textarea').length, 1);

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('Extrator de Valores — erro da ferramenta ocupa a mensagem e some no Limpar', async (t) => {
    const pagina = await abrir(t);

    pagina.script('runTool = function () { return { error: "Ferramenta não configurada." }; };');
    processar(pagina, 'R$ 10,00');

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#errorMessage'), 'Ferramenta não configurada.');
    assert.equal(pagina.texto('#resultSummary'), '');
    assert.equal(pagina.html('#results'), '');

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);

    pagina.clicar('#clearButton');
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
    assert.equal(pagina.texto('#errorMessage'), 'Ferramenta não configurada.');
});
