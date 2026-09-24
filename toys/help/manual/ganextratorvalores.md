# Extrator de Valores

Extrai o número de cada linha colada e o reescreve no padrão brasileiro, com vírgula decimal. Entra uma lista de valores em texto, um por linha; sai uma tabela com a coluna `Extraído` e a mesma lista pronta para copiar.

## Requisitos

- Apenas navegador. O toy não lê arquivos, não usa bibliotecas externas e não envia nada para a internet.
- Cole um valor por linha. Em linhas com campos separados por `|`, apenas o trecho antes da primeira barra é aproveitado.
- Linhas vazias ou só com espaços são ignoradas na contagem e no resultado.

## Passo a passo

1. Cole os valores na caixa `Dados`. O texto de apoio do bloco diz `Cole os dados, um por linha.` e o placeholder da caixa é `Cole os dados aqui...`.
2. Clique em `Processar`.
3. Confira a coluna `Extraído` no bloco `Resultado` e a contagem exibida acima da tabela.
4. Clique em `Copiar resultado` para levar a saída para a área de transferência, ou em `Limpar` para esvaziar a caixa e o resultado.

## Campos e controles

- **Dados** — caixa de texto sem corretor ortográfico, com o placeholder `Cole os dados aqui...`.
- **Processar** — lê o conteúdo atual da caixa, monta a tabela e mostra a contagem `<N> linhas processadas.` (no singular, `1 linha processada.`).
- **Copiar resultado** — copia apenas a coluna de saída, sem cabeçalho e sem repetir a entrada, em valores separados por tabulação. O rótulo muda para `Copiado` por cerca de 1,6 segundo e volta para `Copiar resultado`.
- **Limpar** — apaga o texto, esconde o bloco de resultado, limpa a tabela e a mensagem de erro e devolve o foco à caixa de texto.
- O bloco de ajustes acima da caixa `Dados` não aparece: este toy não declara nenhum campo de configuração.

## Resultado

- Contagem de linhas processadas acima da tabela.
- Tabela com uma única coluna, `Extraído`, com uma linha por valor de entrada na mesma ordem em que foi colado.
- Área de transferência com um valor por linha, em texto separado por tabulação, sem cabeçalho.

## Avisos e limitações

- Linha sem nenhum dígito não gera aviso: a célula correspondente sai vazia.
- Não há mensagem de erro prevista para este modo; nenhuma entrada faz o toy recusar o processamento.
- O toy não soma, não arredonda e não interpreta moeda: ele apenas reescreve cada número.
- Valores ambíguos, escritos com ponto como separador de milhar e sem vírgula, são lidos como decimais: `1.234` sai como `1,234`.
- A saída é apenas a tela e a área de transferência; não há download nem gravação em arquivo.
- Processar de novo substitui todo o resultado anterior, inclusive o texto guardado para copiar.

## Detalhes técnicos

- Para cada linha, o toy pega o trecho antes do primeiro `|` e remove todos os caracteres que não sejam dígito, vírgula, ponto ou hífen.
- Quando o valor tem vírgula e ponto, a última ocorrência decide o formato: se a última vírgula vem depois do último ponto, os pontos são removidos e a vírgula vira ponto; caso contrário, as vírgulas são removidas. Em seguida todo ponto é trocado por vírgula, fixando a vírgula como separador decimal.
- Quando o valor tem apenas ponto, todo ponto vira vírgula. Assim `R$ 1.500,00` sai como `1500`, `2.499,90` sai como `2.499,90` e `1.234.567` sai como `1,234,567`.
- O sufixo `,00` é retirado do fim do resultado, o que transforma valores inteiros escritos com centavos em número simples.
- O hífen é preservado junto dos dígitos, então valores negativos continuam negativos.
- A cópia tenta a área de transferência do navegador e, quando ela é bloqueada, usa uma caixa de texto temporária com o comando de cópia para concluir a operação.
