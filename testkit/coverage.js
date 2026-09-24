/**
 * Coleta de cobertura das páginas carregadas no jsdom.
 *
 * Cada arquivo de teste roda em um processo próprio (isolamento padrão do
 * `node --test`), então o mapa é acumulado em memória e gravado em
 * `.coverage/partial-<pid>.json` no fim do processo. `test/coverage/run.mjs`
 * junta os parciais e aplica os limites.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pacoteCobertura from 'istanbul-lib-coverage';

const { createCoverageMap } = pacoteCobertura;

const DIR = process.env.GANTOYS_COVERAGE_DIR
    ? path.resolve(process.env.GANTOYS_COVERAGE_DIR)
    : path.resolve(import.meta.dirname, '..', '.coverage');

const mapa = createCoverageMap({});
let gravado = false;
const finalizadores = [];

/**
 * Registra uma coleta a rodar no fim do processo, antes do arquivo parcial ser
 * gravado (janelas que o teste esqueceu de fechar entram por aqui).
 */
export function aoFinalizar(fn) {
    finalizadores.push(fn);
}

/** Junta o `__gancov__` de uma janela do jsdom no mapa do processo. */
export function coletar(janela) {
    const dados = janela?.__gancov__;
    if (!dados || typeof dados !== 'object') return;
    mapa.merge(createCoverageMap(JSON.parse(JSON.stringify(dados))));
}

function gravar() {
    if (gravado) return;
    gravado = true;
    for (const finalizar of finalizadores) {
        try { finalizar(); } catch { /* coleta é melhor esforço */ }
    }
    if (Object.keys(mapa.data).length === 0) return;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(
        path.join(DIR, `partial-${process.pid}-${Date.now()}.json`),
        JSON.stringify(mapa.data),
        'utf8'
    );
}

process.on('exit', gravar);
process.on('SIGINT', () => { gravar(); process.exit(130); });

/** Resumo do que já foi coletado neste processo (usado por smoke tests). */
export function resumoDoProcesso() {
    return mapa.data;
}
