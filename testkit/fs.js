/**
 * Sistema de arquivos em memória com a forma da File System Access API.
 *
 * Os toys que copiam, renomeiam ou gravam arquivos falam com
 * `showDirectoryPicker()` (ou com o app hospedeiro, que fala). Aqui a pasta
 * escolhida é uma árvore em memória, montada a partir de um objeto simples:
 *
 *   const origem = montarArvore('Origem', { 'sub/a.pdf': 'conteúdo' });
 *   preparar: (janela) => { janela.showDirectoryPicker = async () => origem; }
 *
 * O handle implementa o que o projeto usa de verdade: `values()`,
 * `getFileHandle(name, {create})`, `getDirectoryHandle`, `removeEntry`,
 * `createWritable()`, `getFile()`, `move(novoNome)`, `queryPermission` e
 * `requestPermission`. Depois do teste, `paraObjeto()` devolve como a árvore
 * ficou e `escritas` lista o que foi gravado.
 */

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

export function texto(bytes) {
    return decodificador.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/**
 * Aceita ArrayBuffer vindo de qualquer realm.
 *
 * `valor instanceof ArrayBuffer` falha quando o buffer foi criado dentro da
 * página (o jsdom roda os scripts em outro contexto): o objeto cai no fallback
 * de string e o arquivo gravado vira o texto "[object ArrayBuffer]". A checagem
 * por marca interna (`Object.prototype.toString`) atravessa realms.
 */
function ehArrayBuffer(valor) {
    return Object.prototype.toString.call(valor) === '[object ArrayBuffer]';
}

export function bytesDe(valor) {
    if (valor === null || valor === undefined) return codificador.encode('');
    // ArrayBuffer.isView também funciona entre realms (usa slot interno).
    if (ArrayBuffer.isView(valor)) return new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength);
    if (ehArrayBuffer(valor)) return new Uint8Array(valor);
    if (valor instanceof Uint8Array) return valor;
    if (valor && typeof valor.arrayBuffer === 'function') return valor.arrayBuffer().then((b) => new Uint8Array(b));
    return codificador.encode(String(valor));
}

class Arquivo {
    constructor(nome, conteudo = new Uint8Array()) {
        this.kind = 'file';
        this.name = nome;
        this.bytes = conteudo instanceof Uint8Array ? conteudo : codificador.encode(String(conteudo));
        this.pai = null;
    }
}

class Pasta {
    constructor(nome) {
        this.kind = 'directory';
        this.name = nome;
        this.filhos = new Map();
        this.pai = null;
    }
}

function erroNaoEncontrado(nome) {
    const erro = new Error(`O arquivo ou diretório "${nome}" não existe.`);
    erro.name = 'NotFoundError';
    return erro;
}

function tipoDoNome(nome) {
    if (/\.pdf$/i.test(nome)) return 'application/pdf';
    if (/\.zip$/i.test(nome)) return 'application/zip';
    if (/\.csv$/i.test(nome)) return 'text/csv';
    if (/\.json$/i.test(nome)) return 'application/json';
    if (/\.xlsx$/i.test(nome)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (/\.(txt|md)$/i.test(nome)) return 'text/plain';
    return 'application/octet-stream';
}

/**
 * Cria uma árvore a partir de `{ 'caminho/arquivo.ext': conteúdo }`.
 * O primeiro argumento é o nome da pasta raiz (o que o toy exibe na tela).
 */
export function montarArvore(nomeRaiz, descricao = {}) {
    const raiz = new Pasta(nomeRaiz);
    const escritas = [];

    for (const [caminho, conteudo] of Object.entries(descricao)) {
        const partes = caminho.split('/').filter(Boolean);
        const nome = partes.pop();
        let pasta = raiz;
        for (const parte of partes) {
            let filho = pasta.filhos.get(parte);
            if (!filho) {
                filho = new Pasta(parte);
                filho.pai = pasta;
                pasta.filhos.set(parte, filho);
            }
            if (filho.kind !== 'directory') throw new Error(`Conflito na árvore de teste: ${caminho}`);
            pasta = filho;
        }
        const arquivo = new Arquivo(nome, conteudo);
        arquivo.pai = pasta;
        pasta.filhos.set(nome, arquivo);
    }

    const api = {
        raiz,
        escritas,
        negarPermissao: false,
        negarCriacao: false,
        nome: nomeRaiz,
    };

    function handle(no) {
        if (no.kind === 'file') {
            return {
                kind: 'file',
                name: no.name,
                __no: no,
                async getFile() {
                    return new globalThis.File([no.bytes], no.name, { type: tipoDoNome(no.name) });
                },
                async createWritable() {
                    return {
                        async write(dados) {
                            no.bytes = await bytesDe(dados);
                            escritas.push(no.name);
                        },
                        async seek() {},
                        async truncate() {},
                        async close() {},
                        async abort() {},
                    };
                },
                async isSameEntry(outro) {
                    return Boolean(outro && outro.__no === no);
                },
                async move(novoNome) {
                    if (!no.pai) throw new Error('Arquivo sem pasta de origem.');
                    if (no.pai.filhos.has(novoNome)) {
                        const erro = new Error('já existe um arquivo com esse nome');
                        erro.name = 'InvalidModificationError';
                        throw erro;
                    }
                    no.pai.filhos.delete(no.name);
                    no.name = novoNome;
                    no.pai.filhos.set(novoNome, no);
                },
            };
        }

        return {
            kind: 'directory',
            name: no.name,
            __no: no,
            async *values() {
                for (const filho of [...no.filhos.values()]) yield handle(filho);
            },
            async *entries() {
                for (const [chave, filho] of [...no.filhos.entries()]) yield [chave, handle(filho)];
            },
            async getFileHandle(nome, opcoes = {}) {
                const filho = no.filhos.get(nome);
                if (!filho) {
                    if (!opcoes.create || api.negarCriacao) throw erroNaoEncontrado(nome);
                    const novo = new Arquivo(nome);
                    novo.pai = no;
                    no.filhos.set(nome, novo);
                    return handle(novo);
                }
                if (filho.kind !== 'file') throw erroNaoEncontrado(nome);
                return handle(filho);
            },
            async getDirectoryHandle(nome, opcoes = {}) {
                const filho = no.filhos.get(nome);
                if (!filho) {
                    if (!opcoes.create) throw erroNaoEncontrado(nome);
                    const nova = new Pasta(nome);
                    nova.pai = no;
                    no.filhos.set(nome, nova);
                    return handle(nova);
                }
                if (filho.kind !== 'directory') throw erroNaoEncontrado(nome);
                return handle(filho);
            },
            async removeEntry(nome) {
                if (!no.filhos.has(nome)) throw erroNaoEncontrado(nome);
                no.filhos.delete(nome);
            },
            async queryPermission() {
                return api.negarPermissao ? 'denied' : 'granted';
            },
            async requestPermission() {
                return api.negarPermissao ? 'denied' : 'granted';
            },
            async isSameEntry(outro) {
                return Boolean(outro && outro.__no === no);
            },
        };
    }

    api.handle = handle(raiz);
    api.paraObjeto = () => {
        const saida = {};
        const visitar = (pasta, prefixo) => {
            for (const filho of pasta.filhos.values()) {
                if (filho.kind === 'file') saida[`${prefixo}${filho.name}`] = filho.bytes;
                else visitar(filho, `${prefixo}${filho.name}/`);
            }
        };
        visitar(raiz, '');
        return saida;
    };
    api.caminhos = () => Object.keys(api.paraObjeto()).sort();
    api.conteudo = (caminho) => {
        const encontrado = api.paraObjeto()[caminho];
        if (!encontrado) throw new Error(`Caminho ausente na árvore: ${caminho}`);
        return texto(encontrado);
    };

    return api;
}
