# Normalizador de Nomes

Recebe textos de nomes, um por linha, e devolve cada valor em maiúsculas, sem acentos e limitado aos caracteres aceitos pelo cadastro. Não grava arquivos: a saída fica na tela e na área de transferência.

## Requisitos
- Nenhuma dependência externa e nenhum download: o toy roda offline, dentro do próprio navegador.
- Para `Copiar resultado` é preciso que a área de transferência esteja disponível; quando a API do navegador falha, o toy usa a cópia por seleção temporária de texto.
- Suporta colunas separadas por tabulação, o que permite colar direto de uma planilha.

## Passo a passo
1. Cole os nomes no campo `Dados`, um por linha. Para várias colunas, cole com tabulação entre elas, como vem de uma planilha.
2. Clique em `Processar`.
3. Confira a seção `Resultado`: o resumo com o número de linhas e a lista de valores já normalizados.
4. Clique em `Copiar resultado` para levar a saída para onde precisar.
5. Clique em `Limpar` para esvaziar a entrada e esconder o resultado.

## Campos e controles
- **Dados** — área de texto livre, uma entrada por linha. Linhas em branco são descartadas. Cada linha é dividida por tabulação, e cada célula é normalizada de forma independente.
- **Processar** — aplica a normalização ao conteúdo atual do campo e exibe o resultado. Sempre disponível, inclusive com o campo vazio.
- **Copiar resultado** — copia todas as colunas normalizadas, uma linha por linha, com as colunas separadas por tabulação, sem cabeçalho. Depois da cópia o botão mostra `Copiado` por cerca de 1,6 segundo e volta ao texto `Copiar resultado`. Não faz nada enquanto não houver resultado.
- **Limpar** — esvazia `Dados`, esconde a seção `Resultado` e devolve o foco para o campo.

## Resultado
- A seção `Resultado` mostra o resumo `N linhas processadas.`, ou `1 linha processada.` quando há uma única linha.
- Com uma coluna, a lista tem o cabeçalho `Normalizado`. Com mais de uma, os cabeçalhos são `Normalizado 1`, `Normalizado 2` e assim por diante, na ordem das colunas de entrada.
- As colunas são preservadas na mesma ordem e todas as linhas são completadas com valor vazio até o número de colunas da linha mais larga do lote.
- Exemplo de transformação:

```
entrada: João da Silva|123     -> saída: JOAO DA SILVA
entrada: MARIA;SILVA           -> saída: MARIA;SILVA
entrada: José  Carlos          -> saída: JOSE  CARLOS
entrada: sem oab                -> saída: 0
```

- O texto copiado por `Copiar resultado` contém todas as colunas, sem cabeçalho, com tabulação entre as colunas.
- O toy não cria nem altera arquivos ou pastas.

## Avisos e limitações
- O que é corrigido: acentuação e cedilha são removidas, o texto vira maiúsculo, espaços no início e no fim da célula são removidos, e três marcadores internos são traduzidos depois da normalização: `SEM ADV` vira `SEM ADVOGADO`, `SEM OAB` vira `0` e `SEM UF` vira `TJ`.
- O que é removido: todo caractere fora das letras sem acento, dos dígitos, do espaço, do sublinhado, do hífen e do ponto e vírgula. Isso inclui pontos, vírgulas, barras, parênteses, aspas, arrobas e sinais como `&`.
- O que é preservado: dígitos, sublinhado, hífen, ponto e vírgula e os espaços internos, inclusive quando há mais de um espaço seguido entre as palavras.
- O trecho depois do primeiro `|` é descartado na célula, mesmo quando contém informação útil.
- As traduções de `SEM ADV`, `SEM OAB` e `SEM UF` só valem quando a célula inteira, já normalizada, é exatamente esse texto; sozinhas ou em outra posição elas não são alteradas.
- Células vazias continuam vazias, inclusive as criadas para completar linhas com menos colunas.
- Este toy não produz mensagens de erro para o tipo de operação que executa; a área de aviso da tela só é usada por operações que retornam erro.
- O pareamento é posicional: cada linha de entrada gera exatamente uma linha de saída, na mesma ordem.

## Detalhes técnicos
- As linhas vêm de `text.split(/\r?\n/)`, mantendo somente as que têm conteúdo após remover espaços; as células vêm de `line.split('\t')`.
- A normalização de cada célula usa decomposição NFKD e remoção de tudo o que não seja letra sem acento, dígito, espaço, sublinhado, hífen ou ponto e vírgula, seguida de conversão para maiúsculas e remoção de espaços nas pontas.
- Cabeçalhos: uma única coluna gera `Normalizado`; mais de uma gera `Normalizado N`, começando em `Normalizado 1`.
