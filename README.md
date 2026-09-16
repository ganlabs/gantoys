# GAN Toys

Conjunto de ferramentas utilitárias jurídicas (toys) em HTML/CSS/JS puro, sem build
em desenvolvimento. Cada toy vive em `toys/<nome>/` e é exibido dentro de um iframe
pela página principal (`index.html`).

## Desenvolvimento

Abra `index.html` diretamente no navegador (ou sirva a pasta com qualquer servidor
estático). Os toys são carregados de `toys/<nome>/index.html` e a troca de temas é
feita via `postMessage` + variáveis CSS.

Atalho:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Padrão visual dos toys

Todos os toys compartilham a mesma casca e o mesmo vocabulário de componentes,
definidos em `toys/shared/toy.css`:

```html
<head>
  <link rel="icon" type="image/svg+xml" href="../shared/logo.svg">
  <link rel="stylesheet" href="../shared/toy.css">
</head>
<body>
  <main class="shell">
    <header class="brand">
      <img class="brand-logo" src="../shared/logo.svg" alt="GAN Toys">
      <h1>Título do toy</h1>
      <p>Uma linha explicando o que o toy faz.</p>
    </header>
    <section class="glass-card">
      <div class="panel">...</div>
    </section>
  </main>
</body>
```

- **Identidade:** o logo do toy é sempre `toys/shared/logo.svg` (lockup GAN Toys),
  no cabeçalho e no `<link rel="icon">`. `favicon.png`/`logo.png` da raiz são a
  identidade do app e nunca aparecem dentro de um toy.
- **Ícones:** apenas Bootstrap Icons (`<i class="bi bi-*">`). Emoji é proibido.
- **Componentes:** blocos internos são `.tile` (variação `.tile-accent`), rótulos
  de grupo `.section-title`, pílulas `.badge` (+ `.badge-accent/-ok/-warn/-fail`),
  botões `.btn` (`-primary`/`-outline`/`-small`/`-icon`/`-danger`/`-warn` e o
  estado `.selected`), opções `.choice-list`/`.choice`, resultados
  `.result-list`/`.result-item` (+ `.ok`/`.fail`), avisos `.notice`/`.message`,
  modais `.modal-overlay.open` + `.modal-shell/-header/-body`, toasts
  `.toast-container`/`.toast`, log `.log-line`, progresso
  `.progress-*`, etapas `.steps`/`.step`.
- O CSS local de cada toy (`styles.css` ou `<style>` inline) cobre apenas o que é
  específico daquele toy, sempre lendo os tokens `--toy-*`.
- Nenhuma cor de tema é fixada no CSS local: tema claro/escuro e os seis visuais
  (glassmorphism, neumorphism, neobrutalism, material, claymorphism, japandi)
  chegam via `data-theme`/`data-visual` e do CSS que o app injeta no iframe.
- Aberto direto (`file://`) sem tema salvo, o toy cai no claro/escuro do sistema
  via `prefers-color-scheme`.

Referência: `toys/gancopy/index.html` é o toy exemplar do padrão.

`node build/check-bundle.mjs` valida esse contrato em todos os toys: casca
canônica, logo compartilhado embutido (e nenhum asset do app), ausência de
classes legadas e ausência de emoji.

## Bundle HTML único (entregável)

O entregável oficial do projeto é um **único arquivo HTML autocontido**,
`dist/index.html`, que embute:

- todos os toys (como `<iframe srcdoc>`, com seus CSS/JS já inline);
- CSS/JS locais de `vendor/` e `app.js`/`styles.css` da aplicação;
- imagens e fontes (`logo.svg` dos toys, `logo.png`/`favicon.png` do app,
  bootstrap-icons, fonts do vendor) em base64;
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