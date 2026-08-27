---
name: lookup-oab
description: Consulta a UF de uma OAB a partir da tabela de referência (oab-ref.tsv). Aceita input via stdin ou --text com colunas Advogado e OAB separadas por tab. Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: lookup-oab.js
params:
  ref: Caminho para o arquivo TSV de referência (default: oab-ref.tsv no mesmo diretório)
  text: String inline com linhas de "Advogado\\tOAB"
  tsv: Saída tabulada TSV (padrão: true)
---

# Lookup OAB

## Uso

```bash
# Via stdin
echo -e "FERNANDO PASSOS\t152176" | node lookup-oab.js

# Via --text
node lookup-oab.js --text "FERNANDO PASSOS\t152176"

# Com --ref customizado
node lookup-oab.js --ref oab-ref.tsv --text "ADVOGADO\t123456"
```
