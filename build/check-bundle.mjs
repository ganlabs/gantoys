import { readFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const marker = '<script>window.GANTOYS_TOYS = ';
const start = html.indexOf(marker) + marker.length;
const end = html.indexOf('};</script>', start);

if (start < 0 || end < 0) {
    console.error('marcador do mapa de toys não encontrado');
    process.exit(1);
}

let map;
try {
    // inclui o '}' fechador: end aponta para o '}' de '};</script>'
    map = JSON.parse(html.slice(start, end + 1));
    console.log('JSON GANTOYS_TOYS OK — toys:', Object.keys(map).length);
    console.log('toys:', Object.keys(map).join(', '));
} catch (e) {
    console.error('JSON FAIL:', e.message);
    process.exit(1);
}

// 0) registro de assets compartilhados do documento pai
const assetsMarker = 'window.GANTOYS_ASSETS = ';
const assetsStart = html.indexOf(assetsMarker) + assetsMarker.length;
const assetsEnd = html.indexOf(';\n</script>', assetsStart);

let assets = {};
if (assetsStart < assetsMarker.length || assetsEnd < 0) {
    console.error('marcador do registro de assets não encontrado');
    process.exit(1);
}
try {
    assets = JSON.parse(html.slice(assetsStart, assetsEnd));
    console.log('JSON GANTOYS_ASSETS OK — assets:', Object.keys(assets).length);
} catch (e) {
    console.error('JSON GANTOYS_ASSETS FAIL:', e.message);
    process.exit(1);
}

// 1) nenhum </script> cru dentro dos srcdoc (fecharia o script embutido antes da hora)
let rawTotal = 0;
for (const t of Object.keys(map)) {
    const raw = map[t].split('</script>').length - 1;
    if (raw) {
        rawTotal += raw;
        const i = map[t].indexOf('</script>');
        console.log(`  srcdoc ${t}: ${raw} ocorrência(s) — ctx:`, JSON.stringify(map[t].slice(Math.max(0, i - 60), i + 40)));
    }
}
console.log('srcdocs com </script> cru:', rawTotal);

// 2) referências locais quebradas (../../) que ficaram nos srcdoc
// (blocos <style> saem da varredura: comentários de CSS não são referências)
let leftover = 0;
for (const t of Object.keys(map)) {
    const markup = map[t].replace(/<style[\s\S]*?<\/style>/gi, '');
    const refs = markup.match(/(?:src|href)="(?:\.\.\/)+[^"]+"/g) || [];
    if (refs.length) {
        leftover += refs.length;
        console.log(`  srcdoc ${t}: referências locais restantes:`, refs.slice(0, 5));
    }
}
console.log('referências locais restantes nos toys:', leftover);

// 3) contrato de layout: o markup de todo toy usa a casca canônica do shared
// (o CSS embutido é removido antes da checagem: o contrato aparece comentado nele)
const REQUIRED = ['<main class="shell">', '<header class="brand">', 'class="brand-logo"'];
const FORBIDDEN = [
    'toy-header', 'tool-card', 'glass-container', 'gondim-card', 'btn-gold', 'primary-btn', 'secondary-btn',
    // vocabulários locais substituídos pelos componentes do shared
    'btn-tiny', 'btn-control', 'control-card-surface', 'mode-choice', 'app-toast', 'toast-container-custom',
    'mini-log', 'file-badge', 'file-item-badge', 'badge-green', 'badge-yellow', 'badge-red',
    'panel active', 'modal-overlay active',
    // sistemas de ícone concorrentes
    'lucide', 'lucide-react',
];

// identidade: o logo do toy é o favicon.png (asset compartilhado do bundle)
const toyLogoDataUrl = `data:image/png;base64,${readFileSync('favicon.png').toString('base64')}`;
const toyLogoAsset = '__ganasset:favicon.png';

const layoutFails = [];
for (const t of Object.keys(map)) {
    const markup = map[t].replace(/<style[\s\S]*?<\/style>/gi, '');
    const missing = REQUIRED.filter((needle) => !markup.includes(needle));
    const stale = FORBIDDEN.filter((needle) => markup.includes(needle));

    if (!markup.includes(toyLogoAsset) && !markup.includes(toyLogoDataUrl)) missing.push('logo (favicon.png)');

    // Emoji de verdade: apresentação padrão emoji (©/™/→ são pictográficos mas não emoji)
    const emoji = map[t].match(/[\p{Emoji_Presentation}\uFE0F]/gu);
    if (emoji) stale.push(`emoji: ${JSON.stringify([...new Set(emoji)].join(' '))}`);

    if (missing.length || stale.length) {
        layoutFails.push({ t, missing, stale });
        console.log(`  srcdoc ${t}: faltando ${JSON.stringify(missing)} | legado ${JSON.stringify(stale)}`);
    }
}
console.log('toys fora do contrato de layout:', layoutFails.length);

// 3.1) todo marcador __ganasset: precisa existir no registro do pai — inclusive
// os que aparecem dentro do conteúdo dos próprios assets (CSS -> fonte)
const registered = new Set(Object.keys(assets));
const missingRefs = new Map();
const sources = [...Object.entries(map), ...Object.entries(assets).map(([k, v]) => [`asset:${k}`, v[2]])];
for (const [name, text] of sources) {
    for (const ref of String(text).match(/__ganasset:([\w./-]+)/g) || []) {
        const key = ref.slice('__ganasset:'.length);
        if (!registered.has(key)) missingRefs.set(`${name} -> ${key}`, true);
    }
}
for (const ref of missingRefs.keys()) console.log('  referência sem asset no registro:', ref);
console.log('referências de asset órfãs:', missingRefs.size);

// 4) estrutura principal
const assetEntries = Object.values(assets);
const registryBytes = assetEntries.reduce((total, entry) => total + entry[2].length, 0);
console.log('worker do pdf como asset:', registered.has('vendor/pdfjs/pdf.worker.min.js'));
console.log('runtime de assets no app.js:', html.includes('window.ganAssetText(bundled)'));
console.log('tesseract CDN (externo, intencional):', html.includes('cdn.jsdelivr.net/npm/tesseract'));
console.log('registry MB:', (registryBytes / 1024 / 1024).toFixed(2), '| assets:', assetEntries.length);
console.log('data:image:', (html.match(/data:image\//g) || []).length);
console.log('data:font:', (html.match(/data:font\//g) || []).length);
console.log('tamanho total MB:', (html.length / 1024 / 1024).toFixed(2));

if (leftover > 0) {
    console.error('FALHA: há referências locais quebradas no bundle.');
    process.exit(1);
}
if (missingRefs.size > 0) {
    console.error('FALHA: há marcadores de asset sem entrada no registro.');
    process.exit(1);
}
if (layoutFails.length > 0) {
    console.error('FALHA: toys fora do contrato de layout (toys/shared/toy.css).');
    process.exit(1);
}
console.log('VALIDAÇÃO OK');