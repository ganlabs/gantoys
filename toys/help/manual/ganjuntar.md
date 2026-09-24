# Juntar PDFs

Une em um único PDF todos os PDFs de cada subpasta do diretório escolhido. Entra uma pasta com subpastas de PDFs; sai um arquivo `<nome da subpasta>.pdf` por subpasta, na raiz da pasta escolhida, além da lista de resultados na tela.

## Requisitos
- `pdf-lib` já vem no projeto (`vendor/pdf-lib/pdf-lib.min.js`); nenhum download é feito e nenhum arquivo é enviado para a internet.
- Para gravar o PDF gerado de volta na pasta escolhida é necessária a File System Access API (`showDirectoryPicker`), com permissão de leitura e escrita.
- Sem essa API, o toy usa o seletor clássico de pasta do navegador (input de diretório com `webkitdirectory`, `accept=".pdf,application/pdf"`) e o resultado sai apenas como link para abrir/baixar.
- Quando a página roda em `file:` dentro do iframe do app, a File System Access API é bloqueada pela permissions policy: nesse caso o seletor clássico é usado automaticamente.
- São considerados apenas arquivos cuja extensão termina em `.pdf` (sem diferenciar maiúsculas de minúsculas).

## Passo a passo
1. Clique em `Selecionar Pasta`.
2. Escolha a pasta que contém as subpastas com os PDFs. No modo com File System Access API o navegador pede permissão de leitura e escrita.
3. Confira o cartão que aparece: o nome da pasta, os contadores `Pastas` e `PDFs` e a lista `Subpastas` com a quantidade de PDFs de cada uma.
4. Clique em `Juntar PDFs`. O botão só fica habilitado quando existe pelo menos uma subpasta com PDFs.
5. Acompanhe a barra de progresso: ela mostra o nome da subpasta em processamento, o percentual e o detalhe `i/total - arquivo.pdf`.
6. Ao terminar, leia a seção `Resultados` e os PDFs abertos em novas abas.

## Campos e controles
- **Selecionar Pasta** — botão que abre o seletor de pasta. Depois da escolha, o próprio texto do botão passa a ser o nome da pasta e ele ganha o estado visual de selecionado.
- **Pastas** — contador de subpastas que contêm ao menos um PDF.
- **PDFs** — contador do total de PDFs encontrados nessas subpastas.
- **Subpastas** — lista de uma linha por subpasta, com o nome à esquerda e a quantidade de PDFs à direita.
- **Juntar PDFs** — inicia a união. Fica desabilitado antes de qualquer seleção, quando não há subpastas com PDFs e enquanto o processamento está em andamento.
- **Barra de progresso** — fica oculta até o processamento começar; em repouso exibe `-`, `0%` e `-`.

## Resultado
- Um arquivo `<nome da subpasta>.pdf` gravado na própria pasta escolhida, sobrescrevendo arquivo de mesmo nome quando já existe.
- No modo clássico (sem File System Access API), nenhum arquivo é gravado: o PDF montado é oferecido como link e aberto em nova aba.
- A seção `Resultados` lista um item por subpasta. Cada item mostra o nome do arquivo gerado, o rótulo `OK` e a quantidade de páginas no formato `N páginas`.
- Cada PDF gerado com sucesso é aberto automaticamente em uma nova aba.
- O caminho da pasta aparece acima dos contadores; no modo clássico ele vem com o sufixo `(modo offline)`.

## Avisos e limitações
- Se a seleção clássica não devolver nenhum PDF, aparece o aviso `Nenhum PDF encontrado na pasta selecionada.` e nada é processado.
- Arquivos cujo nome começa com `Integral_` são ignorados, tanto no modo com File System Access API quanto no modo clássico.
- Subpastas sem PDFs são descartadas da lista; no modo com File System Access API uma subpasta que não pode ser lida gera o aviso `Não foi possível ler subpasta: <nome>` no console e é pulada.
- Os PDFs precisam estar diretamente dentro das subpastas: o toy não desce mais de um nível. No modo clássico, arquivos soltos na raiz entram em um grupo com o nome da própria pasta escolhida e arquivos em níveis mais profundos são agrupados pela primeira subpasta do caminho.
- Um PDF que falha ao carregar é ignorado com o aviso `Erro ao processar <arquivo>:` no console; as páginas dos demais arquivos da mesma subpasta continuam sendo unidas.
- Se a subpasta inteira falhar, o item aparece com o rótulo `Falha` e a mensagem de erro do navegador na linha seguinte, sem interromper as outras subpastas.
- PDFs protegidos por senha são abertos com `ignoreEncryption: true`; se ainda assim não puderem ser lidos, valem as regras de falha acima.
- O toy não reordena, não rotaciona e não remove páginas: as páginas entram na ordem alfabética dos arquivos.
- Cancelar o seletor de pasta não faz nada e não mostra erro.

## Detalhes técnicos
- Os nomes de subpastas e de arquivos são ordenados com `localeCompare(..., 'pt-BR')`, tanto no modo com File System Access API quanto no clássico.
- Cada subpasta gera um `PDFDocument.create()`; cada arquivo é carregado com `PDFDocument.load(arrayBuffer, { ignoreEncryption: true })` e suas páginas são copiadas com `copyPages` e adicionadas com `addPage`.
- O progresso é calculado como `round(((subpastasProcessadas + (i + 1) / arquivosDaSubpasta) / totalDeSubpastas) * 100)`, com pausa de `10 ms` entre arquivos para a interface atualizar.
- A gravação usa `getFileHandle(fileName, { create: true })` seguido de `createWritable()`, `write(blob)` e `close()`; o blob é do tipo `application/pdf`.
- O nome de saída é exatamente `${nomeDaSubpasta}.pdf`, sem prefixo nem sufixo adicional.
