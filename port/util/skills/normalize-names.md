---
name: normalize-names
description: Normaliza nomes/palavras para ASCII maiúsculo, removendo acentos e caracteres especiais. Útil para pads de cidades, partes processuais, etc. Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: normalize-names.js
params:
  file: Caminho para arquivo com lista de nomes
  text: String inline com nome(s)
  sep: Separador dos itens no input (padrão: ","; use "\\n" para linhas)
  tsv: Saída tabulada TSV (padrão: true)
---

# Normalize Names

## Uso

```bash
# Via stdin (um por linha)
echo "São Paulo" | node normalize-names.js --sep "\\n"

# Via --text com separador padrão (vírgula)
node normalize-names.js --text "João,Maçã,França"

# Via --file
node normalize-names.js --file cidades.txt

# Saída: SAO PAULO, JOÃO -> JOAO, MAÇÃ -> MACA
```
