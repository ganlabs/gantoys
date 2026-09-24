# Normalizador de Pastas IRIS

Recebe uma lista de identificadores de pastas IRIS, um por linha, e devolve cada valor sem o prefixo `IRIS` e sem zeros à esquerda. Não toca em arquivos nem em pastas do disco: a saída fica na tela e na área de transferência.

## Requisitos
- Nenhuma dependência externa e nenhum download: o toy roda offline, dentro do próprio navegador.
- Para `Copiar resultado` é preciso que a área de transferência esteja disponível; quando a API do navegador falha, o toy usa a cópia por seleção temporária de texto.
- Nenhuma permissão de pasta é pedida: o toy não lê nem grava no sistema de arquivos.

## Passo a passo
1. Cole os identificadores no campo `Dados`, um por linha, no formato mostrado na dica da tela: `IRIS00998585`.
2. Clique em `Processar`.
3. Confira a seção `Resultado`: o resumo com o número de linhas e a lista com o valor normalizado de cada linha.
4. Clique em `Copiar resultado` para levar a lista normalizada para onde precisar.
5. Clique em `Limpar` para esvaziar a entrada e esconder o resultado.

## Campos e controles
- **Dados** — área de texto livre, uma entrada por linha. Linhas em branco são descartadas e espaços no início e no fim de cada linha são ignorados. Não há campo de configuração nesta ferramenta.
- **Processar** — aplica a normalização ao conteúdo atual do campo e exibe o resultado. Sempre disponível, inclusive com o campo vazio.
- **Copiar resultado** — copia a coluna normalizada, uma linha por linha, sem cabeçalho. Depois da cópia o botão mostra `Copiado` por cerca de 1,6 segundo e volta ao texto `Copiar resultado`. Não faz nada enquanto não houver resultado.
- **Limpar** — esvazia `Dados`, esconde a seção `Resultado` e devolve o foco para o campo.

## Resultado
- A seção `Resultado` mostra o resumo `N linhas processadas.`, ou `1 linha processada.` quando há uma única linha.
- A lista tem uma única coluna, com o cabeçalho `Normalizado`.
- Exemplo de transformação:

```
entrada: IRIS00998585   -> saída: 998585
entrada: iris-000123    -> saída: 123
entrada: IRIS 0025      -> saída: 25
entrada: IRIS000        -> saída: 0
entrada: 000123         -> saída: 123
```

- O texto copiado por `Copiar resultado` tem uma linha por entrada, sem cabeçalho.
- O pareamento é posicional: cada linha de entrada gera exatamente uma linha de saída, na mesma ordem.
- O toy não cria, renomeia nem move arquivos ou pastas.

## Avisos e limitações
- O prefixo é removido apenas no início do valor, sem diferenciar maiúsculas de minúsculas e aceitando, no máximo, um separador opcional entre o prefixo e o número, entre `-`, `_`, `:` e `/`, com espaços ao redor permitidos.
- Quando o prefixo aparece repetido, só a primeira ocorrência é removida: `IRISIRIS001` sai como `IRIS001`.
- Os zeros à esquerda são removidos apenas enquanto houver um dígito depois deles. Um valor só de zeros, como `IRIS000`, sai como `0`.
- Zeros no meio do valor são preservados: `IRIS1000` sai como `1000`.
- O restante do texto não é alterado: maiúsculas e minúsculas são mantidas e nenhuma pontuação interna é removida. `IRIS PASTA 01` sai como `PASTA 01`.
- Valores sem o prefixo `IRIS` passam pelo mesmo tratamento: só os zeros à esquerda são removidos, como em `000123`, que sai como `123`.
- Como o toy só produz texto, renomear pastas ou arquivos depende de você aplicar a lista no gerenciador de arquivos ou em outro processo.
- Este toy não produz mensagens de erro para o tipo de operação que executa; a área de aviso da tela só é usada por operações que retornam erro.

## Detalhes técnicos
- As linhas vêm de `text.split(/\r?\n/)`, com `trim` em cada uma e descarte das vazias.
- O prefixo é removido com a expressão `^iris\s*[-_:/]?\s*`, aplicada sem diferenciar maiúsculas de minúsculas.
- Os zeros à esquerda são removidos com a expressão `^0+(?=\d)`, que exige um dígito logo depois dos zeros removidos.
- O cabeçalho da saída é sempre `Normalizado`, uma coluna por linha.
