# Removedor por Wildcard

Remove ou substitui trechos de cada linha usando um padrão wildcard. A entrada é uma lista de textos, um por linha; a saída é uma tabela com a linha original e a linha resultante.

## Requisitos
- Navegador com JavaScript habilitado. Nada é enviado para a internet e nenhum arquivo é lido ou gravado.
- A cópia usa a área de transferência do navegador, com alternativa interna quando o navegador bloqueia o acesso direto.

## Passo a passo
1. Cole os dados no campo `Dados`, um item por linha.
2. Confira o `Modo`: `Remover` (padrão) ou `Substituir`.
3. Ajuste o `Padrão (aceita * e ?)` — o valor inicial é `-*`.
4. No modo `Substituir`, preencha `Substituir por` com o texto que entra no lugar de cada trecho encontrado.
5. Clique em `Processar`.
6. Use `Copiar resultado` para copiar a tabela em TSV, ou `Limpar` para zerar a entrada, voltar os campos aos valores iniciais e esconder o resultado.

## Campos e controles
- **Dados** — área de texto livre. O exemplo do campo é `Cole os dados aqui...`. Cada linha é aparada e as linhas vazias são descartadas.
- **Modo** — `Remover` apaga todos os trechos que casam com o padrão; `Substituir` troca cada trecho casado pelo conteúdo de `Substituir por`.
- **Padrão (aceita * e ?)** — `*` representa qualquer sequência (inclusive vazia) e `?` representa exatamente um caractere. Parênteses agrupam o padrão e são repassados para a expressão regular. Valor inicial `-*`, que apaga do primeiro hífen até o fim da linha. Fica sempre habilitado, inclusive no modo `Remover`.
- **Substituir por** — só aparece quando o `Modo` é `Substituir`. Começa vazio, o que faz o trecho casado ser apagado. É ocultado novamente ao voltar para `Remover`.
- **Processar** — aplica o padrão ao conteúdo atual do campo.
- **Limpar** — esvazia `Dados`, restaura `Modo` para `Remover` e o padrão para `-*`, limpa os resultados e devolve o foco ao campo `Dados`.
- **Copiar resultado** — copia as linhas da tabela em TSV, sem cabeçalho e com as duas colunas. Fica sem efeito enquanto não houver resultado.

## Resultado
- Resumo `N linhas processadas.` — no singular, `1 linha processada.`.
- Tabela com a coluna `Original` e uma segunda coluna que muda com o modo: `Sem trecho` em `Remover` e `Substituído` em `Substituir`.
- Linhas em que o padrão não casa aparecem com o mesmo texto nas duas colunas.
- A cópia gera uma linha por item, com as colunas separadas por tabulação.
- O toy não cria arquivos nem pastas.

## Avisos e limitações
- Com o campo de padrão vazio, o processamento é interrompido com `Informe um padrão.` e nenhuma tabela é montada.
- Padrão que não pode ser compilado, por exemplo com parênteses desbalanceados, gera `O padrão informado não pôde ser processado.`
- A comparação diferencia maiúsculas de minúsculas.
- Não há retrorreferência: os parênteses agrupam, mas não existe sintaxe para repetir o grupo capturado na saída.
- O mesmo padrão é aplicado a todas as ocorrências da linha, não só à primeira.

## Detalhes técnicos
- Conversão do padrão para expressão regular: `*` vira `.*`, cada `?` vira `.`, os parênteses são mantidos como delimitadores de grupo e todos os demais caracteres são escapados. A expressão é criada com a flag `g` (todas as ocorrências) e sem a flag `i` (sensível a maiúsculas).
- O texto de `Substituir por` é passado direto para a substituição nativa do navegador, então sequências como `$&` e `$1` são interpretadas ali, não escritas literalmente.
- Exemplos de padrão: `-*` transforma `123-PI` em `123`; `-?` transforma `1234-PI` em `1234I`, porque apaga o hífen e o caractere seguinte; `-PI` apaga apenas as ocorrências de `-PI`; `*.pdf` apaga a linha inteira quando ela termina em `.pdf`, porque `*` é guloso.
- Cada `?` vale um caractere isolado: o padrão `-??` só casa onde houver hífen, um caractere, outro hífen e mais um caractere (como em `A-B-1`).
- A substituição é global: `A-1-B-2` com o padrão `-*` vira `A`.
