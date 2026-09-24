/**
 * Harness das regras de divisão do NovoDiv (Divisor Automático Santander).
 *
 * O detector é uma tabela de regras (`START_PATTERNS`, `CLOSING_PATTERNS`,
 * marcadores de página de sistema, reconhecedores de documento novo) mais uma
 * pontuação. A regra de ouro do toy: **regra nova de divisão nunca pode mudar o
 * resultado de um processo que já funcionava**.
 *
 * Para isso o teste precisa de duas coisas que este módulo entrega:
 *
 *   - rodar o detector sobre páginas sintéticas, devolvendo a decisão crua
 *     (`{ start, end, confidence, flags, total }`) — sem passar pela interface;
 *   - LER e INJETAR regras na página viva (`regras()`, `injetarInicio()`,
 *     `injetarFim()`), para o teste provar que o corpus é sensível: uma regra
 *     nova que intercepte página antiga tem de fazer algum caso mudar.
 *
 * Cada regra do detector ganha um fragmento de texto aqui; o corpus
 * (`test/toys/gannovodiv-regras.test.js`) casa regra ↔ caso.
 */

import { carregarToy } from './toy.js';
import { criarPdfjsFake, criarTesseractFake } from './vendor.js';
import { puro } from './pagina.js';

/** Texto de enchimento: página com conteúdo real, sem marcação de sistema. */
export const CORRIDO = 'Laudo médico emitido em 10/01/2025 descrevendo o quadro clínico, os exames '
    + 'realizados, as medicações em uso e as recomendações de acompanhamento ambulatorial regular '
    + 'pelo paciente, assinado pelo profissional responsável com registro no conselho de classe.';

/** Página que o detector trata como "página de sistema" (não é do processo). */
export const SISTEMA = 'PÁGINA DE SEPARAÇÃO\nDocumento gerado automaticamente pelo sistema.';

/** Primeira página de uma petição inicial típica. */
export const INICIAL = 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL DA COMARCA\n\n'
    + 'A autora, já qualificada nos autos, vem propor a presente ação de cobrança em face da ré, '
    + 'pelos fatos e fundamentos que passa a expor.';

/** Página de fechamento com OAB (sinal forte de fim). */
export const FECHAMENTO = 'Ante o exposto, requer a procedência integral dos pedidos.\n'
    + 'Pede deferimento.\nSão Paulo, 10 de janeiro de 2025.\nAdvogado\nOAB/SP 123.456';

/**
 * Uma página de exemplo para cada regra de início, na mesma ordem de
 * `START_PATTERNS`. O índice é a chave que liga o caso à regra.
 */
export const FRAGMENTOS_DE_INICIO = [
    'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO',                       // 0
    'AO DOUTO JUÍZO DA VARA CÍVEL',                                       // 1
    'AO JUÍZO DA 2ª VARA CÍVEL',                                          // 2
    'AO JUÍZADO ESPECIAL CÍVEL',                                          // 3
    'EXMO. SR. DR. JUIZ DE DIREITO',                                      // 4
    'JUÍZO DE DIREITO DA VARA CÍVEL DA COMARCA',                          // 5
    'MERITÍSSIMO JUIZ DE DIREITO',                                        // 6
    'MERITISSIMO JUIZ DE DIREITO',                                        // 7
    'EXMO (A) SENHOR DOUTOR JUIZ',                                        // 8
    'EXMO. DR. JUIZ DE DIREITO',                                          // 9
    'DEFENSORIA PÚBLICA DO ESTADO',                                       // 10
    'DEFENSORIA PUBLICA DO ESTADO',                                       // 11
];

/** Uma página de fechamento para cada regra de fim, na ordem de `CLOSING_PATTERNS`. */
export const FRAGMENTOS_DE_FIM = [
    'Ante o exposto, pede deferimento.',                                  // 0
    'Ante o exposto, pede-se deferimento.',                               // 1
    'Requerente pede e espera o deferimento.',                            // 2
    'Requerente confia e espera o deferimento.',                          // 3
    'Requerente confia no deferimento.',                                  // 4
    'P. Deferimento.',                                                    // 5
    'Termos em que pede deferimento.',                                    // 6
    'Nestes Termos, pede deferimento.',                                   // 7
    'Nesses Termos, requer o deferimento.',                               // 8
    'Dá-se a causa o valor de R$ 10.000,00.',                             // 9
    'Sendo assim, requer a procedência.',                                 // 10
    'A consumidora requer deferimento imediato do pedido.',                // 11
    'VALOR DA CAUSA: R$ 10.000,00',                                       // 12
];

/** Páginas que o detector deve reconhecer como "documento novo" no meio dos autos. */
export const FRAGMENTOS_DE_DOCUMENTO_NOVO = {
    procuracao: 'PROCURAÇÃO AD JUDICIA\n\nOutorgante: Maria da Silva\nOutorgado: Advogado OAB/SP 123.456',
    resumo: 'Resumo financeiro do contrato com histórico de parcelas e valores atualizados.',
    crednet: 'CREDNET CONSULTAS\nDetalhamento do histórico de crédito do consumidor.',
    serasa: 'SERASA EXPERIAN\nRelatório de restrições e negativações do período consultado.',
    qrCode: 'QR-CODE DE CONFERÊNCIA\nDocumento emitido eletronicamente para conferência de autenticidade.',
    fls: 'fls. 145\nDocumento anexado aos autos para instrução do processo em questão.',
    processo: 'Processo: 0000001-02.2025.8.26.0100\nDOCUMENTO OFICIAL emitido pelo juízo competente.',
    termoNotificacao: 'TERMO DE NOTIFICAÇÃO\nNotificação de audiência de conciliação ao fornecedor.',
    conferirOriginal: 'Para conferir o original, acesse o PJe e informe o número do processo.',
    carteiraTrabalho: 'Carteira de Trabalho e Previdência Social\nRegistro de contrato de trabalho.',
    comprovante: 'COMPROVANTE DE PAGAMENTO\nPagamento efetuado em 10/01/2025 com autenticação bancária.',
    declaracao: 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA\nDeclaro para os devidos fins que não possuo condições.',
    certidao: 'CERTIDÃO DE OBJETO E PÉ\nCertifico que localizei o processo em referência.',
};

/** Documentos numerados por sistema, para exercitar `extractDocId`. */
export const FRAGMENTOS_DE_IDENTIFICADOR = {
    pje: `${CORRIDO}\nNum. 45 - Pág. 3`,
    projudi: `${CORRIDO}\nId. 7701 - Pág. 9`,
    eproc: 'Evento 12, PETICAO,\nDocumento protocolado eletronicamente pelo sistema eproc.',
    semIdentificador: CORRIDO,
};

/** Página que o detector marca como página de sistema por marcador forte. */
export const FRAGMENTOS_DE_SISTEMA = {
    separacao: SISTEMA,
    geradaPorSistema: 'Documento gerado automaticamente pelo sistema\nNão contém informação processual útil.',
    numeroProcesso: 'Nº do processo: 0000001-02.2025.8.26.0100\nData de autuação: 10/01/2025',
    classe: 'Classe: Procedimento Comum Cível\nÓrgão julgador: 1ª Vara Cível\nAssunto: Cobrança',
    curta: 'fls. 1',
    curtaComProcesso: 'PROCESSO 123',
};

/**
 * Página longa o bastante para o detector NÃO cair no OCR de emergência.
 *
 * A FASE 0.5 roda OCR quando as 10 primeiras páginas somam menos de 500
 * caracteres e substitui o texto pelo resultado do OCR — o corpus precisa medir
 * as REGRAS, então todas as páginas nascem acima desse limite.
 */
export function paginaComInicio(fragmento) {
    return `${CORRIDO}\n\n${fragmento}\n\n${CORRIDO}`;
}

/** Página longa com o trecho de fechamento no fim (as regras olham o rodapé). */
export function paginaComFim(fragmento) {
    return `${CORRIDO}\n\n${CORRIDO}\n\n${fragmento}`;
}

/** Página longa sem marcação nenhuma: só conteúdo corrido. */
export function paginaNeutra() {
    return `${CORRIDO}\n\n${CORRIDO}`;
}

/**
 * Abre a página do toy com um pdf.js falso controlado por este módulo.
 *
 * `detectar(paginas)` troca as páginas e devolve a decisão do detector;
 * `regras()` lê as tabelas vivas; `injetarInicio/injetarFim` acrescentam uma
 * regra NOVA no topo da tabela, como se tivesse vindo de um processo analisado
 * depois (é a simulação do fluxo "a LLM propôs uma regra nova").
 */
export async function abrirDetector(t) {
    let paginas = [CORRIDO];
    const pagina = await carregarToy('gannovodiv', {
        globais: {
            pdfjsLib: criarPdfjsFake(() => paginas),
            // Página sem texto levaria ao OCR: o dublê devolve texto vazio, para
            // a decisão depender só das regras, nunca do OCR.
            Tesseract: criarTesseractFake(['']),
        },
    });
    t.after(() => pagina.fechar());

    return {
        pagina,
        async detectar(novasPaginas) {
            paginas = novasPaginas;
            const decisao = await pagina.janela.detectInicialRange(new pagina.janela.Uint8Array(0));
            return puro(decisao);
        },
        regras() {
            return puro(pagina.script(`({
                inicio: START_PATTERNS.map(String),
                fim: CLOSING_PATTERNS.map(String),
                marcadores: STRONG_MARKERS.slice(),
                continuacao: CONTINUATION_WORDS.slice(),
            })`));
        },
        injetarInicio(fonte, flags = 'i') {
            pagina.script(`START_PATTERNS.unshift(new RegExp(${JSON.stringify(fonte)}, ${JSON.stringify(flags)}))`);
        },
        injetarFim(fonte, flags = 'i') {
            pagina.script(`CLOSING_PATTERNS.unshift(new RegExp(${JSON.stringify(fonte)}, ${JSON.stringify(flags)}))`);
        },
        /** A regra `indice` da tabela de início casa este texto? */
        casarInicio(indice, texto) {
            return pagina.script(`START_PATTERNS[${indice}].test(${JSON.stringify(texto)})`);
        },
        /** A regra `indice` da tabela de fim casa este texto? */
        casarFim(indice, texto) {
            return pagina.script(`CLOSING_PATTERNS[${indice}].test(${JSON.stringify(texto)})`);
        },
        /** Quantas regras da tabela de início casam este texto, e quais. */
        casamInicio(texto) {
            return puro(pagina.script(`START_PATTERNS.map((pat, indice) => (pat.test(${JSON.stringify(texto)}) ? indice : -1)).filter((indice) => indice >= 0)`));
        },
        /** Quantas regras da tabela de fim casam este texto, e quais. */
        casamFim(texto) {
            return puro(pagina.script(`CLOSING_PATTERNS.map((pat, indice) => (pat.test(${JSON.stringify(texto)}) ? indice : -1)).filter((indice) => indice >= 0)`));
        },
        /** O fechamento é aceito de verdade (regra + heurística de continuação)? */
        fechamentoReal(texto) {
            return pagina.script(`isRealClosing(${JSON.stringify(texto)})`);
        },
        classificadores() {
            return puro(pagina.script(`({
                sistemas: [
                    ['separacao', isSystemPage(${JSON.stringify(FRAGMENTOS_DE_SISTEMA.separacao)})],
                    ['geradaPorSistema', isSystemPage(${JSON.stringify(FRAGMENTOS_DE_SISTEMA.geradaPorSistema)})],
                    ['numeroProcesso', isSystemPage(${JSON.stringify(FRAGMENTOS_DE_SISTEMA.numeroProcesso)})],
                    ['classe', isSystemPage(${JSON.stringify(FRAGMENTOS_DE_SISTEMA.classe)})],
                    ['curta', isSystemPage(${JSON.stringify(FRAGMENTOS_DE_SISTEMA.curta)})],
                    ['curtaComProcesso', isSystemPage(${JSON.stringify(FRAGMENTOS_DE_SISTEMA.curtaComProcesso)})],
                    ['corrido', isSystemPage(${JSON.stringify(CORRIDO)})],
                ],
                documentosNovos: Object.entries(${JSON.stringify(FRAGMENTOS_DE_DOCUMENTO_NOVO)}).map(([chave, texto]) => [chave, isNewDocByContent(texto)]),
                identificadores: Object.entries(${JSON.stringify(FRAGMENTOS_DE_IDENTIFICADOR)}).map(([chave, texto]) => [chave, extractDocId(texto)]),
            })`));
        },
    };
}
