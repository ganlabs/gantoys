---
name: normalizar-cnj
description: Normaliza números de processo para o formato CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO). Aceita números com ou sem formatação. Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: normalizar-cnj.js
params:
  file: Caminho para arquivo com lista de números
  text: String inline com número(s) de processo
  tsv: Saída tabulada TSV (padrão: true)
---

# Normalizar CNJ

## Uso

```bash
# Via stdin
echo "00274762120268160021" | node normalizar-cnj.js

# Via --text
node normalizar-cnj.js --text "0027476-21.2026.8.16.0021"

# Via --file
node normalizar-cnj.js --file processos.txt

# Saída: 0027476-21.2026.8.16.0021
```
