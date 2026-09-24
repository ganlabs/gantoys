/**
 * Atalhos para carregar toys no harness.
 *
 * Cada toy declara aqui só o que precisa do `vendor/`: pdf-lib e JSZip são puros
 * e rodam de verdade; pdf.js, jspdf e tesseract.js são substituídos pelo dublê
 * correspondente (o teste passa o dublê em `globais`).
 */

import { carregarPagina } from './pagina.js';
import { criarPdfjsFake } from './vendor.js';

export const VENDOR = {
    'pdf-lib': 'vendor/pdf-lib/',
    jszip: 'vendor/jszip/',
    xlsx: 'vendor/xlsx/',
};

// pdf.js não roda no jsdom: os toys que o usam recebem o dublê já no
// carregamento (o script do toy toca `pdfjsLib.GlobalWorkerOptions` no topo).
const COM_PDFJS = { globais: { pdfjsLib: () => criarPdfjsFake([]) } };

const PADRAO_POR_TOY = {
    gancompressor: COM_PDFJS,
    gandivisorsantander: { ...COM_PDFJS, vendor: [VENDOR['pdf-lib']] },
    gannovodiv: { ...COM_PDFJS, vendor: [VENDOR['pdf-lib']] },
    ganjuntar: { vendor: [VENDOR['pdf-lib']] },
    ganpdf: { vendor: [VENDOR['pdf-lib'], VENDOR.jszip] },
};

function resolverGlobais(globais = {}) {
    return Object.fromEntries(Object.entries(globais).map(([nome, valor]) => [
        nome,
        typeof valor === 'function' ? valor() : valor,
    ]));
}

export async function carregarToy(slug, opcoes = {}) {
    const padrao = PADRAO_POR_TOY[slug] || {};
    const pagina = await carregarPagina(`toys/${slug}/index.html`, {
        ...padrao,
        ...opcoes,
        globais: resolverGlobais({ ...(padrao.globais || {}), ...(opcoes.globais || {}) }),
        vendor: [...(padrao.vendor || []), ...(opcoes.vendor || [])],
    });
    pagina.slug = slug;
    return pagina;
}

/**
 * Faz `showDirectoryPicker` devolver as pastas em memória na ordem informada
 * (toys que abrem a pasta sozinhos, como `ganjuntar`).
 */
export function enfileirarPastas(pagina, ...arvores) {
    const fila = [...arvores];
    pagina.janela.showDirectoryPicker = async () => {
        if (fila.length === 0) {
            const erro = new Error('Nenhuma pasta preparada no teste.');
            erro.name = 'NotFoundError';
            throw erro;
        }
        return fila.shift().handle;
    };
    pagina.pastasRestantes = () => fila.length;
    return pagina;
}

/** Simula um navegador sem File System Access API (caminho alternativo do toy). */
export function desativarSeletorDePasta(pagina) {
    delete pagina.janela.showDirectoryPicker;
    return pagina;
}

/** Simula um erro do seletor de pasta (cancelamento, permissão negada, etc.). */
export function falharSeletorDePasta(pagina, nome = 'AbortError', mensagem = 'Seleção cancelada.') {
    pagina.janela.showDirectoryPicker = async () => {
        const erro = new Error(mensagem);
        erro.name = nome;
        throw erro;
    };
    return pagina;
}
