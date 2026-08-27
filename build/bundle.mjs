#!/usr/bin/env node
/**
 * GAN Toys — gerador de bundle HTML único.
 *
 * Lê a aplicação (index.html + app.js + styles.css + vendor/) e os toys
 * (toys\/{nome}\/index.html + scripts + estilos) e produz um único arquivo
 * autocontido em dist/gantoys.html:
 *
 *   - CSS e JS locais ficam embutidos (style/script);
 *   - imagens e fontes locais viram data: URLs (base64);
 *   - cada toy vira um iframe <srcdoc> com HTML/CSS/JS já inline;
 *   - o worker do pdf.js vira um Blob URL criado no documento pai
 *     (os toys usam window.parent.__ganPdfWorkerUrl).
 *
 * Uso: node build/bundle.mjs
 * Saída: dist/gantoys.html (um único arquivo).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function read(relPath) {
    return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function bytes(relPath) {
    return readFileSync(path.join(ROOT, relPath));
}

function dataUrl(relPath) {
    const ext = path.extname(relPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    return `data:${mime};base64,${bytes(relPath).toString('base64')}`;
}

/** Escapa sequências que fechariam um bloco <script> ao embutir texto no bundle. */
function escapeScript(text) {
    return String(text).replace(/<\/script/gi, '<\\/script');
}

/**
 * Resolve uma referência encontrada dentro de um toy (ex.: "styles.css",
 * "../../logo.png", "../../vendor/x.js") para um caminho relativo ao ROOT.
 */
function resolveToyRef(toyName, href) {
    const normalized = path.posix.normalize(path.posix.join('toys', toyName, href));
    if (normalized.startsWith('../') || normalized.includes('..')) return null;
    const candidates = [normalized];
    const toyFallback = path.posix.normalize(href);
    if (toyFallback !== normalized) candidates.push(toyFallback);
    for (const candidate of candidates) {
        if (candidate.startsWith('..')) continue;
        if (existsSync(path.join(ROOT, candidate))) return candidate;
    }
    return null;
}

/** Troca url(...) de arquivos locais por data: URLs. */
function inlineCssUrls(css, baseRel) {
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, rawUrl) => {
        const clean = rawUrl.split('?')[0].trim();
        if (/^(data:|https?:|#)/i.test(clean)) return match;
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(baseRel), clean));
        if (resolved.startsWith('..') || !existsSync(path.join(ROOT, resolved))) return match;
        return `url("${dataUrl(resolved)}")`;
    });
}

/**
 * Escapa sequências que fechariam tags embutidas (<script>/<style>)
 * dentro de conteúdos que serão inlinados. No runtime JS/CSS a sequência
 * vira o texto original (\/ === /).
 */
function escapeInlineTags(text) {
    return String(text)
        .replace(/<\/script/gi, '<\\/script')
        .replace(/<\/style/gi, '<\\/style');
}

const WORKER_SRC_QUOTED = [
    `'../../vendor/pdfjs/pdf.worker.min.js'`,
    `"../../vendor/pdfjs/pdf.worker.min.js"`,
];

// ---------------------------------------------------------------------------
// Toys -> srcdoc
// ---------------------------------------------------------------------------

function buildToy(toyName) {
    const source = read(`toys/${toyName}/index.html`);
    let usesPdfWorker = false;
    let html = source;

    // <script src="X"></script> local -> inline
    html = html.replace(/<script\s+src=["']([^"']+)["']\s*><\/script>/gi, (match, src) => {
        if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) return match;
        const resolved = resolveToyRef(toyName, src);
        if (!resolved) {
            console.warn(`[bundle] toy ${toyName}: script não encontrado, mantendo referência: ${src}`);
            return match;
        }
        let content = escapeInlineTags(read(resolved));
        if (WORKER_SRC_QUOTED.some((token) => content.includes(token))) {
            usesPdfWorker = true;
            for (const token of WORKER_SRC_QUOTED) {
                content = content.split(token).join('(window.parent.__ganPdfWorkerUrl)');
            }
        }
        return `<script>\n${content}\n</script>`;
    });

    // <link rel="stylesheet" href="X"> local -> inline <style>
    html = html.replace(/<link\s+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
        if (/^(https?:)?\/\//i.test(href) || /^data:/i.test(href)) return match;
        const resolved = resolveToyRef(toyName, href);
        if (!resolved) {
            console.warn(`[bundle] toy ${toyName}: stylesheet não encontrada, mantendo referência: ${href}`);
            return match;
        }
        const css = escapeInlineTags(inlineCssUrls(read(resolved), resolved));
        return `<style>\n${css}\n</style>`;
    });

    // <link rel="icon" href="X"> -> data URL
    html = html.replace(/<link\s+rel=["'](?:icon|shortcut\s+icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
        if (/^(https?:)?\/\//i.test(href) || /^data:/i.test(href)) return match;
        const resolved = resolveToyRef(toyName, href);
        if (!resolved) return match;
        return match.replace(/href=["'][^"']+["']/, `href="${dataUrl(resolved)}"`);
    });

    // <img src="X"> -> data URL
    html = html.replace(/(<img\s+[^>]*?src=["'])([^"']+)(["'][^>]*>)/g, (match, pre, src, post) => {
        if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) return match;
        const resolved = resolveToyRef(toyName, src);
        if (!resolved) return match;
        return `${pre}${dataUrl(resolved)}${post}`;
    });

    // Atribuições de workerSrc que estejam em <script> inline do próprio index.html
    for (const token of WORKER_SRC_QUOTED) {
        if (html.includes(token)) {
            usesPdfWorker = true;
            html = html.split(token).join('(window.parent.__ganPdfWorkerUrl)');
        }
    }

    return { html, usesPdfWorker };
}

// ---------------------------------------------------------------------------
// Main document
// ---------------------------------------------------------------------------

function buildMain(toysMap, anyUsesPdfWorker) {
    let html = read('index.html');

    html = html.replace(
        /<link rel="icon" type="image\/png" href="favicon\.png">/,
        () => `<link rel="icon" type="image/png" href="${dataUrl('favicon.png')}">`
    );

    // bootstrap css -> inline
    html = html.replace(
        /<link rel="stylesheet" href="vendor\/bootstrap\/css\/bootstrap\.min\.css">/,
        () => `<style>\n${inlineCssUrls(read('vendor/bootstrap/css/bootstrap.min.css'), 'vendor/bootstrap/css/bootstrap.min.css')}\n</style>`
    );

    // bootstrap-icons css (com fontes em base64) -> inline
    const iconsCssRel = 'vendor/bootstrap-icons/font/bootstrap-icons.css';
    html = html.replace(
        /<link rel="stylesheet" href="vendor\/bootstrap-icons\/font\/bootstrap-icons\.css">/,
        () => `<style>\n${inlineCssUrls(read(iconsCssRel), iconsCssRel)}\n</style>`
    );

    // styles.css -> inline
    html = html.replace(
        /<link rel="stylesheet" href="styles\.css">/,
        () => `<style>\n${read('styles.css')}\n</style>`
    );

    // logo -> data URL
    html = html.replace(
        /<img src="logo\.png" alt="GAN" class="sidebar-logo"([^>]*)>/,
        (match, rest) => `<img src="${dataUrl('logo.png')}" alt="GAN" class="sidebar-logo"${rest}>`
    );

    // app.js -> inline + mapa de toys embutido
    // IMPORTANTE: usar função de substituição evita que \$& (ex.: "\\$&" do pdf-lib)
    // seja expandido pelo String.prototype.replace ao embutir app.js e o mapa de toys.
    const appJs = escapeScript(read('app.js'));
    const toysJson = escapeScript(JSON.stringify(toysMap));

    const injectedScripts = [
        `<script>window.GANTOYS_TOYS = ${toysJson};</script>`,
    ];
    if (anyUsesPdfWorker) {
        const workerB64 = readFileSync(path.join(ROOT, 'vendor/pdfjs/pdf.worker.min.js')).toString('base64');
        injectedScripts.unshift(`<script>window.GANTOYS_PDF_WORKER_B64 = "${workerB64}";</script>`);
    }

    html = html.replace(
        '<script src="app.js"></script>',
        () => `${injectedScripts.join('\n')}\n<script>\n${appJs}\n</script>`
    );

    return html;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const toyNames = readdirSync(path.join(ROOT, 'toys'))
    .filter((name) => statSync(path.join(ROOT, 'toys', name)).isDirectory())
    .filter((name) => existsSync(path.join(ROOT, 'toys', name, 'index.html')));

const toysMap = {};
let anyUsesPdfWorker = false;
for (const name of toyNames) {
    const { html, usesPdfWorker } = buildToy(name);
    toysMap[name] = html;
    if (usesPdfWorker) anyUsesPdfWorker = true;
    console.log(`[bundle] toy ${name}: ${(html.length / 1024).toFixed(0)} KB${usesPdfWorker ? ' [pdf worker]' : ''}`);
}

const bundle = buildMain(toysMap, anyUsesPdfWorker);

mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
writeFileSync(path.join(ROOT, 'dist', 'gantoys.html'), bundle, 'utf8');

console.log(`[bundle] dist/gantoys.html: ${(bundle.length / 1024 / 1024).toFixed(2)} MB (${toyNames.length} toys embutidos)`);