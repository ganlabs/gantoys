/**
 * Benchmarks das transformações de texto dos toys.
 *
 * As funções medidas são as do próprio toy, carregado pelo harness: em script
 * clássico, declarações `function` no topo do arquivo viram propriedades da
 * janela, então `pagina.janela.normalizeIris` é exatamente o código que roda no
 * navegador — sem cópia, sem reimplementação.
 */

import { carregarToy } from '../testkit/toy.js';
import { medir, porSegundo } from './lib/medir.mjs';

const LINHAS = 50000;

function listaDeProcessos() {
    const linhas = [];
    for (let i = 0; i < LINHAS; i += 1) {
        linhas.push(`${String(1000000 + i)}-${String(i % 100).padStart(2, '0')}.2024.8.26.0100`);
    }
    return linhas.join('\n');
}

function listaDeNomes() {
    const linhas = [];
    for (let i = 0; i < LINHAS; i += 1) {
        linhas.push(`João da Silva ${i}\tAutor\t12345678901`);
    }
    return linhas.join('\n');
}

function listaDeWildcard() {
    const linhas = [];
    for (let i = 0; i < LINHAS; i += 1) linhas.push(`PROCESSO-${i}-ENCERRADO`);
    return linhas.join('\n');
}

function listaDePastasIris() {
    const linhas = [];
    for (let i = 0; i < LINHAS; i += 1) linhas.push(`IRIS0${String(i).padStart(7, '0')}`);
    return linhas.join('\n');
}

function listaDeVaras() {
    const linhas = [];
    for (let i = 0; i < LINHAS; i += 1) {
        linhas.push(`${i + 1}ª VARA CÍVEL DA COMARCA DE SÃO PAULO/SP`);
    }
    return linhas.join('\n');
}

function listaDeValores() {
    const linhas = [];
    for (let i = 0; i < LINHAS; i += 1) linhas.push(`R$ 1.234,5${i % 10}`);
    return linhas.join('\n');
}

/** Cada entrada: toy, nome da função global, e o gerador do texto de entrada. */
const ALVOS = [
    { toy: 'gannormalizadornomes', funcao: 'normalizeNames', entrada: listaDeNomes, itens: LINHAS },
    { toy: 'ganremovedorsufixouf', funcao: 'transformByWildcard', entrada: listaDeWildcard, itens: LINHAS, argumentoExtra: '-*' },
    { toy: 'gannormalizadoriris', funcao: 'normalizeIris', entrada: listaDePastasIris, itens: LINHAS },
    { toy: 'ganclassificadorvara', funcao: 'classifyCourt', entrada: listaDeVaras, itens: LINHAS },
    { toy: 'ganextratorvalores', funcao: 'extractMoney', entrada: listaDeValores, itens: LINHAS },
    { toy: 'gannormalizadordocumentos', funcao: 'normalizeDocuments', entrada: listaDeProcessos, itens: LINHAS },
];

export async function benchmarksDeTransformacao() {
    const resultados = [];

    for (const alvo of ALVOS) {
        const pagina = await carregarToy(alvo.toy);
        const texto = alvo.entrada();

        const medicao = await medir(`${alvo.toy}.${alvo.funcao} (${(alvo.itens / 1000).toFixed(0)}k linhas)`, {
            preparar: () => texto,
            async executar(entrada) {
                const funcao = pagina.janela[alvo.funcao];
                if (typeof funcao !== 'function') throw new Error(`${alvo.toy}: ${alvo.funcao} não está exposta na janela`);
                const resultado = alvo.argumentoExtra !== undefined
                    ? funcao(entrada, alvo.argumentoExtra)
                    : funcao(entrada);
                if (resultado && typeof resultado.then === 'function') await resultado;
            },
            repeticoes: 5,
        });

        await pagina.fechar();
        resultados.push({
            ...medicao,
            vazao: `${Math.round(porSegundo(medicao.medianaMs, alvo.itens) / 1000)}k linhas/s`,
            orcamento: '≥ 20k linhas/s',
            ok: porSegundo(medicao.medianaMs, alvo.itens) >= 20000,
        });
    }

    return resultados;
}
