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

// identidade: o logo do toy é o favicon.png (mesmo asset nos 15 toys)
const toyLogoDataUrl = `data:image/png;base64,${readFileSync('favicon.png').toString('base64')}`;

const layoutFails = [];
for (const t of Object.keys(map)) {
    const markup = map[t].replace(/<style[\s\S]*?<\/style>/gi, '');
    const missing = REQUIRED.filter((needle) => !markup.includes(needle));
    const stale = FORBIDDEN.filter((needle) => markup.includes(needle));

    if (!markup.includes(toyLogoDataUrl)) missing.push('logo (favicon.png)');

    // Emoji de verdade: apresentação padrão emoji (©/™/→ são pictográficos mas não emoji)
    const emoji = map[t].match(/[\p{Emoji_Presentation}\uFE0F]/gu);
    if (emoji) stale.push(`emoji: ${JSON.stringify([...new Set(emoji)].join(' '))}`);

    if (missing.length || stale.length) {
        layoutFails.push({ t, missing, stale });
        console.log(`  srcdoc ${t}: faltando ${JSON.stringify(missing)} | legado ${JSON.stringify(stale)}`);
    }
}
console.log('toys fora do contrato de layout:', layoutFails.length);

// 4) estrutura principal
console.log('worker b64 embutido:', html.includes('window.GANTOYS_PDF_WORKER_B64'));
console.log('srcdoc usado no app.js:', html.includes('iframe.srcdoc = bundled'));
console.log('tesseract CDN (externo, intencional):', html.includes('cdn.jsdelivr.net/npm/tesseract'));
console.log('data:image:', (html.match(/data:image\//g) || []).length);
console.log('data:font:', (html.match(/data:font\//g) || []).length);
console.log('tamanho total MB:', (html.length / 1024 / 1024).toFixed(2));

if (leftover > 0) {
    console.error('FALHA: há referências locais quebradas no bundle.');
    process.exit(1);
}
if (layoutFails.length > 0) {
    console.error('FALHA: toys fora do contrato de layout (toys/shared/toy.css).');
    process.exit(1);
}
console.log('VALIDAÇÃO OK');