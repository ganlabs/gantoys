---
name: extract-polos-ativos
description: Extrai os polos ativos de uma planilha TSV de processos, normalizando nomes e documentos (CPF/CNPJ). Expande advogados em colunas dinâmicas (Nome_Adv_N, OAB_Adv_N, CPF_Adv_N). Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: extract-polos-ativos.js
params:
  file: Caminho para arquivo TSV com colunas Processo, Polo, Nome, Número do Documento, Nome Advogado N, OAB Advogado N, CPF Advogado N
  text: String inline com TSV
  polo: Polo a filtrar (default: ATIVO)
  tsv: Saída tabulada TSV (padrão: true)
---

# Extract Polos Ativos

## Uso

```bash
# Via stdin (pipe de TSV)
cat processos.tsv | node extract-polos-ativos.js

# Com polo customizado
cat processos.tsv | node extract-polos-ativos.js --polo PASSIVO

# Via --file
node extract-polos-ativos.js --file processos.tsv
```
