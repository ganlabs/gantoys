# GAN Toys

Conjunto de ferramentas utilitárias jurídicas (toys) em HTML/CSS/JS puro, sem build
em desenvolvimento. Cada toy vive em `toys/<nome>/` e é exibido dentro de um iframe
pela página principal (`index.html`).

## Desenvolvimento

**`file://` é requisito, não conveniência.** O app (`index.html`), cada toy e o
bundle (`dist/index.html`) têm de funcionar abertos direto do disco, sem servidor.
Isso vale para abrir por duplo clique e para uso offline na máquina do usuário.
Consequências para quem mexe no código:

- só caminhos relativos (`../shared/toy.css`, `../../vendor/...`); nada de URL
  absoluta de projeto nem `fetch`/`XHR` para arquivos locais;
- scripts clássicos (`<script src>`), nunca módulos ES (`type="module"`), que o
  navegador bloqueia em `file://`;
- recursos compartilhados ficam em `toys/shared/` e são carregados por caminho
  relativo (`../shared/toy.css`, `../shared/toy.js`); no bundle os dois entram
  uma única vez e chegam aos toys como `Blob URL` do documento pai;
- nada de Service Worker nem de `Worker` a partir de arquivo local (`Blob URL`
  criado pelo documento pai funciona: é o que o worker do pdf.js usa);
- a única dependência de rede é o `tesseract.js` por CDN no `gannovodiv` (OCR).

Servir por HTTP continua valendo como atalho de desenvolvimento:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Padrão visual dos toys

Todos os toys compartilham a mesma casca e o mesmo vocabulário de componentes,
definidos em `toys/shared/toy.css`:

```html
<head>
  <link rel="icon" type="image/png" href="../../favicon.png">
  <link rel="stylesheet" href="../shared/toy.css">
</head>
<body>
  <main class="shell">
    <header class="brand">
      <img class="brand-logo" src="../../favicon.png" alt="GAN">
      <h1>Título do toy</h1>
      <p>Uma linha explicando o que o toy faz.</p>
    </header>
    <section class="glass-card">
      <div class="panel">...</div>
    </section>
  </main>
</body>
```

- **Identidade:** o logo do toy é sempre `favicon.png` (o mesmo em todos os
  toys), no cabeçalho e no `<link rel="icon">`.
- **Ícones:** apenas Bootstrap Icons (`<i class="bi bi-*">`). Emoji é proibido.
- **Componentes:** blocos internos são `.tile` (variação `.tile-accent`), rótulos
  de grupo `.section-title`, pílulas `.badge` (+ `.badge-accent/-ok/-warn/-fail`),
  botões `.btn` (`-primary`/`-outline`/`-small`/`-icon`/`-danger`/`-warn` e o
  estado `.selected`), opções `.choice-list`/`.choice`, resultados
  `.result-list`/`.result-item` (+ `.ok`/`.fail`), avisos `.notice`/`.message`,
  modais `.modal-overlay.open` + `.modal-shell/-header/-body`, toasts
  `.toast-container`/`.toast`, log `.log-line`, progresso
  `.progress-*`, etapas `.steps`/`.step`.
- **Campos:** entradas, combobox e textarea vêm do shared, sem aparência nativa
  do sistema. O `<select>` do toy é convertido por `toys/shared/toy.js` num
  combobox próprio (`.combo`/`.combo-button`/`.combo-list`): o popup nativo ignora
  o CSS do produto, então a lista é desenhada pelo tema. O `<select>` original
  permanece no DOM, escondido, como fonte do valor (`name`, `value` e `change`
  continuam valendo para o script do toy).
- O CSS local de cada toy (`styles.css` ou `<style>` inline) cobre apenas o que é
  específico daquele toy, sempre lendo os tokens `--toy-*`.
- Nenhuma cor de tema é fixada no CSS local: tema claro/escuro e os seis visuais
  (glassmorphism, neumorphism, neobrutalism, material, claymorphism, japandi)
  chegam via `data-theme`/`data-visual` e do CSS que o app injeta no iframe.
- Aberto direto (`file://`) sem tema salvo, o toy cai no claro/escuro do sistema
  via `prefers-color-scheme`.

Referência: `toys/gancopy/index.html` é o toy exemplar do padrão.

`node build/check-bundle.mjs` valida esse contrato em todos os toys: casca
canônica, logo (`favicon.png`) referenciado, ausência de classes legadas, ausência
de emoji e integridade dos assets compartilhados do bundle.

## Manuais e o toy de Ajuda

O toy `toys/help/` é a central de manuais: ele usa a mesma casca dos demais
(cabeçalho, cartão, avisos) e abre cada manual em um popup, com um índice que
troca de toy sem fechar a janela.

A fonte da verdade são arquivos Markdown em `toys/help/manual/` — um por toy
(`<nome da pasta>.md`) mais o `index.md` de visão geral. Como o app precisa
funcionar em `file://`, onde não há `fetch` de arquivo local, o gerador
`build/manual.mjs` embute cada `.md` em `toys/help/index.html` duas vezes:

- como card da grade (região `<!-- manuals:cards:start -->` … `end`);
- como `<script type="text/markdown" data-manual="<slug>">` (região
  `<!-- manuals:start -->` … `end`), de onde o renderizador Markdown da própria
  página lê o texto.

```bash
node build/manual.mjs   # reembute toys/help/manual/*.md em toys/help/index.html
```

Consequências para quem mexe no código:

- depois de criar ou editar um manual, rode o gerador; sem ele a página continua
  servindo a versão anterior do texto;
- a ordem e o ícone de cada manual vêm da navegação do `index.html`, e a
  descrição do card é o primeiro parágrafo do manual — não há registro paralelo
  para manter em dia;
- o Markdown aceito é um subconjunto (títulos, parágrafos, listas planas,
  negrito, `código`, blocos cercados, citação e régua): o renderizador vive em
  `toys/help/index.html` e é pequeno de propósito. Sem tabelas, imagens ou HTML
  cru; emoji é reprovado pelo contrato visual;
- o workflow de release roda `node build/manual.mjs` antes do bundle, então o
  entregável nunca sai com manual desatualizado.

## Testes, benchmarks e checagens

O projeto é HTML/CSS/JS puro, mas o código de produto é exercitado por uma suíte
em Node + jsdom: o harness carrega a página do toy, executa os scripts na ordem
do documento (com os `<script>` controlados, sem `fetch` de arquivo local) e
mede cobertura por toy. Nada de navegador de verdade, nada de rede.

```bash
npm ci                 # dependências só de desenvolvimento (jsdom, istanbul, eslint)
npm test               # suíte completa + cobertura + limites (falha abaixo de 90%)
npm run test:fast      # só os testes, sem medir cobertura
npm run bench          # benchmarks (transformações, fluxos, pipeline de entrega)
npm run lint           # ESLint (inclui o JS embutido nos HTML)
npm run security       # checagens estáticas de segurança
npm run assets:integrity   # confere o sha256 dos assets de terceiros
npm run verify         # lint + security + cobertura + benchmarks
```

- **Cobertura:** mínimo de **90%** em linhas, branches, funções e statements,
  por toy e no total da suíte. Toy sem teste é falha, não aviso. Para ver o que
  ficou de fora: `node testkit/coverage/detalhe.mjs <toy>` (linhas, branches e
  funções sem cobertura, com o número da linha). O relatório HTML fica em
  `coverage/`.
- **Regras de divisão do NovoDiv:** `test/toys/gannovodiv-regras.test.js` congela a
  divisão de cada processo em `test/golden/novodiv-regras.json` (40 casos: um por
  regra de início, um por regra de fechamento, classificadores de página e
  pontuação), inventaria a tabela de regras do toy e prova que o corpus é
  sensível — regra nova que intercepte página antiga reprova apontando o padrão.
  O passo a passo para acrescentar uma regra está em `toys/help/manual/gannovodiv.md`.
- **Testes de regressão:** os testes falam pela interface real (campos, botões,
  combobox) e conferem valores exatos — mensagens, formatos, nomes de arquivo,
  contagens, ordem, estado habilitado/desabilitado. `test/toys/texto-corpus.test.js`
  congela o comportamento dos toys de texto em `test/golden/texto.json` (46
  casos), que é a rede de proteção ao mexer no kit compartilhado.
- **Harness (`testkit/`):** loader do jsdom, sistema de arquivos em memória com
  a forma da File System Access API, ponte com o `app.js` real, dublês de
  pdf.js/jspdf/tesseract e helpers de interação. O guia de uso está em
  `testkit/COMO-TESTAR.md`; os toys que carregam pdf-lib e JSZip usam os
  arquivos reais do `vendor/`.
- **Benchmarks:** medem as transformações de texto com as funções reais dos
  toys, os fluxos de tela dentro do jsdom e o pipeline (`build/manual.mjs`,
  `build/bundle.mjs`, `build/check-bundle.mjs`). Os orçamentos têm folga grande:
  servem para pegar regressão grosseira (algoritmo que virou quadrático), não
  variação de 5%. Resultado em `bench/resultados.json`.
- **Segurança:** `npm run security` procura execução dinâmica de código, HTML
  montado por interpolação, URL `javascript:`, `target=_blank` sem `noopener`,
  recurso externo, segredo no repositório e `postMessage('*')`. Risco aceito
  fica escrito em `tools/seguranca-allowlist.json`, com o motivo. Os assets de
  terceiros (`vendor/`, `toys/shared/`, imagens da raiz) têm impressão digital
  registrada em `tools/integridade-assets.json`.
- **CI:** `.github/workflows/test.yml` roda lint, segurança, integridade,
  cobertura e benchmarks em push para `main` e em pull request, e publica o
  relatório de cobertura e o resultado dos benchmarks como artefato.

Ao rodar duas execuções de cobertura ao mesmo tempo, cada uma escreve em
`.coverage/run-<pid>/`, mas o relatório consolidado (`coverage/`) é único — para
números finais, rode uma suíte por vez.

## Bundle HTML único (entregável)

O entregável oficial do projeto é um **único arquivo HTML autocontido**,
`dist/index.html`, que embute:

- todos os toys (como `<iframe srcdoc>`, com o HTML e o JS/CSS próprios já inline);
- CSS/JS da aplicação (`app.js`, `styles.css`, bootstrap) inline;
- imagens da aplicação (`logo.png`, `favicon.png`) em base64;
- os assets compartilhados entre os toys — `vendor/`, `toys/shared/` e as
  imagens da raiz — **uma única vez**, em `window.GANTOYS_ASSETS`.

Como os assets compartilhados chegam aos toys: o srcdoc não carrega cópia
própria. Ele sai do bundle com o marcador `__ganasset:<caminho>` e, na hora de
carregar o toy, o documento pai troca cada marcador por um `Blob URL` criado a
partir do registro (`window.ganAssetText`). É o mesmo mecanismo já usado pelo
worker do pdf.js (`window.parent.__ganPdfWorkerUrl`), e funciona em `file://`
porque o iframe `srcdoc` herda a origem do documento pai. Consequências para
quem mexe no código:

- nada muda nos toys nem no `index.html` de desenvolvimento: eles continuam
  carregando `vendor/…` e `toys/shared/…` por caminho relativo, e abrem direto
  do disco;
- um asset novo referenciado por toy entra no bundle automaticamente; se ele
  estiver fora da pasta do próprio toy (`vendor/`, `toys/shared/`, raiz), vale
  para todos;
- CSS embutido passa por dois ajustes de tamanho no bundle: `@font-face` mantém
  só o `woff2` quando existe (woff/ttf/eot/otf saem) e `url()` de asset
  compartilhado vira marcador, resolvido em tempo de carga;
- abrir `dist/index.html` exige JS ligado (o registro e os Blob URLs são
  runtime); não há nada externo ao arquivo.

Gere localmente com Node (sem dependências externas):

```bash
node build/manual.mjs        # reembute os manuais no toy de Ajuda
node build/bundle.mjs        # -> dist/index.html
node build/check-bundle.mjs  # valida integridade do bundle
```

> O toy **Divisor Automático Santander** (`gannovodiv`) usa OCR via
> `tesseract.js` carregado de CDN. Ele já é o único recurso que depende de
> internet; os demais assets são todos embutidos.

## Release automática

O workflow `.github/workflows/build-release.yml` roda em **push para `main`**:

1. gera `dist/index.html` com `node build/bundle.mjs`;
2. valida o bundle;
3. publica o artefato;
4. cria uma **release** no GitHub com o `index.html` anexado
   (tag `v<data>-<sha curto>`).

Repositório destino: `ganlabs/gantoys`.