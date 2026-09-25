# Tasks: gancadastro: layout compacto e regras avançadas de cadastro

**Contract version:** 3
**Work ID:** 0002

## Execution contract

| Component | Root | Regression | Lint | Build | Security | Dev | Health |
|-----------|------|------------|------|-------|----------|-----|--------|
| toy-gancadastro | `toys/gancadastro/index.html` | `test/toys/gancadastro.test.js` | `npm run lint` | `node build/bundle.mjs && node build/check-bundle.mjs` | `npm run security` | `N/A` | `cobertura >= 90%` |

## Global gates
- [ ] `npm test` — suíte completa verde.
- [ ] `npm run lint` — ESLint sem erros.
- [ ] `node build/check-bundle.mjs` — integridade do bundle.

### [ ] [2.1] Layout compacto e seletores lado a lado em .folder-grid

**Requirement:** FR-001
**Depends on:** none
**Behavior:** Atualiza toys/gancadastro/index.html e styles.css para usar .folder-grid e .folder-card nos seletores de arquivo e pasta, removendo a área de logs e ajustando o script para não emitir logs.
**Components:** toy-gancadastro
**Files:** `toys/gancadastro/index.html`, `toys/gancadastro/styles.css`, `toys/gancadastro/script.js`, `test/toys/gancadastro.test.js`
**Implementation files:** `toys/gancadastro/index.html`, `toys/gancadastro/styles.css`, `toys/gancadastro/script.js`
**Test files:** `test/toys/gancadastro.test.js`

**RED:**
- `node --test test/toys/gancadastro.test.js` — a asserção que verifica a presença de .folder-grid e ausência de #log-area falha antes da alteração

**Implementation:**
1. Atualizar index.html com a estrutura .folder-grid nos seletores e remover a div #log-area
2. Remover as chamadas de registrarLog do script.js e ajustar testes correspondentes

**ACs:**
- [ ] `node --test test/toys/gancadastro.test.js` — os testes de tela e fluxo passam
- [ ] `node --test test/preambulo.test.js` — o preâmbulo de tema continua válido
- [ ] `npm run lint` — o código passa no lint

**Visual:** N/A
**Documentation:** N/A

### [ ] [2.2] Novas colunas e regras avançadas de cadastro

**Requirement:** FR-002
**Depends on:** 2.1
**Behavior:** Implementa as novas colunas e as regras de negócio de Carteira/Parte Ré (Bradesco e resolveCarteiraReu), Comarca (capital da UF, Leopoldina, Jacarepaguá) e Tipo Audiencia ('AC').
**Components:** toy-gancadastro
**Files:** `toys/gancadastro/script.js`, `test/toys/gancadastro.test.js`
**Implementation files:** `toys/gancadastro/script.js`
**Test files:** `test/toys/gancadastro.test.js`

**RED:**
- `node --test test/toys/gancadastro.test.js` — os testes das novas regras de negócio falham antes da implementação

**Implementation:**
1. Escrever testes cobrindo todas as novas regras de substituição de valores
2. Implementar mapeamento ampliado de colunas e as regras condicionais em script.js

**ACs:**
- [ ] `node --test test/toys/gancadastro.test.js` — todas as regras de substituição passam nos testes
- [ ] `node --test test/preambulo.test.js` — preâmbulo continua íntegro
- [ ] `npm run lint` — lint sem erros

**Visual:** N/A
**Documentation:** N/A

### [ ] [2.3] Pintura condicional em styles.xml e documentação no manual

**Requirement:** FR-004
**Depends on:** 2.2
**Behavior:** Adiciona suporte à injeção cirúrgica de preenchimentos sólidos (laranja e vermelho) em styles.xml, aplicando o estilo condicionalmente conforme as regras e atualizando o manual.
**Components:** toy-gancadastro
**Files:** `toys/gancadastro/script.js`, `toys/help/manual/gancadastro.md`, `toys/help/index.html`, `test/toys/gancadastro.test.js`, `test/help.test.js`
**Implementation files:** `toys/gancadastro/script.js`, `toys/help/manual/gancadastro.md`, `toys/help/index.html`
**Test files:** `test/toys/gancadastro.test.js`, `test/help.test.js`

**RED:**
- `node --test test/toys/gancadastro.test.js` — as asserções de pintura em styles.xml e células coloridas falham antes da implementação

**Implementation:**
1. Implementar injeção de fills e cellXfs em styles.xml e a aplicação das cores laranja e vermelha
2. Atualizar toys/help/manual/gancadastro.md, rodar build/manual.mjs e verificar conformidade dos testes

**ACs:**
- [ ] `node --test test/toys/gancadastro.test.js` — os testes de pintura passam
- [ ] `node build/manual.mjs` — manual embutido com sucesso
- [ ] `npm run lint` — lint sem erros

**Visual:** N/A
**Documentation:** N/A
