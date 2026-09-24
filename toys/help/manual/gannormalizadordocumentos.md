# Normalizador CPF/CNPJ

Recebe uma lista de documentos, um por linha, e devolve cada um no padrão oficial de CPF ou CNPJ, com o tipo identificado. Não grava arquivos: a saída fica na tela e na área de transferência.

## Requisitos
- Nenhuma dependência externa e nenhum download: o toy roda offline, dentro do próprio navegador.
- Para `Copiar resultado` é preciso que a área de transferência esteja disponível; quando a API do navegador falha, o toy usa a cópia por seleção temporária de texto.
- Os documentos não saem da máquina: todo o processamento é local.

## Passo a passo
1. Cole os documentos no campo `Dados`, um por linha.
2. Clique em `Processar`.
3. Confira a seção `Resultado`: o resumo com o número de linhas e a lista com o tipo e o valor normalizado de cada linha.
4. Clique em `Copiar resultado` para levar a coluna normalizada para onde precisar.
5. Clique em `Limpar` para esvaziar a entrada e esconder o resultado.

## Campos e controles
- **Dados** — área de texto livre, uma entrada por linha. Linhas em branco são descartadas, espaços no início e no fim de cada linha são ignorados e, em cada linha, só o trecho antes do primeiro `|` é considerado.
- **Processar** — aplica a normalização ao conteúdo atual do campo e exibe o resultado. Sempre disponível, inclusive com o campo vazio.
- **Copiar resultado** — copia apenas a coluna dos documentos normalizados, uma por linha, sem cabeçalho e sem a coluna de tipo. Depois da cópia o botão mostra `Copiado` por cerca de 1,6 segundo e volta ao texto `Copiar resultado`. Não faz nada enquanto não houver resultado.
- **Limpar** — esvazia `Dados`, esconde a seção `Resultado` e devolve o foco para o campo.

## Resultado
- A seção `Resultado` mostra o resumo `N linhas processadas.`, ou `1 linha processada.` quando há uma única linha.
- A lista tem duas colunas: `Tipo`, com `CPF`, `CNPJ` ou `INVÁLIDO`, e `Normalizado`, com o documento formatado.
- Exemplo de transformação:

```
entrada: 12345678901          -> Tipo: CPF       Normalizado: 123.456.789-01
entrada: 12.345.678/0001-95   -> Tipo: CNPJ      Normalizado: 12.345.678/0001-95
entrada: abc                  -> Tipo: INVÁLIDO  Normalizado: (vazio)
```

- O texto copiado por `Copiar resultado` contém somente a segunda coluna, uma linha por documento, separada por tabulação.
- O toy não cria nem altera arquivos ou pastas.

## Avisos e limitações
- Qualquer entrada cuja contagem de dígitos não seja 11 nem 14 recebe o rótulo `INVÁLIDO`, e a coluna `Normalizado` mostra os dígitos encontrados, que podem sair vazios quando a linha não tem nenhum dígito.
- Não há validação de dígito verificador: a decisão depende exclusivamente da quantidade de dígitos.
- Toda pontuação da entrada é descartada, não reaproveitada; a máscara é montada do zero a partir dos dígitos.
- Tudo o que vem depois do primeiro `|` na linha é ignorado.
- Este toy não produz mensagens de erro para o tipo de operação que executa; a área de aviso da tela só é usada por operações que retornam erro.
- Se uma linha tiver mais de 14 dígitos, por exemplo um CPF e um CNPJ colados, o resultado é `INVÁLIDO` com todos os dígitos.

## Detalhes técnicos
- As linhas são obtidas por `text.split(/\r?\n/)`, com `trim` em cada uma e descarte das vazias.
- Os dígitos saem de `line.split('|')[0].replace(/\D/g, '')`.
- Com 11 dígitos a máscara é `###.###.###-##`; com 14 dígitos, `##.###.###/####-##`; qualquer outro tamanho devolve os dígitos sem máscara.
- O pareamento entre entrada e saída é sempre posicional: cada linha de entrada gera exatamente uma linha de saída, na mesma ordem.
