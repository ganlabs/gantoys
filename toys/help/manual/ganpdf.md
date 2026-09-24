# Divisor de PDF

Divide um PDF em partes menores que o tamanho máximo em megabytes informado, testando a soma das páginas antes de fechar cada bloco. Entra um arquivo `.pdf`; saem as partes nomeadas em sequência e um ZIP com todas elas.

## Requisitos

- `pdf-lib` e `jszip` vêm do próprio projeto (`../../vendor/pdf-lib/pdf-lib.min.js` e `../../vendor/jszip/jszip.min.js`); nenhum download externo é feito.
- Um único arquivo por vez, com tipo `application/pdf`.
- O arquivo é lido na máquina do usuário; nada é enviado para a internet.

## Passo a passo

1. Arraste um `.pdf` para a área de seleção ou clique nela e escolha o arquivo. O nome escolhido substitui o texto da área e a linha abaixo passa a mostrar `Tamanho Original: X.XX MB`.
2. Ajuste `Tamanho máximo por parte (MB)` se não quiser usar `3.0`.
3. Clique em `Processar Arquivo`. A faixa de status mostra, em ordem, `Lendo arquivo original...`, `Otimizando e carregando PDF...`, `Analisando N páginas...`, `Processando página X de Y...` e `Finalizando arquivos...`, com a barra acompanhando.
4. Confira o resumo e a lista de partes. Clique em `Baixar Todas as Partes (ZIP)` para levar tudo de uma vez, ou clique no nome de uma parte para baixá-la isolada.

## Campos e controles

- **Área de seleção** — aceita clique e arraste. O texto inicial é `Arraste seu PDF ou clique aqui`; depois da escolha passa a `<nome do arquivo> selecionado`. Arquivo que não seja PDF dispara `Por favor, selecione um arquivo PDF válido.` e a seleção é limpa.
- **Tamanho Original** — apenas informativo, com o tamanho do arquivo em MB com duas casas.
- **Tamanho máximo por parte (MB)** — campo numérico, mínimo `0.1`, passo `0.1`, valor padrão `3.0`, placeholder `Ex: 3.0`. Valor vazio, zero ou negativo dispara `Por favor, insira um tamanho máximo válido.` e o processamento não começa.
- **Processar Arquivo** — fica desabilitado enquanto nenhum arquivo foi escolhido e durante todo o processamento; volta a ficar ativo no fim, inclusive em caso de erro.

## Resultado

- O bloco `Resultado` aparece com o resumo `O arquivo foi dividido em N parte(s) menores que X MB.`
- Lista de links `NOME_parte_1.pdf`, `NOME_parte_2.pdf` e assim por diante, cada um exibido com o tamanho no formato `(X.XX MB)`.
- `Baixar Todas as Partes (ZIP)` gera o arquivo `NOME_dividido.zip` com todas as partes dentro.
- Em todos os nomes, `NOME` é o nome do arquivo original sem a extensão `.pdf`.
- Os arquivos são salvos na pasta de downloads do navegador; o toy não grava em outra pasta.

## Avisos e limitações

- `Ocorreu um erro ao processar o arquivo. Detalhes no console.` — falha ao ler o arquivo ou ao montar os PDFs. A faixa de status volta para `Erro no processamento.` com 0%, e o detalhe técnico fica no console do navegador.
- Uma página sozinha maior que o limite não pode ser reduzida: ela vira uma parte própria, ainda acima do tamanho pedido.
- O toy não compacta nem reamostra imagens nem fontes; o tamanho de cada parte é o do PDF reescrito pelo `pdf-lib`, que costuma ficar próximo do original.
- A divisão é sempre sequencial a partir da página 1 e não aceita intervalo inicial nem ordem diferente das páginas.
- A lista de partes fica só na tela até o clique; se a página for recarregada, a seleção e as partes são perdidas.
- O botão de ZIP não faz nada enquanto a lista de partes estiver vazia.
- Nenhuma página é descartada: a soma das páginas das partes é o total do documento.

## Detalhes técnicos

- O limite em megabytes é convertido para bytes por multiplicação por 1024 duas vezes.
- O algoritmo percorre as páginas em ordem. Para cada página monta um PDF de teste com todas as páginas do bloco corrente mais a página nova, salva em memória e compara o tamanho com o limite.
- Se o teste estourar o limite e o bloco já tiver ao menos uma página, o último bloco válido é fechado e a página atual passa a ser a primeira do próximo bloco. Se o bloco estiver vazio, a página é aceita mesmo acima do limite, garantindo que uma página grande não trave o processo.
- O bloco válido anterior é sempre reaproveitado, então nenhuma página é duplicada entre partes.
- A barra vai de 20% a 80% durante o laço de páginas, usa 5% e 15% nas leituras iniciais, 90% em `Finalizando arquivos...` e 100% em `Concluído!`; o bloco de resultado só aparece depois de uma pausa curta.
- O ZIP é montado no navegador com `JSZip.generateAsync` e a URL temporária é liberada um segundo após o clique.
