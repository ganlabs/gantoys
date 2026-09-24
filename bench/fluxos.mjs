/**
 * Benchmarks de fluxo: o caminho completo do usuário dentro do jsdom.
 *
 * Mede o custo por linha de um processamento de ponta a ponta (digitar, clicar,
 * ler o resultado) e a abertura dos manuais do toy de Ajuda. Serve para pegar
 * regressão grosseira de interação (laço que remonta a lista inteira a cada
 * item, por exemplo), não para medir o jsdom.
 */

import { carregarToy } from '../testkit/toy.js';
import { medir, porSegundo } from './lib/medir.mjs';

const LINHAS = 2000;

function listaDeProcessos() {
    const linhas = [];
    for (let i = 0; i < LINHAS; i += 1) linhas.push(`0000001${String(i % 100).padStart(2, '0')}20248260100`);
    return linhas.join('\n');
}

export async function benchmarksDeFluxo() {
    const resultados = [];

    const pagina = await carregarToy('ganpadronizadorcnj');
    const entrada = listaDeProcessos();

    const medicao = await medir(`ganpadronizadorcnj — processar ${LINHAS} linhas na tela`, {
        preparar: () => entrada,
        async executar(texto) {
            pagina.digitar('#processInput', texto);
            pagina.clicar('#processBtn');
            const itens = pagina.todos('.result-item').length;
            if (itens !== LINHAS) throw new Error(`esperava ${LINHAS} itens, veio ${itens}`);
        },
        repeticoes: 3,
        aquecimento: 1,
    });
    await pagina.fechar();

    resultados.push({
        ...medicao,
        vazao: `${Math.round(porSegundo(medicao.medianaMs, LINHAS))} linhas/s`,
        // O custo aqui é dominado pelo DOM do jsdom (~10x mais lento que um
        // navegador de verdade). O orçamento existe para pegar regressão de
        // ordem de grandeza (remontar a lista a cada linha, por exemplo).
        orcamento: '≥ 150 linhas/s',
        ok: porSegundo(medicao.medianaMs, LINHAS) >= 150,
    });

    const ajuda = await carregarToy('help');
    const manuais = ajuda.todos('#manualGrid [data-manual]').map((no) => no.dataset.manual);

    const medicaoAjuda = await medir(`help — abrir os ${manuais.length} manuais`, {
        preparar: () => manuais,
        async executar(lista) {
            for (const slug of lista) {
                ajuda.clicar(`.manual-card[data-manual="${slug}"]`);
                const titulo = ajuda.seletor('#manualContent h1').textContent;
                if (!titulo) throw new Error(`manual ${slug} sem título`);
            }
        },
        repeticoes: 3,
        aquecimento: 1,
    });
    await ajuda.fechar();

    const porManual = (medicaoAjuda.medianaMs / manuais.length) * 1000;
    resultados.push({
        ...medicaoAjuda,
        vazao: `${Math.round(porManual)} µs/manual`,
        orcamento: '≤ 50 ms/manual',
        ok: porManual <= 50000,
    });

    return resultados;
}
