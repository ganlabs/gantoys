---
name: extract-money
description: Extrai valores monetários de textos, normalizando para o padrão brasileiro (vírgula decimal). Remove separadores de milhar e lida com formatos ambíguos. Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: extract-money.js
params:
  file: Caminho para arquivo com lista de textos (um por linha)
  text: String inline com texto(s) contendo valores
  tsv: Saída tabulada TSV (padrão: true)
---

# Extract Money

## Uso

```bash
# Via stdin
echo "R$ 1.234,56" | node extract-money.js

# Saída: 1234,56

# Via --text
node extract-money.js --text "O valor de R$ 500,00 foi pago"

# Via --file
node extract-money.js --file valores.txt
```
