#!/usr/bin/env node
/**
 * Integridade dos assets de terceiros embutidos no entregável.
 *
 *   npm run assets:integrity            # confere
 *   node tools/assets-integrity.mjs --update   # regrava o manifesto
 *
 * O bundle embute `vendor/` inteiro (bootstrap, bootstrap-icons, jspdf, jszip,
 * pdf.js, pdf-lib, xlsx, sql.js) e os arquivos de `toys/shared/`. Sem uma
 * impressão digital registrada, uma troca silenciosa de arquivo nessa pasta
 * entraria no entregável sem ninguém notar. O manifesto guarda o sha256 de cada
 * arquivo: qualquer alteração vira falha explícita, e arquivo novo não
 * registrado também.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const MANIFESTO = path.join(RAIZ, 'tools', 'integridade-assets.json');
const PASTAS = ['vendor', 'toys/shared'];
const ARQUIVOS_SOLTOS = ['logo.png', 'favicon.png'];

function listar(dir = RAIZ, saida = []) {
    for (const nome of readdirSync(dir)) {
        const caminho = path.join(dir, nome);
        if (statSync(caminho).isDirectory()) listar(caminho, saida);
        else saida.push(path.relative(RAIZ, caminho).split(path.sep).join('/'));
    }
    return saida;
}

function arquivosMonitorados() {
    const lista = [];
    for (const pasta of PASTAS) {
        const absoluto = path.join(RAIZ, pasta);
        if (existsSync(absoluto)) lista.push(...listar(absoluto, []));
    }
    for (const solto of ARQUIVOS_SOLTOS) {
        if (existsSync(path.join(RAIZ, solto))) lista.push(solto);
    }
    return lista.sort();
}

function hash(relativo) {
    return createHash('sha256').update(readFileSync(path.join(RAIZ, relativo))).digest('hex');
}

const atualizar = process.argv.includes('--update');
const atual = Object.fromEntries(arquivosMonitorados().map((relativo) => [relativo, hash(relativo)]));

if (atualizar) {
    writeFileSync(MANIFESTO, `${JSON.stringify({ geradoPor: 'tools/assets-integrity.mjs', arquivos: atual }, null, 2)}\n`, 'utf8');
    console.log(`Manifesto regravado: ${Object.keys(atual).length} arquivos em tools/integridade-assets.json.`);
    process.exit(0);
}

if (!existsSync(MANIFESTO)) {
    console.error('FALHA: tools/integridade-assets.json não existe. Rode com --update e revise o diff antes de commitar.');
    process.exit(1);
}

const esperado = JSON.parse(readFileSync(MANIFESTO, 'utf8')).arquivos || {};
const alterados = [];
const ausentes = [];
const novos = [];

for (const [relativo, digest] of Object.entries(esperado)) {
    if (!(relativo in atual)) ausentes.push(relativo);
    else if (atual[relativo] !== digest) alterados.push(relativo);
}
for (const relativo of Object.keys(atual)) {
    if (!(relativo in esperado)) novos.push(relativo);
}

if (alterados.length) console.log(`Alterados (${alterados.length}):\n  ${alterados.join('\n  ')}`);
if (ausentes.length) console.log(`Ausentes (${ausentes.length}):\n  ${ausentes.join('\n  ')}`);
if (novos.length) console.log(`Novos sem registro (${novos.length}):\n  ${novos.join('\n  ')}`);

if (alterados.length || ausentes.length || novos.length) {
    console.error('\nFALHA: os assets monitorados não batem com o manifesto (tools/integridade-assets.json).');
    process.exit(1);
}

console.log(`Integridade OK: ${Object.keys(atual).length} assets de terceiros conferidos por sha256.`);
