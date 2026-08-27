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

## Bundle HTML único (entregável)

O entregável oficial do projeto é um **único arquivo HTML autocontido**,
`dist/gantoys.html`, que embute:

- todos os toys (como `<iframe srcdoc>`, com seus CSS/JS já inline);
- CSS/JS locais de `vendor/` e `app.js`/`styles.css` da aplicação;
- imagens e fontes (`logo.png`, `favicon.png`, bootstrap-icons, DM Sans) em base64;
- o worker do pdf.js como `Blob URL` criado pelo documento pai.

Gere localmente com Node (sem dependências externas):

```bash
node build/bundle.mjs      # -> dist/gantoys.html
node build/check-bundle.mjs  # valida integridade do bundle
```

> O toy **Divisor Automático Santander** (`gannovodiv`) usa OCR via
> `tesseract.js` carregado de CDN. Ele já é o único recurso que depende de
> internet; os demais assets são todos embutidos.

## Release automática

O workflow `.github/workflows/build-release.yml` roda em **push para `main`**:

1. gera `dist/gantoys.html` com `node build/bundle.mjs`;
2. valida o bundle;
3. publica o artefato;
4. cria uma **release** no GitHub com o `gantoys.html` anexado
   (tag `v<data>-<sha curto>`).

Repositório destino: `ganlabs/gantoys`.