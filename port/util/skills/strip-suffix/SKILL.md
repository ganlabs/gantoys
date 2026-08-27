---
name: strip-suffix
description: Remove sufixo de strings, linha a linha. Útil para limpar listas de cidades/estados. Aceita input via stdin, --text ou --file. Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: scripts/strip-suffix.js
params:
  suffix: Sufixo a remover (default: -PI)
  text: String inline (uma linha = um item)
  file: Caminho para arquivo com lista de strings
  tsv: Saída tabulada TSV (padrão: true)
---

# Strip Suffix

## Uso

```bash
# Via stdin
echo "Teresina-PI" | node scripts/strip-suffix.js

# Via --text
node scripts/strip-suffix.js --text "Teresina-PI"

# Com sufixo customizado
echo "foo.bar" | node scripts/strip-suffix.js --suffix ".bar"

# Via --file
node scripts/strip-suffix.js --file cidades.txt

# Saída TSV (padrão): Original    Sem sufixo
echo "Teresina-PI" | node scripts/strip-suffix.js
```
