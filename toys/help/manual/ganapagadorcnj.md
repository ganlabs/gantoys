# Apagador por CNJ

Apaga, em uma pasta local, os arquivos cujo nome contenha um dos números de processo informados. A entrada é uma pasta mais a lista de CNJs; a saída é a pasta com esses arquivos removidos e um relatório na tela com o que foi e o que não foi apagado.

## Requisitos

- Abra o arquivo no Google Chrome ou no Microsoft Edge: a seleção da pasta e a exclusão usam a File System Access API.
- Permissão de leitura e escrita na pasta escolhida, confirmada na hora de apagar.
- A busca percorre a pasta inteira, incluindo as subpastas.
- Nenhum arquivo é enviado para a internet: a exclusão é local.
- A exclusão é definitiva: o toy não move os arquivos para a lixeira.

## Passo a passo

1. Em `Pasta`, clique em `Selecionar pasta` e confirme no diálogo `Selecionar pasta`. O nome da pasta escolhida substitui o texto `Nenhuma pasta selecionada`.
2. Cole os números dos processos no campo `Números dos processos`, um por linha.
3. Clique em `Apagar arquivos` (o botão só habilita com a pasta escolhida e pelo menos um CNJ).
4. Acompanhe a barra de progresso enquanto a pasta é varrida.
5. Confira os contadores e os quadros `Apagados` e `Não apagados`.

## Campos e controles

- **Selecionar pasta** — abre o diálogo de pasta em modo de leitura e escrita. O nome escolhido substitui `Nenhuma pasta selecionada`. Cancelar a seleção não altera a pasta já escolhida.
- **Números dos processos** — uma linha por CNJ; o contador ao lado mostra `N CNJs` (ou `1 CNJ`). Os exemplos do marcador são `12345` e `0001234-56.2026.8.00.0000`. Linhas vazias são ignoradas e a busca percorre também as subpastas.
- **Apagar arquivos** — habilita só com a pasta escolhida e ao menos um CNJ.
- **Copiar lista** — habilita quando existe pelo menos um CNJ no quadro `Não apagados`; copia somente os números desses processos, sem caminhos e sem mensagens.

## Resultado

- É apagado todo arquivo de qualquer subpasta da pasta escolhida cujo nome ou caminho contenha um dos CNJs informados. Vários arquivos podem atender ao mesmo CNJ.
- Para processos no formato CNJ, a busca localiza o arquivo tanto no formato pontuado quanto no formato sem pontuação (e vice-versa).
- O contador `Encontrados` conta os arquivos que casaram com algum CNJ; `Apagados` e `Não apagados` dividem esse total.
- Cada linha do quadro `Apagados` traz o caminho relativo do arquivo apagado e o estado `APAGADO`.
- CNJs sem nenhum arquivo recebem a linha `NÃO LOCALIZADO` com a mensagem `<processo>: nenhum arquivo localizado.`
- Quando nada é encontrado, o total fica em zero e aparece a linha `Nenhum arquivo encontrado para os CNJs informados.`
- Os quadros `Apagados` e `Não apagados` só aparecem quando têm conteúdo.
- Rodar a exclusão de novo limpa os quadros e os contadores antes de recomeçar.

## Avisos e limitações

- Erros de seleção de pasta aparecem em uma caixa de alerta do navegador com a mensagem do erro, ou `Não foi possível selecionar a pasta.` quando não há mensagem; se a seleção não responder em 60 segundos, o erro é `A seleção de pasta não respondeu.`
- Se a exclusão ficar 2 minutos sem enviar progresso, o processo é interrompido com `A operação de exclusão não respondeu.` e a barra mostra `Não foi possível concluir a exclusão.`
- Se a pasta escolhida não estiver mais disponível, a exclusão falha com `A pasta selecionada não está mais disponível. Selecione-a novamente.`; sem permissão, falha com `É necessário conceder permissão de escrita na pasta.`
- Pastas (mesmo as vazias) nunca são apagadas; só arquivos são removidos. Se uma subpasta ficar vazia, ela permanece na pasta.
- O toy não pede confirmação antes de apagar: os arquivos correspondentes são removidos assim que a exclusão começa.
- Um arquivo que não puder ser apagado (por exemplo, bloqueado pelo sistema) entra no quadro `Não apagados` com o estado `ERRO` e o motivo do sistema.

## Detalhes técnicos

- Correspondência de CNJ: cada número informado é normalizado uma vez (texto em minúsculas e apenas os dígitos). Um arquivo casa quando o caminho em minúsculas contém o número informado (para números com algum caractere não numérico) ou quando os dígitos do caminho contêm todos os dígitos do número.
- O relatório marca como apagados apenas o estado `ok`; `missing` e `fail` vão para `Não apagados`.
- Durante a varredura, o progresso é enviado no máximo a cada 120 milissegundos e a barra fica cheia, com o texto `N analisado(s) | M apagado(s)`; o texto inicial é `Procurando e apagando arquivos...`.
- A exclusão usa `removeEntry` do diretório pai de cada arquivo, sem opção recursiva, o que apaga somente o arquivo correspondente e nunca a pasta que o contém.