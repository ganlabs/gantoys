# Divisor Santander

Percorre um lote de PDFs de processo e separa, em cada um, as páginas da Inicial das demais, baixando os arquivos gerados. Entram PDFs nomeados com o CNJ; saem `Inicial`, `Docs Inicial` ou divisões com nome próprio, todos baixados direto para a pasta de downloads do navegador.

## Requisitos

- `pdf.js` (`../../vendor/pdfjs/pdf.min.js`, com worker em `../../vendor/pdfjs/pdf.worker.min.js`) para exibir as páginas e ler o texto, e `pdf-lib` (`../../vendor/pdf-lib/pdf-lib.min.js`) para copiar as páginas.
- Seleção múltipla de arquivos `.pdf`, feita pelo seletor do navegador; os arquivos ficam abertos um a um, não em paralelo.
- O CNJ é procurado no nome do arquivo, no padrão `0000000-00.0000.0.00.0000` ou como 20 dígitos seguidos. Quando não é encontrado, o toy pede o número e avisa que ele serve para nomear os arquivos gerados.
- Os downloads usam o mecanismo do próprio navegador. Não há ZIP, não há escolha de pasta e nada é enviado para a internet.

## Passo a passo

1. Clique em `Selecionar PDFs` e escolha os arquivos do lote. O texto de apoio lembra: `Use Ctrl+Clique para selecionar vários arquivos.`
2. O painel do lote mostra `Total`, `Processados`, `Faltando`, `Em andamento` e `Arquivo atual`, e o primeiro PDF é aberto no visualizador com a notificação `Arquivo carregado`.
3. Confira o painel `CNJ`. Se aparecer `Não detectado`, digite o número no campo com o exemplo `57104727520258090051 ou formatado` e clique em `Aplicar`.
4. Escolha o `Modo de divisão`: `Automático` ou `Personalizado`.
5. No modo `Automático`, navegue até a Inicial, ajuste `Primeira página` e `Última página` ou use os botões de marcação, confira o `Preview da divisão` e clique em `Dividir e baixar PDFs`.
6. No modo `Personalizado`, informe `Nome do arquivo`, `Início` e `Fim`, clique em `Adicionar divisão`, repita para cada corte e clique em `Processar todas as divisões`.
7. No modo `Automático`, o próximo arquivo do lote é aberto sozinho depois de cada divisão; o resumo final do lote aparece quando não há mais arquivos.

## Campos e controles

- **Selecionar PDFs** — abre o seletor múltiplo. Sem nenhum PDF: `Por favor, selecione arquivos PDF válidos.` Arquivos de outro tipo são descartados com o aviso `N arquivo(s) não-PDF foram ignorados.`
- **CNJ** — mostra o número detectado ou `Não detectado`.
- **Campo do CNJ manual** — aceita 20 dígitos, que são formatados automaticamente, ou o padrão já pontuado.
- **Aplicar** — valida e aplica o CNJ digitado, que passa a aparecer com a indicação `(manual)`.
- **Modo de divisão** — `Automático`, que gera `Inicial` e `Docs Inicial`, ou `Personalizado`, que cria vários cortes com nome próprio. Os painéis e os botões de ação trocam conforme a escolha.
- **Primeira página** e **Última página** — números inteiros, mínimo 1, máximo igual ao total de páginas do arquivo; começam em 1 e no total. Se a primeira ficar maior que a última, as bordas ficam vermelhas e o preview para de atualizar.
- **Marcar atual como 1ª** e **Marcar atual como última** — copiam a página exibida para os respectivos campos.
- **Nome do arquivo** — obrigatório; não pode conter os caracteres `< > : " / \ | ? *`.
- **Início** e **Fim** do modo personalizado — inteiros dentro do documento; os botões ao lado copiam a página atual para cada campo.
- **Adicionar divisão** — valida o nome e o intervalo e acrescenta o item em `Divisões criadas`, numerado e com a contagem de páginas.
- **Buscar palavra no PDF...** — campo de busca; `Enter` ou o botão `Buscar` procuram a palavra em todas as páginas.
- **Navegação de página** — botões `Primeira página`, `Página anterior`, `Próxima página` e `Última página`, mais o campo numérico ao centro. Os botões das pontas ficam desabilitados quando a página atual é a primeira ou a última. A roda do mouse sobre o documento também troca de página.
- **Zoom** — botões `Reduzir zoom` e `Aumentar zoom` em passos de 0,25 sobre o valor inicial de 150%, com o percentual exibido ao lado.
- **Dividir e baixar PDFs** e **Processar todas as divisões** — durante o trabalho ficam desabilitados e passam a mostrar `Processando...`.
- **Limpar e recomeçar** — confirma com `Deseja limpar tudo e recomeçar?` e depois avisa `Tudo limpo! Selecione novos PDFs para começar.`
- **Limpar divisões** — remove todas as divisões criadas no modo personalizado.

## Resultado

- `Preview da divisão` com dois cartões: `Inicial`, com o intervalo, a contagem de páginas e o nome `<Inicial><sufixo>.pdf`; e `Docs Inicial`, com as páginas restantes ou `Nenhuma página` seguido de `(Todas as páginas estão na "Inicial")`.
- Downloads: `Inicial - <CNJ>.pdf` e, quando sobram páginas, `Docs Inicial - <CNJ>.pdf`. Sem CNJ o sufixo é omitido e os nomes saem como `Inicial.pdf` e `Docs Inicial.pdf`.
- No modo `Personalizado`, cada divisão gera `<Nome> - <CNJ>.pdf`.
- Bloco `Resultado` com `Arquivo N/M processado!`, a linha `N PDF(s) baixado(s) com sucesso!` e, no fim, `Carregando próximo arquivo...` ou `Todos os arquivos foram processados!`
- Ao terminar o lote, a tela troca pelo resumo `Processamento concluído!` com `Total de arquivos`, `Processados com sucesso`, `Erros` e `Ignorados`, seguido de `Os arquivos foram baixados para sua pasta Downloads.`
- O painel `Processando` mostra a barra e as etapas `Lendo arquivo...`, `Carregando PDF...`, `Criando "Inicial"...`, `Gerando arquivo "Inicial"...`, `Criando "Docs Inicial"...` e `Concluído!`
- Notificações no canto da tela: `Arquivo carregado`, `Iniciando Divisão`, `Processando Divisões`, `Divisões geradas` e `Lote concluído`.

## Avisos e limitações

- `Erro: A primeira página não pode ser maior que a última página!` — validação antes de dividir, no modo automático.
- `Erro ao carregar PDF!` com o nome do arquivo e a mensagem do erro — o arquivo é contado como erro e o próximo da fila é aberto.
- `Erro ao processar PDF!` seguido de `Deseja continuar com o próximo arquivo?` — o arquivo entra como erro e o lote só segue se a continuidade for confirmada.
- `Erro ao processar divisões!` — mesma ideia no modo personalizado, sem perguntar sobre o próximo arquivo.
- `Digite um nome para o arquivo!`, `A página inicial não pode ser maior que a final!`, `Páginas devem estar entre 1 e N!` e `O nome do arquivo contém caracteres inválidos!` — validações da divisão personalizada.
- `Nenhuma divisão criada!` seguido de `Crie ao menos uma divisão antes de processar.` — o processamento personalizado começa com a lista vazia.
- `Digite o número CNJ!`, `Número CNJ inválido! Deve ter 20 dígitos.` e `Formato CNJ inválido!` — validação do CNJ informado à mão.
- `Digite uma palavra para buscar!`, `Nenhum PDF carregado!`, `Palavra não encontrada no documento.` e `Faça uma busca primeiro!` — respostas da busca.
- Sem CNJ detectado e sem preenchimento manual, os arquivos saem como `Inicial.pdf` e `Docs Inicial.pdf`, sem identificação do processo.
- Todos os downloads vão para a pasta padrão do navegador, um arquivo por vez; repetições recebem o sufixo numérico do próprio navegador.
- No modo `Personalizado` com mais de um PDF no lote, ao concluir um arquivo a tela avisa `Carregando próximo arquivo...` e passa sozinha (cerca de 1 segundo depois) para o próximo PDF da fila. A lista de divisões é esvaziada a cada processamento, então os cortes precisam ser criados de novo para o arquivo seguinte.
- Nada marca arquivos como ignorados, então o contador `Ignorados` do resumo final fica em zero.
- As páginas fora do intervalo da Inicial são reunidas em um único arquivo, sem separar cada documento.

## Detalhes técnicos

- O CNJ é procurado primeiro no padrão pontuado de sete dígitos, dois dígitos, quatro dígitos, um dígito, dois dígitos e quatro dígitos; depois em uma sequência de 20 dígitos, que é reescrita no formato `NNNNNNN-DD.AAAA.J.TR.OOOO`.
- O visualizador começa em escala 1.5, com zoom em passos de 0,25 limitados entre 0.5 e 3; cada página é desenhada em canvas pelo `pdf.js`.
- A roda do mouse usa pausa de gesto de 120 ms, impulso de 400 por página e intervalo mínimo de 160 ms entre trocas, o que evita pular páginas em rodas com inércia.
- O arquivo é lido duas vezes: uma para o visualizador e outra na hora de cortar, garantindo bytes íntegros na cópia das páginas.
- O arquivo `Docs Inicial` recebe as páginas anteriores à Inicial e depois as posteriores, nessa ordem, com os índices originais.
- A busca monta o texto de cada página juntando os itens com espaço, guarda esse texto em cache por página e lista todas as páginas encontradas, posicionando o documento na primeira delas.
- Cada download é disparado isoladamente com uma pausa de meio segundo antes do próximo; no modo personalizado há ainda 200 ms de intervalo entre a geração de cada divisão.
- A página carrega apenas `scripts.js`; o arquivo `script.js` existe na pasta do toy mas não é referenciado pelo `index.html`.
