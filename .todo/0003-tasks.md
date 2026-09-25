# Tasks: gancadastro: excecao Santander na carteira e parte re

**Contract version:** 3
**Work ID:** 0003

## Execution contract

| Component | Root | Regression | Lint | Build | Security | Dev | Health |
|-----------|------|------------|------|-------|----------|-----|--------|
| toy-gancadastro | `toys/gancadastro/script.js` | `test/toys/gancadastro.test.js` | `npm run lint` | `node build/bundle.mjs && node build/check-bundle.mjs` | `npm run security` | `N/A` | `cobertura >= 90%` |

## Global gates
- [ ] `npm test` — suíte completa verde.
- [ ] `npm run lint` — ESLint sem erros.

### [ ] [3.1] Implementar exceção Santander para Carteira e Parte Ré

**Requirement:** FR-001
**Depends on:** none
**Behavior:** Se a Carteira contiver 'santander' (case-insensitive), o toy não modifica a Carteira nem a Parte Ré e não aplica pintura laranja nelas, mantendo os valores originais intactos.
**Components:** toy-gancadastro
**Files:** `toys/gancadastro/script.js`, `test/toys/gancadastro.test.js`, `toys/help/manual/gancadastro.md`
**Implementation files:** `toys/gancadastro/script.js`, `toys/help/manual/gancadastro.md`
**Test files:** `test/toys/gancadastro.test.js`

**RED:**
- `node --test test/toys/gancadastro.test.js` — a asserção que verifica que carteira Santander não vira laranja e mantém Parte Ré intacta falha antes da regra

**Implementation:**
1. Escrever teste com linha Santander comprovando preservação e ausência de estilo laranja
2. Adicionar verificação de 'SANTANDER' em calcularNovosValoresECores de script.js e atualizar manual

**ACs:**
- [ ] `node --test test/toys/gancadastro.test.js` — os testes de Santander passam
- [ ] `npm run lint` — lint sem erros

**Visual:** N/A
**Documentation:** N/A
