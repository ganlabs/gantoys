# Compressor de PDF em Lote

Reduz o tamanho de vários PDFs de uma vez: cada página é renderizada como imagem JPEG dentro de um PDF novo, montado página a página. A entrada é um lote de arquivos `.pdf` escolhidos no seletor de arquivos e a saída é o download automático de um arquivo `<nome>_comprimido.pdf` por PDF do lote.

## Requisitos

- Navegador com suporte a Canvas e a download por link; o toy não usa seleção de pastas nem File System Access API.
- O `pdf.js` e o `jsPDF` vêm do próprio projeto (`vendor/pdfjs/pdf.min.js` e `vendor/jspdf/jspdf.umd.min.js`), com o worker `vendor/pdfjs/pdf.worker.min.js`; nenhum recurso é baixado da internet.
- O seletor aceita apenas `.pdf` (múltipla seleção) e o toy descarta arquivos cujo tipo não seja `application/pdf`.
- Os PDFs ficam na sua máquina; nada é enviado para a internet.

## Passo a passo

1. Clique em `Selecionar PDFs` e escolha os arquivos do lote (use Ctrl+Clique para selecionar vários).
2. A seção `Arquivos do lote` dá lugar a `Configurações e processamento`, com a `Fila de Arquivos` na ordem em que os arquivos foram escolhidos.
3. Ajuste `Qualidade da Compressão` e `Resolução (DPI)`.
4. Clique em `Comprimir PDFs`. Durante o lote, `Comprimir PDFs` e `Limpar e Recomeçar` ficam desabilitados.
5. Acompanhe `Progresso Geral` e o estado de cada item da fila.
6. Ao terminar, a seção `Processamento Concluído!` aparece com o aviso `A compressão foi finalizada. Os arquivos foram baixados automaticamente.` e o aviso rápido `Sucesso` / `Processamento do lote concluído!`.
7. Clique em `Processar Novos Arquivos` para voltar à primeira etapa, ou em `Limpar e Recomeçar` para zerar a fila.

Se nenhum arquivo válido for escolhido, nada avança: aparece o aviso rápido `Aviso` / `Selecione arquivos PDF válidos.`

## Campos e controles

- **Qualidade da Compressão** — botões de rádio que definem a qualidade do JPEG de cada página: `Baixa (Maior Compressão)` (`0.4`), `Média (Recomendado)` (`0.6`, marcado por padrão) e `Alta (Menor Compressão)` (`0.8`).
- **Resolução (DPI)** — botões de rádio que definem a resolução de renderização: `50 DPI (Extrema)`, `72 DPI (Baixa)`, `150 DPI (Média)` (marcado por padrão) e `300 DPI (Alta)`.
- **Selecionar PDFs** — abre o seletor de arquivos (`.pdf`, múltipla seleção). A dica abaixo do botão é `Use Ctrl+Clique para selecionar vários arquivos.`
- **Comprimir PDFs** — inicia o lote. Fica desabilitado do início ao fim do processamento.
- **Limpar e Recomeçar** — zera a fila, limpa o seletor de arquivos, esconde as seções de configuração e de conclusão e volta para a etapa `Arquivos do lote`.
- **Processar Novos Arquivos** — botão da seção de conclusão; faz o mesmo que `Limpar e Recomeçar`.
- **Fila de Arquivos** — lista somente leitura. Cada item mostra o nome do arquivo, o tamanho original e uma etiqueta de estado: `Aguardando`, `Processando...`, `Concluído` ou `Erro`. A barra fina de cada item aparece apenas enquanto o arquivo está em processamento.

## Resultado

- Cada PDF concluído é baixado automaticamente com o nome `<nome original sem extensão>_comprimido.pdf`.
- O item da fila passa de `Original: <tamanho>` para `Original: <tamanho> -> Final: <tamanho> (Redução de X%)` quando o arquivo diminui; quando não diminui, mostra `Original: <tamanho> -> Final: Mantido (Já otimizado. Original mantido)` e o arquivo baixado é o original.
- Tamanhos são formatados em `Bytes`, `KB`, `MB` ou `GB`, com duas casas decimais.
- `Progresso Geral` mostra `N / M concluídos`, com a barra preenchida na proporção dos arquivos já tratados.
- O toy não grava pastas nem relatórios: os arquivos vão para a pasta de downloads do navegador.

## Avisos e limitações

- O PDF de saída é feito de imagens JPEG: o texto deixa de ser selecionável e buscável, e não há OCR.
- Se a compressão de um arquivo falhar, o item recebe `Erro`, aparece o aviso rápido `Erro` / `Falha ao comprimir <nome do arquivo>` e o lote segue para os demais arquivos.
- Se o resultado ficar maior que o original, o toy mantém o conteúdo original no arquivo baixado, ainda com o sufixo `_comprimido.pdf`.
- Um arquivo já `Concluído` ou com `Erro` é pulado se o processamento for acionado de novo sem limpar a fila.
- O lote é processado em sequência, um arquivo por vez, sem limite de quantidade definido no código.

## Detalhes técnicos

- O fator de renderização é `dpi / 72`, aplicado em `getViewport({ scale })` sobre um canvas oculto (`renderCanvas`); cada página é exportada com `toDataURL('image/jpeg', qualidade)`.
- O PDF de saída é montado com o jsPDF: a primeira página usa as dimensões originais da página de origem em pontos (`unit: 'pt'`, `format: [largura, altura]`) e a orientação `portrait` ou `landscape` conforme a proporção; as páginas seguintes são criadas com `addPage` nas mesmas dimensões. O documento é criado com `compress: true` e cada imagem é inserida ocupando a página inteira.
- O progresso por arquivo vai de 0 a 100 conforme as páginas são renderizadas; o progresso geral é recalculado ao término de cada arquivo.
- Os valores de qualidade (`0.4` / `0.6` / `0.8`) e de DPI (`50` / `72` / `150` / `300`) são lidos dos botões de rádio marcados; sem marcação, o código usa `0.6` e `150`.
- O download usa um link temporário com `URL.createObjectURL` e o atributo `download`.
