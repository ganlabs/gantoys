---
name: normalizar-cpf-cnpj
description: Normaliza CPFs e CNPJs removendo não-dígitos e formatando no padrão oficial (XXX.XXX.XXX-XX / XX.XXX.XXX/XXXX-XX). Detecta automaticamente se é CPF (11 dígitos) ou CNPJ (14 dígitos). Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: normalizar-cpf-cnpj.js
params:
  file: Caminho para arquivo com lista de documentos
  text: String inline com documento(s)
  tsv: Saída tabulada TSV (padrão: true)
---

# Normalizar CPF/CNPJ

## Uso

```bash
# Via stdin
echo "12345678901" | node normalizar-cpf-cnpj.js

# Via --text
node normalizar-cpf-cnpj.js --text "12.345.678/0001-90"

# Via --file
node normalizar-cpf-cnpj.js --file docs.txt

# Saída TSV: Tipo    Normalizado
# CPF	123.456.789-01
# CNPJ	12.345.678/0001-90
```
