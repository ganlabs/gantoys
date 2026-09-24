// Configurar PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = '../../vendor/pdfjs/pdf.worker.min.js';

// Estado global da aplicação
let pdfDoc = null;
let pdfBytes = null;
let pageNum = 1;
let pageCount = 0;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');

// Lote de arquivos
let filesQueue = [];
let currentFileIndex = 0;
let currentFile = null;
let numeroCNJ = '';
let fileStatuses = [];

// Busca no PDF
let searchResults = [];
let pdfTextContent = {}; // Cache de texto por página

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    const pdfInput = document.getElementById('pdfInput');
    pdfInput.addEventListener('change', handleFilesSelect);
    
    // Botões de navegação
    document.getElementById('btnFirstPage').addEventListener('click', () => irParaPagina(1));
    document.getElementById('btnPrevPage').addEventListener('click', () => irParaPagina(pageNum - 1));
    document.getElementById('btnNextPage').addEventListener('click', () => irParaPagina(pageNum + 1));
    document.getElementById('btnLastPage').addEventListener('click', () => irParaPagina(pageCount));
    
    // Input de página
    document.getElementById('pageNumber').addEventListener('change', function() {
        irParaPagina(parseInt(this.value));
    });
    
    // Botões de zoom
    document.getElementById('btnZoomIn').addEventListener('click', () => ajustarZoom(0.25));
    document.getElementById('btnZoomOut').addEventListener('click', () => ajustarZoom(-0.25));
    
    // Inputs de seleção
    document.getElementById('inicioInicial').addEventListener('change', atualizarPreview);
    document.getElementById('fimInicial').addEventListener('change', atualizarPreview);
    
    // Busca com Enter
    document.getElementById('searchText').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarNoPDF();
    });
    
    // Roda do mouse troca de página: sempre uma por vez e sempre página inteira.
    // Roda livre (inércia) emite uma rajada de dezenas de eventos por giro, então
    // a troca é decidida por IMPULSO acumulado, não por evento:
    //   - pausa de GESTO_PAUSA_MS sem eventos => giro novo: troca já na primeira
    //     rodada (roda de catraca continua valendo uma página por giro);
    //   - dentro do mesmo giro, cada IMPULSO_PAGINA de delta acumulado vale uma
    //     página, com teto de uma troca a cada TROCA_INTERVALO_MS.
    // Assim girar mais anda mais (a inércia rende), mas nunca pula duas de uma vez
    // e a cauda fraca da inércia desacelera sozinha.
    const GESTO_PAUSA_MS = 120;
    const IMPULSO_PAGINA = 400;
    const TROCA_INTERVALO_MS = 160;
    let ultimoEventoGiro = 0;
    let ultimaTroca = 0;
    let impulsoGesto = 0;
    canvas.addEventListener('wheel', (e) => {
        if (e.ctrlKey) return; // gesto de zoom do sistema
        e.preventDefault();
        const agora = Date.now();
        const novoGesto = agora - ultimoEventoGiro >= GESTO_PAUSA_MS;
        if (novoGesto) impulsoGesto = 0;
        ultimoEventoGiro = agora;
        impulsoGesto += Math.abs(e.deltaY) || 1;
        if (pageRendering) return;
        const limiar = novoGesto ? 1 : IMPULSO_PAGINA;
        if (impulsoGesto < limiar || agora - ultimaTroca < TROCA_INTERVALO_MS) return;
        impulsoGesto -= Math.min(impulsoGesto, limiar);
        ultimaTroca = agora;
        irParaPagina(e.deltaY < 0 ? pageNum - 1 : pageNum + 1);
    }, { passive: false });

    alternarModoDivisao();
});

// Manipular seleção de múltiplos arquivos
function handleFilesSelect(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    // Filtrar apenas PDFs
    filesQueue = files.filter(f => f.type === 'application/pdf');
    
    if (filesQueue.length === 0) {
        alert('Por favor, selecione arquivos PDF válidos.');
        return;
    }
    
    if (filesQueue.length < files.length) {
        alert(`${files.length - filesQueue.length} arquivo(s) não-PDF foram ignorados.`);
    }
    
    fileStatuses = filesQueue.map(() => 'pending');
    atualizarResumoLote();
    
    // Iniciar com primeiro arquivo
    currentFileIndex = 0;
    carregarArquivoAtual();
}

// Mostrar resumo do lote (sem fila de arquivos)
function atualizarResumoLote() {
    const container = document.getElementById('filesQueue');

    const total = filesQueue.length;
    const processados = fileStatuses.filter(status => ['completed', 'error', 'skipped'].includes(status)).length;
    const faltando = Math.max(total - processados, 0);
    const arquivoAtual = currentFile && currentFile.name ? currentFile.name : '-';

    const html = `
        <div class="stat">
            <strong>${total}</strong>
            <span>Total</span>
        </div>
        <div class="stat">
            <strong>${processados}</strong>
            <span>Processados</span>
        </div>
        <div class="stat">
            <strong>${faltando}</strong>
            <span>Faltando</span>
        </div>
        <div class="stat">
            <strong>${Math.min(processados + 1, total)}/${total}</strong>
            <span>Em andamento</span>
        </div>
        <div class="stat">
            <strong class="nowrap">${arquivoAtual}</strong>
            <span>Arquivo atual</span>
        </div>
    `;

    container.innerHTML = html;
    container.classList.add('visible');
}

// Extrair número CNJ do nome do arquivo
function extrairNumeroCNJ(nomeArquivo) {
    // Padrão CNJ com pontuação: 0000000-00.0000.0.00.0000
    const regexFormatado = /(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/;
    const matchFormatado = nomeArquivo.match(regexFormatado);
    
    if (matchFormatado) {
        return matchFormatado[1];
    }
    
    // Tentar encontrar CNJ sem pontuação: 20 dígitos seguidos
    const regexSemPontuacao = /(\d{20})/;
    const matchSemPontuacao = nomeArquivo.match(regexSemPontuacao);
    
    if (matchSemPontuacao) {
        // Formatar automaticamente
        const formatado = formatarCNJ(matchSemPontuacao[1]);
        if (formatado) {
            return formatado;
        }
    }
    
    return null;
}

// Avança para o próximo arquivo do lote e o carrega no visualizador.
function carregarProximoArquivo() {
    currentFileIndex += 1;
    carregarArquivoAtual();
}

// Carregar arquivo atual da fila
async function carregarArquivoAtual() {
    if (currentFileIndex >= filesQueue.length) {
        // Todos processados
        finalizarProcessamento();
        return;
    }
    
    currentFile = filesQueue[currentFileIndex];
    numeroCNJ = extrairNumeroCNJ(currentFile.name);
    
    // Atualizar UI
    document.getElementById('currentFileNumber').textContent = `${currentFileIndex + 1}/${filesQueue.length}`;
    document.getElementById('currentFileName').textContent = currentFile.name;
    document.getElementById('detectedCNJ').innerHTML = numeroCNJ
        ? `<span class="badge badge-ok"><i class="bi bi-check-lg"></i>${numeroCNJ}</span>`
        : `<span class="badge badge-fail"><i class="bi bi-x-lg"></i>Não detectado</span>`;
    
    // Mostrar/esconder painel de CNJ manual
    if (!numeroCNJ) {
        document.getElementById('cnjWarning').style.display = 'block';
        document.getElementById('cnjManual').value = '';
    } else {
        document.getElementById('cnjWarning').style.display = 'none';
    }
    
    try {
        // Ler arquivo como ArrayBuffer
        const arrayBuffer = await currentFile.arrayBuffer();
        pdfBytes = new Uint8Array(arrayBuffer);
        
        // Carregar PDF com PDF.js
        const loadingTask = pdfjsLib.getDocument({data: pdfBytes});
        pdfDoc = await loadingTask.promise;
        pageCount = pdfDoc.numPages;
        
        // Atualizar UI
        document.getElementById('pageCount').textContent = `de ${pageCount}`;
        document.getElementById('pageNumber').max = pageCount;
        document.getElementById('inicioInicial').max = pageCount;
        document.getElementById('fimInicial').max = pageCount;
        document.getElementById('fimInicial').value = pageCount;
        
        // Resetar valores
        pageNum = 1;
        document.getElementById('inicioInicial').value = 1;
        
        // Mostrar seções
        document.getElementById('viewerSection').style.display = 'block';
        document.getElementById('processSection').style.display = 'none';
        
        // Renderizar primeira página
        renderPage(1);
        
        // Atualizar preview
        atualizarPreview();
        
        // Limpar busca anterior
        searchResults = [];
        pdfTextContent = {};
        document.getElementById('searchText').value = '';
        document.getElementById('searchResults').textContent = '';
        
        // Marcar arquivo como em processamento
        atualizarStatusFila(currentFileIndex, 'Processando', 'processing');
        showToast('Arquivo carregado', `Pronto para marcar e dividir: ${currentFile.name}`, 'info', 1300);
        
    } catch (error) {
        console.error('Erro ao carregar PDF:', error);
        alert(`Erro ao carregar PDF!\n\nArquivo: ${currentFile.name}\n\n${error.message}`);
        
        // Marcar como erro e pular
        marcarArquivoComoErro(currentFileIndex, error.message);
        currentFileIndex++;
        carregarArquivoAtual();
    }
}

// Atualizar status na fila
function atualizarStatusFila(index, status, className = '') {
    if (index >= 0 && index < fileStatuses.length && className) {
        fileStatuses[index] = className;
    }
    atualizarResumoLote();
}

// Marcar arquivo como erro
function marcarArquivoComoErro(index, _erro) {
    atualizarStatusFila(index, 'Erro', 'error');
}

// Renderizar página específica
function renderPage(num) {
    if (num < 1 || num > pageCount) return;
    
    pageRendering = true;
    
    // Atualizar indicador de página
    document.getElementById('pageIndicator').textContent = `Página ${num} de ${pageCount}`;
    
    // Usando promise para buscar a página
    pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({scale: scale});
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Renderizar página no canvas
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);
        
        renderTask.promise.then(function() {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
    });
    
    // Atualizar número da página
    document.getElementById('pageNumber').value = num;
    pageNum = num;
    
    // Atualizar estado dos botões
    atualizarBotoesNavegacao();
}

// Ir para página específica
function irParaPagina(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Atualizar estado dos botões de navegação
function atualizarBotoesNavegacao() {
    document.getElementById('btnFirstPage').disabled = pageNum <= 1;
    document.getElementById('btnPrevPage').disabled = pageNum <= 1;
    document.getElementById('btnNextPage').disabled = pageNum >= pageCount;
    document.getElementById('btnLastPage').disabled = pageNum >= pageCount;
}

// Ajustar zoom
function ajustarZoom(delta) {
    scale += delta;
    scale = Math.max(0.5, Math.min(3, scale)); // Limitar entre 0.5x e 3x
    
    document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + '%';
    renderPage(pageNum);
}

// Definir início da seção "Inicial"
function definirInicio() {
    document.getElementById('inicioInicial').value = pageNum;
    atualizarPreview();
}

// Definir fim da seção "Inicial"
function definirFim() {
    document.getElementById('fimInicial').value = pageNum;
    atualizarPreview();
}

// Atualizar preview da divisão
function atualizarPreview() {
    const inicio = parseInt(document.getElementById('inicioInicial').value) || 1;
    const fim = parseInt(document.getElementById('fimInicial').value) || pageCount;
    
    // Validar
    if (inicio > fim) {
        document.getElementById('inicioInicial').style.borderColor = 'var(--toy-danger)';
        document.getElementById('fimInicial').style.borderColor = 'var(--toy-danger)';
        return;
    } else {
        document.getElementById('inicioInicial').style.borderColor = '';
        document.getElementById('fimInicial').style.borderColor = '';
    }
    
    // Calcular páginas com nova lógica
    const paginasInicial = fim - inicio + 1;
    const temPaginasAntes = inicio > 1;
    const temPaginasDepois = fim < pageCount;
    
    // Calcular páginas dos "Docs da Inicial"
    let paginasDocs = 0;
    let docsDescricao = '';
    
    if (temPaginasAntes && temPaginasDepois) {
        const paginasAntes = inicio - 1;
        const paginasDepois = pageCount - fim;
        paginasDocs = paginasAntes + paginasDepois;
        docsDescricao = `Páginas 1-${inicio-1} + ${fim+1}-${pageCount}`;
    } else if (temPaginasAntes) {
        paginasDocs = inicio - 1;
        docsDescricao = `Páginas 1-${inicio-1}`;
    } else if (temPaginasDepois) {
        paginasDocs = pageCount - fim;
        docsDescricao = `Páginas ${fim+1}-${pageCount}`;
    }
    
    // Definir nomes dos arquivos
    const sufixoCNJ = numeroCNJ ? ` - ${numeroCNJ}` : '';
    
    // Atualizar preview (valores por textContent: o sufixo vem do CNJ lido do nome do arquivo)
    const espaco = () => document.createTextNode(' ');
    const previewInicial = document.getElementById('previewInicial');
    previewInicial.replaceChildren(
        criarLinhaForte(`Páginas ${inicio}-${fim}`),
        document.createElement('br'),
        espaco(),
        document.createTextNode(`${paginasInicial} página(s)`),
        document.createElement('br'),
        espaco(),
        criarLinhaFina(`Inicial${sufixoCNJ}.pdf`)
    );

    const previewDocs = document.getElementById('previewDocs');
    if (paginasDocs > 0) {
        previewDocs.replaceChildren(
            criarLinhaForte(docsDescricao),
            document.createElement('br'),
            espaco(),
            document.createTextNode(`${paginasDocs} página(s)`),
            document.createElement('br'),
            espaco(),
            criarLinhaFina(`Docs Inicial${sufixoCNJ}.pdf`)
        );
    } else {
        previewDocs.replaceChildren(
            criarLinhaForte('Nenhuma página'),
            document.createElement('br'),
            espaco(),
            criarLinhaFina('(Todas as páginas estão na "Inicial")')
        );
    }
    
    // Mostrar preview
    document.getElementById('divisionPreview').style.display = 'block';
}

/** Elemento <strong> com texto literal. */
function criarLinhaForte(texto) {
    const elemento = document.createElement('strong');
    elemento.textContent = texto;
    return elemento;
}

/** Elemento <small> com texto literal. */
function criarLinhaFina(texto) {
    const elemento = document.createElement('small');
    elemento.textContent = texto;
    return elemento;
}

/** Ícone + texto, para compor mensagens sem passar valor por HTML. */
function partesComIcone(classe, conteudo) {
    const icone = document.createElement('i');
    icone.className = classe;
    return [icone, document.createTextNode(conteudo)];
}

/**
 * Mensagem de fim de arquivo do lote: `Arquivo X/Y processado!` seguida do
 * resultado e do aviso de avanço. Contadores vêm da fila do usuário, então
 * tudo é montado com DOM/textContent.
 */
function mostrarFimDeArquivo(resultado) {
    const destino = document.getElementById('resultMessage');
    const quebra = () => document.createElement('br');

    const titulo = document.createElement('strong');
    titulo.textContent = `Arquivo ${currentFileIndex + 1}/${filesQueue.length} processado!`;

    const aviso = document.createElement('strong');
    const ultimo = currentFileIndex + 1 >= filesQueue.length;
    aviso.append(...partesComIcone(
        ultimo ? 'bi bi-check2-circle' : 'bi bi-arrow-right',
        ultimo ? ' Todos os arquivos foram processados!' : ' Carregando próximo arquivo...'
    ));

    destino.replaceChildren(
        titulo, quebra(), quebra(),
        ...partesComIcone('bi bi-file-earmark-arrow-down', ` ${resultado}`),
        quebra(), quebra(),
        aviso
    );
}

// Processar e dividir PDF
async function processarDivisao() {
    const inicio = parseInt(document.getElementById('inicioInicial').value) || 1;
    const fim = parseInt(document.getElementById('fimInicial').value) || pageCount;
    
    // Validar
    if (inicio > fim) {
        alert('Erro: A primeira página não pode ser maior que a última página!');
        return;
    }
    
    const sufixoCNJ = numeroCNJ ? ` - ${numeroCNJ}` : '';
    
    showToast('Iniciando Divisão', `Processando: ${currentFile.name}`, 'info', 2000);
    
    // Desabilitar botão
    const btnProcessar = document.getElementById('btnProcessar');
    btnProcessar.disabled = true;
    btnProcessar.innerHTML = '<i class="bi bi-hourglass-split"></i>Processando...';
    
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const resultSection = document.getElementById('resultSection');
    
    progressSection.style.display = 'block';
    resultSection.style.display = 'none';
    
    try {
        // Ler arquivo novamente para garantir bytes corretos
        progressText.textContent = 'Lendo arquivo...';
        progressFill.style.width = '10%';
        
        const freshArrayBuffer = await currentFile.arrayBuffer();
        const freshBytes = new Uint8Array(freshArrayBuffer);
        
        // Carregar PDF com PDF-Lib
        progressText.textContent = 'Carregando PDF...';
        progressFill.style.width = '20%';
        
        const pdfLibDoc = await PDFLib.PDFDocument.load(freshBytes);
        
        // Criar PDF da "Inicial"
        progressText.textContent = 'Criando "Inicial"...';
        progressFill.style.width = '40%';
        
        const pdfInicial = await PDFLib.PDFDocument.create();
        const indicesPaginasInicial = Array.from({length: fim - inicio + 1}, (_, i) => inicio - 1 + i);
        const paginasInicial = await pdfInicial.copyPages(pdfLibDoc, indicesPaginasInicial);
        
        paginasInicial.forEach(page => pdfInicial.addPage(page));
        
        // Salvar PDF Inicial
        progressText.textContent = 'Gerando arquivo "Inicial"...';
        progressFill.style.width = '60%';
        
        const bytesInicial = await pdfInicial.save();
        
        // Download Inicial
        baixarPDF(bytesInicial, `Inicial${sufixoCNJ}.pdf`);
        
        // Criar PDF "Docs da Inicial" (páginas antes + depois da inicial)
        const temPaginasAntes = inicio > 1;
        const temPaginasDepois = fim < pageCount;
        
        if (temPaginasAntes || temPaginasDepois) {
            progressText.textContent = 'Criando "Docs Inicial"...';
            progressFill.style.width = '80%';
            
            const pdfDocs = await PDFLib.PDFDocument.create();
            const indicesPaginasDocs = [];
            
            // Adicionar páginas ANTES da inicial (se houver)
            if (temPaginasAntes) {
                for (let i = 0; i < inicio - 1; i++) {
                    indicesPaginasDocs.push(i);
                }
            }
            
            // Adicionar páginas DEPOIS da inicial (se houver)
            if (temPaginasDepois) {
                for (let i = fim; i < pageCount; i++) {
                    indicesPaginasDocs.push(i);
                }
            }
            
            // Copiar todas as páginas dos "Docs da Inicial"
            const paginasDocs = await pdfDocs.copyPages(pdfLibDoc, indicesPaginasDocs);
            paginasDocs.forEach(page => pdfDocs.addPage(page));
            
            // Salvar PDF Docs
            const bytesDocs = await pdfDocs.save();
            
            // Download Docs
            baixarPDF(bytesDocs, `Docs Inicial${sufixoCNJ}.pdf`);
        }
        
        progressText.textContent = 'Concluído!';
        progressFill.style.width = '100%';
        
        // Marcar arquivo como processado
        atualizarStatusFila(currentFileIndex, 'Concluído', 'completed');
        
        // Mostrar resultado
        setTimeout(() => {
            progressSection.style.display = 'none';
            resultSection.style.display = 'block';
            
            const numArquivos = (temPaginasAntes || temPaginasDepois) ? 2 : 1;
            mostrarFimDeArquivo(`${numArquivos} PDF(s) baixado(s) com sucesso!`);
            
            // Resetar botão
            btnProcessar.disabled = false;
            btnProcessar.innerHTML = '<i class="bi bi-scissors"></i>Dividir e baixar PDFs';
            
            // Carregar próximo arquivo após 2 segundos
            setTimeout(() => {
                currentFileIndex++;
                if (currentFileIndex < filesQueue.length) {
                    resultSection.style.display = 'none';
                    carregarArquivoAtual();
                } else {
                    // Todos processados
                    finalizarProcessamento();
                }
            }, 2000);
            
        }, 500);
        
    } catch (error) {
        console.error('Erro ao processar PDF:', error);
        
        progressSection.style.display = 'none';
        alert('Erro ao processar PDF!\n\nDetalhes: ' + error.message);
        
        // Marcar como erro
        marcarArquivoComoErro(currentFileIndex, error.message);
        
        btnProcessar.disabled = false;
        btnProcessar.innerHTML = '<i class="bi bi-scissors"></i>Dividir e baixar PDFs';
        
        // Perguntar se quer continuar
        if (currentFileIndex + 1 < filesQueue.length) {
            if (confirm('Erro ao processar arquivo!\n\nDeseja continuar com o próximo arquivo?')) {
                currentFileIndex++;
                carregarArquivoAtual();
            }
        }
    }
}

// Baixar PDF diretamente
function baixarPDF(pdfBytes, nomeArquivo) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Pequeno delay entre downloads
    return new Promise(resolve => setTimeout(resolve, 500));
}

// Finalizar processamento
function finalizarProcessamento() {
    document.getElementById('viewerSection').style.display = 'none';
    document.getElementById('processSection').style.display = 'block';
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'block';
    
    // Contar resultados
    const total = filesQueue.length;
    const concluidos = fileStatuses.filter(status => status === 'completed').length;
    const erros = fileStatuses.filter(status => status === 'error').length;
    const ignorados = fileStatuses.filter(status => status === 'skipped').length;
    
    const destino = document.getElementById('resultMessage');
    const quebra = () => document.createElement('br');

    const titulo = document.createElement('h3');
    titulo.style.color = 'var(--toy-success)';
    titulo.append(...partesComIcone('bi bi-check2-circle', ' Processamento concluído!'));

    const subtitulo = document.createElement('strong');
    subtitulo.append(...partesComIcone('bi bi-bar-chart-line', ' Estatísticas:'));

    const linhas = [
        ['bi bi-folder2-open', ` Total de arquivos: ${total}`],
        ['bi bi-check-lg', ` Processados com sucesso: ${concluidos}`],
        ['bi bi-x-lg', ` Erros: ${erros}`],
        ['bi bi-skip-end-fill', ` Ignorados: ${ignorados}`],
    ];

    const rodape = document.createElement('strong');
    rodape.append(...partesComIcone('bi bi-download', ' Os arquivos foram baixados para sua pasta Downloads.'));

    destino.replaceChildren(
        titulo, quebra(),
        subtitulo, quebra(), quebra(),
        ...linhas.flatMap(([classe, conteudo]) => [...partesComIcone(classe, conteudo), quebra()]),
        quebra(),
        rodape, quebra(),
        document.createTextNode(' Você pode organizá-los na pasta de sua preferência.')
    );
}

// Limpar tudo e recomeçar
function limparTudo() {
    if (confirm('Deseja limpar tudo e recomeçar?\n\nTodos os arquivos serão removidos da fila.')) {
        pdfDoc = null;
        pdfBytes = null;
        pageNum = 1;
        pageCount = 0;
        scale = 1.5;
        filesQueue = [];
        fileStatuses = [];
        currentFileIndex = 0;
        currentFile = null;
        numeroCNJ = '';
        
        document.getElementById('pdfInput').value = '';
        document.getElementById('filesQueue').classList.remove('visible');
        document.getElementById('viewerSection').style.display = 'none';
        document.getElementById('processSection').style.display = 'none';
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('resultSection').style.display = 'none';
        document.getElementById('divisionPreview').style.display = 'none';
        
        // Limpar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        alert('Tudo limpo! Selecione novos PDFs para começar.');
    }
}

// Buscar texto no PDF
async function buscarNoPDF() {
    const searchTerm = document.getElementById('searchText').value.trim().toLowerCase();
    
    if (!searchTerm) {
        alert('Digite uma palavra para buscar!');
        return;
    }
    
    if (!pdfDoc) {
        alert('Nenhum PDF carregado!');
        return;
    }
    
    searchResults = [];
    
    // Mostrar progresso
    document.getElementById('searchResults').innerHTML = '<i class="bi bi-hourglass-split"></i> Buscando...';
    
    // Buscar em todas as páginas
    for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();
        
        if (pageText.includes(searchTerm)) {
            searchResults.push(i);
        }
        
        // Cache do texto
        pdfTextContent[i] = pageText;
    }
    
    // Mostrar resultados
    if (searchResults.length > 0) {
        const destinoBusca = document.getElementById('searchResults');
        const iconeBusca = document.createElement('i');
        iconeBusca.className = 'bi bi-check-lg';
        destinoBusca.replaceChildren(iconeBusca, document.createTextNode(
            ` ${searchResults.length} página(s) encontrada(s): ${searchResults.join(', ')}`
        ));
        
        // Ir para primeira ocorrência
        irParaPagina(searchResults[0]);
        alert(`Encontrado em ${searchResults.length} página(s)!\n\nPáginas: ${searchResults.join(', ')}`);
    } else {
        document.getElementById('searchResults').innerHTML = '<i class="bi bi-x-lg"></i> Palavra não encontrada';
        alert('Palavra não encontrada no documento.');
    }
}

// Formatar número CNJ sem pontuação
function formatarCNJ(cnj) {
    // Remove tudo que não é número
    const apenasNumeros = cnj.replace(/\D/g, '');
    
    // Verifica se tem 20 dígitos
    if (apenasNumeros.length !== 20) {
        return null;
    }
    
    // Formato: NNNNNNN-DD.AAAA.J.TR.OOOO
    // Exemplo: 57104727520258090051 → 5710472-75.2025.8.09.0051
    const formatado = `${apenasNumeros.substr(0, 7)}-${apenasNumeros.substr(7, 2)}.${apenasNumeros.substr(9, 4)}.${apenasNumeros.substr(13, 1)}.${apenasNumeros.substr(14, 2)}.${apenasNumeros.substr(16, 4)}`;
    
    return formatado;
}

// Aplicar CNJ manual
function aplicarCNJManual() {
    const cnjInput = document.getElementById('cnjManual').value.trim();
    
    if (!cnjInput) {
        alert('Digite o número CNJ!');
        return;
    }
    
    // Tentar formatar se for só números
    let cnjFormatado = cnjInput;
    
    // Se tiver apenas números, formatar
    if (/^\d{20}$/.test(cnjInput)) {
        cnjFormatado = formatarCNJ(cnjInput);
        if (!cnjFormatado) {
            alert('Número CNJ inválido! Deve ter 20 dígitos.');
            return;
        }
        alert(`CNJ formatado automaticamente:\n\n${cnjInput}\n↓\n${cnjFormatado}`);
    }
    
    // Validar formato CNJ
    const regexCNJ = /^\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}$/;
    if (!regexCNJ.test(cnjFormatado)) {
        alert('Formato CNJ inválido!\n\nFormato esperado: 0000000-00.0000.0.00.0000\nOu: 20 dígitos sem pontuação');
        return;
    }
    
    // Aplicar CNJ
    numeroCNJ = cnjFormatado;
    const selo = document.createElement('span');
    selo.className = 'badge badge-ok';
    const iconeSelo = document.createElement('i');
    iconeSelo.className = 'bi bi-check-lg';
    selo.append(iconeSelo, document.createTextNode(`${numeroCNJ} (manual)`));
    document.getElementById('detectedCNJ').replaceChildren(selo);
    document.getElementById('cnjWarning').style.display = 'none';
    
    // Atualizar preview
    atualizarPreview();
    
    alert(`CNJ aplicado com sucesso!\n\n${numeroCNJ}\n\nOs PDFs serão nomeados com este número.`);
}

// ============= MODO PERSONALIZADO =============

// Array para armazenar divisões personalizadas
let customDivisions = [];


function showToast(title, message, type = 'info', duration = 2200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Tom do toast pelo tipo: o shared define a borda por .ok/.warn/.fail.
    const tons = { success: 'ok', error: 'fail', warning: 'warn' };
    const toast = document.createElement('div');
    toast.className = 'toast' + (tons[type] ? ` ${tons[type]}` : '');
    // Título e mensagem podem carregar nome de arquivo: vão por textContent.
    const titulo = document.createElement("div");
    titulo.className = "toast-title";
    titulo.textContent = title;
    const corpo = document.createElement("div");
    corpo.className = "toast-body";
    corpo.textContent = message;
    toast.append(titulo, corpo);
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 220);
    }, duration);
}

// Alternar entre modos
function alternarModoDivisao() {
    const modo = document.querySelector('input[name="modoDivisao"]:checked')?.value || 'auto';
    const autoPanel = document.getElementById('modoDivisaoAuto');
    const customPanel = document.getElementById('modoDivisaoPersonalizado');
    // As ações vivem em contêineres próprios: mostrar o botão sem o contêiner
    // deixaria o "Processar todas as divisões" inalcançável.
    const autoActions = document.getElementById('actionButtonsAuto');
    const customActions = document.getElementById('actionButtonsCustom');
    if (autoPanel) autoPanel.style.display = modo === 'auto' ? 'grid' : 'none';
    if (customPanel) customPanel.style.display = modo === 'custom' ? 'grid' : 'none';
    if (autoActions) autoActions.style.display = modo === 'auto' ? '' : 'none';
    if (customActions) customActions.style.display = modo === 'custom' ? '' : 'none';
}

// Marcar página atual nos campos do modo personalizado
function marcarPaginaAtualCustom(tipo) {
    if (tipo === 'inicio') {
        document.getElementById('customInicio').value = pageNum;
    } else {
        document.getElementById('customFim').value = pageNum;
    }
}

// Adicionar divisão personalizada
function adicionarDivisaoCustom() {
    const nome = document.getElementById('customFileName').value.trim();
    const inicio = parseInt(document.getElementById('customInicio').value) || 1;
    const fim = parseInt(document.getElementById('customFim').value) || pageCount;
    
    // Validações
    if (!nome) {
        alert('Digite um nome para o arquivo!');
        return;
    }
    
    if (inicio > fim) {
        alert('A página inicial não pode ser maior que a final!');
        return;
    }
    
    if (inicio < 1 || fim > pageCount) {
        alert(`Páginas devem estar entre 1 e ${pageCount}!`);
        return;
    }
    
    // Verificar caracteres inválidos no nome
    const caracteresInvalidos = /[<>:"/\\|?*]/g;
    if (caracteresInvalidos.test(nome)) {
        alert('O nome do arquivo contém caracteres inválidos!\n\nNão use: < > : " / \\ | ? *');
        return;
    }
    
    // Adicionar à lista
    const divisao = {
        id: Date.now(),
        nome: nome,
        inicio: inicio,
        fim: fim,
        paginas: fim - inicio + 1
    };
    
    customDivisions.push(divisao);
    renderizarListaDivisoes();
    
    // Limpar campos
    document.getElementById('customFileName').value = '';
    document.getElementById('customInicio').value = '1';
    document.getElementById('customFim').value = '1';
    
    alert(`Divisão adicionada!\n\n${nome}\nPáginas ${inicio}-${fim} (${divisao.paginas} páginas)`);
}

// Renderizar lista de divisões
function renderizarListaDivisoes() {
    const container = document.getElementById('divisionsListContainer');
    const listSection = document.getElementById('customDivisionsList');
    
    if (customDivisions.length === 0) {
        listSection.style.display = 'none';
        container.replaceChildren();
        return;
    }
    
    listSection.style.display = 'block';
    
    const sufixoCNJ = numeroCNJ ? ` - ${numeroCNJ}` : '';
    
    let html = '<div class="stack">';
    
    customDivisions.forEach((div, index) => {
        html += `
            <div class="tile">
                <p class="row">
                    <span class="badge badge-accent">#${index + 1}</span>
                    <i class="bi bi-file-pdf"></i>
                    <strong>${div.nome}${sufixoCNJ}.pdf</strong>
                </p>
                <p class="hint">
                    <i class="bi bi-files"></i>
                    Páginas ${div.inicio}-${div.fim} (${div.paginas} ${div.paginas === 1 ? 'página' : 'páginas'})
                </p>
                <div class="actions">
                    <button class="btn btn-outline btn-small btn-icon btn-danger" onclick="removerDivisaoCustom(${div.id})" title="Remover">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    // Adicionar resumo
    const totalPaginas = customDivisions.reduce((sum, div) => sum + div.paginas, 0);
    html += `
        <div class="notice">
            <i class="bi bi-info-circle"></i>
            <span><strong>Total:</strong> ${customDivisions.length} ${customDivisions.length === 1 ? 'divisão' : 'divisões'}
            | ${totalPaginas} ${totalPaginas === 1 ? 'página' : 'páginas'}</span>
        </div>
    `;
    
    html += '</div>';
    
    container.innerHTML = html;
}

// Remover divisão personalizada
function removerDivisaoCustom(id) {
    if (!confirm('Deseja remover esta divisão?')) {
        return;
    }
    
    customDivisions = customDivisions.filter(div => div.id !== id);
    renderizarListaDivisoes();
}

// Limpar todas as divisões
function limparDivisoesCustom() {
    if (!confirm('Deseja limpar todas as divisões criadas?')) {
        return;
    }
    
    customDivisions = [];
    renderizarListaDivisoes();
}

// Processar divisões personalizadas
async function processarDivisoesCustom() {
    if (customDivisions.length === 0) {
        alert('Nenhuma divisão criada!\n\nCrie ao menos uma divisão antes de processar.');
        return;
    }
    
    const sufixoCNJ = numeroCNJ ? ` - ${numeroCNJ}` : '';
    
    showToast('Processando Divisões', `Processando ${customDivisions.length} divisão(ões)...`, 'info', 2000);
    
    // Desabilitar botão
    const btnProcessar = document.getElementById('btnProcessarCustom');
    btnProcessar.disabled = true;
    btnProcessar.innerHTML = '<i class="bi bi-hourglass-split"></i>Processando...';
    
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const resultSection = document.getElementById('resultSection');
    
    progressSection.style.display = 'block';
    resultSection.style.display = 'none';
    
    try {
        // Ler arquivo
        progressText.textContent = 'Lendo arquivo...';
        progressFill.style.width = '5%';
        
        const freshArrayBuffer = await currentFile.arrayBuffer();
        const freshBytes = new Uint8Array(freshArrayBuffer);
        
        // Carregar PDF
        progressText.textContent = 'Carregando PDF...';
        progressFill.style.width = '10%';
        
        const pdfLibDoc = await PDFLib.PDFDocument.load(freshBytes);
        
        // Processar cada divisão
        const totalDivisoes = customDivisions.length;
        
        for (let i = 0; i < totalDivisoes; i++) {
            const div = customDivisions[i];
            const progress = 10 + (i / totalDivisoes) * 80;
            
            progressText.textContent = `Criando "${div.nome}" (${i + 1}/${totalDivisoes})...`;
            progressFill.style.width = `${progress}%`;
            
            // Criar novo PDF
            const newPdf = await PDFLib.PDFDocument.create();
            
            // Copiar páginas
            const indices = [];
            for (let p = div.inicio - 1; p < div.fim; p++) {
                indices.push(p);
            }
            
            const copiedPages = await newPdf.copyPages(pdfLibDoc, indices);
            copiedPages.forEach(page => newPdf.addPage(page));
            
            // Salvar e baixar
            const pdfBytes = await newPdf.save();
            const nomeArquivo = `${div.nome}${sufixoCNJ}.pdf`;
            baixarPDF(pdfBytes, nomeArquivo);
            
            // Pequeno delay para não sobrecarregar
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        progressText.textContent = 'Concluído!';
        progressFill.style.width = '100%';
        
        // Marcar arquivo como processado
        atualizarStatusFila(currentFileIndex, 'Concluído', 'completed');
        
        // Mostrar resultado
        setTimeout(() => {
            progressSection.style.display = 'none';
            resultSection.style.display = 'block';
            
            mostrarFimDeArquivo(`${totalDivisoes} PDF(s) criado(s) com sucesso!`);
            
            // Resetar botão
            btnProcessar.disabled = false;
            btnProcessar.innerHTML = '<i class="bi bi-scissors"></i>Processar todas as divisões';
            
            // Limpar divisões após processar
            customDivisions = [];
            renderizarListaDivisoes();
            
            // Processar próximo arquivo se houver
            if (currentFileIndex + 1 < filesQueue.length) {
                showToast('Divisões geradas', `Arquivo ${currentFileIndex + 1}/${filesQueue.length} concluído. Carregando o próximo...`, 'success', 1800);
                setTimeout(() => {
                    carregarProximoArquivo();
                }, 1200);
            } else {
                showToast('Lote concluído', 'Todos os arquivos do lote foram processados.', 'success', 2600);
            }
        }, 1000);
        
    } catch (erro) {
        console.error('Erro ao processar divisões:', erro);
        alert(`Erro ao processar divisões!\n\n${erro.message}`);
        
        progressSection.style.display = 'none';
        btnProcessar.disabled = false;
        btnProcessar.innerHTML = '<i class="bi bi-scissors"></i>Processar todas as divisões';
    }
}
