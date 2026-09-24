/**
 * Medição de desempenho: aquecimento, repetições e percentis.
 *
 * O alvo é regressão grosseira (algoritmo que virou quadrático, laço que passou
 * a alocar por linha), não diferença de 5%. Por isso as medições são simples e
 * os orçamentos têm folga grande.
 */

import { performance } from 'node:perf_hooks';

/**
 * Roda `executar` algumas vezes após um aquecimento e devolve estatísticas.
 *
 * `preparar` é chamado uma vez e o que ele devolver é repassado para
 * `executar`; `descartar` limpa o que ficou (janelas do jsdom, por exemplo).
 */
export async function medir(nome, { preparar, executar, desfazer, repeticoes = 7, aquecimento = 2 }) {
    const contexto = preparar ? await preparar() : undefined;

    for (let i = 0; i < aquecimento; i += 1) await executar(contexto);

    const amostras = [];
    for (let i = 0; i < repeticoes; i += 1) {
        const inicio = performance.now();
        await executar(contexto);
        amostras.push(performance.now() - inicio);
    }

    if (desfazer) await desfazer(contexto);

    const ordenadas = [...amostras].sort((a, b) => a - b);
    const soma = amostras.reduce((total, valor) => total + valor, 0);
    return {
        nome,
        repeticoes,
        mediaMs: soma / amostras.length,
        medianaMs: ordenadas[Math.floor(ordenadas.length / 2)],
        p95Ms: ordenadas[Math.min(ordenadas.length - 1, Math.ceil(ordenadas.length * 0.95) - 1)],
        minMs: ordenadas[0],
        maxMs: ordenadas[ordenadas.length - 1],
    };
}

/** Mede uma taxa: quantos itens por segundo o passo processa. */
export function porSegundo(ms, itens) {
    return (itens / ms) * 1000;
}

export function formatarMs(valor) {
    return `${valor.toFixed(2)} ms`.padStart(11);
}

export function tabela(linhas) {
    const largura = Math.max(...linhas.map((linha) => linha.nome.length), 24);
    const saida = [];
    saida.push('');
    saida.push(`  ${'medição'.padEnd(largura)} ${'mediana'.padStart(11)} ${'p95'.padStart(11)} ${'vazão'.padStart(14)}  orçamento`);
    saida.push('-'.repeat(largura + 56));
    for (const linha of linhas) {
        const estado = linha.ok ? 'ok' : 'ESTOURADO';
        saida.push(
            `  ${linha.nome.padEnd(largura)} ${formatarMs(linha.medianaMs)} ${formatarMs(linha.p95Ms)} ${String(linha.vazao || '—').padStart(14)}  ${linha.orcamento} ${estado}`
        );
    }
    saida.push('');
    return saida.join('\n');
}
