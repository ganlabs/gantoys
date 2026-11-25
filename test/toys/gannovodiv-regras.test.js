import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    abrirDetector,
    SISTEMA,
    INICIAL,
    FECHAMENTO,
    FRAGMENTOS_DE_INICIO,
    FRAGMENTOS_DE_FIM,
    paginaComInicio,
    paginaComFim,
    paginaNeutra,
} from '../../testkit/novodiv.js';

/**
 * Guarda de regressão das REGRAS DE DIVISÃO do NovoDiv.
 *
 * Contrato do toy: **regra nova nunca pode quebrar regra antiga**. Sempre que
 * mais processos são analisados e novas regras entram na tabela (padrão de
 * início, padrão de fechamento, marcador de sistema), o resultado de todo
 * processo que já dividia certo precisa continuar idêntico.
 *
 * Como o guarda funciona:
 *   1. inventário — a tabela de regras viva é comparada com a registrada. Regra
 *      nova (ou removida) FALHA aqui, com o nome dela, obrigando a decisão
 *      consciente de registrar o caso correspondente;
 *   2. cobertura de regras — toda regra da tabela tem UM caso no corpus, então
 *      nenhuma regra entra sem prova;
 *   3. corpus congelado — cada caso tem a divisão esperada (start/end/score/
 *      flags) e qualquer mudança de comportamento em caso antigo FALHA,
 *      apontando o processo e a regra;
 *   4. sensibilidade — o teste injeta uma regra nova que intercepta páginas
 *      antigas e prova que o corpus REPROVA; e injeta uma regra nova inofensiva
 *      e prova que o corpus fica verde. Sem isso, o corpus poderia ser cego.
 *
 * Regravar o golden (só com mudança intencional, revisando o diff):
 *   GANTOYS_ATUALIZAR_GOLDEN=1 node --test test/toys/gannovodiv-regras.test.js
 */

const ARQUIVO = path.join(import.meta.dirname, '..', 'golden', 'novodiv-regras.json');
const ATUALIZAR = process.env.GANTOYS_ATUALIZAR_GOLDEN === '1';

/** Casos de pontuação e de nuance que não vêm de uma regra isolada. */
const CASOS_DE_NUANCE = [
    {
        id: 'pontuacao-peticao-curta',
        regra: 'pontuacao',
        descricao: 'Inicial + fechamento em 2 páginas: intervalo curto desconta 1 ponto',
        paginas: [INICIAL, FECHAMENTO],
    },
    {
        id: 'pontuacao-documento-longo',
        regra: 'pontuacao',
        descricao: 'Inicial seguida de 62 páginas de documento: intervalo longo desconta 1 ponto',
        paginas: [INICIAL, ...Array.from({ length: 62 }, () => paginaNeutra())],
    },
    {
        id: 'sem-inicio-fallback',
        regra: 'fallback',
        descricao: 'Nenhuma página tem saudação a juízo: início cai na primeira página, com revisão',
        paginas: [paginaNeutra(), paginaNeutra()],
    },
    {
        id: 'fechamento-com-continuacao',
        regra: 'continuacao',
        descricao: '"Pede deferimento da parte" não fecha (palavra de continuação), mas OAB fecha',
        paginas: [INICIAL, paginaComFim('Ante o exposto, pede deferimento da parte requerente conforme segue.')],
    },
    {
        id: 'fechamento-sem-oab',
        regra: 'fechamento-sem-oab',
        descricao: 'Fechamento sem OAB é confirmado por página de sistema seguinte',
        paginas: [INICIAL, paginaComFim(FECHAMENTO.replace('\nOAB/SP 123.456', '')), SISTEMA],
    },
    {
        id: 'sinal-de-oab',
        regra: 'sinal-oab',
        descricao: 'OAB na página basta como sinal de fim de petição',
        paginas: [INICIAL, paginaComFim('Advogado\nOAB/SP 999.999')],
    },
    {
        id: 'sinal-de-valor',
        regra: 'sinal-valor',
        descricao: 'Valor da causa em reais fecha a petição',
        paginas: [INICIAL, paginaComFim('Valor: R$ 5.000,00')],
    },
    {
        id: 'sinal-de-fls',
        regra: 'sinal-fls',
        descricao: 'Selo de fls. no fim da página fecha a petição',
        paginas: [INICIAL, paginaComFim('fls. 22')],
    },
    {
        id: 'procon-notificacao',
        regra: 'procon',
        descricao: 'TERMO DE NOTIFICAÇÃO abre o processo e vai até o fim',
        paginas: [SISTEMA, paginaComInicio('TERMO DE NOTIFICAÇÃO\nNotificação de audiência ao fornecedor.'), paginaNeutra()],
    },
    {
        id: 'procon-troca-de-identificador',
        regra: 'procon',
        descricao: 'PROCON: troca de identificador fecha a notificação',
        paginas: [SISTEMA, paginaComInicio('TERMO DE NOTIFICAÇÃO\nNotificação de audiência.'), paginaComInicio('Num. 7 - Pág. 1'), paginaComInicio('Num. 8 - Pág. 1')],
    },
    {
        id: 'eproc-inic1',
        regra: 'identificador-eproc',
        descricao: 'Página eproc INIC1 marca o início da inicial',
        paginas: [SISTEMA, paginaComInicio('Evento 1, INIC1,\n' + INICIAL), paginaComInicio('Evento 12, PETICAO,')],
    },
    {
        id: 'pje-troca-de-documento',
        regra: 'identificador-pje',
        descricao: 'Mudança de identificador PJe fecha a inicial',
        paginas: [SISTEMA, paginaComInicio('Num. 100 - Pág. 1\n' + INICIAL), paginaComInicio('Num. 100 - Pág. 2'), paginaComInicio('Num. 200 - Pág. 1')],
    },
    {
        id: 'ancora-inicio-depois-de-pagina-neutra',
        regra: 'ancora',
        descricao: 'Página neutra antes da inicial: o início é a página com saudação, não a primeira',
        paginas: [SISTEMA, paginaNeutra(), paginaComInicio(`${FRAGMENTOS_DE_INICIO[0]}\n\nA autora requer a procedência do pedido.`), FECHAMENTO],
    },
    {
        id: 'ancora-fim-por-fechamento-confirmado',
        regra: 'ancora',
        descricao: 'Fechamento com OAB seguido de página de sistema confirma o fim',
        paginas: [INICIAL, paginaComFim(FECHAMENTO), SISTEMA],
    },
    {
        id: 'ancora-fim-por-documento-novo',
        regra: 'ancora',
        descricao: 'Procuração depois da inicial fecha a petição',
        paginas: [INICIAL, paginaComFim(FECHAMENTO), paginaComInicio('PROCURAÇÃO AD JUDICIA\nOutorgado: Advogado OAB/SP 1.234')],
    },
];

/** Corpus completo: uma regra de início e uma de fim por índice + as nuances. */
function montarCorpus() {
    const corpus = [];

    FRAGMENTOS_DE_INICIO.forEach((fragmento, indice) => {
        corpus.push({
            id: `inicio-${indice}`,
            regra: `inicio:${indice}`,
            descricao: fragmento,
            paginas: [SISTEMA, paginaComInicio(`${fragmento}\n\nA autora requer a procedência do pedido.`), FECHAMENTO],
        });
    });

    FRAGMENTOS_DE_FIM.forEach((fragmento, indice) => {
        corpus.push({
            id: `fim-${indice}`,
            regra: `fim:${indice}`,
            descricao: fragmento,
            paginas: [INICIAL, paginaComFim(fragmento)],
        });
    });

    return [...corpus, ...CASOS_DE_NUANCE];
}

const CORPUS = montarCorpus();

/** Mede o corpus inteiro com as regras que estiverem na página. */
async function medirCorpus(detector) {
    const medicoes = {};
    for (const caso of CORPUS) {
        medicoes[caso.id] = await detector.detectar(caso.paginas);
    }
    return medicoes;
}

async function lerGolden() {
    return JSON.parse(readFileSync(ARQUIVO, 'utf8'));
}

test('NovoDiv regras — inventário: a tabela de regras só muda com caso novo registrado', async (t) => {
    const detector = await abrirDetector(t);
    const vivas = detector.regras();

    assert.ok(Array.isArray(vivas.inicio) && vivas.inicio.length > 0, 'START_PATTERNS não foi lida');
    assert.ok(vivas.fim.length > 0, 'CLOSING_PATTERNS não foi lida');

    if (ATUALIZAR || !existsSync(ARQUIVO)) {
        mkdirSync(path.dirname(ARQUIVO), { recursive: true });
        const medido = await medirCorpus(detector);
        const golden = {
            geradoPor: 'GANTOYS_ATUALIZAR_GOLDEN=1 node --test test/toys/gannovodiv-regras.test.js',
            inventario: vivas,
            // Quais regras casam cada fragmento: é o que acusa regra nova
            // interceptando página antiga, mesmo sem mudar o caso do corpus.
            casamento: {
                inicio: FRAGMENTOS_DE_INICIO.map((fragmento) => detector.casamInicio(fragmento)),
                fim: FRAGMENTOS_DE_FIM.map((fragmento) => detector.casamFim(fragmento)),
            },
            classificadores: detector.classificadores(),
            casos: Object.fromEntries(CORPUS.map((caso) => [caso.id, {
                regra: caso.regra,
                descricao: caso.descricao,
                paginas: caso.paginas,
                esperado: medido[caso.id],
            }])),
        };
        writeFileSync(ARQUIVO, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
        t.diagnostic(`golden gravado em ${path.relative(process.cwd(), ARQUIVO)} (${CORPUS.length} casos)`);
        return;
    }

    const golden = await lerGolden();

    for (const [campo, valor] of Object.entries(vivas)) {
        const esperado = golden.inventario[campo];
        const novas = valor.filter((item) => !esperado.includes(item));
        const removidas = esperado.filter((item) => !valor.includes(item));
        const reordenadas = novas.length === 0 && removidas.length === 0
            && JSON.stringify(valor) !== JSON.stringify(esperado);

        assert.deepEqual(
            { novas, removidas, reordenadas },
            { novas: [], removidas: [], reordenadas: false },
            [
                `A tabela de regras "${campo}" mudou.`,
                novas.length ? `Regras novas: ${JSON.stringify(novas)}` : '',
                removidas.length ? `Regras removidas: ${JSON.stringify(removidas)}` : '',
                reordenadas ? 'A ORDEM das regras mudou (a ordem decide qual regra ganha a página).' : '',
                'Cada regra nova precisa de um caso no corpus (test/toys/gannovodiv-regras.test.js)',
                'e de um golden regravado; nenhum caso antigo pode mudar de resultado.',
            ].filter(Boolean).join('\n')
        );
    }
});

test('NovoDiv regras — toda regra da tabela tem um caso no corpus', async (t) => {
    const detector = await abrirDetector(t);
    const vivas = detector.regras();

    const exigidas = [
        ...vivas.inicio.map((_, indice) => `inicio:${indice}`),
        ...vivas.fim.map((_, indice) => `fim:${indice}`),
    ];
    const presentes = new Set(CORPUS.map((caso) => caso.regra));
    const semCaso = exigidas.filter((regra) => !presentes.has(regra));
    const casoOrfao = [...presentes].filter((regra) => regra.includes(':') && !exigidas.includes(regra));

    assert.deepEqual(semCaso, [], `Regra sem caso no corpus: ${semCaso.join(', ')}. Adicione um caso em test/toys/gannovodiv-regras.test.js que só ela resolva.`);
    assert.deepEqual(casoOrfao, [], `Caso apontando para regra inexistente: ${casoOrfao.join(', ')}.`);
});

test('NovoDiv regras — cada processo do corpus mantém a divisão congelada', async (t) => {
    const golden = await lerGolden();
    const detector = await abrirDetector(t);

    const divergentes = [];
    for (const caso of CORPUS) {
        const esperado = golden.casos[caso.id]?.esperado;
        assert.ok(esperado, `caso ${caso.id} não está no golden (regenere com GANTOYS_ATUALIZAR_GOLDEN=1)`);
        const medido = await detector.detectar(caso.paginas);
        if (JSON.stringify(medido) !== JSON.stringify(esperado)) {
            divergentes.push({ caso: caso.id, regra: caso.regra, esperado, medido });
        }
    }

    assert.deepEqual(
        divergentes,
        [],
        'REGRA DE DIVISÃO MUDOU O RESULTADO DE UM PROCESSO QUE JÁ FUNCIONAVA:\n'
        + divergentes.map((linha) => `  ${linha.caso} (regra ${linha.regra}) esperado ${JSON.stringify(linha.esperado)} veio ${JSON.stringify(linha.medido)}`).join('\n')
    );
});

test('NovoDiv regras — uma regra nova que intercepta página antiga faz o corpus reprovar', async (t) => {
    // Regra de FECHAMENTO gulosa (`/./`): casa qualquer página com texto, como
    // faria uma regra nova escrita larga demais a partir de um processo novo.
    const detectorFim = await abrirDetector(t);
    const antesFim = await medirCorpus(detectorFim);
    detectorFim.injetarFim('.');
    const depoisFim = await medirCorpus(detectorFim);
    const alteradosPeloFim = Object.keys(antesFim).filter((id) => JSON.stringify(antesFim[id]) !== JSON.stringify(depoisFim[id]));

    assert.ok(
        alteradosPeloFim.length >= 5,
        `o corpus precisa ACUSAR regra de fim que casa página demais, mas só ${alteradosPeloFim.length} caso(s) mudaram`
    );

    // Regra de INÍCIO gulosa: precisa reprovar ao menos o caso em que existe
    // página neutra antes da petição (senão regra larga passaria batido).
    const detectorInicio = await abrirDetector(t);
    const antesInicio = await medirCorpus(detectorInicio);
    detectorInicio.injetarInicio('\\S');
    const depoisInicio = await medirCorpus(detectorInicio);
    const alteradosPeloInicio = Object.keys(antesInicio).filter((id) => JSON.stringify(antesInicio[id]) !== JSON.stringify(depoisInicio[id]));

    assert.ok(
        alteradosPeloInicio.length >= 1,
        'o corpus precisa ACUSAR regra de início que casa página demais (falta caso com página neutra antes da inicial)'
    );
});

test('NovoDiv regras — regra nova inofensiva não muda nenhum processo antigo', async (t) => {
    const golden = await lerGolden();
    const detector = await abrirDetector(t);

    // Duas regras novas que não casam nenhuma página do corpus: uma de início e
    // uma de fim. É o caso saudável de "processo novo trouxe um padrão a mais".
    detector.injetarInicio('PADRAO_DE_PROCESSO_NOVO_QUE_NAO_EXISTE_AQUI');
    detector.injetarFim('OUTRO_PADRAO_DE_FECHAMENTO_INEXISTENTE');

    const divergentes = [];
    for (const caso of CORPUS) {
        const medido = await detector.detectar(caso.paginas);
        if (JSON.stringify(medido) !== JSON.stringify(golden.casos[caso.id].esperado)) {
            divergentes.push(caso.id);
        }
    }

    assert.deepEqual(divergentes, [], `regra inofensiva não pode mexer em caso existente, mas mudou: ${divergentes.join(', ')}`);
});

test('NovoDiv regras — cada fragmento é casado pela SUA regra, e por nenhuma anterior', async (t) => {
    const golden = await lerGolden();
    const detector = await abrirDetector(t);
    const falhas = [];

    const conferir = (rotulo, fragmentos, casam, linhaDourada) => {
        fragmentos.forEach((fragmento, indice) => {
            const casamAgora = casam(fragmento);

            if (!casamAgora.includes(indice)) {
                falhas.push(`${rotulo} ${indice}: a própria regra não casa mais "${fragmento}"`);
            }

            const novasColisoes = casamAgora.filter((outro) => !linhaDourada[indice].includes(outro));
            if (novasColisoes.length) {
                falhas.push(`${rotulo} ${indice}: regra(s) ${novasColisoes.join(', ')} passaram a casar "${fragmento}" — página antiga sendo interceptada`);
            }

            const perdidas = linhaDourada[indice].filter((outro) => !casamAgora.includes(outro));
            if (perdidas.length) {
                falhas.push(`${rotulo} ${indice}: regra(s) ${perdidas.join(', ')} deixaram de casar "${fragmento}"`);
            }
        });
    };

    conferir('início', FRAGMENTOS_DE_INICIO, (texto) => detector.casamInicio(texto), golden.casamento.inicio);
    conferir('fim', FRAGMENTOS_DE_FIM, (texto) => detector.casamFim(texto), golden.casamento.fim);

    FRAGMENTOS_DE_FIM.forEach((fragmento, indice) => {
        if (!detector.fechamentoReal(paginaComFim(fragmento).split('\n').slice(-20).join('\n'))) {
            falhas.push(`fim ${indice}: o fechamento "${fragmento}" deixou de ser aceito pela heurística de continuação`);
        }
    });

    assert.deepEqual(falhas, [], `regra nova está interceptando página antiga:\n${falhas.join('\n')}`);
});

test('NovoDiv regras — o corpus mede as regras, não o OCR de emergência', async () => {
    const golden = await lerGolden();
    const comOcr = Object.entries(golden.casos)
        .filter(([, caso]) => (caso.esperado.flags || []).includes('OCR'))
        .map(([id]) => id);

    assert.deepEqual(comOcr, [], `caso caindo no OCR de emergência: ${comOcr.join(', ')} (as páginas do corpus precisam passar de 500 caracteres)`);
});

test('NovoDiv regras — classificadores de página continuam decidindo igual', async (t) => {
    const golden = await lerGolden();
    const detector = await abrirDetector(t);
    const medido = detector.classificadores();

    assert.deepEqual(medido, golden.classificadores, 'classificador de página de sistema / documento novo / identificador mudou');
});

test('NovoDiv correções — fechamento intermediário não corta a cauda da inicial', async (t) => {
    const detector = await abrirDetector(t);
    const mesmaPagina = (id, texto) => `Num. ${id} - Pág. 1\n${texto}`;

    const comIdentificador = await detector.detectar([
        mesmaPagina(100, INICIAL),
        mesmaPagina(100, paginaComFim('Nestes termos, pede deferimento.\nOAB/SP 123.456')),
        mesmaPagina(100, paginaNeutra()),
        mesmaPagina(100, FECHAMENTO),
        mesmaPagina(200, paginaNeutra()),
    ]);
    assert.deepEqual(
        { start: comIdentificador.start, end: comIdentificador.end },
        { start: 1, end: 4 }
    );

    const comAssinaturaSeparada = await detector.detectar([
        INICIAL,
        paginaComFim('Nestes termos, pede deferimento.\nOAB/SP 123.456'),
        paginaComFim('São Paulo, 10 de janeiro de 2025.\nAdvogado\nOAB/SP 123.456'),
        SISTEMA,
    ]);
    assert.deepEqual(
        { start: comAssinaturaSeparada.start, end: comAssinaturaSeparada.end },
        { start: 1, end: 3 }
    );
});

test('NovoDiv correções — frase de fechamento citada não encerra a inicial', async (t) => {
    const detector = await abrirDetector(t);
    const decisao = await detector.detectar([
        INICIAL,
        paginaComFim('A mensagem registra: “Sendo assim, comunicamos a reversão do valor correspondente”.'),
        paginaNeutra(),
        FECHAMENTO,
        SISTEMA,
    ]);

    assert.deepEqual({ start: decisao.start, end: decisao.end }, { start: 1, end: 4 });
});

test('NovoDiv correções — identificadores compostos e rodapé vazio preservam o fim correto', async (t) => {
    const detector = await abrirDetector(t);
    const eproc = await detector.detectar([
        SISTEMA,
        `Evento 1, INIC1,\n${INICIAL}`,
        `Evento 1, INIC1,\n${paginaNeutra()}`,
        `Evento 1, ANEXOS PET INI2,\n${paginaNeutra()}`,
    ]);
    assert.deepEqual({ start: eproc.start, end: eproc.end }, { start: 2, end: 3 });

    const pje = await detector.detectar([
        SISTEMA,
        `Num. 100 - Pág. 1\n${INICIAL}`,
        `Num. 100 - Pág. 2\n${paginaComFim('Nestes termos, pede deferimento.\nRosilene\nOAB RJ 119174')}`,
        'Num. 100 - Pág. 3\nAssinado eletronicamente por: AUTORA\nhttps://pje.example/documento\nNúmero do documento: 1',
        `Num. 200 - Pág. 1\n${paginaNeutra()}`,
    ]);
    assert.deepEqual({ start: pje.start, end: pje.end }, { start: 2, end: 3 });
});

test('NovoDiv correções — candidato alternativo considera a primeira página do novo documento', async (t) => {
    const detector = await abrirDetector(t);
    const pje = (id, pagina, texto) => `Num. ${id} - Pág. ${pagina}\n${texto}`;
    const decisao = await detector.detectar([
        pje(10, 1, paginaComFim('Ao Juízo competente se requer a juntada.')),
        pje(20, 1, INICIAL),
        pje(20, 2, paginaNeutra()),
        pje(20, 3, paginaNeutra()),
        pje(20, 4, paginaComFim(`Ao Juízo competente.\n${FECHAMENTO}`)),
        pje(20, 5, paginaComFim('Advogado\nOAB/SP 123.456')),
        pje(30, 1, paginaNeutra()),
    ]);

    assert.deepEqual({ start: decisao.start, end: decisao.end }, { start: 2, end: 6 });
});

test('NovoDiv correções — documento INIC posterior impede PROCON anexo de virar inicial', async (t) => {
    const detector = await abrirDetector(t);
    const decisao = await detector.detectar([
        SISTEMA,
        `Evento 1, RG1,\n${paginaComInicio('TERMO DE NOTIFICAÇÃO\nNOTIFICAÇÃO DE AUDIÊNCIA')}`,
        `Evento 1, RG1,\n${paginaNeutra()}`,
        `Evento 1, INIC2,\n${INICIAL}`,
        `Evento 1, INIC2,\n${FECHAMENTO}`,
        `Evento 1, OUT3,\n${paginaNeutra()}`,
    ]);

    assert.deepEqual({ start: decisao.start, end: decisao.end }, { start: 4, end: 5 });
    assert.equal(decisao.flags.includes('PROCON'), false);
});

test('NovoDiv correções — capas e formulários anexos não entram na inicial', async (t) => {
    const detector = await abrirDetector(t);
    const capa = `Num. 10 - Pág. 1\n${'EM ANEXO J.V '.repeat(20)}`;
    const fallback = await detector.detectar([
        SISTEMA,
        capa,
        `Num. 20 - Pág. 1\n${paginaNeutra()}`,
        `Num. 20 - Pág. 2\n${FECHAMENTO}`,
        `Num. 30 - Pág. 1\n${paginaNeutra()}`,
    ]);
    assert.deepEqual({ start: fallback.start, end: fallback.end }, { start: 3, end: 4 });

    const boleto = await detector.detectar([
        INICIAL,
        paginaNeutra(),
        `Local de pagemento\n${paginaNeutra()}`,
    ]);
    assert.deepEqual({ start: boleto.start, end: boleto.end }, { start: 1, end: 2 });

    const formulario = await detector.detectar([
        INICIAL,
        paginaNeutra(),
        `Recebi 1 folhas\n${paginaNeutra()}`,
    ]);
    assert.deepEqual({ start: formulario.start, end: formulario.end }, { start: 1, end: 2 });
});

test('NovoDiv correções — atos judiciais e petições incidentais não viram inicial', async (t) => {
    const detector = await abrirDetector(t);
    const decisao = await detector.detectar([
        paginaComInicio('AO JUÍZO DA VARA CÍVEL\nPROCESSO Nº: 1\nBANCO SANTANDER, já qualificado nos autos, vem informar o encerramento do mandato.'),
        paginaComInicio('EXCELENTÍSSIMO SENHOR JUIZ\nRef. Processo 1\nBANCO S.A. requerer a juntada dos instrumentos de mandato.'),
        paginaComInicio('TRIBUNAL DE JUSTIÇA\nEXPEDIENTE DE INTIMAÇÃO\nPor ordem do Excelentíssimo Juiz, intime-se a parte.'),
        INICIAL,
        FECHAMENTO,
    ]);

    assert.deepEqual({ start: decisao.start, end: decisao.end }, { start: 4, end: 5 });
});

test('NovoDiv correções — OCR antecede o fallback quando as primeiras páginas são imagens', async (t) => {
    const detector = await abrirDetector(t, {
        ocr: [INICIAL, paginaNeutra(), paginaNeutra(), paginaNeutra(), FECHAMENTO],
    });
    const decisao = await detector.detectar([
        '', '', '', '', '',
        ...Array.from({ length: 29 }, () => ''),
        paginaNeutra(),
    ]);

    assert.deepEqual({ start: decisao.start, end: decisao.end }, { start: 1, end: 5 });
    assert.equal(decisao.flags.includes('OCR'), true);
});

test('NovoDiv correções — inicial original de processo antecedente prevalece sobre a incorporadora', async (t) => {
    const detector = await abrirDetector(t);
    const decisao = await detector.detectar([
        SISTEMA,
        `Evento 1, INIC1,\nAO DOUTO JUÍZO DE DIREITO\nProcessos antecedentes: nº 1000000-00.2025.8.26.0001\n${paginaNeutra()}`,
        `Evento 1, INIC1,\n${FECHAMENTO}`,
        `Num. 500 - Pág. 1\nPara conferir o original, acesse o portal.\nAO JUÍZO DE DIREITO DA VARA CÍVEL\nA autora vem propor a presente ação.\n${paginaNeutra()}`,
        `Num. 500 - Pág. 2\n${FECHAMENTO}\nfls. 16`,
        'Num. 500 - Pág. 3\nAssinado eletronicamente por: AUTORA\nDocumento anexo:\nPara conferir o original, acesse o portal.',
    ]);

    assert.deepEqual({ start: decisao.start, end: decisao.end }, { start: 4, end: 5 });
    assert.equal(decisao.flags.includes('review'), true);
});
