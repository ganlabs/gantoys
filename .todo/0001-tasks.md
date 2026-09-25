# Tasks: Toy gancadastro: planilha de cadastro processada preservando formatação, abas e nomes

**Contract version:** 3
**Work ID:** 0001

## Execution contract

| Component | Root | Regression | Lint | Build | Security | Dev | Health |
|-----------|------|------------|------|-------|----------|-----|--------|
| kit-compartilhado | `toys/shared/kit.js` | `test/shared-kit.test.js e os testes dos toys que consomem o kit` | `eslint.config.mjs registra as funções do kit como globais dos scripts de toy` | `toys/shared/kit.js entra no bundle como asset compartilhado único` | `nenhuma execução dinâmica e nenhum HTML por interpolação` | `N/A` | `tools/integridade-assets.json confere o sha256 de toys/shared/kit.js` |
| toy-gancadastro | `toys/gancadastro/index.html` | `test/toys/gancadastro.test.js` | `npm run lint` | `build/bundle.mjs embute o toy como srcdoc e resolve vendor/jszip como asset` | `npm run security` | `N/A` | `cobertura ≥90% do grupo gancadastro` |
| entrega | `index.html` | `test/help.test.js e test/build.test.js` | `npm run lint` | `node build/manual.mjs && node build/bundle.mjs && node build/check-bundle.mjs` | `npm run security` | `N/A` | `npm run assets:integrity` |

## Global gates
- [ ] `npm test` — suíte completa com cobertura ≥90% por toy e no total passa com exit 0.
- [ ] `npm run lint` — ESLint, incluindo o JS embutido nos HTML, passa com exit 0.
- [ ] `npm run security` — checagens estáticas de segurança passam com exit 0.
- [ ] `npm run assets:integrity` — sha256 dos assets monitorados bate com o manifesto.
- [ ] `node build/check-bundle.mjs` — bundle único respeita o contrato de layout e de assets.

### [ ] [1.1] cnjDigits e formatCnj no kit compartilhado

**Requirement:** FR-007
**Depends on:** none
**Behavior:** toys/shared/kit.js passa a expor cnjDigits e formatCnj para os toys, com formatCnj devolvendo null fora de 20 dígitos, e as duas passam a valer como globais no lint
**Components:** kit-compartilhado
**Files:** `toys/shared/kit.js`, `eslint.config.mjs`, `tools/integridade-assets.json`, `test/shared-kit.test.js`
**Implementation files:** `toys/shared/kit.js`, `eslint.config.mjs`, `tools/integridade-assets.json`
**Test files:** `test/shared-kit.test.js`

**RED:**
- `node --test test/shared-kit.test.js` — a asserção que exige cnjDigits e formatCnj expostos pelo kit falha porque o kit ainda não tem as duas funções

**Implementation:**
1. Acrescentar ao teste do kit a asserção do contrato das duas funções e do valor devolvido para 20 dígitos, para valor já pontuado e para valor fora de 20 dígitos
2. Escrever cnjDigits e formatCnj em toys/shared/kit.js, registrar as globais novas no eslint.config.mjs e regravar o manifesto com node tools/assets-integrity.mjs --update

**ACs:**
- [ ] `node --test test/shared-kit.test.js` — o contrato de cnjDigits e formatCnj passa
- [ ] `npm run lint` — as globais novas do kit passam no lint
- [ ] `npm run assets:integrity` — o manifesto bate com toys/shared/kit.js alterado

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.2] Toy gancadastro: processa a planilha e grava a saída pela ponte

**Requirement:** FR-001
**Depends on:** 1.1
**Behavior:** escolhido um .xlsx e uma pasta de destino, o toy reconhece as colunas de cadastro, reescreve as células com as transformações do kit, reempacota o pacote OOXML preservando formatação, abas e nomes, e grava Cadastro-DD-MM-AAAA_HH-MM.xlsx na pasta escolhida; atende FR-001 a FR-006
**Components:** toy-gancadastro
**Files:** `toys/gancadastro/index.html`, `toys/gancadastro/styles.css`, `toys/gancadastro/script.js`, `test/toys/gancadastro.test.js`
**Implementation files:** `toys/gancadastro/index.html`, `toys/gancadastro/styles.css`, `toys/gancadastro/script.js`
**Test files:** `test/toys/gancadastro.test.js`

**RED:**
- `node --test test/toys/gancadastro.test.js` — a asserção do fluxo ponta a ponta falha porque, com a casca do toy já no baseline, nada é processado nem gravado na pasta escolhida

**Implementation:**
1. Implementar no script a leitura do pacote OOXML (workbook, rels, sharedStrings e worksheets, com endereço reconstruído pela posição), o mapa de cabeçalho por apelido normalizado e as transformações por coluna reusando cnjDigits, formatCnj, normalizeNameValue e extractMoney do kit
2. Implementar a reescrita cirúrgica da célula como texto inline preservando o atributo s, o descarte de célula igual ou com fórmula e a gravação pela ponte da pasta destino com o nome Cadastro-DD-MM-AAAA_HH-MM.xlsx

**ACs:**
- [ ] `node --test test/toys/gancadastro.test.js` — o fluxo do toy, o patch do pacote e a gravação passam
- [ ] `node --test test/preambulo.test.js` — o toy novo respeita o preâmbulo de tema e a casca canônica
- [ ] `npm run lint` — o script do toy passa no lint

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.3] Entrega: navegação, manual embutido e bundle validado

**Requirement:** FR-008
**Depends on:** 1.1, 1.2
**Behavior:** o toy aparece na navegação do app, o manual em toys/help/manual entrou na central de manuais pelo gerador e o bundle único passa na validação de contrato e de integridade
**Components:** entrega
**Files:** `index.html`, `toys/help/manual/gancadastro.md`, `toys/help/index.html`, `test/help.test.js`
**Implementation files:** `index.html`, `toys/help/manual/gancadastro.md`, `toys/help/index.html`
**Test files:** `test/help.test.js`

**RED:**
- `node --test test/help.test.js` — a asserção que exige card e bloco embutido do manual do gancadastro na Ajuda falha porque o manual ainda não existe nem foi embutido

**Implementation:**
1. Acrescentar ao teste da Ajuda a asserção do card e do bloco embutido do manual do gancadastro
2. Escrever toys/help/manual/gancadastro.md, acrescentar o item de navegação data-toy ganacadastro no index.html, rodar node build/manual.mjs, node build/bundle.mjs e node build/check-bundle.mjs

**ACs:**
- [ ] `node --test test/help.test.js` — o manual novo aparece na grade e no índice da Ajuda
- [ ] `npm run check:bundle` — o bundle único passa no contrato de layout e de assets
- [ ] `npm run assets:integrity` — o manifesto bate com todos os assets monitorados

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.4] Descartar o BOM do prólogo XML na leitura do pacote

**Requirement:** EC-001
**Depends on:** 1.2
**Behavior:** o leitor de XML descarta um U+FEFF inicial de cada parte do pacote, de modo que uma planilha exportada pelo Excel (BOM no .rels) volte a ter as abas e as colunas de cadastro reconhecidas
**Components:** toy-gancadastro
**Files:** `toys/gancadastro/script.js`, `test/toys/gancadastro.test.js`
**Implementation files:** `toys/gancadastro/script.js`
**Test files:** `test/toys/gancadastro.test.js`

**RED:**
- `node --test test/toys/gancadastro.test.js` — a asserção que exige o texto da parte sem BOM falha porque o leitor ainda entrega o U+FEFF ao parser

**Implementation:**
1. Acrescentar ao teste do toy a asserção do texto sem BOM e o caso da planilha com BOM no .rels
2. Descartar o BOM no leitor de XML do toy antes de parsear cada parte do pacote

**ACs:**
- [ ] `node --test test/toys/gancadastro.test.js` — o caso do BOM e os demais casos do toy passam
- [ ] `node --test test/preambulo.test.js` — o preâmbulo de tema do toy continua válido
- [ ] `npm run lint` — o script do toy passa no lint

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.5] Reescrever a célula em pacote com prefixo de namespace

**Requirement:** EC-002
**Depends on:** 1.2
**Behavior:** a célula endereçada é reescrita mesmo quando a planilha usa prefixo de namespace (formato exportado pelo Excel) e o elemento gravado mantém o prefixo do documento, de modo que a saída tenha os valores padronizados em vez de sair idêntica à entrada
**Components:** toy-gancadastro
**Files:** `toys/gancadastro/script.js`, `test/toys/gancadastro.test.js`
**Implementation files:** `toys/gancadastro/script.js`
**Test files:** `test/toys/gancadastro.test.js`

**RED:**
- `node --test test/toys/gancadastro.test.js` — a asserção que exige a célula com prefixo reescrita falha porque a busca atual só casa o elemento sem prefixo

**Implementation:**
1. Acrescentar ao teste do toy o caso do pacote prefixado, comparando a célula reescrita e a contagem de alterações
2. Tornar a reescrita tolerante ao prefixo e gravar o elemento com o mesmo prefixo do documento

**ACs:**
- [ ] `node --test test/toys/gancadastro.test.js` — o caso do pacote prefixado e os demais casos do toy passam
- [ ] `node --test test/preambulo.test.js` — o preâmbulo de tema do toy continua válido
- [ ] `npm run lint` — o script do toy passa no lint

**Visual:** N/A
**Documentation:** N/A
