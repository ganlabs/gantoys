/**
 * Dublês das bibliotecas de PDF/OCR que os toys carregam do `vendor/`.
 *
 * pdf.js, jspdf e tesseract.js dependem do navegador de verdade (canvas,
 * worker, wasm, CDN) e não têm como rodar no jsdom. Os dublês implementam
 * exatamente o contrato que o projeto consome, com o texto das páginas vindo do
 * modelo informado pelo teste — assim a lógica do toy (heurísticas, divisão,
 * progresso, relatório) é exercitada de ponta a ponta, e só a biblioteca fica
 * de fora da medição.
 *
 * pdf-lib e JSZip rodam de verdade: são puros, então os testes usam o arquivo
 * real do `vendor/` (opção `vendor` do harness).
 */

function itensDeTexto(conteudo) {
    const linhas = String(conteudo).split('\n');
    return linhas.map((linha, indice) => ({
        str: linha,
        // y diminui a cada linha, como no PDF real (origem no canto inferior).
        transform: [12, 0, 0, 12, 40, 780 - indice * 14],
        width: linha.length * 6,
        height: 12,
        fontName: 'F1',
        hasEOL: false,
    }));
}

/**
 * Cria um `pdfjsLib` falso.
 *
 * `paginas`: array de páginas (ou uma função que devolve o array, para o teste
 * trocar o conteúdo entre chamadas sem recarregar a página). Cada página é um
 * objeto `{ largura = 595, altura = 842, texto = '' }` ou só uma string.
 * `rotacao` gira a viewport, para exercitar as heurísticas de orientação.
 */
export function criarPdfjsFake(paginas = [], opcoes = {}) {
    const listaDePaginas = typeof paginas === 'function' ? paginas : () => paginas;
    const normalizar = (pagina) => (
        typeof pagina === 'string'
            ? { texto: pagina, largura: 595, altura: 842 }
            : { texto: '', largura: 595, altura: 842, ...pagina }
    );

    const registro = {
        documentos: 0,
        renderizacoes: [],
        falharEm: opcoes.falharEm ?? null,   // número da página (1-based) que rejeita o render
        falharCarga: opcoes.falharCarga ?? null,
    };

    function criarDocumento() {
        const paginasNormalizadas = listaDePaginas().map(normalizar);
        registro.documentos += 1;
        return {
            numPages: paginasNormalizadas.length,
            fingerprint: `fake-${registro.documentos}`,
            async getPage(numeroDaPagina) {
                const pagina = paginasNormalizadas[numeroDaPagina - 1];
                if (!pagina) {
                    const erro = new Error(`Página inexistente: ${numeroDaPagina}`);
                    erro.name = 'MissingPDFException';
                    throw erro;
                }
                return {
                    pageNumber: numeroDaPagina,
                    rotate: pagina.rotacao ?? 0,
                    getViewport({ scale = 1, rotation = 0 } = {}) {
                        const girada = Math.abs((pagina.rotacao ?? 0) + rotation) % 180 === 90;
                        const largura = girada ? pagina.altura : pagina.largura;
                        const altura = girada ? pagina.largura : pagina.altura;
                        return {
                            width: largura * scale,
                            height: altura * scale,
                            scale,
                            rotation,
                            transform: [scale, 0, 0, scale, 0, 0],
                        };
                    },
                    async getTextContent() {
                        return { items: itensDeTexto(pagina.texto), styles: {}, lang: 'pt' };
                    },
                    render(contexto = {}) {
                        const viewport = contexto.viewport || { width: 0, height: 0 };
                        const renderizacao = { pagina: numeroDaPagina, viewport };
                        registro.renderizacoes.push(renderizacao);

                        const tarefa = {
                            cancel() { tarefa.cancelado = true; },
                            cancelado: false,
                            promise: (async () => {
                                if (registro.falharEm === numeroDaPagina) throw new Error(`Falha ao renderizar a página ${numeroDaPagina}`);
                                const ctx = contexto.canvasContext;
                                if (ctx) {
                                    ctx.save();
                                    ctx.fillStyle = '#fff';
                                    ctx.fillRect(0, 0, viewport.width || 1, viewport.height || 1);
                                    ctx.fillStyle = '#000';
                                    ctx.fillText(pagina.texto, 10, 20);
                                    ctx.restore();
                                }
                                return undefined;
                            })(),
                        };
                        return tarefa;
                    },
                    async cleanup() {},
                    async getAnnotations() { return []; },
                };
            },
            async destroy() {},
        };
    }

    return {
        GlobalWorkerOptions: { workerSrc: '' },
        version: 'fake',
        registro,
        getDocument(fonte = {}) {
            const tarefa = {
                destroy: async () => {},
                onProgress: null,
                promise: null,
            };
            tarefa.promise = registro.falharCarga
                ? Promise.reject(new Error(registro.falharCarga))
                : Promise.resolve(criarDocumento(fonte));
            return tarefa;
        },
    };
}

/**
 * Cria um `jspdf` falso que registra páginas/imagens e devolve bytes de mentira
 * em `output('arraybuffer')` — o suficiente para o toy gravar o arquivo e o
 * teste conferir o que foi montado.
 */
export function criarJspdfFake() {
    const registro = { instancias: [] };

    class jsPDF {
        constructor(opcoes = {}) {
            this.opcoes = opcoes;
            this.paginas = [{ imagens: [] }];
            this.operacoes = [];
            registro.instancias.push(this);
        }

        addPage(formato, orientacao) {
            this.paginas.push({ formato, orientacao, imagens: [] });
            return this;
        }

        addImage(dados, tipo, x, y, largura, altura) {
            this.paginas[this.paginas.length - 1].imagens.push({ tipo, x, y, largura, altura, bytes: String(dados).length });
            this.operacoes.push('addImage');
            return this;
        }

        setFontSize(tamanho) { this.operacoes.push(['setFontSize', tamanho]); return this; }
        text(...argumentos) { this.operacoes.push(['text', ...argumentos]); return this; }
        save(nome) { registro.salvos = (registro.salvos || []).concat(nome || 'documento.pdf'); return this; }
        setProperties() { return this; }

        output(tipo = 'blob') {
            const marca = JSON.stringify({
                paginas: this.paginas.length,
                imagens: this.paginas.reduce((total, pagina) => total + pagina.imagens.length, 0),
            });
            const bytes = new TextEncoder().encode(marca);
            if (tipo === 'arraybuffer') return bytes.buffer;
            if (tipo === 'blob') return new Blob([bytes], { type: 'application/pdf' });
            return marca;
        }
    }

    return { jsPDF, registro };
}

/**
 * Cria um `Tesseract` falso. `textos` é a fila de respostas do OCR: cada
 * `recognize` consome a próxima (a última se repete).
 */
export function criarTesseractFake(textos = [''], opcoes = {}) {
    const fila = [...textos];
    const registro = { reconhecimentos: 0, workers: [], terminados: 0 };

    function proximoTexto() {
        if (fila.length > 1) return fila.shift();
        return fila[0] ?? '';
    }

    function criarWorker(idioma) {
        registro.workers.push(idioma);
        return Promise.resolve({
            async recognize(_imagem) {
                registro.reconhecimentos += 1;
                if (opcoes.falhar) throw new Error('Falha no OCR');
                return { data: { text: proximoTexto(), confidence: 90 } };
            },
            async terminate() { registro.terminados += 1; },
            async setParameters() {},
        });
    }

    return {
        registro,
        createWorker: criarWorker,
        async recognize() {
            registro.reconhecimentos += 1;
            return { data: { text: proximoTexto() } };
        },
    };
}
