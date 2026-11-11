/**
 * Carrega o app (`index.html` + `app.js`) no harness.
 *
 * `showGanToysDirectoryPicker` (em `app.js`) delega para
 * `window.showDirectoryPicker`, então o seletor real do navegador vira uma fila
 * de pastas em memória preparadas pelo teste:
 *
 *   const app = await carregarApp();
 *   app.enfileirarPasta(origem);
 *   app.enfileirarPasta(destino);
 */

import { carregarPagina } from './pagina.js';
import { conectarPonte } from './ponte.js';

export async function carregarApp(opcoes = {}) {
    const fila = [];

    const pagina = await carregarPagina('index.html', {
        ...opcoes,
        preparar(janela, registro) {
            janela.showDirectoryPicker = async ({ mode } = {}) => {
                if (fila.length === 0) {
                    const erro = new Error('Nenhuma pasta preparada no teste.');
                    erro.name = 'NotFoundError';
                    throw erro;
                }
                const proxima = fila.shift();
                proxima.modoUsado = mode;
                return proxima.handle ?? proxima;
            };
            if (typeof opcoes.preparar === 'function') opcoes.preparar(janela, registro);
        },
    });

    pagina.filaDePastas = fila;
    pagina.enfileirarPasta = (arvore) => {
        fila.push(arvore);
        return arvore;
    };
    pagina.conectarToy = (paginaToy) => conectarPonte(pagina, paginaToy);
    pagina.erroDePasta = (mensagem) => {
        const erro = new Error(mensagem);
        erro.name = 'AbortError';
        return erro;
    };

    return pagina;
}
