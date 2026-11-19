import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { carregarApp, carregarToy, montarArvore, VENDOR } from '../../testkit/index.js';

/**
 * Toy Cadastro (planilha) — `toys/gancadastro`.
 *
 * A fixture é um pacote OOXML montado com o JSZip real dentro da página: três
 * abas (`Plan1` de cadastro, `Planilha1` de tabelas auxiliares e `Vazia`) e
 * estilos com três cellXfs. Entre as células há string compartilhada, texto
 * inline, número, célula vazia, célula com fórmula, célula inline sem texto,
 * célula sem o atributo `r` e uma coluna fora do mapa.
 *
 * Os nomes de arquivo de saída dependem do relógio: o teste congela `Date`.
 */

const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TIPOS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const CONTENT_TYPES = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    '</Types>',
].join('');

const RELS_RAIZ = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships xmlns="${RELS}">`,
    `<Relationship Id="rId1" Type="${TIPOS_REL}/officeDocument" Target="xl/workbook.xml"/>`,
    '</Relationships>',
].join('');

/** Abas do pacote no formato de `workbook.xml`. */
function workbook(abas) {
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        ` xmlns:r="${TIPOS_REL}">`,
        '<sheets>',
        ...abas.map((aba, indice) => `<sheet name="${aba.nome}" sheetId="${indice + 1}" r:id="${aba.rid}"/>`),
        '</sheets>',
        '</workbook>',
    ].join('');
}

/** Relacionamentos do workbook: sheet1, sheet2, styles, sharedStrings e os extras. */
function relsDoWorkbook(extras = []) {
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<Relationships xmlns="${RELS}">`,
        `<Relationship Id="rId1" Type="${TIPOS_REL}/worksheet" Target="worksheets/sheet1.xml"/>`,
        `<Relationship Id="rId2" Type="${TIPOS_REL}/worksheet" Target="worksheets/sheet2.xml"/>`,
        `<Relationship Id="rId3" Type="${TIPOS_REL}/styles" Target="styles.xml"/>`,
        `<Relationship Id="rId4" Type="${TIPOS_REL}/sharedStrings" Target="sharedStrings.xml"/>`,
        ...extras.map(([id, alvo]) => `<Relationship Id="${id}" Type="${TIPOS_REL}/worksheet" Target="${alvo}"/>`),
        '</Relationships>',
    ].join('');
}

const ABAS_BASE = [
    { nome: 'Plan1', rid: 'rId1' },
    { nome: 'Planilha1', rid: 'rId2' },
    { nome: 'Vazia', rid: 'rId5' },
];

/** `SemRelacao` não tem relacionamento e `SemParte` aponta para uma parte ausente. */
const ABAS_QUEBRADAS = [
    ...ABAS_BASE,
    { nome: 'SemRelacao', rid: 'rId9' },
    { nome: 'SemParte', rid: 'rId6' },
];

const ESTILOS = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    '<font><i/><sz val="11"/><name val="Calibri"/></font></fonts>',
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '</styleSheet>',
].join('');

// Índices de sharedStrings usados pelas células da fixture.
const STRINGS = [
    'Núm. Processo',
    'Advogado Adverso',
    'OAB Advogado Adverso',
    'UF OAB Advogado Adverso',
    'Comarca',
    'Valor da Causa',
    'Observação',
    '00044695120268050103',
    'José  da Silva|observação interna',
    'SEM OAB',
    'SEM UF',
    'Ilhéus',
    '20.000,00',
    'manter',
    '1,234.56',
    '0004469-51.2026.8.05.0103',
    'Não encontrado',
    'SEM ADV',
    'Auxiliar',
    'Controle',
];

const SHARED_STRINGS = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${STRINGS.length}" uniqueCount="${STRINGS.length}">`,
    ...STRINGS.map((valor) => `<si><t>${valor.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`),
    '</sst>',
].join('');

const SHEET1 = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<dimension ref="A1:G5"/><sheetData>',
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>',
    '<c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c><c r="G1" t="s"><v>6</v></c></row>',
    '<row r="2"><c r="A2" s="1" t="s"><v>7</v></c><c r="B2" t="s"><v>8</v></c><c r="C2" t="s"><v>9</v></c>',
    '<c r="D2" t="s"><v>10</v></c><c r="E2" t="s"><v>11</v></c><c r="F2" t="s"><v>12</v></c><c r="G2" t="s"><v>13</v></c></row>',
    '<row r="3"><c r="A3"><v>12345</v></c><c r="B3" s="2" t="s"><v>17</v></c>',
    '<c r="D3" t="inlineStr"><is></is></c>',
    '<c r="E3" t="s"><v>16</v></c><c r="F3" t="s"><v>14</v></c></row>',
    '<row r="4"><c r="A4" t="s"><v>15</v></c><c r="B4"/>',
    '<c r="C4"><f>UPPER(B3)</f><v>SEM ADV</v></c>',
    '<c r="D4" t="inlineStr"><is><t>SEM UF</t></is></c>',
    '<c r="F4" t="n"><v>1500.5</v></c></row>',
    '<row r="5"><c r="B5" t="s"><v>8</v></c><c t="s"><v>13</v></c></row>',
    '</sheetData></worksheet>',
].join('');

/** Mesma forma, sem nenhuma coluna de cadastro no cabeçalho. */
const SHEET1_SEM_CADASTRO = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<dimension ref="A1:B2"/><sheetData>',
    '<row r="1"><c r="A1" t="s"><v>18</v></c><c r="B1" t="s"><v>6</v></c></row>',
    '<row r="2"><c r="A2" t="s"><v>13</v></c><c r="B2" t="s"><v>11</v></c></row>',
    '</sheetData></worksheet>',
].join('');

const SHEET2 = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<dimension ref="A1:A2"/><sheetData>',
    '<row r="1"><c r="A1" t="s"><v>18</v></c></row>',
    '<row r="2"><c r="A2" t="s"><v>19</v></c></row>',
    '</sheetData></worksheet>',
].join('');

/** Aba sem `sheetData`: nenhuma linha, nenhuma coluna. */
const SHEET3 = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<dimension ref="A1"/></worksheet>',
].join('');

/** O relógio da página é congelado: o nome de saída depende da hora local. */
const AGORA = '2026-09-25T14:30:00';
const NOME_SAIDA = 'Cadastro-25-09-2026_14-30.xlsx';

/** Primeira coisa que falta na casca: pedir a pasta de destino pela ponte. */
const PEDE_A_PASTA = 'o toy precisa pedir a pasta de destino pela ponte do app';

/** Segunda: liberar o processamento com planilha lida e pasta escolhida. */
const AINDA_NAO_LIBERA = 'o processamento precisa liberar depois de ler a planilha e escolher a pasta';

async function abrir(t, opcoes = {}) {
    const app = await carregarApp();
    // O toy lê o pacote com o JSZip real do vendor.
    const pagina = await carregarToy('gancadastro', { ...opcoes, vendor: [VENDOR.jszip, ...(opcoes.vendor || [])] });
    t.after(() => {
        pagina.fechar();
        app.fechar();
    });
    return { app, pagina, ponte: app.conectarToy(pagina) };
}

function congelarRelogio(pagina) {
    pagina.script(`(() => {
        const Real = Date;
        const fixo = new Real(${JSON.stringify(AGORA)}).getTime();
        function Falso(...args) { return args.length ? new Real(...args) : new Real(fixo); }
        Falso.now = () => fixo;
        Falso.parse = Real.parse;
        Falso.UTC = Real.UTC;
        Falso.prototype = Real.prototype;
        window.Date = Falso;
    })()`);
}

function selecionarArquivo(pagina, bytes, nome) {
    pagina.janela.__ganEntrada = Array.from(bytes);
    pagina.janela.__ganNome = nome;
    pagina.script(`(() => {
        const arquivo = new File([new Uint8Array(window.__ganEntrada)], window.__ganNome);
        const input = document.getElementById('arquivo');
        Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
}

const NS_PLANILHA = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Replica o que o Excel escreve: tags com prefixo e sem namespace default. */
function comNamespacePrefixo(xml, ns) {
    return xml
        .replace(/<(?!\?|!)(\/?)([A-Za-z][\w.]*)/g, (_, barra, nome) => `<${barra}x:${nome}`)
        .replace(`xmlns="${ns}"`, `xmlns:x="${ns}"`);
}

/** Monta a fixture dentro da página e devolve os bytes do pacote. */
async function montarPlanilha(pagina, { comCadastro = true, abasQuebradas = false, semSharedStrings = false, comBom = false, comPrefixo = false, customSheet1 = null, customSharedStrings = null, customEstilos = null } = {}) {
    const abas = abasQuebradas ? ABAS_QUEBRADAS : ABAS_BASE;
    const relsExtras = abasQuebradas
        ? [['rId5', 'worksheets/sheet3.xml'], ['rId6', 'worksheets/sheet9.xml']]
        : [['rId5', 'worksheets/sheet3.xml']];
    const prefixo = (xml, ns) => (comPrefixo ? comNamespacePrefixo(xml, ns) : xml);
    // O cadastro exportado pelo Excel grava BOM no prólogo do .rels e do workbook.
    const bom = comBom ? '\uFEFF' : '';

    const partes = {
        '[Content_Types].xml': CONTENT_TYPES,
        '_rels/.rels': RELS_RAIZ,
        'xl/workbook.xml': bom + prefixo(workbook(abas), NS_PLANILHA),
        'xl/_rels/workbook.xml.rels': bom + prefixo(relsDoWorkbook(relsExtras), NS_RELS),
        'xl/styles.xml': customEstilos || ESTILOS,
        'xl/sharedStrings.xml': prefixo(customSharedStrings || SHARED_STRINGS, NS_PLANILHA),
        'xl/worksheets/sheet1.xml': prefixo(customSheet1 || (comCadastro ? SHEET1 : SHEET1_SEM_CADASTRO), NS_PLANILHA),
        'xl/worksheets/sheet2.xml': prefixo(SHEET2, NS_PLANILHA),
        'xl/worksheets/sheet3.xml': prefixo(SHEET3, NS_PLANILHA)
    };
    if (semSharedStrings && !customSharedStrings) delete partes['xl/sharedStrings.xml'];
    pagina.janela.__ganPartes = JSON.stringify(partes);
    const bytes = await pagina.script(`(async () => {
        const zip = new JSZip();
        const partes = JSON.parse(window.__ganPartes);
        for (const nome of Object.keys(partes)) zip.file(nome, partes[nome]);
        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        return Array.from(new Uint8Array(buffer));
    })()`);
    return Uint8Array.from(bytes);
}

/** Abre um pacote na página e devolve o texto de cada parte, para comparar. */
async function abrirPacote(pagina, bytes) {
    pagina.janela.__ganSaida = Array.from(bytes);
    return pagina.script(`(async () => {
        const zip = await JSZip.loadAsync(new Uint8Array(window.__ganSaida));
        const nomes = Object.keys(zip.files).sort();
        const partes = {};
        for (const nome of nomes) {
            const parte = zip.file(nome);
            if (parte && !parte.dir) partes[nome] = await parte.async('string');
        }
        return { nomes, partes };
    })()`);
}

/** Escolhe a pasta de destino pela ponte: só o lado do app é aguardado aqui. */
async function escolherDestino({ app, pagina, ponte }, arvore) {
    app.enfileirarPasta(arvore);
    pagina.clicar('#escolher-destino');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: PEDE_A_PASTA });
    await ponte.confirmarPasta();
}

/** O botão só libera com a planilha lida e a pasta escolhida. */
async function aguardarProcessamentoLiberado(pagina) {
    await pagina.aguardar(() => pagina.seletor('#processar').disabled === false, { descricao: AINDA_NAO_LIBERA });
}

async function processarEGravar(pagina, destino) {
    pagina.clicar('#processar');
    await pagina.aguardar(() => destino.escritas.length > 0, { descricao: 'a planilha processada precisa ser gravada na pasta de destino escolhida' });
    await pagina.aguardar(() => pagina.seletor('#resultado').classList.contains('hidden') === false, { descricao: 'resultado na tela' });
}

// ---------------------------------------------------------------------------

test('gancadastro — processa a planilha e grava o cadastro datado na pasta destino', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;
    const destino = montarArvore('Destino', {});

    selecionarArquivo(pagina, await montarPlanilha(pagina), 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    await processarEGravar(pagina, destino);

    assert.deepEqual(destino.escritas, [NOME_SAIDA], 'as escritas na pasta de destino, na ordem');

    // Ponte: pasta pedida em leitura/escrita e arquivo enviado como bytes.
    const pedidos = ponte.enviados;
    assert.deepEqual(
        pedidos.filter((mensagem) => mensagem.type.endsWith('-request')).map((mensagem) => mensagem.type),
        ['gantoys-directory-picker-request', 'gantoys-file-request']
    );
    assert.equal(pedidos[0].mode, 'readwrite');
    const gravacao = pedidos.find((mensagem) => mensagem.type === 'gantoys-file-request');
    assert.equal(gravacao.action, 'write');
    assert.equal(gravacao.name, NOME_SAIDA);
    assert.equal(typeof gravacao.directoryId, 'string');
    assert.ok(['Uint8Array', 'ArrayBuffer'].includes(gravacao.bytes?.constructor?.name), 'os bytes vão na mensagem de gravação');

    // Tela: pasta escolhida, resumo, números e uma linha por aba.
    assert.equal(pagina.texto('#planilha-nome'), 'cadastro.xlsx');
    assert.equal(pagina.texto('#destino-nome'), 'Destino');
    assert.equal(pagina.texto('#resultado-resumo'), `${NOME_SAIDA} gravado em Destino.`);
    assert.deepEqual(pagina.textos('#resultado-numeros .stat strong'), ['12', '1', '3', '1']);
    assert.deepEqual(pagina.textos('#resultado-numeros .stat span'), ['alteradas', 'sem mudança', 'ignoradas', 'não convertidas']);
    assert.deepEqual(pagina.textos('#resultado-lista .result-name'), ['Plan1', 'Planilha1', 'Vazia']);
    assert.deepEqual(pagina.textos('#resultado-lista .result-status'), ['12 células alteradas', '0 células alteradas', '0 células alteradas']);
    assert.equal(pagina.existe('.folder-grid'), true, 'a tela precisa ter os seletores organizados em .folder-grid e sem area de logs');
    assert.equal(pagina.todos('.folder-card').length, 2, 'dois cards de seletores lado a lado');
    assert.equal(pagina.existe('#log-area'), false, 'a area de logs foi removida');
    assert.equal(pagina.seletor('#progresso').classList.contains('visible'), true, 'a barra de progresso aparece');
    assert.equal(pagina.texto('#progresso-porcento'), '100%');
    assert.equal(pagina.atributo('#progresso-barra', 'style'), 'width: 100%;');
    assert.equal(pagina.texto('#progresso-titulo'), 'Concluído');
    assert.equal(pagina.texto('#progresso-detalhe'), '3 abas processadas, 12 células alteradas.');
    assert.equal(pagina.seletor('#mensagem').classList.contains('hidden'), true, 'sem erro na tela');
    assert.equal(pagina.seletor('#processar').disabled, false, 'o botão volta a ficar disponível');
});

test('gancadastro — o botão de processar só libera com planilha e pasta', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;

    assert.equal(pagina.seletor('#processar').disabled, true, 'sem nada escolhido não processa');

    selecionarArquivo(pagina, await montarPlanilha(pagina), 'cadastro.xlsx');
    await pagina.aguardar(() => pagina.texto('#planilha-nome') === 'cadastro.xlsx', { descricao: 'nome da planilha no toy' });
    assert.equal(pagina.seletor('#processar').disabled, true, 'sem pasta de destino não processa');

    await escolherDestino(ctx, montarArvore('Destino', {}));
    await aguardarProcessamentoLiberado(pagina);
    assert.equal(pagina.texto('#destino-nome'), 'Destino');
});

test('gancadastro — diagnóstico lista as abas e as colunas reconhecidas', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;

    selecionarArquivo(pagina, await montarPlanilha(pagina), 'cadastro.xlsx');
    await pagina.aguardar(() => pagina.texto('#planilha-nome') === 'cadastro.xlsx', { descricao: 'nome da planilha no toy' });

    assert.equal(pagina.seletor('#diagnostico').classList.contains('hidden'), false, 'o diagnóstico aparece ao escolher a planilha');
    assert.equal(pagina.texto('#diagnostico-resumo'), '3 abas, 1 com colunas reconhecidas.');
    assert.deepEqual(pagina.textos('#diagnostico-lista .result-name'), ['Plan1', 'Planilha1', 'Vazia']);
    assert.deepEqual(pagina.textos('#diagnostico-lista .badge'), ['5 linhas', '2 linhas', '0 linhas']);
    assert.deepEqual(pagina.textos('#diagnostico-lista .result-meta'), [
        'Colunas reconhecidas: Núm. Processo, Advogado Adverso, OAB Advogado Adverso, UF OAB Advogado Adverso, Comarca, Valor da Causa.',
        'Nenhuma coluna reconhecida.',
        'Nenhuma coluna reconhecida.',
    ]);
});

test('gancadastro — aba sem relacionamento e parte ausente ficam de fora sem quebrar a leitura', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;

    selecionarArquivo(pagina, await montarPlanilha(pagina, { abasQuebradas: true, semSharedStrings: true }), 'cadastro.xlsx');
    await pagina.aguardar(() => pagina.texto('#mensagem').length > 0, { descricao: 'mensagem de cadastro' });

    assert.deepEqual(pagina.textos('#diagnostico-lista .result-name'), ['Plan1', 'Planilha1', 'Vazia'], 'as abas sem parte resolvida não entram');
    assert.equal(pagina.texto('#diagnostico-resumo'), '3 abas, 0 com colunas reconhecidas.');
    assert.equal(pagina.texto('#mensagem'), 'Nenhuma coluna de cadastro foi reconhecida na planilha.');
});

test('gancadastro — parte com BOM no prólogo é lida normalmente', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;

    // O cadastro exportado pelo Excel começa o .rels com U+FEFF, e o parser do
    // navegador devolve documento de erro quando o BOM chega junto do texto.
    assert.equal(
        typeof pagina.janela.textoSemBom,
        'function',
        'o leitor precisa limpar o BOM antes de parsear a parte'
    );
    assert.equal(pagina.janela.textoSemBom('\uFEFF<?xml version="1.0"?>'), '<?xml version="1.0"?>');
    assert.equal(pagina.janela.textoSemBom('sem bom'), 'sem bom');

    selecionarArquivo(pagina, await montarPlanilha(pagina, { comBom: true }), 'cadastro.xlsx');
    await pagina.aguardar(() => pagina.texto('#planilha-nome') === 'cadastro.xlsx', { descricao: 'nome da planilha no toy' });

    assert.equal(pagina.texto('#diagnostico-resumo'), '3 abas, 1 com colunas reconhecidas.');
    assert.deepEqual(pagina.textos('#diagnostico-lista .result-meta'), [
        'Colunas reconhecidas: Núm. Processo, Advogado Adverso, OAB Advogado Adverso, UF OAB Advogado Adverso, Comarca, Valor da Causa.',
        'Nenhuma coluna reconhecida.',
        'Nenhuma coluna reconhecida.',
    ]);
});

test('gancadastro — pacote com prefixo de namespace é reescrito no mesmo namespace', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const destino = montarArvore('Destino', {});
    const entrada = await montarPlanilha(pagina, { comPrefixo: true });

    selecionarArquivo(pagina, entrada, 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    await processarEGravar(pagina, destino);

    const saida = await abrirPacote(pagina, destino.paraObjeto()[NOME_SAIDA]);
    const original = await abrirPacote(pagina, entrada);
    const sheet1 = saida.partes['xl/worksheets/sheet1.xml'];

    // O Excel escreve as tags com prefixo e sem namespace default: o elemento
    // gravado precisa manter o prefixo, senão sai do namespace da planilha.
    assert.ok(
        sheet1.includes('<x:c r="A2" s="1" t="inlineStr"><x:is><x:t>0004469-51.2026.8.05.0103</x:t></x:is></x:c>'),
        'a célula com prefixo precisa sair reescrita, no mesmo namespace do documento'
    );
    assert.ok(sheet1.includes('<x:c r="F2" s="3" t="inlineStr"><x:is><x:t>20000</x:t></x:is></x:c>'), 'valor da causa reescrito com prefixo e formato Texto');
    assert.ok(sheet1.includes('<x:c r="B3" s="2" t="inlineStr"><x:is><x:t>SEM ADVOGADO</x:t></x:is></x:c>'), 'estilo preservado na célula com prefixo');
    assert.ok(sheet1.includes('<x:c r="A3"><x:v>12345</x:v></x:c>'), 'valor fora de 20 dígitos fica intacto');
    assert.ok(sheet1.includes('<x:c r="G2" t="s"><x:v>13</x:v></x:c>'), 'coluna fora do mapa fica intacta');
    assert.match(saida.partes['xl/styles.xml'], /<cellXfs count="4">/, 'o valor da causa ganha um xf de Texto');
    assert.match(saida.partes['xl/styles.xml'], /<xf [^>]*fontId="0"[^>]*numFmtId="49"[^>]*applyNumberFormat="1"/, 'xf de Texto preserva os demais atributos');
    assert.equal(saida.partes['xl/worksheets/sheet2.xml'], original.partes['xl/worksheets/sheet2.xml'], 'aba sem coluna de cadastro sai idêntica');
    assert.deepEqual(pagina.textos('#resultado-numeros .stat strong'), ['12', '1', '3', '1']);
});

test('gancadastro — a saída preserva formatação, abas e nomes, e só reescreve o necessário', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const destino = montarArvore('Destino', {});
    const entrada = await montarPlanilha(pagina);

    selecionarArquivo(pagina, entrada, 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    await processarEGravar(pagina, destino);

    const saida = await abrirPacote(pagina, destino.paraObjeto()[NOME_SAIDA]);
    const original = await abrirPacote(pagina, entrada);
    const partes = saida.partes;

    // Mesmas partes do pacote, mesmas abas, mesmos nomes.
    assert.deepEqual(saida.nomes, original.nomes, 'as partes do pacote continuam as mesmas');
    assert.equal(partes['xl/workbook.xml'], original.partes['xl/workbook.xml'], 'workbook.xml sai idêntico');
    assert.match(partes['xl/styles.xml'], /<cellXfs count="4">/, 'o valor da causa ganha um xf de Texto');
    assert.match(partes['xl/styles.xml'], /<xf [^>]*fontId="0"[^>]*numFmtId="49"[^>]*applyNumberFormat="1"/, 'xf de Texto preserva os demais atributos');
    assert.equal(partes['xl/sharedStrings.xml'], original.partes['xl/sharedStrings.xml'], 'sharedStrings.xml sai idêntico');
    assert.equal(partes['xl/worksheets/sheet2.xml'], original.partes['xl/worksheets/sheet2.xml'], 'aba sem coluna de cadastro sai idêntica');
    assert.equal(partes['xl/worksheets/sheet3.xml'], original.partes['xl/worksheets/sheet3.xml'], 'aba vazia sai idêntica');

    // Células reescritas: valor transformado com o estilo original preservado.
    const sheet1 = partes['xl/worksheets/sheet1.xml'];
    const reescrita = (endereco, valor, estilo = '') => `<c r="${endereco}"${estilo} t="inlineStr"><is><t>${valor}</t></is></c>`;
    assert.ok(sheet1.includes(reescrita('A2', '0004469-51.2026.8.05.0103', ' s="1"')), 'CNJ pontuado com o estilo da célula');
    assert.ok(sheet1.includes(reescrita('B2', 'JOSE  DA SILVA')), 'advogado normalizado, cortando o |');
    assert.ok(sheet1.includes(reescrita('C2', '0')), 'SEM OAB vira 0');
    assert.ok(sheet1.includes(reescrita('D2', 'TJ')), 'SEM UF vira TJ');
    assert.ok(sheet1.includes(reescrita('E2', 'ILHEUS')), 'comarca sem acento');
    assert.ok(sheet1.includes(reescrita('F2', '20000', ' s="3"')), 'valor da causa sem o sufixo de centavos, em formato Texto');
    assert.ok(sheet1.includes(reescrita('B3', 'SEM ADVOGADO', ' s="2"')), 'SEM ADV vira SEM ADVOGADO com o estilo da célula');
    assert.ok(sheet1.includes(reescrita('E3', 'NAO ENCONTRADO')), 'comarca normalizada');
    assert.ok(sheet1.includes(reescrita('F3', '1234,56', ' s="3"')), 'valor no padrão brasileiro, em formato Texto');
    assert.ok(sheet1.includes(reescrita('D4', 'TJ')), 'célula de texto inline também é processada');
    assert.ok(sheet1.includes(reescrita('F4', '1500,5', ' s="3"')), 'valor numérico vira o padrão brasileiro, em formato Texto');
    assert.ok(sheet1.includes(reescrita('B5', 'JOSE  DA SILVA')), 'a normalização vale para todas as linhas');

    // Células que não mudam ficam como estavam — a numérica inválida, a vazia,
    // a que tem fórmula, a inline sem texto, a sem `r` e a coluna fora do mapa.
    assert.ok(sheet1.includes('<c r="A3"><v>12345</v></c>'), 'valor fora de 20 dígitos fica intacto');
    assert.ok(sheet1.includes('<c r="A4" t="s"><v>15</v></c>'), 'CNJ já pontuado não é reescrito');
    assert.ok(sheet1.includes('<c r="B4"/>'), 'célula vazia fica intacta');
    assert.ok(sheet1.includes('<c r="C4"><f>UPPER(B3)</f><v>SEM ADV</v></c>'), 'célula com fórmula é ignorada');
    assert.ok(sheet1.includes('<c r="D3" t="inlineStr"><is></is></c>'), 'inline sem texto fica intacta');
    assert.ok(sheet1.includes('<c t="s"><v>13</v></c>'), 'célula sem endereço fica intacta');
    assert.ok(sheet1.includes('<c r="G2" t="s"><v>13</v></c>'), 'coluna fora do mapa fica intacta');
});


/** Estilo de valor com formato numérico (4) e alinhamento próprio. */
const ESTILOS_VALOR_NUMERICO = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>',
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>',
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">',
    '<alignment horizontal="right" vertical="center"/></xf></cellXfs>',
    '</styleSheet>',
].join('');

/** Cabeçalho só com Valor da Causa; duas linhas numéricas no formato 4. */
const SHEET_VALOR_NUMERICO = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    '<row r="1"><c r="F1" t="s"><v>5</v></c></row>',
    '<row r="2"><c r="F2" s="1"><v>1234.56</v></c></row>',
    '<row r="3"><c r="F3" s="1"><v>0</v></c></row>',
    '<row r="4"><c r="F4" s="1" t="inlineStr"><is><t>20000</t></is></c></row>',
    '</sheetData></worksheet>',
].join('');

test('gancadastro — valor da causa ganha formato Texto sem perder o alinhamento', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const destino = montarArvore('Destino', {});
    const entrada = await montarPlanilha(pagina, {
        customSheet1: SHEET_VALOR_NUMERICO,
        customEstilos: ESTILOS_VALOR_NUMERICO,
    });

    selecionarArquivo(pagina, entrada, 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    await processarEGravar(pagina, destino);

    const saida = await abrirPacote(pagina, destino.paraObjeto()[NOME_SAIDA]);
    const styles = saida.partes['xl/styles.xml'];
    const sheet1 = saida.partes['xl/worksheets/sheet1.xml'];

    const blocoXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)[1];
    const xfs = [...blocoXfs.matchAll(/<xf\b[^>]*?\/>|<xf\b[^>]*?>[\s\S]*?<\/xf>/g)].map((encontrado) => encontrado[0]);
    const celula = /<c r="F2" s="(\d+)" t="inlineStr"><is><t>1234,56<\/t><\/is><\/c>/.exec(sheet1);
    assert.ok(celula, 'o valor numérico vira texto inline "1234,56"');
    const xf = xfs[Number(celula[1])];
    assert.ok(xf, 'a célula aponta para um xf existente');
    assert.match(xf, /numFmtId="49"/, 'o valor da causa usa o formato Texto do Excel');
    assert.match(xf, /applyNumberFormat="1"/, 'o formato de número é aplicado');
    assert.doesNotMatch(xf, /numFmtId="4"/, 'o formato numérico original sai do xf novo');
    assert.match(xf, /<alignment\b[^>]*horizontal="right"[^>]*vertical="center"\/>/, 'o alinhamento da célula é preservado');

    // Valor 0 pintado de laranja: cor, formato Texto e alinhamento no mesmo xf.
    const celulaPintada = /<c r="F3" s="(\d+)" t="inlineStr"><is><t>0<\/t><\/is><\/c>/.exec(sheet1);
    assert.ok(celulaPintada, 'o valor 0 continua escrito como texto');
    const xfPintado = xfs[Number(celulaPintada[1])];
    assert.match(xfPintado, /numFmtId="49"/, 'valor 0 pintado também fica no formato Texto');
    assert.match(xfPintado, /fillId="1" applyFill="1"/, 'valor 0 pintado mantém a cor laranja no xf novo');
    assert.match(xfPintado, /<alignment\b[^>]*horizontal="right"/, 'valor 0 pintado mantém o alinhamento');

    // Célula já em texto e sem mudança de conteúdo recebe só o formato Texto.
    const celulaEstilo = /<c r="F4" s="(\d+)" t="inlineStr"><is><t>20000<\/t><\/is><\/c>/.exec(sheet1);
    assert.ok(celulaEstilo, 'o valor em texto continua com o mesmo conteúdo');
    assert.match(xfs[Number(celulaEstilo[1])], /numFmtId="49"/, 'a célula de valor em texto também fica no formato Texto');

    // O que um leitor de planilha vê: texto, valor com vírgula e formato "@".
    // Lê o arquivo real com a mesma biblioteca que o projeto vendoriza.
    pagina.script(readFileSync('vendor/xlsx/xlsx.full.min.js', 'utf8'));
    pagina.janela.__saidaXlsx = Array.from(destino.paraObjeto()[NOME_SAIDA]);
    const lido = await pagina.script(`(() => {
        const livro = XLSX.read(new Uint8Array(window.__saidaXlsx), { type: 'array', cellNF: true });
        const aba = livro.Sheets[livro.SheetNames[0]];
        return { tipo: aba.F2.t, valor: aba.F2.v, formato: aba.F2.z, tipoZero: aba.F3.t, valorZero: aba.F3.v };
    })()`);
    assert.deepEqual(JSON.parse(JSON.stringify(lido)), {
        tipo: 's',
        valor: '1234,56',
        formato: '@',
        tipoZero: 's',
        valorZero: '0',
    });
});

test('gancadastro — planilha sem nenhuma coluna de cadastro é recusada', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const destino = montarArvore('Destino', {});

    selecionarArquivo(pagina, await montarPlanilha(pagina, { comCadastro: false }), 'sem-cadastro.xlsx');
    await pagina.aguardar(() => pagina.texto('#mensagem').length > 0, { descricao: 'mensagem de cadastro' });

    assert.equal(pagina.texto('#mensagem'), 'Nenhuma coluna de cadastro foi reconhecida na planilha.');
    assert.equal(pagina.texto('#diagnostico-resumo'), '3 abas, 0 com colunas reconhecidas.');

    await escolherDestino(ctx, destino);
    await pagina.tick(0);
    assert.equal(pagina.seletor('#processar').disabled, true, 'sem coluna reconhecida o processamento não libera');
    assert.deepEqual(destino.escritas, []);
});

test('gancadastro — o botão de escolher planilha abre o seletor de arquivo', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;

    pagina.script('(() => { window.__ganCliques = 0; document.getElementById("arquivo").addEventListener("click", () => { window.__ganCliques += 1; }); })()');
    pagina.clicar('#escolher-planilha');
    await pagina.tick(0);

    assert.equal(pagina.janela.__ganCliques, 1, 'o clique no botão cai no campo de arquivo');
});

test('gancadastro — change sem arquivo escolhido não mexe na tela', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;

    pagina.disparar('#arquivo', 'change');
    await pagina.tick(0);

    assert.equal(pagina.texto('#planilha-nome'), 'Nenhuma planilha selecionada');
    assert.equal(pagina.seletor('#processar').disabled, true);
});

test('gancadastro — extensão fora de .xlsx/.xlsm é recusada antes de ler', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;

    selecionarArquivo(pagina, Uint8Array.from([1, 2, 3]), 'cadastro.csv');
    await pagina.aguardar(() => pagina.texto('#mensagem').length > 0, { descricao: 'mensagem de formato' });

    assert.equal(pagina.texto('#mensagem'), 'Formato de arquivo não suportado. Use um arquivo .xlsx ou .xlsm.');
    assert.equal(pagina.texto('#planilha-nome'), 'Nenhuma planilha selecionada');
    assert.equal(pagina.seletor('#diagnostico').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#processar').disabled, true);
});

test('gancadastro — arquivo .xlsx ilegível mostra a mensagem de pacote inválido', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;

    selecionarArquivo(pagina, Uint8Array.from([80, 75, 3, 4, 0, 0]), 'cadastro.xlsx');
    await pagina.aguardar(() => pagina.texto('#mensagem').length > 0, { descricao: 'mensagem de leitura' });

    assert.equal(pagina.texto('#mensagem'), 'Não foi possível ler a planilha. O arquivo não é um .xlsx válido.');
    assert.equal(pagina.seletor('#diagnostico').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#processar').disabled, true);
});

test('gancadastro — cancelar a escolha da pasta mantém a tela sem erro', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;

    selecionarArquivo(pagina, await montarPlanilha(pagina), 'cadastro.xlsx');
    await pagina.aguardar(() => pagina.texto('#planilha-nome') === 'cadastro.xlsx', { descricao: 'nome da planilha no toy' });

    pagina.clicar('#escolher-destino');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: PEDE_A_PASTA });
    await ponte.cancelarPasta();
    await pagina.tick(0);

    assert.equal(pagina.texto('#destino-nome'), 'Nenhuma pasta selecionada');
    assert.equal(pagina.seletor('#mensagem').classList.contains('hidden'), true);
    assert.equal(pagina.seletor('#processar').disabled, true);
});

test('gancadastro — seleção após 120 s grava a planilha sem randomUUID nem alerta', async (t) => {
    const ctx = await abrir(t, {
        preparar(janela) {
            Object.defineProperty(janela.crypto, 'randomUUID', { value: undefined, configurable: true });
        },
    });
    const { app, pagina, ponte } = ctx;
    const destino = montarArvore('Destino', {});
    const alertas = [];
    pagina.janela.alert = (mensagem) => alertas.push(mensagem);
    selecionarArquivo(pagina, await montarPlanilha(pagina), 'cadastro.xlsx');
    await pagina.aguardar(() => pagina.texto('#planilha-nome') === 'cadastro.xlsx', { descricao: 'planilha lida' });
    const vencimentos = [];
    const original = pagina.janela.setTimeout.bind(pagina.janela);
    const timer = t.mock.method(pagina.janela, 'setTimeout', (fn, ms = 0, ...args) => {
        if (ms < 120000) return original(fn, ms, ...args);
        vencimentos.push({ fn, ms, args });
        return 0;
    });

    app.enfileirarPasta(destino);
    pagina.clicar('#escolher-destino');
    await pagina.aguardar(() => ponte.modalDePastaAberto(), { descricao: PEDE_A_PASTA });
    // Avança os prazos longos até 120.001 ms, antes da confirmação do usuário.
    for (const { fn, ms, args } of vencimentos) if (ms <= 120001) fn(...args);
    await pagina.tick(0);
    timer.mock.restore();
    assert.equal(pagina.seletor('#mensagem').classList.contains('hidden'), true);
    assert.deepEqual(alertas, []);

    await ponte.confirmarPasta();
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    await processarEGravar(pagina, destino);

    assert.equal(pagina.janela.crypto.randomUUID, undefined);
    assert.deepEqual(destino.escritas, [NOME_SAIDA]);
    const saida = await abrirPacote(pagina, destino.paraObjeto()[NOME_SAIDA]);
    assert.ok(saida.partes['xl/worksheets/sheet1.xml'].includes('0004469-51.2026.8.05.0103'), 'o cadastro gravado contém o processo normalizado');
    assert.equal(pagina.texto('#resultado-resumo'), `${NOME_SAIDA} gravado em Destino.`);
    assert.equal(pagina.seletor('#mensagem').classList.contains('hidden'), true);
    assert.deepEqual(alertas, []);
});

test('gancadastro — gravação sem resposta mantém o limite de 120 s', async (t) => {
    const ctx = await abrir(t);
    const { pagina, ponte } = ctx;
    const destino = montarArvore('Destino', {});
    selecionarArquivo(pagina, await montarPlanilha(pagina), 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    ponte.desconectar();
    const vencimentos = [];
    const original = pagina.janela.setTimeout.bind(pagina.janela);
    const timer = t.mock.method(pagina.janela, 'setTimeout', (fn, ms = 0, ...args) => {
        if (ms < 120000) return original(fn, ms, ...args);
        vencimentos.push({ fn, ms, args });
        return 0;
    });

    pagina.clicar('#processar');
    await pagina.aguardar(() => vencimentos.length === 1, { descricao: 'prazo da gravação registrado' });
    assert.equal(vencimentos[0].ms, 120000);
    vencimentos[0].fn(...vencimentos[0].args);
    await pagina.aguardar(() => pagina.texto('#mensagem') === 'A operação não respondeu.', { descricao: 'erro de gravação sem resposta' });
    timer.mock.restore();

    assert.equal(pagina.texto('#progresso-titulo'), 'Interrompido');
    assert.deepEqual(destino.escritas, []);
    assert.equal(pagina.seletor('#processar').disabled, false);
});

test('gancadastro — pasta de destino sem permissão de escrita mostra o erro do app', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const destino = montarArvore('Destino', {});
    destino.negarPermissao = true;

    selecionarArquivo(pagina, await montarPlanilha(pagina), 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    pagina.clicar('#processar');
    await pagina.aguardar(() => pagina.texto('#mensagem').length > 0, { descricao: 'mensagem de permissão' });

    assert.equal(pagina.texto('#mensagem'), 'É necessário conceder permissão de escrita na pasta de destino.');
    assert.equal(pagina.texto('#progresso-titulo'), 'Interrompido');
    assert.deepEqual(destino.escritas, []);
    assert.equal(pagina.seletor('#processar').disabled, false, 'o operador pode tentar de novo');
});

test('gancadastro — aplica regras de carteira, comarca e audiência', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const destino = montarArvore('Destino', {});

    const stringsRegras = [
        'Carteira', 'Parte Ré', 'Comarca', 'UF', 'Órgão', 'Num', 'Tipo Audiencia', 'Data Audiencia',
        'Bradesco - Indenizatória', 'Qualquer Réu',
        'Outra Carteira', 'EBAZAR.COM.BR LTDA.',
        'Carteira Sem Match', 'Empresa Inexistente 999',
        'capital', 'SP',
        'Capital - Meier',
        'LEOPOLDINA', 'JEC', '10',
        '11',
        'VC',
        'JACAREPAGUA',
        'Audiencia Marcada',
        '15/10/2026',
    ];
    const sharedRegras = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${stringsRegras.length}" uniqueCount="${stringsRegras.length}">`,
        ...stringsRegras.map((v) => `<si><t>${v}</t></si>`),
        '</sst>',
    ].join('');

    const sheetRegras = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
        '<row r="1">',
        '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>',
        '<c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c>',
        '<c r="G1" t="s"><v>6</v></c><c r="H1" t="s"><v>7</v></c>',
        '</row>',
        '<row r="2"><c r="A2" t="s"><v>8</v></c><c r="B2" t="s"><v>9</v></c></row>',
        '<row r="3"><c r="A3" t="s"><v>10</v></c><c r="B3" t="s"><v>11</v></c></row>',
        '<row r="4"><c r="A4" t="s"><v>12</v></c><c r="B4" t="s"><v>13</v></c></row>',
        '<row r="5"><c r="C5" t="s"><v>14</v></c><c r="D5" t="s"><v>15</v></c></row>',
        '<row r="6"><c r="C6" t="s"><v>16</v></c></row>',
        '<row r="7"><c r="C7" t="s"><v>17</v></c><c r="E7" t="s"><v>18</v></c><c r="F7" t="s"><v>19</v></c></row>',
        '<row r="8"><c r="C8" t="s"><v>17</v></c><c r="E8" t="s"><v>18</v></c><c r="F8" t="s"><v>20</v></c></row>',
        '<row r="9"><c r="C9" t="s"><v>17</v></c><c r="E9" t="s"><v>21</v></c></row>',
        '<row r="10"><c r="C10" t="s"><v>22</v></c><c r="E10" t="s"><v>18</v></c></row>',
        '<row r="11"><c r="C11" t="s"><v>22</v></c><c r="E11" t="s"><v>21</v></c></row>',
        '<row r="12"><c r="G12" t="inlineStr"><is><t></t></is></c><c r="H12" t="s"><v>24</v></c></row>',
        '</sheetData></worksheet>',
    ].join('');

    const entrada = await montarPlanilha(pagina, { customSheet1: sheetRegras, customSharedStrings: sharedRegras });
    selecionarArquivo(pagina, entrada, 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    await processarEGravar(pagina, destino);

    const saida = await abrirPacote(pagina, destino.paraObjeto()[NOME_SAIDA]);
    const sheet1 = saida.partes['xl/worksheets/sheet1.xml'];

    assert.ok(sheet1.includes('BANCO BRADESCO SA'), 'regras de carteira e réu aplicadas');
    assert.ok(sheet1.includes('Mercado Livre'), 'resolveCarteiraReu atualizou carteira');
    assert.ok(sheet1.includes('r="A4"') && sheet1.includes('<v>12</v>') && sheet1.includes('r="B4"') && sheet1.includes('<v>13</v>'), 'exceção manteve carteira e réu originais');
    assert.ok(sheet1.includes('SAO PAULO'), 'capital virou a capital da UF');
    assert.ok(sheet1.includes('MEIER'), 'capital com sufixo virou o sufixo limpo');
    for (const linha of [7, 8, 9]) {
        assert.match(sheet1, new RegExp(`<c r="C${linha}" t="s"><v>17</v></c>`), 'Leopoldina permanece na comarca original');
    }
    assert.ok(sheet1.includes('FREGUESIA'), 'Jacarepagua JEC virou Freguesia');
    assert.ok(sheet1.includes('TAQUARA'), 'Jacarepagua VC virou Taquara');
    assert.ok(sheet1.includes('AC'), 'audiencia vazia com data virou AC');
});

test('gancadastro — aplica pintura condicional laranja e vermelha em styles.xml', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const destino = montarArvore('Destino', {});

    const stringsPintura = [
        'Carteira', 'Parte Ré', 'Valor da Causa', 'Advogado Adverso', 'Órgão', 'Num', 'Rito', 'Causa Raiz',
        'Carteira Sem Match', 'Empresa Inexistente 999',
        '0',
        'SEM ADVOGADO', 'VC',
        '0', 'VC',
        'Sumário',
        'Outra Carteira Comum', 'Falta de Documento',
    ];
    const sharedPintura = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${stringsPintura.length}" uniqueCount="${stringsPintura.length}">`,
        ...stringsPintura.map((v) => `<si><t>${v}</t></si>`),
        '</sst>',
    ].join('');

    const sheetPintura = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
        '<row r="1">',
        '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>',
        '<c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c>',
        '<c r="G1" t="s"><v>6</v></c><c r="H1" t="s"><v>7</v></c>',
        '</row>',
        '<row r="2"><c r="A2" t="s"><v>8</v></c><c r="B2" t="s"><v>9</v></c></row>',
        '<row r="3"><c r="C3" t="s"><v>10</v></c></row>',
        '<row r="4"><c r="D4" t="s"><v>11</v></c><c r="E4" t="s"><v>12</v></c></row>',
        '<row r="5"><c r="F5" t="s"><v>13</v></c><c r="E5" t="s"><v>14</v></c></row>',
        '<row r="6"><c r="G6" t="s"><v>15</v></c></row>',
        '<row r="7"><c r="A7" t="s"><v>16</v></c><c r="H7" t="s"><v>17</v></c></row>',
        '</sheetData></worksheet>',
    ].join('');

    const entrada = await montarPlanilha(pagina, { customSheet1: sheetPintura, customSharedStrings: sharedPintura });
    selecionarArquivo(pagina, entrada, 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    await processarEGravar(pagina, destino);

    const saida = await abrirPacote(pagina, destino.paraObjeto()[NOME_SAIDA]);
    const styles = saida.partes['xl/styles.xml'];
    const sheet1 = saida.partes['xl/worksheets/sheet1.xml'];

    assert.ok(styles.includes('FFFFA500') && styles.includes('FFFF0000'), 'styles.xml precisa conter os preenchimentos solido laranja e vermelho');
    assert.ok(sheet1.includes('r="A2"') && sheet1.includes('r="B2"'), 'células da exceção de carteira existem');
    assert.ok(sheet1.includes('r="C3"'), 'valor da causa 0 existe');
    assert.ok(sheet1.includes('r="D4"'), 'advogado sem advogado existe');
    assert.ok(sheet1.includes('r="F5"'), 'num 0 com VC existe');
    assert.ok(sheet1.includes('r="G6"'), 'rito sumario existe');
    assert.ok(sheet1.includes('r="H7"'), 'causa raiz existe');
});

test('gancadastro — carteira contendo Santander mantém carteira e réu intactos e sem pintura laranja', async (t) => {
    const ctx = await abrir(t);
    const { pagina } = ctx;
    const destino = montarArvore('Destino', {});

    const stringsSantander = [
        'Carteira', 'Parte Ré',
        'Santander - Santander - Indenizatória', 'BANCO SANTANDER BRASIL S A',
    ];
    const sharedSantander = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${stringsSantander.length}" uniqueCount="${stringsSantander.length}">`,
        ...stringsSantander.map((v) => `<si><t>${v}</t></si>`),
        '</sst>',
    ].join('');

    const sheetSantander = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>',
        '</sheetData></worksheet>',
    ].join('');

    const entrada = await montarPlanilha(pagina, { customSheet1: sheetSantander, customSharedStrings: sharedSantander });
    selecionarArquivo(pagina, entrada, 'cadastro.xlsx');
    await escolherDestino(ctx, destino);
    await aguardarProcessamentoLiberado(pagina);
    congelarRelogio(pagina);
    await processarEGravar(pagina, destino);

    const saida = await abrirPacote(pagina, destino.paraObjeto()[NOME_SAIDA]);
    const styles = saida.partes['xl/styles.xml'];
    const sheet1 = saida.partes['xl/worksheets/sheet1.xml'];

    assert.equal(styles.includes('FFFFA500'), false, 'carteira Santander não deve criar estilo laranja');
    assert.equal(/<c[^>]*\bs=/.test(sheet1), false, 'células de Santander não devem receber estilo de pintura');
    assert.ok(sheet1.includes('<c r="A2" t="s"><v>2</v></c>') && sheet1.includes('<c r="B2" t="s"><v>3</v></c>'), 'carteira e réu do Santander devem permanecer intactos');
});
