---
name: classify-court
description: Classifica nomes de varas/juizados em Tipo (Comum/Juizados), Número, Classe (VC/JEC) e Comarca. Aceita input via stdin, --file ou --text. Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: classify-court.js
params:
  file: Caminho para arquivo com lista de varas (uma por linha)
  text: String inline com nome(s) de vara(s)
  tsv: Saída tabulada TSV (padrão: true)
---

# Classify Court

## Uso

```bash
# Via stdin
echo "2ª Vara Cível da Comarca de Teresina-PI" | node classify-court.js

# Via --text
node classify-court.js --text "1º Juizado Especial Cível de São Luís-MA"

# Via --file
node classify-court.js --file lista-varas.txt

# Saída TSV (padrão): Tipo    Número    Classe    Comarca
```
