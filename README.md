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
  relativo (`../shared/toy.css`, `../shared/toy.js`); o bundle embute os dois;
- nada de Service Worker nem de `Worker` a partir de arquivo local;
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

- **Identidade:** o logo do toy é sempre `favicon.png` (o mesmo nos 15 toys), no
  cabeçalho e no `<link rel="icon">`.
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
canônica, logo (`favicon.png`) embutido, ausência de classes legadas e ausência
de emoji.

## Bundle HTML único (entregável)

O entregável oficial do projeto é um **único arquivo HTML autocontido**,
`dist/index.html`, que embute:

- todos os toys (como `<iframe srcdoc>`, com seus CSS/JS já inline);
- CSS/JS locais de `vendor/` e `app.js`/`styles.css` da aplicação;
- imagens e fontes (`logo.png`, `favicon.png`, bootstrap-icons, fonts do vendor)
  em base64;
- o worker do pdf.js como `Blob URL` criado pelo documento pai.

Gere localmente com Node (sem dependências externas):

```bash
node build/bundle.mjs      # -> dist/index.html
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