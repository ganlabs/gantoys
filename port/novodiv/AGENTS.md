# AGENTS.md — Guia para Agentes de IA

> Instruções, convenções e regras para agentes de IA que trabalham no **NovoDiv**.
> Este arquivo é lido **antes** de qualquer alteração no código.

---

## 1. O que é o NovoDiv

App single-file (`index.html`) escrito em **HTML + CSS + JavaScript vanilla** que divide PDFs integrais de processos jurídicos brasileiros, extraindo automaticamente a Petição Inicial. **Sem backend, sem build, sem dependências locais.**

Antes de sugerir mudanças, **leia**:
- [`README.md`](README.md) — visão geral e uso
- [`SPEC.md`](SPEC.md) — especificação técnica completa e reconstrução heurística

---

## 2. Stack e Restrições (NÃO MUDAR SEM AUTORIZAÇÃO)

| Item | Decisão | Motivo |
|------|---------|--------|
| **Linguagem** | JavaScript vanilla (ES2020+) | App deve abrir direto no navegador, sem build |
| **CSS** | CSS puro (sem Tailwind, sem frameworks) | Tamanho mínimo do app, zero dependências |
| **PDF read** | `pdf.js` v3.11.174 via CDN | Líder de mercado, MIT |
| **PDF write** | `pdf-lib` v1.17.1 via CDN | Líder de mercado, MIT |
| **OCR Fallback** | `Tesseract.js` v5 via CDN | OCR local de emergência para PDFs escaneados |
| **Persistência** | File System Access API | Única forma de salvar binários em pasta local no Chrome/Edge |
| **Backend** | ❌ Nenhum | Tudo client-side por requisito de privacidade |
| **Build step** | ❌ Nenhum | `git clone && abrir index.html` deve funcionar |
| **NPM/yarn** | ❌ Não usar | Nenhuma dependência local |
| **TypeScript** | ❌ Não usar | Sem build step |
| **React/Vue/Svelte** | ❌ Não usar | Sem build step |

> ⛔ **NUNCA** introduza dependências locais, build steps ou frameworks. Mudar isso é redesign de produto, não refatoração.

---

## 3. Estrutura de arquivos

```
novodiv/
├── index.html              # 🏆 O APP INTEIRO — não criar outros .html/.js/.css
├── logo.png
├── favicon.png
│
├── .untracked/             # 🙈 Pasta ÚNICA onde ficam todas as pastas de trabalho/amostras do usuário:
│   ├── Baixados/           #    - PDFs baixados de demonstração
│   ├── processos/          #    - PDFs integrais de entrada
│   ├── NOVOS/              #    - PDFs novos a processar
│   ├── erros/              #    - PDFs de casos de borda/erro
│   ├── procon/             #    - Notificações PROCON
│   └── teste1/             #    - PDFs gerados/divididos
│
├── README.md
├── SPEC.md
├── AGENTS.md               # este arquivo
└── LICENSE
```

**Todas as pastas de trabalho do usuário e PDFs de teste** devem residir exclusivamente dentro de `.untracked/` — **nunca versionar PDFs ou criar pastas de PDF na raiz do repositório**.

---

## 4. Convenção de código

### 4.1 Estilo JavaScript
- **Indentação:** 4 espaços
- **Aspas:** simples (`'`) para strings, duplas (`"`) em JSON
- **Ponto e vírgula:** sempre
- **`const` por padrão**, `let` apenas se reatribuído, **nunca** `var`
- **Arrow functions** em callbacks, **function declarations** no top-level
- **Nomes:**
  - Funções: `camelCase` (`detectInicialRange`, `isSystemPage`)
  - Constantes globais: `UPPER_SNAKE_CASE` (`START_PATTERNS`, `CLOSING_PATTERNS`)
  - Variáveis: `camelCase` descritivo (`pagesText`, `endById`)
- **Comentários:** português para lógica de negócio (é o que o usuário lê), inglês só para coisas técnicas genéricas
- **Logs de UI:** utilizar loggers de interface (ex: `miniLog`, `console.log`)

### 4.2 Estrutura interna do `index.html`
O arquivo está organizado em seções claramente delimitadas por comentários:

```js
// ============================================================
// ALGORITHM v7   ← funções puras de detecção + OCR
// ============================================================

// ============================================================
// UI DASHBOARD CONTROLLER ← handlers de DOM, visualizador Canvas, zoom, etc.
// ============================================================
```

**Sempre preservar essa organização** ao adicionar novas funções.

### 4.3 Visualizador Canvas Customizado (`customViewer`)
- **Fit Scale:** Sempre recalcular proporcionalmente à viewport via `getFitScale()`.
- **Wheel Throttle Cooldown:** Manter a trava de **120ms** para evitar saltos acidentais de página em mouses de alta rotação ou trackpads.
- **Renderização Assíncrona:** Respeitar a flag `isRenderingPage` durante chamadas para evitar concorrência no Canvas.

---

## 5. Convenção de commits

Seguimos **Conventional Commits** em português (título curto) com escopo opcional:

```text
<tipo>(<escopo>): <descrição curta>

<corpo opcional explicando o "quê" e o "porquê">
```

### Tipos permitidos

| Tipo | Quando usar | Exemplo |
|------|-------------|---------|
| `feat` | Nova funcionalidade | `feat(ui): adiciona suporte a zoom fit` |
| `fix` | Correção de bug | `fix(end): corrige endByContent quando OAB vem antes` |
| `docs` | Só documentação | `docs: atualiza SPEC.md com fase 0.5` |
| `refactor` | Mudança interna sem mudar comportamento | `refactor: extrai isRealClosing para função pura` |
| `test` | Adiciona/corrige testes | `test: adiciona casos de PROCON` |
| `chore` | Manutenção (deps, configs) | `chore: adiciona pasta .untracked/ ao .gitignore` |
| `perf` | Performance | `perf: reduz cooldown de scroll para 120ms` |

---

## 6. Pull Requests e Revisão

### 6.1 Checklist antes de abrir PR
- [ ] Mudança foi testada com PDFs reais (de `.untracked/processos/`, `.untracked/NOVOS/`, etc.)
- [ ] Relatório gerado confere com a inspeção manual das páginas
- [ ] Não introduziu dependências locais (`npm`, `package.json`, etc.)
- [ ] Não quebrou a organização de seções do `index.html`
- [ ] Se alterou regex/padrões, atualizou `SPEC.md`
- [ ] Se alterou mecânica de UI/Viewer, atualizou `README.md` e `SPEC.md`

---

## 7. Princípios de design do algoritmo

1. **Conservador > Agressivo:** Na dúvida entre dois cortes, escolha o **menor** (mais cedo encerra a inicial).
2. **Fallback em cascata:** Se heurísticas de texto falharem, acione OCR de emergência ou fallback de conteúdo antes de falhar.
3. **Flags > Erros:** Se houver dúvida, marque `review` para inspeção humana no relatório.
4. **Logs visíveis:** Atualize a barra `mini-log` durante o processamento.

---

## 8. Não faça (anti-patterns)

### ⛔ NUNCA:
- **Não criar arquivos `.js`/`.css` separados** — todo código vai em `index.html`
- **Não introduzir `package.json`** — sem dependências locais
- **Não usar frameworks** (React, Vue, Svelte, Alpine) ou TypeScript
- **Não commitar PDFs reais/novos** em nenhuma pasta do repositório
- **Não fazer upload para servidores externos** — privacidade total é requisito absoluto
- **Não remover a trava de cooldown do scroll** (120ms) do `customViewer`

---

## 9. Versionamento

Incrementado quando há alteração substancial no algoritmo heurístico (ex: "Algorithm v7").

---

*Este arquivo é lido por agentes antes de qualquer alteração.*
