import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

async function abrir(t) {
    const pagina = await carregarToy('ganclassificadorvara');
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

test('Classificador de Vara — a seção de resultado e os ajustes nascem escondidos', async (t) => {
    const pagina = await abrir(t);

    assert.equal(pagina.documento.title, 'Classificador de Vara');
    assert.equal(pagina.texto('h1'), 'Classificador de Vara');
    assert.equal(pagina.texto('.brand p'), 'Classifique varas e juizados por tipo, número, classe e comarca.');
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

test('Classificador de Vara — cada formato aceito vira tipo, número, classe e comarca', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        'VARA CIVEL DA COMARCA DE SAO PAULO',
        '1ª VARA CIVEL DA COMARCA DE CAMPINAS/SP',
        'JUIZADO ESPECIAL CIVEL E CRIMINAL DE SANTO ANDRE',
        'VARA DO JEC CIVEL DE CURITIBA',
        'JUI ESP CIV CRIM DA COMARCA DE BELEM',
    ].join('\n'));

    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '5 linhas processadas.');
    assert.deepEqual(cabecalhos(pagina), ['Tipo', 'Nº', 'Classe', 'Comarca']);
    assert.deepEqual(linhas(pagina), [
        ['Comum', '1', 'VC', 'SAO PAULO'],
        ['Comum', '1', 'VC', 'CAMPINAS'],
        ['Juizados', '0', 'JEC', 'SANTO ANDRE'],
        ['Juizados', '0', 'JEC', 'CURITIBA'],
        ['Juizados', '0', 'JEC', 'BELEM'],
    ]);
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), true);
});

test('Classificador de Vara — números escritos, romanos e a heurística de comarca', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, [
        'SEGUNDA VARA DE FAMILIA E SUCESSOES DE GOIANIA.',
        'VARA IV DA FAZENDA PUBLICA - RIO DE JANEIRO/RJ',
        'DECIMA VARA DO TRABALHO DE PORTO ALEGRE',
        'NONA VARA CIVEL DO JUIZADO ESPECIAL',
        'VARA X',
        'XII VARA',
        'PRIMEIRO JUIZADO',
        'vara comum sem nada',
        'VARA UNICA DE PICOS',
        'VARA CIVEL DA COMARCA DE SAO PAULO/SP.',
    ].join('\n'));

    assert.equal(pagina.texto('#resultSummary'), '10 linhas processadas.');
    assert.deepEqual(linhas(pagina), [
        ['Comum', '2', 'VC', 'FAMILIA E SUCESSOES DE GOIANIA'],
        ['Comum', '4', 'VC', 'RIO DE JANEIRO'],
        ['Comum', '10', 'VC', 'TRABALHO DE PORTO ALEGRE'],
        ['Juizados', '9', 'JEC', 'DO ESPECIAL'],
        ['Comum', '10', 'VC', ''],
        ['Comum', '1', 'VC', 'VARA'],
        ['Juizados', '1', 'JEC', 'PRIMEIRO'],
        ['Comum', '1', 'VC', 'COMUM SEM NADA'],
        ['Comum', '1', 'VC', 'UNICA DE PICOS'],
        ['Comum', '1', 'VC', 'SAO PAULOSP'],
    ]);
});

test('Classificador de Vara — o resumo fica no singular com uma única linha', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '   VARA X   ');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['Comum', '10', 'VC', '']]);
});

test('Classificador de Vara — linhas vazias e espaços das pontas não entram na tabela', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '  JUIZADO ESPECIAL CIVEL DE SOROCABA  \n\n   \n\t\n');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['Juizados', '0', 'JEC', 'SOROCABA']]);
    assert.deepEqual(cabecalhos(pagina), ['Tipo', 'Nº', 'Classe', 'Comarca']);
});

test('Classificador de Vara — entrada vazia mostra zero linhas e não copia nada', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, '');
    assert.equal(pagina.texto('#resultSummary'), '0 linhas processadas.');
    assert.deepEqual(linhas(pagina), []);
    assert.deepEqual(cabecalhos(pagina), ['Tipo', 'Nº', 'Classe', 'Comarca']);

    pagina.clicar('#copyButton');
    await pagina.tick(10);
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('Classificador de Vara — reprocessar troca a tabela inteira e a cópia segue a última execução', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'VARA CIVEL DA COMARCA DE SAO PAULO\nJUIZADO ESPECIAL CIVEL DE SOROCABA');
    assert.deepEqual(linhas(pagina), [
        ['Comum', '1', 'VC', 'SAO PAULO'],
        ['Juizados', '0', 'JEC', 'SOROCABA'],
    ]);

    processar(pagina, 'VARA X');

    assert.equal(pagina.texto('#resultSummary'), '1 linha processada.');
    assert.deepEqual(linhas(pagina), [['Comum', '10', 'VC', '']]);

    pagina.clicar('#copyButton');
    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['Comum\t10\tVC\t']);
});

test('Classificador de Vara — Limpar apaga a entrada, esconde o resultado e devolve o foco', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'VARA CIVEL DA COMARCA DE SAO PAULO');
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
    assert.deepEqual(pagina.registro.clipboard.escritas, ['Comum\t1\tVC\tSAO PAULO']);
});

test('Classificador de Vara — copiar leva a tabela em TSV, com a coluna Tipo e sem cabeçalho', async (t) => {
    const pagina = await abrir(t);

    processar(pagina, 'VARA CIVEL DA COMARCA DE SAO PAULO\nJUIZADO ESPECIAL CIVEL DE SOROCABA');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia' });
    assert.deepEqual(pagina.registro.clipboard.escritas, ['Comum\t1\tVC\tSAO PAULO\nJuizados\t0\tJEC\tSOROCABA']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');
    assert.deepEqual(pagina.registro.execCommand, []);

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('Classificador de Vara — área de transferência bloqueada cai no caminho alternativo', async (t) => {
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

    processar(pagina, 'VARA CIVEL DA COMARCA DE SAO PAULO');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.execCommand.length === 1, { descricao: 'cópia alternativa' });
    assert.deepEqual(pagina.registro.clipboard.escritas, []);
    assert.deepEqual(pagina.registro.execCommand, ['Comum\t1\tVC\tSAO PAULO']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');
    assert.equal(pagina.todos('body textarea').length, 1);

    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('Classificador de Vara — erro da ferramenta ocupa a mensagem e some no Limpar', async (t) => {
    const pagina = await abrir(t);

    pagina.script('runTool = function () { return { error: "Ferramenta não configurada." }; };');
    processar(pagina, 'VARA X');

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
