# Divisor Automático Santander

Localiza a Petição Inicial dentro de PDFs de processo integral e grava a Inicial separada dos demais documentos, um par de arquivos por processo. Entram PDFs nomeados com o número CNJ; saem `Inicial_<CNJ>.pdf`, `Docs_<CNJ>.pdf`, um relatório na tela e um CSV.

## Requisitos

- O toy precisa rodar dentro do aplicativo GAN Toys: a escolha da pasta de destino e a gravação dos arquivos são pedidas ao aplicativo hospedeiro por mensagem. Fora do host, não existe seletor de pasta e o processamento nem começa.
- `pdf-lib` e `pdf.js` são carregados do próprio projeto (`../../vendor/pdf-lib/pdf-lib.min.js` e `../../vendor/pdfjs/pdf.min.js`, com worker em `../../vendor/pdfjs/pdf.worker.min.js`); nenhum download é feito para eles.
- O OCR de emergência depende da CDN `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js`. Sem internet o OCR não existe: o arquivo que precisaria dele falha em vez de ser lido como imagem.
- Cada PDF precisa ter o número CNJ no nome, no padrão `0000000-00.0000.0.00.0000`. Arquivos cujo nome começa com `Inicial` ou `Docs` são descartados da fila.
- Extração de texto e montagem dos PDFs acontecem na máquina do usuário; nada é enviado para servidores.

## Passo a passo

1. Clique na área de seleção (`Clique para selecionar ou arraste os PDFs aqui`) ou arraste os arquivos para ela. A contagem passa a aparecer no formato `N arquivo(s) na fila`.
2. Clique em `Avançar e Escolher Destino`. O aplicativo hospedeiro abre o seletor de pasta; escolha onde os PDFs serão gravados.
3. Acompanhe o passo `Processamento`: a linha de status mostra `Analisando 1 de N: <arquivo>`, a barra avança em porcentagem, os contadores `Total`, `Concluídos`, `A Revisar` e `Erros` são atualizados a cada arquivo e o log registra `Lendo bytes de ...`, `Detectando limites...`, `Separando PDF (início a fim)...` e `Salvo com sucesso.`
4. Ao terminar, o passo `Auditoria` é ativado e aparece a mensagem `Os resultados foram guardados em <pasta>.`
5. Clique em `Ver Relatório` para abrir `Relatório Detalhado` e conferir a linha de cada processo.
6. Na coluna `Visualizar`, use `Inicial` ou `Docs` para abrir o PDF gerado, ou `Corrigir` para refazer a divisão à mão.
7. Clique em `Exportar CSV` para baixar o relatório, ou em `Novo Processamento` para voltar ao início.

## Campos e controles

- **Clique para selecionar ou arraste os PDFs aqui** — área de clique e de arraste; aceita vários arquivos `.pdf` de uma vez.
- **N arquivo(s) na fila** — contagem da fila válida; só aparece depois de uma seleção aceita.
- **Avançar e Escolher Destino** — inicia o lote; só funciona com a pasta escolhida no host.
- **Refazer seleção** — limpa fila, relatório, contadores, barra e log, e volta ao passo 1.
- **Ver Relatório** — abre o relatório; disponível apenas depois do processamento.
- **Exportar CSV** — baixa o CSV do relatório; sem dados, não faz nada.
- **Novo Processamento** — mesmo efeito de `Refazer seleção`.
- **Inicial** e **Docs** — abrem o arquivo gerado no visualizador nativo do navegador, sem controles de zoom próprios.
- **Corrigir** — abre o arquivo original no visualizador próprio, com os campos `Início` e `Fim` preenchidos com o intervalo detectado.
- **Marcar Início** e **Marcar Fim** — copiam a página que está sendo exibida para os campos `Início` e `Fim`.
- **Início** e **Fim** — números inteiros, mínimo 1; definem o intervalo da Inicial na correção manual.
- **Dividir** — grava a divisão manual por cima dos arquivos do processo e marca a linha do relatório com a origem `Manual`.
- **Fit** — reajusta a página ao quadro; sem zoom manual o rótulo é `Fit`, com zoom manual o rótulo passa a mostrar o percentual aplicado.
- **Pág N de M** — campo numérico de página; valores fora de 1 e do total são ignorados.
- **Contadores do painel** — `Total`, `Concluídos`, `A Revisar` e `Erros`.
- **Coluna Status do relatório** — selo `OK`, selo `Revisar` ou o texto `Erro: <mensagem>`.

## Resultado

- Na pasta escolhida: `Inicial_<CNJ>.pdf` com as páginas detectadas da petição e `Docs_<CNJ>.pdf` com todas as páginas restantes, na ordem do original. O arquivo de documentos só é criado quando existem páginas fora do intervalo da Inicial.
- Ao final da tela de processamento, além do caminho da pasta, pode aparecer `Atenção: N processo(s) geraram dúvidas algorítmicas e requerem revisão humana.`
- `Relatório Detalhado` com as colunas `Arquivo`, `Páginas Iniciais` (formato `12 a 34 (23p)`), `Visualizar` e `Status`.
- CSV baixado como `NovoDiv_Relatorio_<data-hora>.csv`, em UTF-8 com marca de ordem de bytes, separado por ponto e vírgula e com as colunas `Arquivo`, `CNJ`, `Pagina_Inicial`, `Pagina_Final`, `Total_Paginas_Peticao`, `Status`, `Precisa_Revisao`, `Flags` e `Mensagem_Erro`. Em `Status` os valores são `OK`, `REVISAR` e `ERRO`; em `Precisa_Revisao`, `SIM` ou `NÃO`.

## Avisos e limitações

- `Nenhum PDF válido selecionado.` — a seleção ou o arraste não trouxe nenhum arquivo `.pdf`.
- `Nenhum PDF Integral encontrado. Certifique-se de que o nome contém o número CNJ.` — nenhum arquivo passou no filtro de nome.
- `É necessário selecionar uma pasta de destino para salvar os PDFs.` — a escolha de pasta falhou ou estourou o limite de espera, que é de 120 segundos; nesse caso o erro interno é `A operação com a pasta não respondeu.`
- `Não detectou início (mesmo com OCR)` — o arquivo entra como erro no relatório e o lote continua.
- `Não foi possível carregar o PDF gerado: <mensagem>` — falha ao ler o arquivo gravado para visualização.
- `Arquivo original não encontrado na memória.` e `Erro ao abrir PDF para edição visual: <mensagem>` — falhas ao abrir o modo de correção.
- `Intervalo de páginas inválido.` — `Início`/`Fim` vazios, menores que 1 ou em ordem invertida.
- `Divisão manual concluída e sobrescrita com sucesso!` — a correção substitui os arquivos do processo e remove a pendência de revisão.
- Um arquivo com erro não interrompe o lote: os demais são processados e a contagem `Erros` aumenta.
- O CNJ é lido apenas do nome do arquivo; sem ele o arquivo nem entra na fila.
- Repetir o lote na mesma pasta sobrescreve `Inicial_<CNJ>.pdf` e `Docs_<CNJ>.pdf` dos processos já feitos.
- O toy não valida o conteúdo jurídico do resultado e não corrige o intervalo sem intervenção: quando a detecção termina com dúvida, a linha vai para revisão humana.

## Detalhes técnicos

- O texto de cada página é extraído pelo `pdf.js` juntando os itens; uma quebra de linha é inserida quando a diferença de posição vertical entre itens passa de 2.
- Páginas de sistema são ignoradas: página com menos de 50 caracteres, cabeçalho com marcadores como `PÁGINA DE SEPARAÇÃO`, `Nº do processo`, `Data de autuação`, `Classe:`, `Órgão julgador:`, `Assunto:` ou `Número:`, ou página com menos de 500 caracteres que contenha `PROCESSO`.
- O identificador de documento é procurado no início do texto: `Num. N - Pág. N` (PJe), `Id. N - Pág. N` (Projudi) e `Evento N, NOME,` (eproc). A troca de identificador indica onde um documento termina e o outro começa.
- Início: a primeira página não-sistema que traz saudação a juízo, como `EXCELENTÍSSIMO`, `AO DOUTO JUÍZO`, `AO JUÍZO`, `EXMO. SR. DR. JUIZ`, `JUÍZO DE DIREITO DA VARA`, `MERITÍSSIMO` ou `DEFENSORIA PÚBLICA`. Sem nenhuma delas, vale a primeira página não-sistema com mais de 200 caracteres. Processo originado em PROCON começa na primeira página de notificação encontrada entre as 20 primeiras.
- Fim: é escolhida a menor página entre os candidatos, na ordem identificador de documento, início de novo documento por conteúdo, fechamento confirmado por OAB e Defensoria seguido de novo documento, fechamento sem OAB e fechamento isolado.
- Documento novo por conteúdo é reconhecido por início de página, entre outros: `PROCURAÇÃO`, `Resumo`, `CREDNET`, `SERASA`, `SPC Brasil`, `Calculadora`, `INSS`, `QR-CODE`, `fls.` com número, `Processo:` com número, `TERMO DE NOTIFICAÇÃO`, `Para conferir o original`, carteira de trabalho, RG, `COMPROVANTE`, `DECLARAÇÃO`, `Termo de Audiência` e `CERTIDÃO`.
- O fechamento da petição é reconhecido por fórmulas como `Pede deferimento`, `Pede-se deferimento`, `Confia e espera deferimento`, `Confia no deferimento`, `Termos em que`, `Nestes termos`, `Dá-se a causa`, `Sendo assim`, `consumidora requer` e `VALOR DA CAUSA`. Ocorrências cujo texto seguinte começa por `da`, `do`, `de`, `a` ou `o` são descartadas por parecerem continuação de frase.
- Também contam como sinal de fim, nas últimas 20 linhas da página, a presença de `OAB/` ou `OAB` seguido de número, de Defensoria Pública, de `valor da causa` ou `Dá-se a causa`, de `Valor: R$` e de `fls.` com número.
- Refinamento de início: se a primeira candidata tiver 2 páginas ou menos, o algoritmo procura adiante outra candidata e adota a que tiver pelo menos o dobro de páginas; em processo eproc, um documento `INIC1`, `INIC` ou `PET1` pode deslocar o início, e um `TERMO` posterior a um único `INIC1` passa a valer como início.
- Confiança de 0 a 5: soma 2 para início por padrão ou por `INIC1` e 2 para fim por identificador, conteúdo ou fechamento confirmado; início alternativo, por `TERMO2` ou PROCON e fim sem OAB somam 1. Intervalos menores que 3 páginas ou maiores que 60 páginas perdem 1 ponto. Pontuação final abaixo de 3 ou qualquer ocorrência sinalizada marcam o processo como `Revisar`.
- OCR: `Tesseract.createWorker('por')`, com cada página renderizada em canvas na escala 1.5. A varredura cobre as 10 primeiras páginas quando o texto inicial tem menos de 500 caracteres, e depois continua pelas páginas sem texto até encontrar fechamento com OAB; as mensagens são `[!] Imagem sem texto detectada. Iniciando OCR de emergência...` e `> Lendo pág N com OCR...`.
- Visualizador próprio: a roda do mouse troca uma página por vez, com pausa de gesto de 120 ms, impulso de 400 por página e intervalo mínimo de 160 ms entre trocas. O zoom anda em passos de 0,2, com mínimo de 0,4, e o ajuste `Fit` calcula a escala pela área visível descontando 40 pixels de largura e 80 de altura.
- A divisão usa `pdf-lib`: copia as páginas do intervalo para o arquivo da Inicial e as páginas antes e depois do intervalo, na ordem original, para o arquivo de documentos. Os bytes são gravados pelo aplicativo hospedeiro.

### Adicionar uma regra de divisão sem quebrar as antigas

Regra nova nunca pode mudar o resultado de um processo que já dividia certo. Toda divisão conhecida está congelada em `test/golden/novodiv-regras.json`: um caso para cada padrão de início, um para cada padrão de fechamento, os classificadores de página (sistema, documento novo, identificador) e os casos de pontuação.

1. Acrescente o padrão na tabela certa de `toys/gannovodiv/index.html`: `START_PATTERNS` (saudação a juízo), `CLOSING_PATTERNS` (fechamento da petição) ou os marcadores usados por `isSystemPage`.
2. Rode `npm test`. O teste `test/toys/gannovodiv-regras.test.js` reprova de propósito em dois pontos: o inventário de regras mudou e a regra nova ainda não tem caso.
3. Acrescente em `testkit/novodiv.js` um fragmento realista da página do processo novo, na lista correspondente (`FRAGMENTOS_DE_INICIO` ou `FRAGMENTOS_DE_FIM`, na mesma posição da tabela), e rode `GANTOYS_ATUALIZAR_GOLDEN=1 node --test test/toys/gannovodiv-regras.test.js` para registrar o caso.
4. Rode `npm test` outra vez. Nenhum caso antigo pode ter mudado; se mudou, o teste aponta o processo e a regra (`regra(s) N passaram a casar página antiga`, `a divisão do caso X mudou`). Estreite o padrão novo em vez de aceitar o resultado novo.
5. Confira `git diff test/golden/novodiv-regras.json`: o diff deve conter apenas as adições do processo novo.

Se a regra nova for mesmo mais específica e precisar ganhar de uma antiga, isso é reordenação de tabela: registre o caso afetado, explique no commit e revise o diff do golden caso a caso.
