# Cópia Integral e Bradesco

Copia documentos por número de processo entre duas pastas locais. A entrada é um par de pastas (origem e destino) mais as listas de números de processo e, na aba `Bradesco`, de pastas cliente; a saída são os arquivos na pasta de destino e um relatório na tela com o que foi e o que não foi processado. Por padrão a origem é preservada; na aba `Arquivo`, a opção `Mover em vez de copiar` remove o arquivo da origem depois de gravá-lo no destino.

## Requisitos

- Abra o arquivo no Google Chrome ou no Microsoft Edge: a seleção e a cópia das pastas usam a File System Access API.
- Permissão de leitura na pasta de origem e de permissão de escrita na pasta de destino, confirmada na hora da operação. Com `Mover em vez de copiar`, a origem também precisa de escrita, porque o arquivo é removido de lá.
- A busca percorre a pasta de origem inteira, incluindo as subpastas.
- Nenhum arquivo é enviado para a internet: a cópia é local.

## Passo a passo

### Modo `Arquivo`

1. Mantenha a aba `Arquivo` selecionada.
2. Em `Pasta de origem`, clique em `Selecionar origem` e confirme no diálogo `Selecionar pasta`. O nome da pasta escolhida substitui o texto `Nenhuma pasta selecionada`.
3. Em `Pasta de destino`, clique em `Selecionar destino` e confirme do mesmo modo.
4. Cole os números dos processos no campo `Números dos processos`, um por linha.
5. Para mover em vez de copiar, marque `Mover em vez de copiar`; o botão passa a se chamar `Mover arquivos` e os quadros passam a falar em `Movidos`.
6. Clique em `Copiar arquivos` (ou `Mover arquivos`; o botão só habilita com origem, destino e pelo menos um processo).
7. Acompanhe a barra de progresso enquanto a origem é varrida.
8. Confira os contadores e os quadros `Copiados`/`Movidos` e `Não copiados`/`Não movidos`.

### Modo `Bradesco`

1. Clique na aba `Bradesco`.
2. Selecione a pasta de origem com `Selecionar origem` e a de destino com `Selecionar destino`, como no outro modo.
3. Cole os números dos processos em `Números dos processos`, um por linha.
4. Cole as pastas cliente em `Pastas cliente`, uma por linha, na mesma ordem dos processos: o primeiro processo recebe a primeira pasta cliente, e assim por diante.
5. Confira a linha de validação abaixo dos campos.
6. Clique em `Copiar e renomear PDFs` (habilita apenas com as duas listas do mesmo tamanho).
7. Acompanhe a barra e, no fim, os contadores e os quadros de resultado.

### Depois da cópia

1. O texto da barra termina em `Cópia concluída.` (ou `Movimentação concluída.`, com `Mover` marcado); quando nenhum arquivo corresponde, a aba `Arquivo` mostra `Nenhum arquivo correspondente foi encontrado.`
2. Cada linha do quadro `Não copiados` (ou `Não movidos`) vem precedida de um estado: `NÃO LOCALIZADO`, `IGUAL` ou `ERRO`.
3. Use `Copiar lista` no quadro `Não copiados`/`Não movidos` para copiar apenas os números dos processos dessas linhas, um por linha e sem repetir. O rótulo do botão vira `Copiado` por instantes e volta a `Copiar lista`.
4. Rodar a cópia de novo limpa os quadros e os contadores antes de recomeçar.

## Campos e controles

- **Abas `Arquivo` e `Bradesco`** — trocam o painel exibido. A aba `Arquivo` abre a seção `Cópia por número de processo`, com a descrição de que localiza todos os arquivos cujo nome contenha um dos processos informados e os copia mantendo o nome original; a aba `Bradesco` abre `Cópia e renomeação de iniciais`. Cada aba mantém as suas próprias pastas, listas e resultados; trocar de aba não apaga o que já foi feito na outra.
- **Selecionar origem** — abre o diálogo de pasta em modo somente leitura; com `Mover em vez de copiar` marcado na aba `Arquivo`, abre em leitura e escrita, porque o arquivo é removido de lá. O nome escolhido substitui `Nenhuma pasta selecionada`. Cancelar a seleção não altera o que já estava escolhido.
- **Selecionar destino** — o mesmo diálogo, em modo de leitura e escrita.
- **Mover em vez de copiar** (aba `Arquivo`) — caixa de seleção desmarcada por padrão. Marcada, o arquivo é gravado no destino e removido da origem; o botão passa a `Mover arquivos`, os contadores viram `Movidos`/`Não movidos` e os quadros passam a falar em movimentação. Marcar a opção com uma origem já escolhida descarta essa origem, para que ela seja escolhida de novo em leitura e escrita.
- **Números dos processos** — uma linha por processo; o contador ao lado mostra `N processos` (ou `1 processo`). Os exemplos do marcador são `12345` e `0001234-56.2026.8.00.0000`. Linhas vazias são ignoradas e a busca percorre também as subpastas da origem.
- **Pastas cliente** — só na aba `Bradesco`; uma linha por pasta, com o contador `N pastas` (ou `1 pasta`). A linha de validação abaixo das listas mostra `Informe os processos e as pastas cliente.` quando as duas estão vazias, `As listas precisam ter a mesma quantidade: N processo(s) e M pasta(s).` quando os tamanhos divergem, ou `N correspondência(s) pronta(s) para cópia.` quando estão pareadas. A dica fixa é `A ordem das linhas define a correspondência: o primeiro processo recebe a primeira pasta cliente, e assim por diante.`
- **Copiar arquivos** / **Mover arquivos** (aba `Arquivo`) — habilita só com origem, destino e ao menos um processo. Só o rótulo muda com a opção de mover.
- **Copiar e renomear PDFs** (aba `Bradesco`) — habilita só com origem, destino e as duas listas com a mesma quantidade de linhas.
- **Copiar lista** — habilita quando existe pelo menos um processo no quadro `Não copiados`/`Não movidos`; copia somente os números desses processos, sem caminhos e sem mensagens.

## Resultado

Na aba `Arquivo`:

- É copiado (ou movido) todo arquivo de qualquer subpasta da origem cujo nome ou caminho contenha um dos processos informados, mantendo o nome original. Vários arquivos podem atender ao mesmo processo. Para processos no formato CNJ, a busca localiza o arquivo tanto no formato pontuado quanto no formato sem pontuação (e vice-versa).
- O contador `Encontrados` conta os arquivos que casaram com algum processo; `Copiados`/`Movidos` e `Não copiados`/`Não movidos` dividem esse total.
- Cada linha do quadro `Copiados` traz o caminho relativo do arquivo na origem e o estado `COPIADO` ou `ATUALIZADO`. Com `Mover` marcado, o estado de sucesso é `MOVIDO` e a mensagem recebe o sufixo ` (movido)`; um destino sobrescrito fica `ATUALIZADO` com ` (sobrescrito e movido)`; quando o destino já tinha o mesmo conteúdo, nada é regravado e a mensagem é ` (movido; já havia o mesmo conteúdo no destino)`.
- Processos sem nenhum arquivo recebem a linha `NÃO LOCALIZADO` com a mensagem `<processo>: nenhum arquivo localizado na origem.`
- Quando nada é encontrado, o total fica em zero e aparece a linha `Nenhum arquivo encontrado para os processos informados.`

Na aba `Bradesco`:

- Para cada processo, o primeiro PDF localizado na origem é copiado com o nome `INICIAL <pasta cliente>.pdf`, usando a pasta cliente da mesma posição da lista.
- O contador `Processos` mostra o tamanho da lista de processos; `Copiados` e `Não copiados` dividem esse total.
- Cada linha do quadro `Copiados` mostra `<processo> -> INICIAL <pasta cliente>.pdf`, com o estado `COPIADO` ou `ATUALIZADO`.
- Processos sem PDF recebem a linha `NÃO LOCALIZADO` com a mensagem `<processo>: nenhum PDF localizado.`

Nas duas abas, os quadros `Copiados` e `Não copiados` só aparecem quando têm conteúdo, e o destino é sempre a pasta escolhida em `Selecionar destino` (sem recriar as subpastas da origem).

## Avisos e limitações

- Erros explícitos de seleção aparecem em uma caixa de alerta do navegador. A escolha da pasta não tem limite de tempo.
- Se o navegador cancelar ou recusar a escolha, o diálogo do app permite outra tentativa. O botão `Cancelar` encerra a escolha.
- Se a cópia ficar 2 minutos sem enviar progresso, o processo é interrompido com `A operação de cópia não respondeu.` e a barra mostra `Não foi possível concluir a cópia.`
- Se as pastas escolhidas não estiverem mais disponíveis, a cópia falha com `Selecione novamente as pastas de origem e destino.`; sem permissão, falha com `É necessário conceder permissão de leitura na origem e escrita no destino.` Com `Mover` marcado, a mensagem de permissão é `É necessário conceder permissão de leitura na origem e escrita no destino (e na origem para mover).`
- Um arquivo já existente no destino com o mesmo conteúdo não é recopiado: entra no quadro `Não copiados` com o estado `IGUAL` e o motivo `já existe no destino com o mesmo conteúdo`. Se o arquivo do destino for o mesmo arquivo da origem, o motivo é `origem e destino são o mesmo arquivo` (e, com `Mover`, nada é apagado).
- Um arquivo já existente com conteúdo diferente é sobrescrito, recebe o estado `ATUALIZADO` e o sufixo ` (sobrescrito)` no relatório. O toy não pergunta antes de sobrescrever.
- Com `Mover em vez de copiar`, o arquivo é gravado no destino e só então removido da origem. Se a remoção falhar (por exemplo, arquivo em uso), o destino fica com o arquivo e a linha entra em `Não movidos` com o estado `ERRO` e a mensagem `<caminho>: não foi possível remover da origem: <motivo>`. A ação é definitiva: o toy não usa a lixeira nem pergunta antes de remover.
- No modo `Bradesco` só entram arquivos com nome terminando em `.pdf` e cada processo consome apenas o primeiro PDF que casar.
- O destino é plano: arquivos vindos de subpastas diferentes com o mesmo nome caem na mesma pasta, e o último processado sobrescreve o anterior.
- Sem `Mover`, nada é movido, renomeado ou apagado na origem; com `Mover`, o arquivo correspondente sai da origem e as subpastas vazias permanecem. Ao final, o texto da barra de progresso continua mostrando a contagem de `analisado(s)` e `copiado(s)`/`movido(s)`.

## Detalhes técnicos

- Correspondência de processo: cada número informado é normalizado uma vez (texto em minúsculas e apenas os dígitos). Um arquivo casa quando o caminho em minúsculas contém o processo informado (para processos com algum caractere não numérico) ou quando os dígitos do caminho contêm todos os dígitos do processo.
- O relatório marca como processados os estados `ok` (arquivo novo ou removido da origem) e `updated` (sobrescrito); `same`, `missing` e `fail` vão para `Não copiados`/`Não movidos`. Com `Mover`, o estado `ok` aparece como `MOVIDO`.
- Durante a varredura, o progresso é enviado no máximo a cada 120 milissegundos e a barra fica cheia, com o texto `N analisado(s) | M copiado(s)` (ou `M movido(s)`); o texto inicial é `Procurando e copiando arquivos...` (aba `Arquivo`, ou `Procurando e movendo arquivos...` com `Mover`) ou `Procurando e copiando PDFs...` (aba `Bradesco`).
- A comparação de conteúdo entre origem e destino é feita em blocos de 1 MiB, com comparação prévia de tamanho.
- A gravação usa um fluxo de escrita que trunca o arquivo de destino, por isso um arquivo existente é sempre sobrescrito e nunca renomeado com sufixo.
- A remoção usa `removeEntry` do diretório pai do arquivo na origem; a permissão de escrita na origem é pedida já na seleção da pasta quando `Mover` está marcado.
