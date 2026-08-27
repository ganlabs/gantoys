---
name: resolver-carteira-reu
description: Resolve o nome do réu/polo passivo a partir do nome da carteira (cliente/grupo). Usa um banco interno de entradas de saneamento, Mercado Livre, etc. Suporta busca fuzzy por tokens e aliases manuais. Saída TSV. Para copiar pro clipboard, pipe para bin/copy.
scripts:
  node: resolver-carteira-reu.js
params:
  file: Caminho para arquivo com lista de consultas (uma por linha)
  text: String inline com consulta(s)
  tsv: Saída tabulada TSV (padrão: true)
  duo: Modo duo — lê pares separados por tab, resolve cada lado e combina (padrão: false)
---

# Resolver Carteira Réu

## Uso

```bash
# Via stdin
echo "BRK" | node resolver-carteira-reu.js

# Via --text
node resolver-carteira-reu.js --text "Mercado Livre"

# Modo duo (duas colunas tabuladas: carteira_origem \t carteira_destino)
echo -e "BRK\tMercado Livre" | node resolver-carteira-reu.js --duo

# Saída TSV: Consulta    Carteira    Réu
```
