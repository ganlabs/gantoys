/**
 * Instrumentação de cobertura (istanbul) para o JS dos toys e do app.
 *
 * O código é instrumentado antes de rodar no jsdom; o instrumentado escreve em
 * `window.__gancov__`, que `coverage.js` coleta e consolida por toy.
 *
 * Scripts de `vendor/` nunca são instrumentados: são dependências de terceiros,
 * não código do projeto — e medir cobertura sobre eles distorceria o número.
 */

import { createInstrumenter } from 'istanbul-lib-instrument';

const instrumenter = createInstrumenter({
    coverageVariable: '__gancov__',
    esModules: false,
    produceSourceMap: false,
    compact: false,
    preserveComments: true,
});

/**
 * Devolve o código instrumentado para a chave de cobertura informada.
 * A chave é o caminho relativo do arquivo (`toys/x/script.js`) ou um caminho
 * sintético para script inline (`toys/x/index.html#script-2`).
 */
export function instrumentar(codigo, chave) {
    return instrumenter.instrumentSync(codigo, chave);
}
