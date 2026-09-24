import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

async function abrir(t) {
    const pagina = await carregarToy('ganremovedorsufixouf');
    t.after(() => pagina.fechar());
    return pagina;
}

function processar(pagina, texto) {
    pagina.digitar('#toolInput', texto);
    pagina.clicar('#runButton');
}

function trocarModo(pagina, modo) {
    pagina.selecionar('#strip-suffix-mode', modo);
}

function campoCondicional(pagina) {
    return pagina.seletor('#strip-suffix-replacement').parentElement;
}

test('REM — a tela nasce com os ajustes preenchidos e o resultado escondido', async (t) => {
    const pagina = await abrir(t);

    assert.equal(pagina.seletor('#settings').classList.contains('hidden'), false);
    assert.equal(pagina.seletor('#strip-suffix-mode').value, 'remove');
    assert.equal(pagina.texto('.combo-value'), 'Remover');
    assert.deepEqual(pagina.textos('#strip-suffix-mode option'), ['Remover', 'Substituir']);
    assert.equal(pagina.seletor('#strip-suffix-pattern').value, '-*');
    assert.equal(pagina.seletor('#strip-suffix-replacement').value, '');
    assert.equal(campoCondicional(pagina).classList.contains('hidden'), true, 'Substituir por começa escondido');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.texto('#inputHint'), '* representa qualquer sequência; ?, exatamente um caractere. Parênteses agrupam o padrão.');
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('REM — o modo Remover apaga do padrão até o fim da linha e mantém as linhas sem casamento', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '123-PI\nABC-DEF\nsem sufixo');

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '3 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table th'), ['Original', 'Sem trecho']);
    assert.deepEqual(pagina.textos('.results-table td'), [
        '123-PI', '123',
        'ABC-DEF', 'ABC',
        'sem sufixo', 'sem sufixo'
    ]);
});

test('REM — o modo Substituir troca cada trecho casado pelo texto informado', async (t) => {
    const pagina = await abrir(t);

    trocarModo(pagina, 'replace');
    assert.equal(pagina.texto('.combo-value'), 'Substituir');
    assert.equal(campoCondicional(pagina).classList.contains('hidden'), false);

    pagina.digitar('#strip-suffix-replacement', 'XY');
    processar(pagina, '123-PI\nsem sufixo');

    assert.deepEqual(pagina.textos('.results-table th'), ['Original', 'Substituído']);
    assert.deepEqual(pagina.textos('.results-table td'), [
        '123-PI', '123XY',
        'sem sufixo', 'sem sufixo'
    ]);
});

test('REM — Substituir por vazio apaga o trecho, com o cabeçalho do modo', async (t) => {
    const pagina = await abrir(t);

    trocarModo(pagina, 'replace');
    processar(pagina, '123-PI\nABC-DEF');

    assert.deepEqual(pagina.textos('.results-table th'), ['Original', 'Substituído']);
    assert.deepEqual(pagina.textos('.results-table td'), ['123-PI', '123', 'ABC-DEF', 'ABC']);
});

test('REM — ? vale um caractere, parênteses agrupam e os demais caracteres são literais', async (t) => {
    const pagina = await abrir(t);

    pagina.digitar('#strip-suffix-pattern', '-?');
    processar(pagina, '1234-PI\n1234-P');
    assert.deepEqual(pagina.textos('.results-table td'), ['1234-PI', '1234I', '1234-P', '1234']);

    pagina.digitar('#strip-suffix-pattern', '(PI)');
    processar(pagina, '123-PI');
    assert.deepEqual(pagina.textos('.results-table td'), ['123-PI', '123-']);

    pagina.digitar('#strip-suffix-pattern', 'a.b');
    processar(pagina, 'axb\nayb');
    assert.deepEqual(pagina.textos('.results-table td'), ['axb', 'axb', 'ayb', 'ayb'], 'o ponto é literal');

    pagina.digitar('#strip-suffix-pattern', '.pdf');
    processar(pagina, 'contrato.pdf');
    assert.deepEqual(pagina.textos('.results-table td'), ['contrato.pdf', 'contrato']);
});

test('REM — a substituição é global, sem diferenciar maiúsculas, e $& é interpretado', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'A-1-B-2');
    assert.deepEqual(pagina.textos('.results-table td'), ['A-1-B-2', 'A'], '* é guloso e pega todas as ocorrências');

    pagina.digitar('#strip-suffix-pattern', 'pi');
    processar(pagina, '123-PI');
    assert.deepEqual(pagina.textos('.results-table td'), ['123-PI', '123-PI'], 'a comparação diferencia maiúsculas');

    trocarModo(pagina, 'replace');
    pagina.digitar('#strip-suffix-pattern', 'PI');
    pagina.digitar('#strip-suffix-replacement', '$&');
    processar(pagina, '123-PI-PI');
    assert.deepEqual(pagina.textos('.results-table td'), ['123-PI-PI', '123-PI-PI'], '$& repete o trecho casado em cada ocorrência');
});

test('REM — padrão vazio é recusado com a mensagem exata e sem tabela', async (t) => {
    const pagina = await abrir(t);

    pagina.digitar('#strip-suffix-pattern', '');
    processar(pagina, '123-PI');

    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#errorMessage'), 'Informe um padrão.');
    assert.equal(pagina.texto('#resultSummary'), '');
    assert.equal(pagina.todos('.results-table tbody tr').length, 0);
});

test('REM — padrão que não compila é recusado com a mensagem exata e a tela se recupera', async (t) => {
    const pagina = await abrir(t);

    pagina.digitar('#strip-suffix-pattern', '(');
    processar(pagina, '123-PI');

    assert.equal(pagina.texto('#errorMessage'), 'O padrão informado não pôde ser processado.');
    assert.equal(pagina.todos('.results-table tbody tr').length, 0);

    pagina.digitar('#strip-suffix-pattern', '-PI');
    processar(pagina, '123-PI\n456-PI');

    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
    assert.equal(pagina.texto('#resultSummary'), '2 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table td'), ['123-PI', '123', '456-PI', '456']);
});

test('REM — linhas em branco não geram itens e repetir o processamento substitui o resultado', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, ' 123-PI \n\n   \n123-PI\n');
    assert.equal(pagina.texto('#resultSummary'), '2 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table td'), ['123-PI', '123', '123-PI', '123']);

    processar(pagina, '');
    assert.equal(pagina.texto('#resultSummary'), '0 linhas processadas.');
    assert.equal(pagina.todos('.results-table tbody tr').length, 0);
});

test('REM — copiar leva as duas colunas em TSV, sem cabeçalho, e confirma no rótulo', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '123-PI\nsem sufixo');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['123-PI\t123\nsem sufixo\tsem sufixo']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('REM — cópia sem resultado não escreve nada', async (t) => {
    const pagina = await abrir(t);

    pagina.clicar('#copyButton');
    await pagina.tick(10);

    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('REM — falha da área de transferência usa a cópia alternativa e ainda mostra Copiado', async (t) => {
    const pagina = await abrir(t);
    pagina.registro.clipboard.falha = 'permissão negada';

    processar(pagina, '123-PI');
    pagina.clicar('#copyButton');

    await pagina.aguardarTexto('#copyButton', 'Copiado');
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.registro.execCommand.length, 1, 'a cópia alternativa usa execCommand');
    assert.equal(pagina.todos('textarea').length, 1, 'a caixa temporária é removida do corpo');

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('REM — Limpar zera a entrada, devolve modo e padrão iniciais e esconde o resultado', async (t) => {
    const pagina = await abrir(t);

    trocarModo(pagina, 'replace');
    pagina.digitar('#strip-suffix-pattern', '-??');
    pagina.digitar('#strip-suffix-replacement', 'ZZ');
    processar(pagina, 'A-B-1');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);

    pagina.clicar('#clearButton');

    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#strip-suffix-mode').value, 'remove');
    assert.equal(pagina.texto('.combo-value'), 'Remover');
    assert.equal(pagina.seletor('#strip-suffix-pattern').value, '-*');
    assert.equal(pagina.seletor('#strip-suffix-replacement').value, '');
    assert.equal(campoCondicional(pagina).classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.html('#results'), '');
    assert.equal(pagina.documento.activeElement, pagina.seletor('#toolInput'));

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
});
