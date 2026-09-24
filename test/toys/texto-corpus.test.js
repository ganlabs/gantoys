import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CASOS, coletarGoldens } from '../../testkit/golden.js';

/**
 * Comportamento congelado dos toys de texto que compartilham o kit.
 *
 * Cada caso é processado pela interface real (textarea, botão, campos) e o
 * resultado na tela é comparado com `test/golden/texto.json`. É a rede de
 * proteção para mudanças estruturais no kit compartilhado: se um separador,
 * uma ordem, uma linha descartada ou um valor vazio mudar, este teste acusa
 * apontando o toy e o caso.
 *
 * Regravar só com mudança intencional (e revisando o diff do JSON):
 *   GANTOYS_ATUALIZAR_GOLDEN=1 node --test test/toys/texto-corpus.test.js
 */

const ARQUIVO = path.join(import.meta.dirname, '..', 'golden', 'texto.json');
const ATUALIZAR = process.env.GANTOYS_ATUALIZAR_GOLDEN === '1';

test('toys de texto — comportamento congelado (golden)', async (t) => {
    assert.ok(Object.keys(CASOS).length >= 8, 'o golden deve cobrir os oito toys de texto');

    const atual = await coletarGoldens();

    if (ATUALIZAR || !existsSync(ARQUIVO)) {
        mkdirSync(path.dirname(ARQUIVO), { recursive: true });
        writeFileSync(ARQUIVO, `${JSON.stringify(atual, null, 2)}\n`, 'utf8');
        t.diagnostic(`golden gravado em ${path.relative(process.cwd(), ARQUIVO)} (${Object.keys(atual).length} toys)`);
        return;
    }

    const esperado = JSON.parse(readFileSync(ARQUIVO, 'utf8'));

    assert.deepEqual(
        Object.keys(atual).sort(),
        Object.keys(esperado).sort(),
        'a lista de toys do golden mudou'
    );

    for (const slug of Object.keys(esperado)) {
        assert.deepEqual(atual[slug], esperado[slug], `${slug}: a saída na tela mudou em relação ao golden`);
    }
});
