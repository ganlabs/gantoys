#!/usr/bin/env node
/**
 * Benchmarks do GAN Toys.
 *
 *   npm run bench
 *
 * Mede três camadas: as transformações de texto dos toys (funções reais, no
 * jsdom), os fluxos de tela (digitar/processar/abrir manual) e o pipeline de
 * entrega (manuais, bundle, validação). Os resultados vão para
 * `bench/resultados.json` e os orçamentos são folgados: o alvo é regressão
 * grosseira, não micro-otimização.
 *
 * Rode com a máquina ociosa: qualquer coisa pesada em paralelo distorce tudo.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { benchmarksDeTransformacao } from './transformacoes.mjs';
import { benchmarksDeFluxo } from './fluxos.mjs';
import { benchmarksDePipeline } from './pipeline.mjs';
import { tabela } from './lib/medir.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');
const inicio = Date.now();

const camadas = [
    ['Transformações (funções reais dos toys)', await benchmarksDeTransformacao()],
    ['Fluxos (jsdom, caminho do usuário)', await benchmarksDeFluxo()],
    ['Pipeline de entrega', await benchmarksDePipeline()],
];

let estourou = 0;
for (const [titulo, linhas] of camadas) {
    console.log(`\n${titulo}`);
    console.log(tabela(linhas));
    estourou += linhas.filter((linha) => !linha.ok).length;
}

const resultado = {
    medidoEm: new Date().toISOString(),
    duracaoSegundos: Number(((Date.now() - inicio) / 1000).toFixed(1)),
    node: process.version,
    camadas: Object.fromEntries(camadas.map(([titulo, linhas]) => [titulo, linhas])),
};

writeFileSync(path.join(RAIZ, 'bench', 'resultados.json'), JSON.stringify(resultado, null, 2), 'utf8');
console.log(`Resultados em bench/resultados.json (${resultado.duracaoSegundos}s).\n`);

if (estourou > 0) {
    console.error(`FALHA: ${estourou} medição(ões) fora do orçamento.`);
    process.exit(1);
}
