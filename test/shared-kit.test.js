import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarPagina, puro } from '../testkit/index.js';

/**
 * Kit compartilhado dos toys de texto (`toys/shared/kit.js`).
 *
 * Os toys cobrem, pelo fluxo da tela, o tipo que cada um usa. Aqui ficam: (a) os
 * tipos do kit que nenhum toy liga na interface — se um dia um toy usar, o
 * comportamento já está documentado; (b) a casca genérica (campos gerados,
 * leitura dos ajustes, tabela, copiar, limpar, erro), combinada com um type que
 * tem campos, para exercitar o que nenhum toy sozinho alcança.
 */

/** Compara um valor devolvido pela página (outro realm) com o esperado do Node. */
function igual(valor, esperado) {
    assert.deepEqual(puro(valor), esperado);
}

async function abrirKit(t) {
    const pagina = await carregarPagina('testkit/fixtures/kit.html');
    t.after(() => pagina.fechar());
    return pagina;
}

const CABECALHO_POLOS = 'Processo\tPolo\tNome\tNúmero do Documento\tNome Advogado 1\tOAB Advogado 1\tCPF Advogado 1';

test('kit — extract-polos filtra pelo polo e formata nome e documento', async (t) => {
    const pagina = await abrirKit(t);
    const texto = [
        CABECALHO_POLOS,
        '0001234-56.2026.8.00.0000\tATIVO\tJoão da Silva\t12345678901\tMaria Souza\t12345/SP\t98765432100',
        '0001234-57.2026.8.00.0000\tPASSIVO\tEmpresa X\t12345678000199\t\t\t',
        '0001234-58.2026.8.00.0000\tativo\tJosé Ávila\t111.222.333-44\t\t\t',
    ].join('\n');

    igual(pagina.janela.runTool('extract-polos', texto, { polo: 'ATIVO' }), {
        headers: ['Processo', 'Nome', 'Documento', 'Nome_Adv_1', 'OAB_Adv_1', 'CPF_Adv_1'],
        rows: [
            ['0001234-56.2026.8.00.0000', 'JOAO DA SILVA', '123.456.789-01', 'MARIA SOUZA', '12345/SP', '987.654.321-00'],
            ['0001234-58.2026.8.00.0000', 'JOSE AVILA', '111.222.333-44', '', '', ''],
        ],
    });

    igual(pagina.janela.runTool('extract-polos', texto, { polo: 'PASSIVO' }), {
        headers: ['Processo', 'Nome', 'Documento', 'Nome_Adv_1', 'OAB_Adv_1', 'CPF_Adv_1'],
        rows: [['0001234-57.2026.8.00.0000', 'EMPRESA X', '12.345.678/0001-99', '', '', '']],
    });
});

test('kit — extract-polos sem cabeçalho obrigatório devolve o erro com as colunas que faltam', async (t) => {
    const pagina = await abrirKit(t);

    igual(pagina.janela.runTool('extract-polos', 'Processo\tPolo\tNome\n1\tATIVO\tFulano', { polo: 'ATIVO' }),
        { error: 'Coluna obrigatória não encontrada: Número do Documento.' }
    );

    igual(pagina.janela.runTool('extract-polos', '', { polo: 'ATIVO' }),
        { error: 'Coluna obrigatória não encontrada: Processo, Polo, Nome, Número do Documento.' }
    );
});

test('kit — extract-columns seleciona colunas por nome, na ordem pedida', async (t) => {
    const pagina = await abrirKit(t);
    const texto = 'Nome\tProcesso\tValor\nJoão\t0001\t10,00\nMaria\t0002\t20,00';

    igual(pagina.janela.runTool('extract-columns', texto, { cols: 'Valor, Processo' }), {
        headers: ['Valor', 'Processo'],
        rows: [['10,00', '0001'], ['20,00', '0002']],
    });

    igual(pagina.janela.runTool('extract-columns', texto, { cols: '' }), {
        headers: ['Nome', 'Processo', 'Valor'],
        rows: [['João', '0001', '10,00'], ['Maria', '0002', '20,00']],
    });
});

test('kit — extract-columns com coluna inexistente lista as disponíveis', async (t) => {
    const pagina = await abrirKit(t);

    igual(pagina.janela.runTool('extract-columns', 'Nome\tProcesso\nJoão\t0001', { cols: 'Réu' }), {
        error: 'Coluna não encontrada: Réu. Disponíveis: Nome, Processo.',
    });
});

test('kit — extract-columns-santander exige o cabeçalho completo', async (t) => {
    const pagina = await abrirKit(t);
    const colunas = ['Pasta Iris', 'Contratação', 'Núm. Processo', 'Pasta Cliente', 'Carteira', 'Num', 'Órgão', 'Comarca', 'Parte Autora', 'CPFAUTOR', 'Distribuição', 'Valor da Causa', 'Tipo Sistema', 'Parte Ré', 'Causa Raiz', 'Advogado Adverso', 'OAB Advogado Adverso', 'UF OAB Advogado Adverso', 'Data Audiencia', 'Hora Audicencia', 'Tipo Audiencia'];

    const linha = Array.from({ length: colunas.length }, (_, indice) => `v${indice + 1}`).join('\t');
    igual(pagina.janela.runTool('extract-columns-santander', `${colunas.join('\t')}\n${linha}`, {}), {
        headers: colunas,
        rows: [Array.from({ length: colunas.length }, (_, indice) => `v${indice + 1}`)],
    });

    const parciais = pagina.janela.runTool('extract-columns-santander', 'Pasta Iris\tContratação\nP1\tC1', {});
    assert.equal(
        parciais.error,
        'Coluna não encontrada no cabeçalho: Núm. Processo, Pasta Cliente, Carteira, Num, Órgão, Comarca, Parte Autora, CPFAUTOR, Distribuição, Valor da Causa, Tipo Sistema, Parte Ré, Causa Raiz, Advogado Adverso, OAB Advogado Adverso, UF OAB Advogado Adverso, Data Audiencia, Hora Audicencia, Tipo Audiencia.'
    );
});

test('kit — list-reus-ml devolve a lista fixa de réus', async (t) => {
    const pagina = await abrirKit(t);

    igual(pagina.janela.runTool('list-reus-ml', '', {}), {
        headers: ['Réu'],
        rows: [
            ['EBAZAR.COM.BR LTDA.'],
            ['MERCADOLIVRE.COM ATIVIDADES DE INTERNET LTDA.'],
            ['MERCADO CRÉDITO SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO S.A.'],
            ['MERCADO ENVIOS TRANSPORTE LTDA.'],
            ['MERCADO PAGO INSTITUICAO DE PAGAMENTO LTDA'],
            ['KANGU PARTICIPAÇÕES S.A.'],
            ['K21 INTERMEDIACAO LTDA.'],
            ['IBAZAR.COM ATIVIDADES DE INTERNET LTDA.'],
        ],
    });
});

test('kit — tipo desconhecido devolve o erro padrão', async (t) => {
    const pagina = await abrirKit(t);

    igual(pagina.janela.runTool('nao-existe', 'qualquer coisa', {}), {
        error: 'Ferramenta não configurada.',
    });
});

test('kit — inputLines e createTable tratam quebras de linha e células vazias', async (t) => {
    const pagina = await abrirKit(t);

    igual(pagina.janela.inputLines('a\r\n\r\n  b  \nc  '), ['a', 'b', 'c']);
    igual(pagina.janela.inputLines(''), []);

    const tabela = pagina.janela.createTable(['A', 'B'], [['1', '2'], ['3', undefined], []]);
    assert.equal(tabela.className, 'results-table');
    assert.deepEqual([...tabela.querySelectorAll('thead th')].map((no) => no.textContent), ['A', 'B']);
    assert.deepEqual(
        [...tabela.querySelectorAll('tbody tr')].map((linha) => [...linha.querySelectorAll('td')].map((celula) => celula.textContent)),
        [['1', '2'], ['3', ''], []]
    );
});

test('kit — renderSettings monta os campos do tipo, com visibilidade condicional', async (t) => {
    const pagina = await abrirKit(t);

    // Tipo sem campos: o bloco de configuração continua escondido.
    pagina.janela.renderSettings({ type: 'normalize-iris' }, pagina.seletor('#settings'));
    assert.equal(pagina.seletor('#settings').classList.contains('hidden'), true);
    assert.equal(pagina.todos('#settings [name]').length, 0);

    // Tipo com campos: rótulos, ids, valores iniciais e opções exatos.
    pagina.janela.renderSettings({ type: 'strip-suffix' }, pagina.seletor('#settings'));
    assert.equal(pagina.seletor('#settings').classList.contains('hidden'), false);
    assert.deepEqual(pagina.textos('#settings .input-label'), ['Modo', 'Padrão (aceita * e ?)', 'Substituir por']);
    assert.deepEqual(pagina.todos('#settings [name]').map((campo) => campo.id), [
        'strip-suffix-mode',
        'strip-suffix-pattern',
        'strip-suffix-replacement',
    ]);
    assert.deepEqual(pagina.textos('#settings select option'), ['Remover', 'Substituir']);
    assert.equal(pagina.seletor('#strip-suffix-mode').defaultValue, 'remove');
    assert.equal(pagina.seletor('#strip-suffix-pattern').defaultValue, '-*');
    assert.equal(pagina.seletor('#strip-suffix-replacement').defaultValue, '');
    igual(pagina.janela.getSettings(pagina.seletor('#settings')), {
        mode: 'remove',
        pattern: '-*',
        replacement: '',
    });

    // "Substituir por" só aparece no modo Substituir.
    const condicional = pagina.seletor('[data-conditional-on="replace"]');
    assert.equal(condicional.classList.contains('hidden'), true);
    pagina.selecionar('#strip-suffix-mode', 'replace');
    assert.equal(condicional.classList.contains('hidden'), false);
    pagina.selecionar('#strip-suffix-mode', 'remove');
    assert.equal(condicional.classList.contains('hidden'), true);
});

test('kit — getSettings lê campos de texto e checkbox', async (t) => {
    const pagina = await abrirKit(t);
    const container = pagina.seletor('#settings');

    container.innerHTML = '<input type="text" name="polo" value="ATIVO"><input type="checkbox" name="incluir"><select name="ordem"><option value="a">A</option><option value="b">B</option></select>';
    container.querySelector('[name="incluir"]').checked = true;
    container.querySelector('[name="ordem"]').value = 'b';

    igual(pagina.janela.getSettings(container), { polo: 'ATIVO', incluir: true, ordem: 'b' });
});

test('kit — initTool liga processar, copiar, limpar e o erro', async (t) => {
    const pagina = await abrirKit(t);
    pagina.janela.initTool({ type: 'strip-suffix' });

    // Processar: resumo, tabela e o texto que o botão de copiar leva (TSV, sem cabeçalho).
    pagina.digitar('#toolInput', 'PROC-1-PI\nOUTRO-PI');
    pagina.clicar('#runButton');
    assert.equal(pagina.texto('#resultSummary'), '2 linhas processadas.');
    assert.deepEqual(pagina.textos('.results-table thead th'), ['Original', 'Sem trecho']);
    assert.deepEqual(
        pagina.todos('.results-table tbody tr').map((linha) => [...linha.querySelectorAll('td')].map((celula) => celula.textContent)),
        [['PROC-1-PI', 'PROC'], ['OUTRO-PI', 'OUTRO']]
    );

    pagina.clicar('#copyButton');
    await pagina.aguardar(() => pagina.texto('#copyButton') === 'Copiado', { descricao: 'rótulo Copiado' });
    igual(pagina.registro.clipboard.escritas, ['PROC-1-PI\tPROC\nOUTRO-PI\tOUTRO']);
    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });

    // Erro: mensagem no lugar do resumo, e sem tabela.
    pagina.digitar('#strip-suffix-pattern', '');
    pagina.clicar('#runButton');
    assert.equal(pagina.texto('#errorMessage'), 'Informe um padrão.');
    assert.equal(pagina.seletor('#errorMessage').classList.contains('hidden'), false);
    assert.equal(pagina.texto('#resultSummary'), '');

    // Limpar: entrada vazia, campos de volta ao padrão, resultado escondido, foco no campo.
    pagina.digitar('#toolInput', 'A-B');
    pagina.digitar('#strip-suffix-pattern', '-B');
    pagina.clicar('#runButton');
    assert.equal(pagina.existe('.results-table'), true);

    pagina.clicar('#clearButton');
    assert.equal(pagina.seletor('#toolInput').value, '');
    assert.equal(pagina.seletor('#strip-suffix-pattern').value, '-*');
    assert.equal(pagina.seletor('#resultsSection').classList.contains('hidden'), true);
    assert.equal(pagina.html('#results'), '');
    assert.equal(pagina.documento.activeElement.id, 'toolInput');

    // Sem texto guardado, o botão de copiar não escreve nada nem muda de rótulo.
    pagina.clicar('#copyButton');
    await pagina.tick(10);
    igual(pagina.registro.clipboard.escritas, ['PROC-1-PI\tPROC\nOUTRO-PI\tOUTRO']);
    assert.equal(pagina.texto('#copyButton'), 'Copiar resultado');
});

test('kit — copiar cai no caminho alternativo quando a área de transferência falha', async (t) => {
    const pagina = await abrirKit(t);
    pagina.janela.initTool({ type: 'strip-suffix' });
    pagina.registro.clipboard.falha = 'permissão negada';

    pagina.digitar('#toolInput', 'PROC-1-PI');
    pagina.clicar('#runButton');
    pagina.clicar('#copyButton');

    await pagina.aguardar(() => pagina.registro.execCommand.length === 1, { descricao: 'execCommand copy' });
    igual(pagina.registro.execCommand, ['PROC-1-PI\tPROC']);
    assert.equal(pagina.texto('#copyButton'), 'Copiado');
    assert.equal(pagina.todos('body > textarea').length, 0, 'o textarea temporário precisa sair do DOM');
    await pagina.aguardarTexto('#copyButton', 'Copiar resultado', { timeout: 2500 });
});

test('kit — resolve-carteira-reu e normalize-documents copiam sem a primeira coluna', async (t) => {
    const pagina = await abrirKit(t);
    pagina.janela.initTool({ type: 'resolve-carteira-reu' });

    pagina.digitar('#toolInput', 'MERCADO LIVRE VC');
    pagina.clicar('#runButton');
    assert.deepEqual(pagina.textos('.results-table thead th'), ['Consulta', 'Carteira', 'Réu']);

    pagina.clicar('#copyButton');
    await pagina.aguardar(() => pagina.registro.clipboard.escritas.length === 1, { descricao: 'cópia sem a consulta' });
    igual(pagina.registro.clipboard.escritas, ['Mercado Livre - Mercado Livre - JC\tREU A DEFINIR']);
});

test('kit — tabela separada por espaços e linhas curtas preenchem com vazio', async (t) => {
    const pagina = await abrirKit(t);

    // Sem tabulação, o separador é "dois ou mais espaços".
    igual(pagina.janela.runTool('extract-columns', 'Nome  Processo  Valor\nJoão  0001  10,00', { cols: 'Valor, Nome' }), {
        headers: ['Valor', 'Nome'],
        rows: [['10,00', 'João']],
    });

    // Linha com menos células: as colunas que faltam saem vazias.
    igual(pagina.janela.runTool('extract-columns', 'Nome\tProcesso\tValor\nJoão\t0001', { cols: '' }), {
        headers: ['Nome', 'Processo', 'Valor'],
        rows: [['João', '0001', '']],
    });

    // extract-polos sem ajuste de polo usa ATIVO, e a linha curta vira vazio.
    const cabecalho = 'Processo\tPolo\tNome\tNúmero do Documento';
    igual(pagina.janela.runTool('extract-polos', `${cabecalho}\n0001\tATIVO\tFulano\t12345678901\n0002`, {}), {
        headers: ['Processo', 'Nome', 'Documento'],
        rows: [['0001', 'FULANO', '123.456.789-01']],
    });
});

test('kit — extract-columns-santander sem cabeçalho lista todas as colunas obrigatórias', async (t) => {
    const pagina = await abrirKit(t);

    const erro = pagina.janela.runTool('extract-columns-santander', '', {});
    assert.equal(erro.error.startsWith('Coluna não encontrada no cabeçalho: Pasta Iris, Contratação, Núm. Processo'), true);
});

test('kit — extract-columns-santander realinha quando a coluna volátil vem preenchida', async (t) => {
    const pagina = await abrirKit(t);
    // 'CNPJ' é coluna volátil: com célula preenchida o toy considera que ela não
    // faz parte do layout exportado e desloca as colunas seguintes (comportamento
    // atual do realinhamento; nenhum toy liga este tipo na interface).
    const colunas = ['Pasta Iris', 'CNPJ', 'Contratação', 'Núm. Processo', 'Pasta Cliente', 'Carteira', 'Num', 'Órgão', 'Comarca', 'Parte Autora', 'CPFAUTOR', 'Distribuição', 'Valor da Causa', 'Tipo Sistema', 'Parte Ré', 'Causa Raiz', 'Advogado Adverso', 'OAB Advogado Adverso', 'UF OAB Advogado Adverso', 'Data Audiencia', 'Hora Audicencia', 'Tipo Audiencia'];
    const linha = colunas.map((_, indice) => `v${indice + 1}`);
    linha[1] = '12.345.678/0001-99';

    const resultado = pagina.janela.runTool('extract-columns-santander', `${colunas.join('\t')}\n${linha.join('\t')}`, {});
    assert.equal(resultado.error, undefined);
    igual(resultado.rows[0].slice(0, 4), ['v1', '12.345.678/0001-99', 'v3', 'v4']);
});

test('kit — substituir sem campo de substituição e sem padrão informado', async (t) => {
    const pagina = await abrirKit(t);

    // sem padrão: o padrão do argumento vale ('-*')
    igual(pagina.janela.runTool('strip-suffix', 'ABC-XYZ', {}), {
        headers: ['Original', 'Sem trecho'],
        rows: [['ABC-XYZ', 'ABC']],
    });

    // modo Substituir sem "Substituir por": o trecho casado sai (vazio)
    igual(pagina.janela.runTool('strip-suffix', 'ABC-XYZ', { pattern: '-*', mode: 'replace' }), {
        headers: ['Original', 'Substituído'],
        rows: [['ABC-XYZ', 'ABC']],
    });
});
