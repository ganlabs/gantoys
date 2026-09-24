# Classificador de Vara

Classifica varas e juizados a partir de uma lista colada na tela, devolvendo tipo, número, classe e comarca de cada linha. A entrada é texto puro (uma vara por linha) e a saída é uma tabela exibida na própria página, também copiável em formato TSV.

## Requisitos

- Todo o processamento acontece no próprio navegador: nada é enviado para a internet.
- A entrada vem apenas do campo de texto da página; o toy não lê arquivos nem pastas.
- Cada vara deve ficar em uma linha. Linhas vazias são descartadas antes do processamento.

## Passo a passo

1. Cole a lista de varas e juizados no campo `Dados`, uma por linha.
2. Clique em `Processar`.
3. A seção `Resultado` aparece com o resumo acima da tabela.
4. Clique em `Copiar resultado` se precisar levar a tabela para outro programa. O rótulo do botão passa a `Copiado` e volta a `Copiar resultado` logo depois.
5. Clique em `Limpar` para esvaziar a entrada e voltar ao estado inicial.

## Campos e controles

- **Dados** — área de texto com o marcador `Cole os dados aqui...`. Aceita qualquer texto, sem validação de formato. A dica fixa acima do campo é `Cole os dados, um por linha.`
- **Processar** — reprocessa o conteúdo atual do campo e regrava a tabela.
- **Limpar** — apaga `Dados`, esconde a seção `Resultado`, limpa a tabela e devolve o foco ao campo de dados.
- **Copiar resultado** — copia as linhas da tabela em TSV (colunas separadas por tabulação, uma linha por registro, sem o cabeçalho). Se a área de transferência falhar, o toy usa uma cópia alternativa e ainda assim exibe `Copiado`.
- Este toy não tem campos de configuração: o bloco de ajustes fica oculto, porque o tipo `classify-court` não define nenhuma opção.

## Resultado

- Tabela com as colunas `Tipo`, `Nº`, `Classe` e `Comarca`, na mesma ordem das linhas não vazias da entrada.
- `Tipo` recebe `Juizados` quando a linha é identificada como juizado e `Comum` nos demais casos.
- `Classe` recebe `JEC` para juizados e `VC` para as varas comuns.
- Resumo exibido acima da tabela: `N linhas processadas.` (ou `1 linha processada.`).
- O toy não cria arquivos, pastas nem relatórios em disco.

## Avisos e limitações

- Linhas vazias (ou só com espaços) não entram na tabela, então a contagem do resumo pode ser menor que o número de linhas coladas.
- Quando a linha não traz nenhum número reconhecível, `Nº` recebe `0` para juizados e `1` para varas comuns.
- Não há validação de entrada nem mensagem de erro específica: o único erro previsto pelo código é `Ferramenta não configurada.`, exibido se o tipo da ferramenta deixar de ser reconhecido.
- A comarca é deduzida por heurística de texto. Linhas fora dos padrões tratados podem resultar em comarca incompleta ou vazia.

## Detalhes técnicos

- `Nº` é o primeiro número inteiro da linha, aceitando `ª`, `º` ou `°` logo depois dos dígitos. Se não houver dígitos, o toy procura palavra por palavra (ignorando espaços, pontos e hífens) por numerais escritos (`PRIMEIRA`/`PRIMEIRO` até `DECIMA`/`DECIMO`, de 1 a 10) e por numerais romanos de `I` a `X`.
- A linha é classificada como juizado quando contém `JEC` como palavra isolada, ou `JUIZADO`, ou `JUI` seguido de espaço ou ponto.
- Comarca: a linha é convertida para maiúsculas, perde um sufixo `/UF` de duas letras e pontos finais; se contiver `DA COMARCA DE `, aproveita o trecho posterior; se contiver ` - `, aproveita o trecho posterior ao separador. Em seguida, caracteres acentuados são reduzidos a ASCII e símbolos são removidos (mantendo letras, números, espaço, `_` e `-`), e são apagados os rótulos de tipo de órgão (`VARA CIVEL`, `VARA JUDICIAL`, `JUIZADO ESPECIAL CIVEL`, `JUIZADO ESPECIAL CIVEL E CRIMINAL`, `JUIZ ESP CIV`, `JUIZADO`), o ordinal (`1ª`, `PRIMEIRA`, `SEGUNDA`, ...), os numerais romanos e um `DE ` inicial.
- A divisão da entrada usa quebras de linha no padrão `\r?\n`, com remoção de espaços nas pontas e descarte de linhas vazias.
