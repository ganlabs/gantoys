/**
 * Harness de testes do GAN Toys.
 *
 * Uso típico em um arquivo de teste:
 *
 *   import { test } from 'node:test';
 *   import assert from 'node:assert/strict';
 *   import { carregarToy } from '../../testkit/index.js';
 *
 *   test('Toy X', async (t) => {
 *       const pagina = await carregarToy('ganx');
 *       t.after(() => pagina.fechar());
 *       ...
 *   });
 *
 * `pagina` expõe `janela`, `documento`, `registro` (efeitos observáveis),
 * `globais` passados ao carregar, e os atalhos `clicar`, `digitar`, `texto`,
 * `todos`, `aguardar`, `aguardarTexto`, `tick`, `script` e `cobertura`.
 */

export { carregarPagina, extrairScripts, puro, RAIZ } from './pagina.js';
export { carregarApp } from './app.js';
export { conectarPonte } from './ponte.js';
export { montarArvore, texto, bytesDe } from './fs.js';
export { criarRegistro } from './ambiente.js';
export { criarPdfjsFake, criarJspdfFake, criarTesseractFake } from './vendor.js';
export {
    carregarToy,
    enfileirarPastas,
    desativarSeletorDePasta,
    falharSeletorDePasta,
    VENDOR,
} from './toy.js';
