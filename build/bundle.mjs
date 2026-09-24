#!/usr/bin/env node
/**
 * GAN Toys — gerador de bundle HTML único.
 *
 * Lê a aplicação (index.html + app.js + styles.css + vendor/) e os toys
 * (toys\/{nome}\/index.html + scripts + estilos) e produz um único arquivo
 * autocontido em dist/index.html:
 *
 *   - cada toy vira um iframe <srcdoc> com o HTML e o JS/CSS próprios inline;
 *   - assets compartilhados (vendor/, toys/shared/ e imagens da raiz) ficam
 *     UMA vez no documento pai, dentro de window.GANTOYS_ASSETS, e entram nos
 *     srcdoc como marcadores __ganasset:<caminho>; em tempo de carga o pai cria
 *     um Blob URL para cada um (o mesmo mecanismo do worker do pdf.js) e
 *     substitui os marcadores. Assim o bundle não carrega uma cópia do mesmo
 *     arquivo por toy;
 *   - imagens e fontes locais dos toys viram data: URLs (base64);
 *   - o worker do pdf.js é um asset do pai, exposto aos toys como
 *     window.parent.__ganPdfWorkerUrl.
 *
 * Uso: node build/bundle.mjs
 * Saída: dist/index.html (um único arquivo).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIME = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
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

// Assets que vão para o registro do documento pai (e não para dentro do srcdoc).
const SHARED_PREFIXES = ['vendor/', 'toys/shared/'];
// Formatos de fonte embutidos como texto; o resto é binário (base64).
const TEXT_EXT = new Set(['.js', '.css', '.mjs']);
const ASSET_TAG = '__ganasset:';

// ---------------------------------------------------------------------------
// Registro de assets compartilhados
// ---------------------------------------------------------------------------

/** chave (caminho relativo ao ROOT) -> { mime, text } | { mime, data } */
const REGISTRY = new Map();
const REGISTERING = new Set();

/**
 * Um caminho é compartilhado quando não é privado de um toy: vendor/,
 * toys/shared/ e arquivos da raiz (favicon.png, logo.png) entram no registro;
 * o que está dentro de toys/<nome>/ é embutido no srcdoc daquele toy.
 */
function isShared(relPath) {
    if (SHARED_PREFIXES.some((prefix) => relPath.startsWith(prefix))) return true;
    return !relPath.includes('/');
}

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

function getReleaseTag() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const todayUtc = `${y}.${m}.${d}`;

    let sha = '';
    try {
        sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch (e) {
        sha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';
    }

    return `v${todayUtc}-${sha}`;
}

/**
 * Resolve uma referência encontrada dentro de um toy (ex.: "styles.css",
 * "../../logo.png", "../../vendor/x.js") para um caminho relativo ao ROOT.
 */
function resolveToyRef(toyName, href) {
    const normalized = path.posix.normalize(path.posix.join('toys', toyName, href));
    if (normalized.startsWith('../')) return null;
    const candidates = [normalized];
    const toyFallback = path.posix.normalize(href);
    if (toyFallback !== normalized) candidates.push(toyFallback);
    for (const candidate of candidates) {
        if (candidate.startsWith('..')) continue;
        if (existsSync(path.join(ROOT, candidate))) return candidate;
    }
    return null;
}

/**
 * Remove de cada `src:` de @font-face os formatos que todo navegador atual lê
 * melhor como woff2 (woff/ttf/eot/otf). Sem woff2 na lista, nada é removido:
 * a fonte continua inteira para navegadores antigos.
 */
function keepOnlyWoff2(css) {
    return css.replace(/(\bsrc\s*:\s*)([^;}]+)/gi, (match, prefix, list) => {
        const parts = list.split(',');
        const kept = parts.filter((part) => {
            const found = part.match(/url\(\s*['"]?([^'")]+)/i);
            if (!found) return true;
            const ext = path.extname(found[1].split('?')[0]).toLowerCase();
            return ext !== '.woff' && ext !== '.ttf' && ext !== '.eot' && ext !== '.otf';
        });
        if (!kept.length || kept.length === parts.length) return match;
        return prefix + kept.join(',');
    });
}

/** Troca url(...) de arquivos locais por marcador de asset ou data: URL. */
function inlineCssUrls(css, baseRel) {
    return keepOnlyWoff2(css).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, rawUrl) => {
        const clean = rawUrl.split('?')[0].trim();
        if (/^(data:|https?:|#|blob:)/i.test(clean)) return match;
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(baseRel), clean));
        if (resolved.startsWith('..') || !existsSync(path.join(ROOT, resolved))) return match;
        if (isShared(resolved)) {
            registerAsset(resolved);
            return `url("${ASSET_TAG}${resolved}")`;
        }
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

/**
 * Põe o arquivo no registro do documento pai (uma única cópia no bundle).
 * Texto (JS/CSS) fica como string; binário (imagem/fonte) como data: URL.
 * O CSS passa por inlineCssUrls: url() de outro asset compartilhado vira
 * marcador, resolvido de forma recursiva em tempo de carga.
 */
function registerAsset(relPath) {
    if (REGISTRY.has(relPath) || REGISTERING.has(relPath)) return relPath;
    REGISTERING.add(relPath);
    try {
        const ext = path.extname(relPath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        if (TEXT_EXT.has(ext)) {
            const text = read(relPath);
            if (Buffer.compare(Buffer.from(text, 'utf8'), bytes(relPath)) !== 0) {
                throw new Error(`asset de texto não é UTF-8 válido: ${relPath}`);
            }
            REGISTRY.set(relPath, { mime, text: ext === '.css' ? inlineCssUrls(text, relPath) : text });
        } else {
            REGISTRY.set(relPath, { mime, data: dataUrl(relPath) });
        }
    } finally {
        REGISTERING.delete(relPath);
    }
    return relPath;
}

const WORKER_SRC_QUOTED = [
    `'../../vendor/pdfjs/pdf.worker.min.js'`,
    `"../../vendor/pdfjs/pdf.worker.min.js"`,
];
const PDF_WORKER = 'vendor/pdfjs/pdf.worker.min.js';

// ---------------------------------------------------------------------------
// Toys -> srcdoc
// ---------------------------------------------------------------------------

function buildToy(toyName) {
    const source = read(`toys/${toyName}/index.html`);
    let usesPdfWorker = false;
    let html = source;

    // Conteúdo embutido (JS/CSS do próprio toy) sai do HTML antes das buscas de
    // tag: um <img> ou url() citado em comentário de CSS não é referência real e
    // não pode virar data: URL dentro do comentário.
    const injected = [];
    const stash = (markup) => {
        injected.push(markup);
        return `\u0000gan${injected.length - 1}\u0000`;
    };

    // <script src="X"></script> local -> asset compartilhado ou inline
    html = html.replace(/<script\s+src=["']([^"']+)["']\s*><\/script>/gi, (match, src) => {
        if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) return match;
        const resolved = resolveToyRef(toyName, src);
        if (!resolved) {
            console.warn(`[bundle] toy ${toyName}: script não encontrado, mantendo referência: ${src}`);
            return match;
        }
        if (isShared(resolved)) {
            registerAsset(resolved);
            return `<script src="${ASSET_TAG}${resolved}"></script>`;
        }
        let content = escapeInlineTags(read(resolved));
        if (WORKER_SRC_QUOTED.some((token) => content.includes(token))) {
            usesPdfWorker = true;
            for (const token of WORKER_SRC_QUOTED) {
                content = content.split(token).join('(window.parent.__ganPdfWorkerUrl)');
            }
        }
        return stash(`<script>\n${content}\n</script>`);
    });

    // <link rel="stylesheet" href="X"> local -> asset compartilhado ou inline
    html = html.replace(/<link\s+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
        if (/^(https?:)?\/\//i.test(href) || /^data:/i.test(href)) return match;
        const resolved = resolveToyRef(toyName, href);
        if (!resolved) {
            console.warn(`[bundle] toy ${toyName}: stylesheet não encontrada, mantendo referência: ${href}`);
            return match;
        }
        if (isShared(resolved)) {
            registerAsset(resolved);
            return `<link rel="stylesheet" href="${ASSET_TAG}${resolved}">`;
        }
        const css = escapeInlineTags(inlineCssUrls(read(resolved), resolved));
        return stash(`<style>\n${css}\n</style>`);
    });

    // <link rel="icon" href="X"> -> asset compartilhado ou data URL
    html = html.replace(/<link\s+rel=["'](?:icon|shortcut\s+icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
        if (/^(https?:)?\/\//i.test(href) || /^data:/i.test(href)) return match;
        const resolved = resolveToyRef(toyName, href);
        if (!resolved) return match;
        const target = isShared(resolved) ? (registerAsset(resolved), ASSET_TAG + resolved) : dataUrl(resolved);
        return match.replace(/href=["'][^"']+["']/, `href="${target}"`);
    });

    // <img src="X"> -> asset compartilhado ou data URL
    html = html.replace(/(<img\s+[^>]*?src=["'])([^"']+)(["'][^>]*>)/g, (match, pre, src, post) => {
        if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) return match;
        const resolved = resolveToyRef(toyName, src);
        if (!resolved) return match;
        const target = isShared(resolved) ? (registerAsset(resolved), ASSET_TAG + resolved) : dataUrl(resolved);
        return `${pre}${target}${post}`;
    });

    // Atribuições de workerSrc que estejam em <script> inline do próprio index.html
    for (const token of WORKER_SRC_QUOTED) {
        if (html.includes(token)) {
            usesPdfWorker = true;
            html = html.split(token).join('(window.parent.__ganPdfWorkerUrl)');
        }
    }

    // eslint-disable-next-line no-control-regex -- \u0000 é marcador interno de stash, não aparece no HTML
    html = html.replace(/\u0000gan(\d+)\u0000/g, (match, index) => injected[Number(index)]);

    return { html, usesPdfWorker };
}

// ---------------------------------------------------------------------------
// Main document
// ---------------------------------------------------------------------------

/** Script do pai: registro dos assets + criador de Blob URL sob demanda. */
function assetRuntime() {
    return `<script>
window.GANTOYS_ASSETS = ${escapeScript(JSON.stringify(Object.fromEntries(
        [...REGISTRY].map(([key, asset]) => [key, asset.text !== undefined ? ['text', asset.mime, asset.text] : ['data', asset.mime, asset.data]])
    )))};
</script>
<script>
(function () {
    var urls = window.__ganAssetUrls = window.__ganAssetUrls || {};
    function dataUrlToBlob(entry) {
        var payload = entry[2].slice(entry[2].indexOf(',') + 1);
        var binary = atob(payload);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: entry[1] });
    }
    function valueOf(entry) {
        if (entry[0] !== 'text') return dataUrlToBlob(entry);
        return new Blob([window.ganAssetText(entry[2])], { type: entry[1] });
    }
    window.ganAssetUrl = function (key) {
        if (urls[key]) return urls[key];
        var entry = window.GANTOYS_ASSETS[key];
        if (!entry) { console.warn('asset ausente no bundle:', key); return null; }
        return (urls[key] = URL.createObjectURL(valueOf(entry)));
    };
    window.ganAssetText = function (text) {
        return String(text).replace(/__ganasset:([\\w./-]+)/g, function (match, key) {
            return window.ganAssetUrl(key) || match;
        });
    };
    var icons = window.ganAssetUrl('vendor/bootstrap-icons/font/bootstrap-icons.css');
    if (icons) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = icons;
        document.head.appendChild(link);
    }
})();
</script>`;
}

function buildMain(toysMap, anyUsesPdfWorker) {
    let html = read('index.html');

    // O worker do pdf.js é um asset como qualquer outro: registrado antes de o
    // runtime do pai ser gerado.
    if (anyUsesPdfWorker) registerAsset(PDF_WORKER);

    html = html.replace(
        /<link rel="icon" type="image\/png" href="favicon\.png">/,
        () => `<link rel="icon" type="image/png" href="${dataUrl('favicon.png')}">`
    );

    // bootstrap css -> inline
    html = html.replace(
        /<link rel="stylesheet" href="vendor\/bootstrap\/css\/bootstrap\.min\.css">/,
        () => `<style>\n${inlineCssUrls(read('vendor/bootstrap/css/bootstrap.min.css'), 'vendor/bootstrap/css/bootstrap.min.css')}\n</style>`
    );

    // bootstrap-icons css (com as fontes em Blob URL) + runtime dos assets.
    // O registro precisa existir antes do <link> do ícone entrar no <head>, para
    // o CSS ser pedido durante o parse (mesma posição/cascata de antes).
    const iconsCssRel = 'vendor/bootstrap-icons/font/bootstrap-icons.css';
    registerAsset(iconsCssRel);
    html = html.replace(
        /<link rel="stylesheet" href="vendor\/bootstrap-icons\/font\/bootstrap-icons\.css">/,
        () => assetRuntime()
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
        `<script>window.GANTOYS_RELEASE = ${JSON.stringify(getReleaseTag())};</script>`,
        `<script>window.GANTOYS_TOYS = ${toysJson};</script>`,
    ];

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

// nome do entregável — mantido igual ao lido por build/check-bundle.mjs
const OUTPUT_NAME = 'index.html';

mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
writeFileSync(path.join(ROOT, 'dist', OUTPUT_NAME), bundle, 'utf8');

const registryBytes = [...REGISTRY.values()].reduce((total, asset) => total + (asset.text ? asset.text.length : asset.data.length) + asset.mime.length + 16, 0);
console.log(`[bundle] assets compartilhados: ${REGISTRY.size} (${(registryBytes / 1024 / 1024).toFixed(2)} MB, uma cópia por asset)`);
console.log(`[bundle] dist/${OUTPUT_NAME}: ${(bundle.length / 1024 / 1024).toFixed(2)} MB (${toyNames.length} toys embutidos)`);
