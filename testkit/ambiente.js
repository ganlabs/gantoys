/**
 * Ambiente de navegador para o jsdom.
 *
 * O jsdom não implementa algumas APIs que os toys usam de verdade (ou não as
 * implementa no nível que o teste precisa observar). Este módulo completa o
 * ambiente com fakes observáveis:
 *
 *   - `matchMedia` (jsdom não tem) — usado pelo preâmbulo de tema dos toys;
 *   - `URL.createObjectURL` — aqui os Blob URL entram num registro, para o teste
 *     ler os bytes gerados (PDF, ZIP, CSV);
 *   - `navigator.clipboard` e `document.execCommand('copy')` — a cópia vira
 *     registro em vez de tocar a área de transferência real;
 *   - `Element.prototype.scrollIntoView` (ausente no jsdom) — usado pelo
 *     combobox compartilhado;
 *   - canvas 2D — contexto que registra as chamadas, para o render de PDF
 *     (via pdf.js falso) e a montagem de imagem (via jspdf falso) rodarem;
 *   - `Worker` — registra o worker pedido sem carregar nada.
 *
 * Nada aqui altera o comportamento dos toys: são implementações mínimas das
 * APIs do navegador, não atalhos dentro do código do projeto.
 */

/** Registro de efeitos observáveis pelo teste. */
export function criarRegistro() {
    return {
        urls: new Map(),          // blob: URL -> Blob
        clipboard: { escritas: [], leitura: '', falha: null },
        execCommand: [],          // textos copiados pelo caminho alternativo
        canvas: [],               // contextos 2D criados
        workers: [],              // URLs de Worker instanciados
        downloads: [],            // âncoras .click() com download
        selecoesDePasta: 0,
    };
}

function criarContexto2d(canvas) {
    const alvo = {
        canvas,
        fillStyle: '#000',
        strokeStyle: '#000',
        font: '10px sans-serif',
        lineWidth: 1,
        globalAlpha: 1,
        textAlign: 'start',
        textBaseline: 'alphabetic',
        operacoes: [],
    };

    return new Proxy(alvo, {
        get(objeto, propriedade) {
            if (propriedade in objeto) return objeto[propriedade];
            if (propriedade === 'measureText') {
                return (texto) => ({ width: String(texto).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
            }
            if (propriedade === 'createLinearGradient' || propriedade === 'createRadialGradient' || propriedade === 'createPattern') {
                return () => ({ addColorStop() {} });
            }
            if (propriedade === 'getImageData' || propriedade === 'createImageData') {
                return (x, y, largura = 1, altura = 1) => ({
                    data: new Uint8ClampedArray(Math.max(1, largura * altura * 4)),
                    width: largura,
                    height: altura,
                });
            }
            // Qualquer outro método do CanvasRenderingContext2D: registra e ignora.
            return (...argumentos) => { objeto.operacoes.push({ metodo: propriedade, argumentos }); };
        },
        set(objeto, propriedade, valor) {
            objeto[propriedade] = valor;
            return true;
        },
    });
}

function textoSelecionado(janela) {
    const ativo = janela.document.activeElement;
    if (ativo && typeof ativo.value === 'string' && typeof ativo.selectionStart === 'number') {
        return ativo.value.slice(ativo.selectionStart, ativo.selectionEnd);
    }
    const selecao = janela.getSelection && janela.getSelection();
    return selecao ? String(selecao) : '';
}

/**
 * Completa a janela do jsdom com as APIs do navegador que faltam.
 * Deve ser chamado ANTES de executar os scripts do toy: alguns capturam esses
 * objetos no carregamento.
 */
export function instalarAmbiente(janela, opcoes = {}) {
    const registro = criarRegistro();

    janela.matchMedia = (consulta) => ({
        media: consulta,
        matches: opcoes.temaEscuro !== false && /prefers-color-scheme:\s*dark/.test(consulta),
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() { return false; },
    });

    janela.URL.createObjectURL = (blob) => {
        const url = `blob:gan-test/${registro.urls.size + 1}`;
        registro.urls.set(url, blob);
        return url;
    };
    janela.URL.revokeObjectURL = (url) => { registro.urls.delete(url); };

    if (typeof janela.structuredClone !== 'function') {
        janela.structuredClone = (valor) => structuredClone(valor);
    }

    // O jsdom expõe `window.setImmediate`, mas o callback nunca dispara. O
    // pacote `setimmediate` embutido no JSZip faz `if (global.setImmediate)
    // return;` (não instala o polyfill) e o `generateAsync()` fica pendurado
    // para sempre. Em navegador de verdade o JSZip instala o polyfill via
    // MessageChannel; aqui o dublê usa o timer do próprio jsdom.
    janela.setImmediate = (callback, ...argumentos) => janela.setTimeout(() => callback(...argumentos), 0);
    janela.clearImmediate = (identificador) => janela.clearTimeout(identificador);

    janela.Element.prototype.scrollIntoView = function scrollIntoView() {};

    // No navegador, `select()` de input/textarea move o foco para o campo; o
    // jsdom só marca a seleção. A cópia por `document.execCommand('copy')`
    // depende desse foco, então o dublê o reproduz.
    for (const construtor of [janela.HTMLTextAreaElement, janela.HTMLInputElement]) {
        const selecionarOriginal = construtor.prototype.select;
        construtor.prototype.select = function select() {
            try { this.focus(); } catch { /* campo fora do documento */ }
            return selecionarOriginal.apply(this, arguments);
        };
    }

    janela.document.execCommand = (comando) => {
        if (comando !== 'copy') return false;
        registro.execCommand.push(textoSelecionado(janela));
        return true;
    };

    Object.defineProperty(janela.navigator, 'clipboard', {
        configurable: true,
        value: {
            writeText: async (texto) => {
                if (registro.clipboard.falha) throw new Error(registro.clipboard.falha);
                registro.clipboard.escritas.push(String(texto));
            },
            readText: async () => registro.clipboard.leitura,
        },
    });

    janela.HTMLCanvasElement.prototype.getContext = function getContext(tipo) {
        if (tipo !== '2d') return null;
        const contexto = criarContexto2d(this);
        registro.canvas.push(contexto);
        return contexto;
    };

    janela.HTMLCanvasElement.prototype.toDataURL = function toDataURL(tipo = 'image/png') {
        const marca = `imagem-de-teste:${this.width}x${this.height}`;
        return `data:${tipo};base64,${Buffer.from(marca).toString('base64')}`;
    };

    janela.HTMLCanvasElement.prototype.toBlob = function toBlob(callback, tipo = 'image/png') {
        const marca = Buffer.from(`imagem-de-teste:${this.width}x${this.height}`);
        janela.setTimeout(() => callback(new janela.Blob([marca], { type: tipo })), 0);
    };

    if (opcoes.worker !== false) {
        janela.Worker = class WorkerFake {
            constructor(url) {
                registro.workers.push(String(url));
                this.onmessage = null;
                this.onerror = null;
            }
            postMessage() {}
            terminate() {}
            addEventListener() {}
            removeEventListener() {}
        };
    }

    // Âncoras de download: jsdom não navega, então o clique é registrado.
    const cliqueOriginal = janela.HTMLAnchorElement.prototype.click;
    janela.HTMLAnchorElement.prototype.click = function click() {
        if (this.hasAttribute('download')) {
            registro.downloads.push({ nome: this.getAttribute('download') || '', href: this.getAttribute('href') || '' });
            return;
        }
        return cliqueOriginal.apply(this, arguments);
    };

    return registro;
}
