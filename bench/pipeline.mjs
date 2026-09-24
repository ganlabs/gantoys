/**
 * Benchmarks do pipeline de entrega: gerar os manuais, gerar o bundle único e
 * validá-lo. O custo aqui é dominado pela inicialização do Node (cada passo é
 * um processo), então os orçamentos são folgados de propósito: servem para
 * pegar explosão de trabalho (bundle que passou a reler asset N vezes), não
 * micro-otimização.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { medir } from './lib/medir.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');

function rodar(script) {
    const resultado = spawnSync(process.execPath, [script], { cwd: RAIZ, encoding: 'utf8' });
    if (resultado.status !== 0) {
        throw new Error(`${script} falhou (${resultado.status}): ${resultado.stderr || resultado.stdout}`);
    }
    return resultado.stdout;
}

export async function benchmarksDePipeline() {
    const manuais = await medir('build/manual.mjs — reembutir os manuais', {
        async executar() {
            const saida = rodar('build/manual.mjs');
            if (!saida.includes('manuais embutidos')) throw new Error('manual.mjs não confirmou a geração');
        },
        repeticoes: 5,
        aquecimento: 1,
    });

    const bundle = await medir('build/bundle.mjs — gerar dist/index.html', {
        async executar() { rodar('build/bundle.mjs'); },
        repeticoes: 3,
        aquecimento: 1,
    });

    const validacao = await medir('build/check-bundle.mjs — validar o bundle', {
        async executar() {
            const saida = rodar('build/check-bundle.mjs');
            if (!saida.includes('VALIDAÇÃO OK')) throw new Error('check-bundle não terminou com VALIDAÇÃO OK');
        },
        repeticoes: 3,
        aquecimento: 1,
    });

    const bytes = statSync(path.join(RAIZ, 'dist', 'index.html')).size;
    const ajuda = statSync(path.join(RAIZ, 'toys', 'help', 'index.html')).size;
    const embutido = readFileSync(path.join(RAIZ, 'toys', 'help', 'index.html'), 'utf8').split('script type="text/markdown"').length - 1;

    const tamanho = {
        nome: `entrega — dist/index.html (${(bytes / 1024 / 1024).toFixed(2)} MB, ${embutido} manuais, ajuda ${(ajuda / 1024).toFixed(0)} KB)`,
        medianaMs: 0,
        p95Ms: 0,
        vazao: '—',
        orcamento: '≤ 8 MB',
        ok: bytes <= 8 * 1024 * 1024,
    };

    return [
        { ...manuais, vazao: `${embutido} manuais`, orcamento: '≤ 3 s', ok: manuais.medianaMs <= 3000 },
        { ...bundle, vazao: `${(bytes / 1024 / 1024).toFixed(2)} MB`, orcamento: '≤ 20 s', ok: bundle.medianaMs <= 20000 },
        { ...validacao, vazao: '—', orcamento: '≤ 5 s', ok: validacao.medianaMs <= 5000 },
        tamanho,
    ];
}
