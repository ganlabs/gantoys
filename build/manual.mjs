#!/usr/bin/env node
/**
 * GAN Toys — sincroniza os manuais Markdown com o toy de Ajuda.
 *
 * Fonte da verdade: `toys/help/manual/*.md` (um arquivo por toy, mais o
 * `index.md` de visão geral). O toy precisa abrir direto do disco (`file://`),
 * onde `fetch` de arquivo local não funciona, então cada manual é EMBUTIDO em
 * `toys/help/index.html` duas vezes:
 *
 *   - como card da grade (`<!-- manuals:cards:start -->` … `end`);
 *   - como `<script type="text/markdown" data-manual="…">` (`<!-- manuals:start -->` … `end`),
 *     lido pelo renderizador Markdown da própria página.
 *
 * O toy não depende deste script em runtime: ele só é necessário depois de
 * editar um `.md`. O workflow de release roda este comando antes do bundle,
 * para o entregável nunca sair com manual velho.
 *
 * Uso: node build/manual.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MANUAL_DIR = 'toys/help/manual';
const TOY_FILE = 'toys/help/index.html';
const INDICE = 'index';

const MARCADORES = {
    cards: ['<!-- manuals:cards:start -->', '<!-- manuals:cards:end -->'],
    manuais: ['<!-- manuals:start -->', '<!-- manuals:end -->'],
};

// O manual de visão geral não corresponde a um item da navegação.
const ICONES_ESPECIAIS = { [INDICE]: 'bi-info-circle' };

// Tags que quebrariam a página ao embutir Markdown cru dentro de um <script>.
const PROIBIDO_NO_MARKDOWN = [
    { teste: (md) => md.includes('</script'), motivo: 'contém a sequência </script (fecharia o bloco embutido)' },
    { teste: (md) => md.includes('<!-- manuals:'), motivo: 'contém um marcador de região do gerador' },
    { teste: (md) => /[\p{Emoji_Presentation}\uFE0F]/u.test(md), motivo: 'contém emoji (o contrato visual dos toys proíbe emoji)' },
];

function read(relPath) {
    return readFileSync(path.join(ROOT, relPath), 'utf8');
}

/**
 * Ordem e ícone de cada toy vêm da navegação do app (fonte única): um manual
 * novo não precisa de registro próprio, só existir em `toys/help/manual/`.
 */
function entradasDaNavegacao() {
    const html = read('index.html');
    const re = /<a href="#" class="nav-item[^"]*" data-toy="([^"]+)">\s*<i class="bi (bi-[\w-]+)"><\/i>\s*<span>([^<]+)<\/span>/g;
    const entradas = new Map();
    let achado;
    while ((achado = re.exec(html)) !== null) {
        entradas.set(achado[1], { icone: achado[2], rotulo: achado[3].trim() });
    }
    return entradas;
}

/** Primeiro parágrafo do manual: a descrição de uma linha que aparece no card. */
function resumir(md, limite = 150) {
    const linhas = md.split('\n').slice(1).map((linha) => linha.trim());
    const inicio = linhas.findIndex((linha) => linha && !linha.startsWith('#'));
    if (inicio < 0) return '';
    const paragrafo = [];
    for (let i = inicio; i < linhas.length && linhas[i]; i += 1) paragrafo.push(linhas[i]);

    const texto = paragrafo
        .join(' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

    if (texto.length <= limite) return texto;
    const corte = texto.slice(0, limite);
    return corte.slice(0, corte.lastIndexOf(' ')) + '…';
}

function tituloDoManual(md, fallback) {
    const achado = md.match(/^#\s+(.+?)\s*$/m);
    return achado ? achado[1] : fallback;
}

function card({ slug, titulo, descricao, icone }) {
    return [
        `<button class="tile manual-card" type="button" data-manual="${slug}">`,
        `    <i class="bi ${icone}" aria-hidden="true"></i>`,
        `    <span class="manual-card-title">${titulo}</span>`,
        `    <span class="manual-card-desc">${descricao}</span>`,
        '</button>',
    ].join('\n');
}

function blocoMarkdown({ slug, titulo, md }) {
    // O conteúdo do Markdown fica na coluna 0: indentação é significativa nele
    // (um `    # título` deixa de ser título). Só as tags do bloco são indentadas.
    return [
        `    <script type="text/markdown" data-manual="${slug}" data-title="${titulo}">`,
        md.replace(/\s+$/, ''),
        '    </script>',
    ].join('\n');
}

/** Substitui a região entre dois marcadores, preservando a indentação do arquivo. */
function trocarRegiao(html, [inicio, fim], conteudo, arquivo) {
    const de = html.indexOf(inicio);
    const ate = html.indexOf(fim);
    if (de < 0 || ate < 0 || ate < de) {
        throw new Error(`${arquivo}: marcadores ${inicio} / ${fim} não encontrados.`);
    }
    return html.slice(0, de + inicio.length) + '\n' + conteudo + '\n' + html.slice(ate);
}

function indentar(bloco, espacos) {
    const prefixo = ' '.repeat(espacos);
    return bloco.split('\n').map((linha) => (linha ? prefixo + linha : linha)).join('\n');
}

function main() {
    const arquivos = existsSync(path.join(ROOT, MANUAL_DIR))
        ? readdirSync(path.join(ROOT, MANUAL_DIR)).filter((nome) => nome.endsWith('.md'))
        : [];

    if (!arquivos.includes(`${INDICE}.md`)) {
        throw new Error(`${MANUAL_DIR}/${INDICE}.md não existe: é o manual de abertura da Ajuda.`);
    }

    const navegacao = entradasDaNavegacao();
    const manuais = new Map();

    for (const arquivo of arquivos) {
        const slug = arquivo.replace(/\.md$/, '');
        const md = read(`${MANUAL_DIR}/${arquivo}`);

        for (const regra of PROIBIDO_NO_MARKDOWN) {
            if (regra.teste(md)) throw new Error(`${MANUAL_DIR}/${arquivo}: ${regra.motivo}.`);
        }

        manuais.set(slug, {
            slug,
            md,
            titulo: tituloDoManual(md, navegacao.get(slug)?.rotulo || slug),
            descricao: resumir(md),
            icone: ICONES_ESPECIAIS[slug] || navegacao.get(slug)?.icone || 'bi-journal-text',
        });
    }

    // Visão geral primeiro, depois a ordem da navegação do app; manuais fora da
    // navegação entram no fim (em ordem alfabética) para não desaparecerem.
    const ordem = [INDICE, ...[...navegacao.keys()].filter((slug) => slug !== INDICE && manuais.has(slug))];
    const semNavegacao = [...manuais.keys()].filter((slug) => slug !== INDICE && !navegacao.has(slug)).sort();
    const lista = [...ordem, ...semNavegacao].filter((slug) => manuais.has(slug)).map((slug) => manuais.get(slug));

    if (semNavegacao.length) {
        console.warn(`[manual] sem item na navegação (usei ícone genérico): ${semNavegacao.join(', ')}`);
    }

    const semManual = [...navegacao.keys()].filter((slug) => slug !== 'home' && slug !== 'help' && !manuais.has(slug));
    if (semManual.length) {
        console.warn(`[manual] toys sem manual em ${MANUAL_DIR}: ${semManual.join(', ')}`);
    }

    let html = read(TOY_FILE);
    html = trocarRegiao(html, MARCADORES.cards, indentar(lista.map(card).join('\n'), 20), TOY_FILE);
    html = trocarRegiao(html, MARCADORES.manuais, lista.map(blocoMarkdown).join('\n\n'), TOY_FILE);

    writeFileSync(path.join(ROOT, TOY_FILE), html, 'utf8');

    const bytes = lista.reduce((total, manual) => total + manual.md.length, 0);
    console.log(`[manual] ${lista.length} manuais embutidos em ${TOY_FILE} (${(bytes / 1024).toFixed(0)} KB de Markdown)`);
}

main();
