---
name: extrair-colunas-tsv
description: Extrai colunas específicas de uma tabela TSV (com header). Aceita input via stdin, --file ou --text. Saída TSV com header. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: extrair-colunas-tsv.js
params:
  cols: Lista de nomes de colunas separadas por vírgula (ex: "Processo,Parte Ré,Valor da Causa")
  file: Caminho para arquivo TSV
  text: String inline com TSV
  tsv: Saída tabulada TSV (padrão: true)
---

# Extrair Colunas TSV

## Uso

```bash
# Extrair colunas específicas
cat tabela.tsv | node extrair-colunas-tsv.js --cols "Núm. Processo,Parte Ré,Valor da Causa,UF"

# Via --text
node extrair-colunas-tsv.js --text "$(cat tabela.tsv)" --cols "Processo,Valor"

# Via --file
node extrair-colunas-tsv.js --file tabela.tsv --cols "Parte Autora,CPFAUTOR"
```
