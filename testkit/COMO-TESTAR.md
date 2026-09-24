# Como escrever os testes

Suíte em Node + jsdom, com cobertura medida por toy. Nada de servidor, nada de
navegador de verdade: o harness carrega a página do toy, executa os scripts na
ordem do documento e mede a cobertura do código do projeto.

```bash
npm test                              # suíte completa + cobertura + limites
npm run test:fast                     # só os testes, sem cobertura
node testkit/coverage/run.mjs test/toys/ganpdf.test.js   # um arquivo
node testkit/coverage/detalhe.mjs ganpdf                  # o que ficou sem cobertura
```

Ao iterar um toy isolado, use `GANTOYS_COVERAGE_IGNORAR_FALTANDO=1` para não
falhar pelos toys que ainda não têm teste:

```bash
GANTOYS_COVERAGE_IGNORAR_FALTANDO=1 node testkit/coverage/run.mjs test/toys/ganpdf.test.js
```

## Regra número um: teste é guarda de regressão

O objetivo não é "ter testes", é **falhar quando o comportamento mudar**. Então:

- asserte o valor **exato**: strings de UI, formatos (`1234567-89.2024.8.26.0100`),
  nomes de arquivo gerados, mensagens de erro, contagens e ordem dos itens;
- cubra as **bordas**: entrada vazia, linha inválida, duplicatas, limites
  (tamanho, quantidade, primeira/última posição), cancelamento, permissão
  negada, erro da biblioteca, item que falha no meio do lote;
- cubra os **estados observáveis**: o que fica habilitado/desabilitado, o que
  aparece/esconde, o rótulo que muda e volta, o resumo antes e depois;
- **não** asserte implementação: nada de "o campo foi copiado", "a função foi
  chamada", texto de código-fonte, ou `length > 0` quando o valor exato é
  observável (`assert.deepEqual` da lista inteira vale mais que um `includes`);
- nada de teste dependente de tempo real além do que o toy usa de verdade, e
  nada de rede — a suíte roda offline.

Um teste que passa com o código quebrado não serve: se a asserção não distingue
o comportamento certo do errado, ela não é um teste, é decoração.

## Estrutura de um arquivo de teste

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../../testkit/index.js';

test('Toy — descrição do comportamento', async (t) => {
    const pagina = await carregarToy('ganslug');
    t.after(() => pagina.fechar());          // fecha a janela e consolida a cobertura

    pagina.digitar('#campo', 'entrada');
    pagina.clicar('#botao');

    assert.equal(pagina.texto('#resumo'), '2 de 3 linhas convertidas.');
});
```

## O que a página oferece

| Membro | Para que serve |
| --- | --- |
| `pagina.janela`, `pagina.documento` | a janela e o documento do jsdom |
| `pagina.seletor(sel)`, `pagina.todos(sel)`, `pagina.existe(sel)` | consulta de DOM |
| `pagina.texto(sel)`, `pagina.textos(sel)`, `pagina.html(sel)`, `pagina.atributo(sel, nome)` | leitura |
| `pagina.clicar(sel)`, `pagina.digitar(sel, valor)`, `pagina.selecionar(sel, valor)`, `pagina.marcar(sel)`, `pagina.teclar(sel, tecla)`, `pagina.disparar(sel, tipo)` | interação |
| `pagina.aguardar(fn, { descricao, timeout })`, `pagina.aguardarTexto(sel, texto)` | espera ativa (drena a fila antes de checar) |
| `pagina.tick(ms)` | avança o tempo real (timers do toy) |
| `pagina.registro` | efeitos observáveis: `clipboard.escritas`, `execCommand`, `urls` (Blob URL → Blob), `downloads`, `canvas`, `workers` |
| `pagina.console` | mensagens de console da página (`pagina.mensagens('warn')`) |
| `pagina.script(codigo)` | executa código no contexto da página |
| `pagina.fechar()` | fecha a página e junta a cobertura |

## Dublês disponíveis

```js
import { montarArvore, criarPdfjsFake, criarJspdfFake, criarTesseractFake, carregarApp } from '../../testkit/index.js';
```

- **Pasta em memória** (`montarArvore('Origem', { 'sub/a.pdf': 'conteúdo' })`):
  implementa a File System Access API. `arvore.paraObjeto()`, `arvore.caminhos()`,
  `arvore.conteudo('sub/a.pdf')`, `arvore.escritas`, `arvore.negarPermissao`.
- **pdf.js** (`criarPdfjsFake([{ texto: 'página 1' }])`): texto e render por
  página; `registro.renderizacoes`, `opcoes.falharEm`, `opcoes.falharCarga`.
- **jspdf** (`criarJspdfFake()`): registra páginas/imagens e devolve bytes.
- **tesseract** (`criarTesseractFake(['texto do OCR'])`): fila de respostas do OCR.
- **pdf-lib** e **JSZip** rodam de verdade (já configurados em `carregarToy`).
- **app hospedeiro** (`carregarApp()` + `app.conectarToy(pagina)`): o `app.js`
  real atende as mensagens do toy. `app.enfileirarPasta(arvore)` prepara o
  seletor de pasta; `app.conectarToy(pagina).confirmarPasta()` confirma o
  diálogo. Use isso nos toys que delegam ao app (`gancopy`, `ganrenomeador`,
  `gannovodiv`).

Passar global ao toy **antes** dos scripts rodarem (o toy lê no carregamento):

```js
const pagina = await carregarToy('gancompressor', { globais: { jspdf: criarJspdfFake() } });
```

## Detalhes do harness que evitam teste frágil

- **Handlers inline funcionam.** O jsdom não compila `onclick="fn()"` sozinho; o
  harness compila todos os atributos `on*` no contexto da página (inclusive o
  markup que o toy cria depois). Clique nos botões reais — não chame a função
  global no lugar do clique nem reinstale o listener.
- **Valores que voltam da página são de outro realm.** `assert.deepEqual` (strict)
  acusa "same structure but not reference-equal". Passe o retorno de funções da
  página por `puro(...)` antes de comparar.
- **`setImmediate` do jsdom nunca dispara** (o polyfill do JSZip desiste e o
  `generateAsync()` fica pendurado); o harness o apoia no timer do jsdom.
- **`select()` move o foco** no harness, como no navegador — a cópia por
  `document.execCommand(copy)` depende disso.
- **Timers são reais**: rótulos que voltam depois de 1,6 s exigem
  `aguardarTexto(...)` com timeout maior.
- **Uma rodada de cobertura por vez**: cada execução grava em
  `.coverage/run-<pid>/`, mas o relatório consolidado (`coverage/`) é único.

- **NovoDiv (regras de divisão)** (`testkit/novodiv.js`): abre o detector com um
  pdf.js controlado e expõe `detectar(paginas)` (decisão crua), `regras()` (tabela
  viva), `casarInicio/casarFim` (qual regra casa qual texto) e `injetarInicio/
  injetarFim` (simula a chegada de uma regra nova). O corpus e o contrato de
  "regra nova não quebra regra antiga" estão em
  `test/toys/gannovodiv-regras.test.js`; páginas do corpus precisam passar de 500
  caracteres nas 10 primeiras, senão o toy cai no OCR de emergência.

## Preâmbulo de tema

O bloco de tema no `<head>` de cada toy já é verificado por `test/preambulo.test.js`
(um caso por toy). Não precisa repetir isso no teste do toy.

## Cobertura

Limite: **90%** em linhas, branches, funções e statements, por toy e no total.
`node testkit/coverage/detalhe.mjs <toy>` mostra linhas, branches e funções sem
cobertura — é por ali que se fecha a lacuna.
