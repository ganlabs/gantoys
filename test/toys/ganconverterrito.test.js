import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

async function abrir(t) {
    const pagina = await carregarToy('ganconverterrito');
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

test('Conversor de Rito — a seção de resultado e os ajustes nascem escondidos', async (t) => {
    const pagina = await abrir(t);

    assert.equal(pagina.documento.title, 'Conversor de Rito');
    assert.equal(pagina.texto('h1'), 'Conversor de Rito');
    assert.equal(pagina.texto('.brand p'), 'Converta as siglas VC e JEC para a descrição correspondente.');
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

test('Conversor de Rito — VC e JEC viram as descrições e o resto sai como foi digitado', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, ['VC', 'JEC', 'vc', 'jEc', 'JEC ', 'Comum', 'Juizados', 'VARA CIVEL', 'JEC 2'].join('\n'));

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '9 linhas processadas.');
    assert.deepEqual(cabecalhos(pagina), ['Convertido']);
    assert.deepEqual(linhas(pagina), [
        ['Comum'],
        ['Juizados'],
        ['Comum'],
        ['Juizados'],
        ['Juizados'],
        ['Comum'],
        ['Juizados'],
        ['VARA CIVEL'],
        ['JEC 2'],
    ]);
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
});

test('Conversor de Rito — o resumo fica no singular com uma única linha', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '  vc  ');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['Comum']]);
    assert.deepEqual(cabecalhos(pagina), ['Convertido']);
});

test('Conversor de Rito — linhas vazias e espaços das pontas não entram na tabela', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '  JEC  \n\n   \n\t\n');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['Juizados']]);
});

test('Conversor de Rito — entrada vazia mostra zero linhas e não copia nada', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '');
    assert.equal(pagina.texto('#resultSummary'), '0 linhas processadas.');
    assert.deepEqual(linhas(pagina), []);
    assert.deepEqual(cabecalhos(pagina), ['Convertido']);

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('Conversor de Rito — reprocessar troca a tabela inteira e a cópia segue a última execução', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'VC\nJEC');
    assert.deepEqual(linhas(pagina), [['Comum'], ['Juizados']]);

    processar(pagina, 'jec');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['Juizados']]);

    pagina.clicar('#copyButton');
    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['Juizados']);
});

test('Conversor de Rito — Limpar apaga a entrada, esconde o resultado e devolve o foco', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'VC');
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
    assert.deepEqual(pagina.registro.clipboard.escritas, ['Comum']);
});

test('Conversor de Rito — copiar leva a coluna convertida em TSV, sem cabeçalho', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'VC\nJEC\nVARA CIVEL');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['Comum\nJuizados\nVARA CIVEL']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');
    assert.deepEqual(pagina.registro.execCommand, []);

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('Conversor de Rito — área de transferência bloqueada cai no caminho alternativo', async (t) => {
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

    processar(pagina, 'VC');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.execCommand.length === 1, { descricao: 'cópia alternativa' });
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.deepEqual(pagina.registro.execCommand, ['Comum']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');
    assert.equal(pagina.todos('body textarea').length, 1);

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('Conversor de Rito — erro da ferramenta ocupa a mensagem e some no Limpar', async (t) => {
    const pagina = await abrir(t);

    pagina.script('runTool = function () { return { error: "Ferramenta não configurada." }; };');
    processar(pagina, 'VC');

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
