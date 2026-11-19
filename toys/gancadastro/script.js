/* Toy Cadastro (planilha).

   Lê o pacote OOXML escolhido, padroniza as colunas de cadastro reconhecidas e
   grava uma cópia na pasta de destino escolhida pela ponte do app. A saída é o
   MESMO pacote, com apenas as células alteradas reescritas como texto inline.
   Quantidade de abas, nomes e alinhamento saem como estavam. A exceção é a
   coluna Valor da Causa: a célula recebe o número de verdade, no formato Geral
   (numFmt 0), sem o ponto de milhar. Assim o Excel não marca a célula como
   "número armazenado como texto" e um leitor não confunde a vírgula decimal
   com separador de milhar.

   As transformações por coluna vêm do kit compartilhado: formatCnj para o
   número do processo, normalizeNameValue para os nomes e extractMoney para o
   valor da causa. No Espírito Santo, quando a célula da Comarca traz a unidade
   judiciária no lugar do nome ("comarca da capital", "juizado especial
   cível"), ela é substituída pelo nome definido no código da serventia (os
   quatro últimos dígitos do CNJ). As demais comarcas mantêm o nome já escrito,
   com duas exceções que o sistema de destino exige: "Aracruz e Ibiraçu" vira
   ARACRUZ e "Bom Jesus de Itabapoana" vira BOM JESUS DO ITABAPOANA. */

const EXTENSOES_ACEITAS = ['xlsx', 'xlsm'];
const MENSAGEM_FORMATO = 'Formato de arquivo não suportado. Use um arquivo .xlsx ou .xlsm.';
const MENSAGEM_PACOTE = 'Não foi possível ler a planilha. O arquivo não é um .xlsx válido.';
const MENSAGEM_SEM_COLUNA = 'Nenhuma coluna de cadastro foi reconhecida na planilha.';

const CAPITAIS_POR_UF = {
    AC: 'RIO BRANCO', AL: 'MACEIO', AP: 'MACAPA', AM: 'MANAUS',
    BA: 'SALVADOR', CE: 'FORTALEZA', DF: 'BRASILIA', ES: 'VITORIA',
    GO: 'GOIANIA', MA: 'SAO LUIS', MT: 'CUIABA', MS: 'CAMPO GRANDE',
    MG: 'BELO HORIZONTE', PA: 'BELEM', PB: 'JOAO PESSOA', PR: 'CURITIBA',
    PE: 'RECIFE', PI: 'TERESINA', RJ: 'RIO DE JANEIRO', RN: 'NATAL',
    RS: 'PORTO ALEGRE', RO: 'PORTO VELHO', RR: 'BOA VISTA', SC: 'FLORIANOPOLIS',
    SP: 'SAO PAULO', SE: 'ARACAJU', TO: 'PALMAS'
};

/**
 * Comarca do Espírito Santo pelo código da serventia (OOOO do CNJ).
 * A tabela só é usada quando a planilha traz "comarca da capital" no lugar do
 * nome. Fora isso, o nome já escrito é mantido.
 */
const COMARCAS_POR_CODIGO_ES = {
    '0012': 'CARIACICA',
    '0021': 'GUARAPARI',
    '0024': 'VITORIA',
    '0025': 'FUNDAO',
    '0035': 'VILA VELHA',
    '0048': 'SERRA',
    '0050': 'VIANA',
    '0059': 'ARACRUZ'
};

/**
 * Textos que descrevem a unidade judiciária, não o nome da comarca. Quando a
 * célula da Comarca traz um destes, o código da serventia define a comarca.
 */
const MARCADORES_DE_UNIDADE = ['CAPITAL', 'JUIZADO', 'VARA', 'FORO', 'JUSTICA', 'CARTORIO', 'OFICIO', 'SECRETARIA'];

function ehUnidadeJudiciaria(comarcaNormalizada) {
    return MARCADORES_DE_UNIDADE.some((marcador) => comarcaNormalizada.includes(marcador));
}

/**
 * Comarca definida pelo código da serventia de um processo do ES (8.08).
 * Devolve null quando o processo não é do ES, '' quando o código não está na
 * tabela e o nome da comarca quando está.
 */
function comarcaPeloCodigoEs(processo) {
    const digitos = String(processo ?? '').replace(/\D/g, '');
    if (digitos.length !== 20 || digitos.slice(13, 16) !== '808') return null;
    return COMARCAS_POR_CODIGO_ES[digitos.slice(16, 20)] || '';
}


/** Colunas de cadastro reconhecidas e suas transformações padrão. */
const COLUNAS_DE_CADASTRO = [
    { chave: 'processo', nome: 'Núm. Processo', apelidos: ['NUM PROCESSO', 'NUMERO DO PROCESSO', 'NUM PROC'], transformar: (valor) => formatCnj(valor) },
    { chave: 'advogado', nome: 'Advogado Adverso', apelidos: ['ADVOGADO ADVERSO'], transformar: (valor) => normalizeNameValue(valor) },
    { chave: 'oab', nome: 'OAB Advogado Adverso', apelidos: ['OAB ADVOGADO ADVERSO'], transformar: (valor) => normalizeNameValue(valor) },
    { chave: 'ufOab', nome: 'UF OAB Advogado Adverso', apelidos: ['UF OAB ADVOGADO ADVERSO'], transformar: (valor) => normalizeNameValue(valor) },
    { chave: 'comarca', nome: 'Comarca', apelidos: ['COMARCA'] },
    { chave: 'valor', nome: 'Valor da Causa', apelidos: ['VALOR DA CAUSA'], transformar: (valor) => extractMoney(valor).rows[0][0] },
    { chave: 'carteira', nome: 'Carteira', apelidos: ['CARTEIRA'] },
    { chave: 'parteRe', nome: 'Parte Ré', apelidos: ['PARTE RE', 'PARTE RÉ', 'PARTE REU', 'PARTE RÉU'] },
    { chave: 'uf', nome: 'UF', apelidos: ['UF', 'ESTADO'] },
    { chave: 'orgao', nome: 'Órgão', apelidos: ['ORGAO', 'ÓRGÃO'] },
    { chave: 'num', nome: 'Num', apelidos: ['NUM', 'NUMERO', 'VARA'] },
    { chave: 'rito', nome: 'Rito', apelidos: ['RITO'] },
    { chave: 'tipoAudiencia', nome: 'Tipo Audiencia', apelidos: ['TIPO AUDIENCIA', 'TIPO DE AUDIENCIA'] },
    { chave: 'dataAudiencia', nome: 'Data Audiencia', apelidos: ['DATA AUDIENCIA', 'DATA DE AUDIENCIA', 'AUDIENCIA'] },
    { chave: 'causaRaiz', nome: 'Causa Raiz', apelidos: ['CAUSA RAIZ'] }
];


const elementos = {
    arquivo: document.getElementById('arquivo'),
    escolherPlanilha: document.getElementById('escolher-planilha'),
    planilhaNome: document.getElementById('planilha-nome'),
    escolherDestino: document.getElementById('escolher-destino'),
    destinoNome: document.getElementById('destino-nome'),
    processar: document.getElementById('processar'),
    mensagem: document.getElementById('mensagem'),
    diagnostico: document.getElementById('diagnostico'),
    diagnosticoResumo: document.getElementById('diagnostico-resumo'),
    diagnosticoLista: document.getElementById('diagnostico-lista'),
    progresso: document.getElementById('progresso'),
    progressoTitulo: document.getElementById('progresso-titulo'),
    progressoPorcento: document.getElementById('progresso-porcento'),
    progressoBarra: document.getElementById('progresso-barra'),
    progressoDetalhe: document.getElementById('progresso-detalhe'),
    resultado: document.getElementById('resultado'),
    resultadoResumo: document.getElementById('resultado-resumo'),
    resultadoNumeros: document.getElementById('resultado-numeros'),
    resultadoLista: document.getElementById('resultado-lista')
};

const estado = {
    pacote: null,
    destino: null
};

/* ------------------------------------------------------ leitura do pacote -- */

const analisador = new DOMParser();

/**
 * Texto da parte sem o BOM do prólogo. O cadastro exportado pelo Excel grava
 * U+FEFF antes do `<?xml` de algumas partes e o parser do navegador devolve
 * documento de erro quando o BOM chega junto do texto (o jsdom tolera, o
 * Chromium não) — o toy enxergaria zero abas.
 */
function textoSemBom(texto) {
    return String(texto).replace(/^\uFEFF/, '');
}

function analisarXml(texto) {
    return analisador.parseFromString(textoSemBom(texto), 'application/xml');
}

function elementosPorNome(raiz, nome) {
    return Array.from(raiz.getElementsByTagNameNS('*', nome));
}

function primeiroFilho(raiz, nome) {
    return elementosPorNome(raiz, nome)[0] || null;
}

/** Alvo de relacionamento relativo ao diretório `xl/` do pacote. */
function caminhoDaParte(alvo) {
    const limpo = String(alvo).replace(/^\/+/, '');
    return `xl/${limpo.replace(/^xl\//, '')}`;
}

async function textoDaParte(zip, caminho) {
    const parte = caminho ? zip.file(caminho) : null;
    return parte ? parte.async('string') : null;
}

function textosCompartilhados(xml) {
    if (!xml) return [];
    return elementosPorNome(analisarXml(xml), 'si').map((item) => elementosPorNome(item, 't').map((no) => no.textContent).join(''));
}

/**
 * Linhas da aba, cada uma como mapa letra da coluna -> `{ endereco, elemento }`.
 * A célula sem o atributo `r` não é endereçável e fica de fora do processamento.
 */
function linhasDaAba(documento) {
    const dados = primeiroFilho(documento, 'sheetData');
    if (!dados) return [];
    return Array.from(dados.children).map((linha) => {
        const celulas = new Map();
        Array.from(linha.children).forEach((celula) => {
            const endereco = celula.getAttribute('r');
            if (!endereco) return;
            celulas.set(endereco.replace(/\d+/g, ''), { endereco, elemento: celula });
        });
        return celulas;
    });
}

function textoDaCelula(celula, strings) {
    const tipo = celula.getAttribute('t') || 'n';
    if (tipo === 'inlineStr') {
        const inline = primeiroFilho(celula, 't');
        return inline ? inline.textContent : '';
    }
    const valor = primeiroFilho(celula, 'v');
    if (!valor) return '';
    if (tipo === 's') return strings[Number(valor.textContent)] ?? '';
    return valor.textContent;
}

/**
 * Número escrito na célula do Valor da Causa: o texto do extrator usa vírgula
 * decimal e nunca ponto de milhar, então basta trocar a vírgula pelo ponto.
 * Devolve null quando o texto não é número (a célula não é reescrita).
 */
function numeroDoValor(texto) {
    const normalizado = String(texto).trim().replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(?:\.\d+)?$/.test(normalizado)) return null;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : null;
}

function normalizarCabecalho(texto) {
    return String(texto)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

/** Colunas de cadastro presentes no cabeçalho, na ordem canônica. */
function colunasReconhecidas(cabecalho, strings) {
    const porApelido = new Map();
    cabecalho.forEach(({ elemento }, letras) => {
        const chave = normalizarCabecalho(textoDaCelula(elemento, strings));
        if (!porApelido.has(chave)) porApelido.set(chave, letras);
    });
    return COLUNAS_DE_CADASTRO
        .map((coluna) => {
            const letras = coluna.apelidos.map((apelido) => porApelido.get(apelido)).find(Boolean);
            return letras ? { coluna, letras } : null;
        })
        .filter(Boolean);
}

/** Abas do pacote: XML, linhas, cabeçalho e colunas de cadastro reconhecidas. */
async function lerPacote(arquivo) {
    const zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
    const workbook = analisarXml(await textoDaParte(zip, 'xl/workbook.xml'));
    const relacoes = analisarXml(await textoDaParte(zip, 'xl/_rels/workbook.xml.rels'));
    const strings = textosCompartilhados(await textoDaParte(zip, 'xl/sharedStrings.xml'));
    const destinos = new Map(elementosPorNome(relacoes, 'Relationship').map((relacao) => [
        relacao.getAttribute('Id'),
        caminhoDaParte(relacao.getAttribute('Target'))
    ]));

    const abas = [];
    for (const aba of elementosPorNome(workbook, 'sheet')) {
        const caminho = destinos.get(aba.getAttribute('r:id')) || '';
        const xml = await textoDaParte(zip, caminho);
        if (!xml) continue;
        const linhas = linhasDaAba(analisarXml(xml));
        const cabecalho = linhas[0] || null;
        abas.push({
            nome: aba.getAttribute('name'),
            caminho,
            xml,
            linhas,
            cabecalho,
            colunas: cabecalho ? colunasReconhecidas(cabecalho, strings) : []
        });
    }
    return { zip, strings, abas };
}

/* -------------------------------------------------- reescrita e estilos -- */

const COR_LARANJA = 'FFFFA500';
const COR_VERMELHA = 'FFFF0000';

function escaparXml(texto) {
    return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Injeta preenchimentos sólidos (fills) e deriva novos cellXfs em styles.xml,
 * preservando fontes, bordas e alinhamento de cada célula. O formato de número
 * original é mantido, exceto no Valor da Causa, que passa para Geral.
 */
function criarPintorDeEstilos(stylesXml) {
    let xml = stylesXml;
    const doc = analisarXml(xml);
    const fillsNode = primeiroFilho(doc, 'fills');
    const cellXfsNode = primeiroFilho(doc, 'cellXfs');
    if (!fillsNode || !cellXfsNode) return null;

    const prefixo = fillsNode.prefix ? `${fillsNode.prefix}:` : '';
    const fills = elementosPorNome(fillsNode, 'fill');
    const xfs = elementosPorNome(cellXfsNode, 'xf');
    const serializador = new XMLSerializer();

    // O Valor da Causa passa para o formato Geral (numFmt 0) e recebe o número
    // de verdade. Um formato de moeda herdado exibiria "1.234,56"; o ponto de
    // milhar faz o sistema de destino ler o valor errado.
    const fillMap = new Map();
    let proximoFillId = fills.length;
    function obterOuCriarFill(cor) {
        if (fillMap.has(cor)) return fillMap.get(cor);
        const novoFill = `<${prefixo}fill><${prefixo}patternFill patternType="solid"><${prefixo}fgColor rgb="${cor}"/><${prefixo}bgColor indexed="64"/></${prefixo}patternFill></${prefixo}fill>`;
        xml = xml.replace(new RegExp(`</(?:\\w+:)?fills>`), `${novoFill}</${prefixo}fills>`);
        const id = proximoFillId;
        proximoFillId += 1;
        xml = xml.replace(new RegExp(`(<(?:\\w+:)?fills\\b[^>]*\\bcount=")\\d+(")`), `$1${proximoFillId}$2`);
        fillMap.set(cor, id);
        return id;
    }

    let proximoXfId = xfs.length;
    const xfMap = new Map();
    function obterOuCriarXf(sBase, cor, geral = false) {
        const s = Number(sBase) || 0;
        const chave = `${s}|${cor || ''}|${geral ? 'g' : ''}`;
        if (xfMap.has(chave)) return xfMap.get(chave);

        const xfOriginal = xfs[s] || xfs[0];
        if (!xfOriginal) return null;
        let atributos = '';
        Array.from(xfOriginal.attributes).forEach((attr) => {
            if (cor && (attr.name === 'fillId' || attr.name === 'applyFill')) return;
            if (geral && (attr.name === 'numFmtId' || attr.name === 'applyNumberFormat')) return;
            atributos += ` ${attr.name}="${attr.value}"`;
        });
        if (cor) atributos += ` fillId="${obterOuCriarFill(cor)}" applyFill="1"`;
        if (geral) atributos += ' numFmtId="0" applyNumberFormat="1"';

        // Filhos do xf (alignment/protection) entram no novo xf: alinhamento
        // da célula não pode mudar por causa de uma cor ou do formato Geral.
        const filhos = Array.from(xfOriginal.childNodes)
            .map((no) => serializador.serializeToString(no))
            .join('');
        const novoXf = `<${prefixo}xf${atributos}>${filhos}</${prefixo}xf>`;
        xml = xml.replace(new RegExp(`</(?:\\w+:)?cellXfs>`), `${novoXf}</${prefixo}cellXfs>`);
        const id = proximoXfId;
        proximoXfId += 1;
        xml = xml.replace(new RegExp(`(<(?:\\w+:)?cellXfs\\b[^>]*\\bcount=")\\d+(")`), `$1${proximoXfId}$2`);
        xfMap.set(chave, id);
        return id;
    }

    /** O xf já está no formato Geral (numFmt 0 ou sem numFmt declarado). */
    function ehGeral(sBase) {
        const xf = xfs[Number(sBase) || 0];
        return !xf || Number(xf.getAttribute('numFmtId') || 0) === 0;
    }

    return {
        obterXf: (sBase, cor) => obterOuCriarXf(sBase, cor),
        obterXfGeral: (sBase, cor) => obterOuCriarXf(sBase, cor, true),
        ehGeral,
        obterXml: () => xml,
        teveMudanca: () => proximoXfId > xfs.length
    };
}

/**
 * Ajusta o texto e/ou o estilo da célula.
 * Quando novoTexto é null/undefined, apenas o estilo é alterado mantendo o corpo.
 * Quando novoTexto é informado, o conteúdo vira inlineStr mantendo o mesmo prefixo.
 */
function ajustarCelula(xml, endereco, novoTexto, novoEstilo) {
    const elemento = new RegExp(`<((?:\\w+:)?c)\\b[^>]*\\br="${endereco}"[^>]*(?:/>|>[\\s\\S]*?</\\1>)`);
    return xml.replace(elemento, (encontrado, nome) => {
        const prefixo = nome.slice(0, nome.length - 1);
        const idxFecho = encontrado.indexOf('>');
        const autoFechado = encontrado[idxFecho - 1] === '/';
        const abertura = encontrado.slice(0, idxFecho).replace(/\/$/, '');
        let atributos = abertura.replace(/^<[^>\s/]+/, '');

        if (novoEstilo !== undefined && novoEstilo !== null) {
            if (/\bs="[^"]*"/.test(atributos)) {
                atributos = atributos.replace(/\bs="[^"]*"/, `s="${novoEstilo}"`);
            } else {
                atributos += ` s="${novoEstilo}"`;
            }
        }

        if (novoTexto === undefined || novoTexto === null) {
            return autoFechado ? `<${nome}${atributos}/>` : `<${nome}${atributos}>${encontrado.slice(idxFecho + 1)}`;
        }

        atributos = atributos.replace(/\s+t="[^"]*"/, '');
        return `<${nome}${atributos} t="inlineStr"><${prefixo}is><${prefixo}t>${escaparXml(novoTexto)}</${prefixo}t></${prefixo}is></${nome}>`;
    });
}

/**
 * Ajusta o estilo e/ou o número da célula. O valor sai como número do OOXML,
 * sem `t="inlineStr"`: o Excel trata a célula como número de verdade e não
 * marca "número armazenado como texto". Quando novoValor é null/undefined,
 * apenas o estilo muda e o corpo atual (o `<v>`) é mantido.
 */
function ajustarCelulaNumero(xml, endereco, novoValor, novoEstilo) {
    const elemento = new RegExp(`<((?:\\w+:)?c)\\b[^>]*\\br="${endereco}"[^>]*(?:/>|>[\\s\\S]*?</\\1>)`);
    return xml.replace(elemento, (encontrado, nome) => {
        const prefixo = nome.slice(0, nome.length - 1);
        const idxFecho = encontrado.indexOf('>');
        const autoFechado = encontrado[idxFecho - 1] === '/';
        const abertura = encontrado.slice(0, idxFecho).replace(/\/$/, '');
        let atributos = abertura.replace(/^<[^>\s/]+/, '').replace(/\s+t="[^"]*"/, '');

        if (novoEstilo !== undefined && novoEstilo !== null) {
            if (/\bs="[^"]*"/.test(atributos)) {
                atributos = atributos.replace(/\bs="[^"]*"/, `s="${novoEstilo}"`);
            } else {
                atributos += ` s="${novoEstilo}"`;
            }
        }

        if (novoValor === undefined || novoValor === null) {
            return autoFechado ? `<${nome}${atributos}/>` : `<${nome}${atributos}>${encontrado.slice(idxFecho + 1)}`;
        }

        return `<${nome}${atributos}><${prefixo}v>${novoValor}</${prefixo}v></${nome}>`;
    });
}


const VAZIO = { alteradas: 0, mantidas: 0, pintadas: 0, ignoradas: 0, naoConvertidas: 0 };

/** Calcula as substituições condicionais de valores e cores das células. */
function calcularNovosValoresECores(mapaLinha) {
    const novos = new Map();
    const cores = new Map();
    const texto = (chave) => (mapaLinha.get(chave) ? mapaLinha.get(chave).atual : '');

    // 1. Regra Carteira e Parte Ré
    const cart = texto('carteira');
    const pRe = texto('parteRe');
    if (cart) {
        const cartNorm = normalizarCabecalho(cart);
        if (cartNorm.includes('BRADESCO') && cartNorm.includes('INDENIZATORIA')) {
            if (mapaLinha.has('parteRe')) novos.set('parteRe', 'BANCO BRADESCO SA');
        } else if (cartNorm.includes('SANTANDER')) {
            // Se contiver Santander, a parte ré não é modificada e nem a carteira por nenhuma regra
        } else if (!cartNorm.includes('BRADESCO')) {
            const resolvido = pRe ? runTool('resolve-carteira-reu', pRe, {}) : null;
            const nCart = resolvido?.rows[0]?.[1] || '';
            const nReu = resolvido?.rows[0]?.[2] || '';
            if (nCart && nReu) {
                novos.set('carteira', nCart);
                novos.set('parteRe', nReu);
            } else {
                cores.set('carteira', COR_LARANJA);
                cores.set('parteRe', COR_LARANJA);
            }
        }
    }

    // 2. Regra Comarca
    if (mapaLinha.has('comarca')) {
        let com = normalizeNameValue(texto('comarca'));
        const comNorm = normalizarCabecalho(com);
        const comarcaEs = ehUnidadeJudiciaria(comNorm) ? comarcaPeloCodigoEs(texto('processo')) : null;
        if (comarcaEs) {
            // No ES, a célula pode trazer a unidade judiciária ("comarca da
            // capital", "juizado especial cível") no lugar da comarca. O código
            // da serventia (OOOO do CNJ) define a comarca correta.
            com = comarcaEs;
        } else if (comNorm.startsWith('ARACRUZ E IBIRACU')) {
            // O sistema de destino não aceita a comarca dupla.
            com = 'ARACRUZ';
        } else if (comNorm === 'BOM JESUS DE ITABAPOANA') {
            // O sistema de destino exige "do", não "de".
            com = 'BOM JESUS DO ITABAPOANA';
        } else if (comarcaEs === '') {
            // Código fora da tabela: mantém o nome escrito, sem cortar o texto.
        } else if (comNorm === 'CAPITAL') {
            const uf = texto('uf').toUpperCase().trim();
            if (CAPITAIS_POR_UF[uf]) com = CAPITAIS_POR_UF[uf];
        } else if (comNorm.includes('CAPITAL')) {
            const resto = com.replace(/\bCAPITAL\b/gi, '').replace(/^[\s\-_/:]+|[\s\-_/:]+$/g, '').trim();
            com = normalizeNameValue(resto);
        } else if (comNorm === 'JACAREPAGUA') {
            const orgao = normalizarCabecalho(texto('orgao'));
            if (orgao === 'JEC') com = 'FREGUESIA';
            else if (orgao === 'VC') com = 'TAQUARA';
        }
        novos.set('comarca', com);
    }

    // 3. Regra Tipo Audiencia
    if (mapaLinha.has('tipoAudiencia')) {
        const tAud = texto('tipoAudiencia').trim();
        const dAud = texto('dataAudiencia').trim();
        if (!tAud && dAud) {
            novos.set('tipoAudiencia', 'AC');
        }
    }

    // 4. Valor da Causa 0 -> laranja
    if (mapaLinha.has('valor')) {
        const val = texto('valor');
        const digits = val.replace(/\D/g, '');
        if (val.trim() === '0' || val.trim() === '0,00' || (digits.length > 0 && Number(digits) === 0)) {
            cores.set('valor', COR_LARANJA);
        }
    }

    // 5. Advogado Adverso "SEM ADVOGADO" e Órgão fora de JEC, JEA, JECRIM -> laranja
    if (mapaLinha.has('advogado') && mapaLinha.has('orgao')) {
        const adv = normalizeNameValue(texto('advogado'));
        if (adv === 'SEM ADVOGADO') {
            const org = normalizarCabecalho(texto('orgao'));
            if (!['JEC', 'JEA', 'JECRIM'].includes(org)) {
                cores.set('advogado', COR_LARANJA);
            }
        }
    }

    // 6. Num 0 e Órgão VC ou VU -> laranja
    if (mapaLinha.has('num') && mapaLinha.has('orgao')) {
        const num = texto('num').trim();
        const org = normalizarCabecalho(texto('orgao'));
        if ((num === '0' || num === '00') && ['VC', 'VU'].includes(org)) {
            cores.set('num', COR_LARANJA);
        }
    }

    // 7. Rito fora de Comum e Juizados -> laranja
    if (mapaLinha.has('rito')) {
        const rito = normalizarCabecalho(texto('rito'));
        if (rito && rito !== 'COMUM' && !rito.startsWith('JUIZAD')) {
            cores.set('rito', COR_LARANJA);
        }
    }

    // 8. Causa Raiz: se a Carteira não contiver Bradesco nem Santander -> vermelho
    if (mapaLinha.has('causaRaiz') && mapaLinha.has('carteira')) {
        const cartFinal = novos.get('carteira') || cart;
        const cartFinalNorm = normalizarCabecalho(cartFinal);
        if (!cartFinalNorm.includes('BRADESCO') && !cartFinalNorm.includes('SANTANDER')) {
            cores.set('causaRaiz', COR_VERMELHA);
        }
    }

    return { novos, cores };
}

/**
 * Aplica as transformações e preenchimentos de uma aba. Só reescreve a célula cujo
 * valor ou estilo muda; células vazias ou com fórmula ficam intactas.
 */
function processarAba(aba, strings, pintor) {
    const contagem = { ...VAZIO };
    const dados = aba.cabecalho ? aba.linhas.slice(1) : [];
    let xml = aba.xml;

    dados.forEach((celulas) => {
        const mapaLinha = new Map();
        aba.colunas.forEach(({ coluna, letras }) => {
            const celula = celulas.get(letras);
            if (celula) {
                mapaLinha.set(coluna.chave, {
                    coluna,
                    celula,
                    atual: textoDaCelula(celula.elemento, strings),
                    temFormula: Boolean(primeiroFilho(celula.elemento, 'f'))
                });
            }
        });

        const { novos, cores } = calcularNovosValoresECores(mapaLinha);

        mapaLinha.forEach(({ coluna, celula, atual, temFormula }, chave) => {
            if (temFormula) {
                contagem.ignoradas += 1;
                return;
            }

            let novoTexto = null;
            if (novos.has(chave)) {
                novoTexto = novos.get(chave);
            } else if (coluna.transformar) {
                if (!atual) {
                    contagem.ignoradas += 1;
                    return;
                }
                novoTexto = coluna.transformar(atual);
            }

            if (novoTexto === null && !coluna.transformar) {
                // Coluna informativa sem transformação
            } else if (novoTexto === null) {
                contagem.naoConvertidas += 1;
                return;
            }

            const tipoCelula = celula.elemento.getAttribute('t');
            const celulaNumerica = !tipoCelula || tipoCelula === 'n';
            const cor = cores.get(chave);
            const sBase = celula.elemento.getAttribute('s');

            // Valor da Causa: número de verdade no formato Geral. A célula
            // deixou de ser texto para o Excel não marcar "número armazenado
            // como texto" e para o destino não ler "1234,56" como 123456.
            if (chave === 'valor') {
                const numero = numeroDoValor(novoTexto);
                if (numero === null) {
                    contagem.naoConvertidas += 1;
                    return;
                }
                let estiloNumero = null;
                if (cor && pintor) {
                    estiloNumero = pintor.obterXfGeral(sBase, cor);
                    contagem.pintadas += 1;
                } else if (pintor && !pintor.ehGeral(sBase)) {
                    estiloNumero = pintor.obterXfGeral(sBase, null);
                }
                const valorMudou = !celulaNumerica || Number(atual) !== numero;
                if (!valorMudou && estiloNumero === null) {
                    contagem.mantidas += 1;
                    return;
                }
                if (valorMudou) {
                    contagem.alteradas += 1;
                } else {
                    contagem.mantidas += 1;
                }
                xml = ajustarCelulaNumero(xml, celula.endereco, valorMudou ? numero : null, estiloNumero);
                return;
            }

            const textoMudou = novoTexto !== null && novoTexto !== atual;

            let novoEstilo = null;
            if (cor && pintor) {
                novoEstilo = pintor.obterXf(sBase, cor);
                contagem.pintadas += 1;
            }

            if (!textoMudou && novoEstilo === null) {
                if (novoTexto !== null) contagem.mantidas += 1;
                return;
            }

            if (textoMudou) {
                contagem.alteradas += 1;
            } else {
                contagem.mantidas += 1;
            }

            xml = ajustarCelula(xml, celula.endereco, textoMudou ? novoTexto : null, novoEstilo);
        });
    });
    return { xml, contagem };
}

function somar(alvos, contagem) {
    alvos.alteradas += contagem.alteradas;
    alvos.mantidas += contagem.mantidas;
    alvos.pintadas += contagem.pintadas;
    alvos.ignoradas += contagem.ignoradas;
    alvos.naoConvertidas += contagem.naoConvertidas;
}

function doisDigitos(valor) {
    return String(valor).padStart(2, '0');
}

/** Cadastro-DD-MM-AAAA_HH-MM.xlsx, no relógio local. */
function nomeDeSaida(data) {
    const dia = `${doisDigitos(data.getDate())}-${doisDigitos(data.getMonth() + 1)}-${data.getFullYear()}`;
    const hora = `${doisDigitos(data.getHours())}-${doisDigitos(data.getMinutes())}`;
    return `Cadastro-${dia}_${hora}.xlsx`;
}

/* ------------------------------------------------------------- ponte do app -- */

function pedirPelaPonte(tipoResposta, dados) {
    return new Promise((resolve, reject) => {
        const requestId = window.ganRequestId();
        const encerrar = (erro, resposta) => {
            if (relogio !== null) window.clearTimeout(relogio);
            window.removeEventListener('message', receber);
            if (erro) reject(erro);
            else resolve(resposta);
        };
        const relogio = tipoResposta === 'gantoys-directory-picker-result'
            ? null
            : window.setTimeout(() => encerrar(new Error('A operação não respondeu.')), 120000);
        function receber(evento) {
            const mensagem = evento.data;
            if (!mensagem || mensagem.type !== tipoResposta || mensagem.requestId !== requestId) return;
            if (mensagem.error) {
                const erro = new Error(mensagem.error.message);
                erro.name = mensagem.error.name;
                encerrar(erro);
                return;
            }
            encerrar(null, mensagem);
        }
        window.addEventListener('message', receber);
        window.parent.postMessage({ type: tipoResposta.replace(/-result$/, '-request'), requestId, ...dados }, '*');
    });
}

/* ------------------------------------------------------------------- tela -- */

function mostrarMensagem(texto) {
    elementos.mensagem.textContent = texto;
    elementos.mensagem.classList.remove('hidden');
}

function limparMensagem() {
    elementos.mensagem.textContent = '';
    elementos.mensagem.classList.add('hidden');
}


function limparSaidas() {
    elementos.diagnostico.classList.add('hidden');
    elementos.diagnosticoLista.replaceChildren();
    elementos.diagnosticoResumo.textContent = '';
    elementos.resultado.classList.add('hidden');
    elementos.resultadoLista.replaceChildren();
    elementos.resultadoNumeros.replaceChildren();
    elementos.progresso.classList.remove('visible');
    elementos.progressoBarra.style.width = '0';
    elementos.progressoPorcento.textContent = '0%';
    elementos.progressoTitulo.textContent = 'Processando';
    elementos.progressoDetalhe.textContent = '-';
    limparMensagem();
}

function temColunasDeCadastro(pacote) {
    return Boolean(pacote) && pacote.abas.some((aba) => aba.colunas.length > 0);
}

function atualizarProcessar() {
    elementos.processar.disabled = !(Boolean(estado.destino) && temColunasDeCadastro(estado.pacote));
}

function itemComCabecalho(nome, classeDoItem, classeDoRotulo, textoDoRotulo, meta) {
    const item = document.createElement('div');
    item.className = classeDoItem;
    const cabecalho = document.createElement('div');
    cabecalho.className = 'result-item-head';
    const rotulo = document.createElement('span');
    rotulo.className = 'result-name';
    rotulo.textContent = nome;
    const contagem = document.createElement('span');
    contagem.className = classeDoRotulo;
    contagem.textContent = textoDoRotulo;
    cabecalho.append(rotulo, contagem);
    const linha = document.createElement('p');
    linha.className = 'result-meta';
    linha.textContent = meta;
    item.append(cabecalho, linha);
    return item;
}

function renderizarDiagnostico(abas) {
    elementos.diagnosticoLista.replaceChildren();
    abas.forEach((aba) => {
        elementos.diagnosticoLista.appendChild(itemComCabecalho(
            aba.nome,
            'result-item',
            'badge',
            `${aba.linhas.length} linhas`,
            aba.colunas.length
                ? `Colunas reconhecidas: ${aba.colunas.map(({ coluna }) => coluna.nome).join(', ')}.`
                : 'Nenhuma coluna reconhecida.'
        ));
    });
    const comColunas = abas.filter((aba) => aba.colunas.length > 0).length;
    elementos.diagnosticoResumo.textContent = `${abas.length} abas, ${comColunas} com colunas reconhecidas.`;
    elementos.diagnostico.classList.remove('hidden');
}

function renderizarResultado(nome, abas, contagem) {
    elementos.resultadoResumo.textContent = `${nome} gravado em ${estado.destino.name}.`;
    elementos.resultadoNumeros.replaceChildren();
    const itens = [
        [contagem.alteradas, 'alteradas']
    ];
    if (contagem.pintadas > 0) {
        itens.push([contagem.pintadas, 'pintadas']);
    }
    itens.push(
        [contagem.mantidas, 'sem mudança'],
        [contagem.ignoradas, 'ignoradas'],
        [contagem.naoConvertidas, 'não convertidas']
    );
    itens.forEach(([valor, rotulo]) => {
        const bloco = document.createElement('div');
        bloco.className = 'stat';
        const numero = document.createElement('strong');
        numero.textContent = String(valor);
        const legenda = document.createElement('span');
        legenda.textContent = rotulo;
        bloco.append(numero, legenda);
        elementos.resultadoNumeros.appendChild(bloco);
    });
    elementos.resultadoLista.replaceChildren();
    abas.forEach((aba) => {
        elementos.resultadoLista.appendChild(itemComCabecalho(
            aba.nome,
            aba.colunas.length ? 'result-item ok' : 'result-item',
            aba.colunas.length ? 'result-status ok' : 'result-status',
            `${aba.contagem.alteradas} células alteradas`,
            aba.colunas.length
                ? `Colunas processadas: ${aba.colunas.map(({ coluna }) => coluna.nome).join(', ')}.`
                : 'Nenhuma coluna reconhecida.'
        ));
    });
    elementos.resultado.classList.remove('hidden');
}

/* ---------------------------------------------------------------- fluxo -- */

async function selecionarPlanilha(arquivo) {
    limparSaidas();
    estado.pacote = null;
    const extensao = String(arquivo.name).split('.').pop().toLowerCase();
    if (!EXTENSOES_ACEITAS.includes(extensao)) {
        elementos.planilhaNome.textContent = 'Nenhuma planilha selecionada';
        elementos.planilhaNome.classList.remove('ready');
        mostrarMensagem(MENSAGEM_FORMATO);
        atualizarProcessar();
        return;
    }

    try {
        estado.pacote = await lerPacote(arquivo);
    } catch (erro) {
        estado.pacote = null;
    }

    if (!estado.pacote) {
        elementos.planilhaNome.textContent = 'Nenhuma planilha selecionada';
        elementos.planilhaNome.classList.remove('ready');
        mostrarMensagem(MENSAGEM_PACOTE);
        atualizarProcessar();
        return;
    }

    elementos.planilhaNome.textContent = arquivo.name;
    elementos.planilhaNome.classList.add('ready');
    renderizarDiagnostico(estado.pacote.abas);
    if (!temColunasDeCadastro(estado.pacote)) mostrarMensagem(MENSAGEM_SEM_COLUNA);
    atualizarProcessar();
}

async function processarPlanilha() {
    const { zip, strings, abas } = estado.pacote;
    const contagem = { ...VAZIO };
    const stylesXml = await textoDaParte(zip, 'xl/styles.xml');
    const pintor = criarPintorDeEstilos(stylesXml);

    abas.forEach((aba) => {
        const resultado = processarAba(aba, strings, pintor);
        aba.contagem = resultado.contagem;
        somar(contagem, resultado.contagem);
        if (resultado.contagem.alteradas || resultado.contagem.pintadas) {
            zip.file(aba.caminho, resultado.xml);
        }
    });

    if (pintor && pintor.teveMudanca()) {
        zip.file('xl/styles.xml', pintor.obterXml());
    }
    const nome = nomeDeSaida(new Date());
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    await pedirPelaPonte('gantoys-file-result', {
        action: 'write',
        directoryId: estado.destino.id,
        name: nome,
        bytes
    });

    elementos.progresso.classList.add('visible');
    elementos.progressoTitulo.textContent = 'Concluído';
    elementos.progressoPorcento.textContent = '100%';
    elementos.progressoBarra.style.width = '100%';
    elementos.progressoDetalhe.textContent = `${abas.length} abas processadas, ${contagem.alteradas} células alteradas.`;
    renderizarResultado(nome, abas, contagem);
}

/* ---------------------------------------------------------------- eventos -- */

elementos.escolherPlanilha.addEventListener('click', () => {
    elementos.arquivo.click();
});

elementos.arquivo.addEventListener('change', async () => {
    const arquivo = elementos.arquivo.files[0];
    if (!arquivo) return;
    await selecionarPlanilha(arquivo);
});

elementos.escolherDestino.addEventListener('click', async () => {
    try {
        const pasta = await pedirPelaPonte('gantoys-directory-picker-result', { mode: 'readwrite' });
        estado.destino = pasta.directory;
        elementos.destinoNome.textContent = estado.destino.name;
        elementos.destinoNome.classList.add('ready');
        limparMensagem();
    } catch (erro) {
        // AbortError é o cancelamento do diálogo: o app já explicou na tela dele.
        if (erro.name !== 'AbortError') mostrarMensagem(erro.message);
    }
    atualizarProcessar();
});

elementos.processar.addEventListener('click', async () => {
    try {
        await processarPlanilha();
    } catch (erro) {
        elementos.progresso.classList.add('visible');
        elementos.progressoTitulo.textContent = 'Interrompido';
        mostrarMensagem(erro.message);
    }
});
