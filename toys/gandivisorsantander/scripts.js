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
let currentSearchIndex = 0;
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
    
    // Scroll do mouse no canvas
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            // Scroll up - página anterior
            irParaPagina(pageNum - 1);
        } else {
            // Scroll down - próxima página
            irParaPagina(pageNum + 1);
        }
    });

    alternarModoDivisao();
});

// Manipular seleção de múltiplos arquivos
function handleFilesSelect(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    // Filtrar apenas PDFs
    filesQueue = files.filter(f => f.type === 'application/pdf');
    
    if (filesQueue.length === 0) {
        alert('⚠️ Por favor, selecione arquivos PDF válidos.');
        return;
    }
    
    if (filesQueue.length < files.length) {
        alert(`⚠️ ${files.length - filesQueue.length} arquivo(s) não-PDF foram ignorados.`);
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
        <div class="batch-stat-card">
            <div class="label">Total</div>
            <div class="value">${total}</div>
        </div>
        <div class="batch-stat-card">
            <div class="label">Processados</div>
            <div class="value">${processados}</div>
        </div>
        <div class="batch-stat-card">
            <div class="label">Faltando</div>
            <div class="value">${faltando}</div>
        </div>
        <div class="batch-stat-card">
            <div class="label">Em andamento</div>
            <div class="value">${Math.min(processados + 1, total)}/${total}</div>
        </div>
        <div class="batch-current-card">
            <div class="label">Arquivo atual</div>
            <div class="value current-file-name">${arquivoAtual}</div>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';
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
        ? `<span style="color: var(--success);">${numeroCNJ} ✓</span>`
        : `<span style="color: var(--danger);">❌ Não detectado no nome do arquivo</span>`;
    
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
        currentSearchIndex = 0;
        pdfTextContent = {};
        document.getElementById('searchText').value = '';
        document.getElementById('searchResults').textContent = '';
        
        // Marcar arquivo como em processamento
        atualizarStatusFila(currentFileIndex, '🔄 Processando', 'processing');
        showToast('Arquivo carregado', `Pronto para marcar e dividir: ${currentFile.name}`, 'info', 1300);
        
    } catch (error) {
        console.error('Erro ao carregar PDF:', error);
        alert(`❌ Erro ao carregar PDF!\n\nArquivo: ${currentFile.name}\n\n${error.message}`);
        
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

// Marcar arquivo como ignorado
function marcarArquivoComoIgnorado(index) {
    atualizarStatusFila(index, '⏭️ Ignorado', 'skipped');
}

// Marcar arquivo como erro
function marcarArquivoComoErro(index, erro) {
    atualizarStatusFila(index, '❌ Erro', 'error');
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
        document.getElementById('inicioInicial').style.borderColor = 'red';
        document.getElementById('fimInicial').style.borderColor = 'red';
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
    
    // Atualizar preview
    document.getElementById('previewInicial').innerHTML = `
        <strong>Páginas ${inicio}-${fim}</strong><br>
        ${paginasInicial} página(s)<br>
            <small style="color: var(--toy-muted, var(--text-secondary));">Inicial${sufixoCNJ}.pdf</small>
    `;
    
    if (paginasDocs > 0) {
        document.getElementById('previewDocs').innerHTML = `
            <strong>${docsDescricao}</strong><br>
            ${paginasDocs} página(s)<br>
            <small style="color: var(--toy-muted, var(--text-secondary));">Docs Inicial${sufixoCNJ}.pdf</small>
        `;
    } else {
        document.getElementById('previewDocs').innerHTML = `
            <strong>Nenhuma página</strong><br>
            <small style="color: var(--toy-muted, var(--text-secondary));">(Todas as páginas estão na "Inicial")</small>
        `;
    }
    
    // Mostrar preview
    document.getElementById('divisionPreview').style.display = 'block';
}

// Processar e dividir PDF
async function processarDivisao() {
    const inicio = parseInt(document.getElementById('inicioInicial').value) || 1;
    const fim = parseInt(document.getElementById('fimInicial').value) || pageCount;
    
    // Validar
    if (inicio > fim) {
        alert('❌ Erro: A primeira página não pode ser maior que a última página!');
        return;
    }
    
    const sufixoCNJ = numeroCNJ ? ` - ${numeroCNJ}` : '';
    
    // Calcular páginas que serão "Docs da Inicial"
    const paginasAntes = inicio > 1 ? `1-${inicio-1}` : null;
    const paginasDepois = fim < pageCount ? `${fim+1}-${pageCount}` : null;
    
    let docsDescricao = '';
    if (paginasAntes && paginasDepois) {
        docsDescricao = `Páginas ${paginasAntes} + ${paginasDepois}`;
    } else if (paginasAntes) {
        docsDescricao = `Páginas ${paginasAntes}`;
    } else if (paginasDepois) {
        docsDescricao = `Páginas ${paginasDepois}`;
    } else {
        docsDescricao = 'Nenhuma página adicional';
    }
    
    showToast('Iniciando Divisão', `Processando: ${currentFile.name}`, 'info', 2000);
    
    // Desabilitar botão
    const btnProcessar = document.getElementById('btnProcessar');
    btnProcessar.disabled = true;
    btnProcessar.textContent = '⏳ Processando...';
    
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
        atualizarStatusFila(currentFileIndex, '✅ Concluído', 'completed');
        
        // Mostrar resultado
        setTimeout(() => {
            progressSection.style.display = 'none';
            resultSection.style.display = 'block';
            
            const numArquivos = (temPaginasAntes || temPaginasDepois) ? 2 : 1;
            document.getElementById('resultMessage').innerHTML = `
                <strong>Arquivo ${currentFileIndex + 1}/${filesQueue.length} processado!</strong><br><br>
                📄 ${numArquivos} PDF(s) baixado(s) com sucesso!<br><br>
                ${currentFileIndex + 1 < filesQueue.length ? 
                    '<strong>⏭️ Carregando próximo arquivo...</strong>' : 
                    '<strong>🎉 Todos os arquivos foram processados!</strong>'}
            `;
            
            // Resetar botão
            btnProcessar.disabled = false;
            btnProcessar.textContent = '✂️ Dividir e Baixar PDFs';
            
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
        alert('❌ Erro ao processar PDF!\n\nDetalhes: ' + error.message);
        
        // Marcar como erro
        marcarArquivoComoErro(currentFileIndex, error.message);
        
        btnProcessar.disabled = false;
        btnProcessar.textContent = '✂️ Dividir e Baixar PDFs';
        
        // Perguntar se quer continuar
        if (currentFileIndex + 1 < filesQueue.length) {
            if (confirm('⚠️ Erro ao processar arquivo!\n\nDeseja continuar com o próximo arquivo?')) {
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
    
    document.getElementById('resultMessage').innerHTML = `
        <h3 style="color: var(--success);">🎉 Processamento Concluído!</h3><br>
        <strong>📊 Estatísticas:</strong><br><br>
        📁 Total de arquivos: ${total}<br>
        ✅ Processados com sucesso: ${concluidos}<br>
        ❌ Erros: ${erros}<br>
        ⏭️ Ignorados: ${ignorados}<br><br>
        <strong>📥 Os arquivos foram baixados para sua pasta Downloads.</strong><br>
        Você pode organizá-los na pasta de sua preferência.
    `;
}

// Limpar tudo e recomeçar
function limparTudo() {
    if (confirm('⚠️ Deseja limpar tudo e recomeçar?\n\nTodos os arquivos serão removidos da fila.')) {
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
        document.getElementById('filesQueue').style.display = 'none';
        document.getElementById('viewerSection').style.display = 'none';
        document.getElementById('processSection').style.display = 'none';
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('resultSection').style.display = 'none';
        document.getElementById('divisionPreview').style.display = 'none';
        
        // Limpar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        alert('✓ Tudo limpo! Selecione novos PDFs para começar.');
    }
}

// Buscar texto no PDF
async function buscarNoPDF() {
    const searchTerm = document.getElementById('searchText').value.trim().toLowerCase();
    
    if (!searchTerm) {
        alert('⚠️ Digite uma palavra para buscar!');
        return;
    }
    
    if (!pdfDoc) {
        alert('⚠️ Nenhum PDF carregado!');
        return;
    }
    
    searchResults = [];
    currentSearchIndex = 0;
    
    // Mostrar progresso
    document.getElementById('searchResults').textContent = '🔍 Buscando...';
    
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
        document.getElementById('searchResults').textContent = 
            `✅ ${searchResults.length} página(s) encontrada(s): ${searchResults.join(', ')}`;
        
        // Ir para primeira ocorrência
        irParaPagina(searchResults[0]);
        alert(`✅ Encontrado em ${searchResults.length} página(s)!\n\nPáginas: ${searchResults.join(', ')}\n\nUse "Próxima ▶" para navegar entre resultados.`);
    } else {
        document.getElementById('searchResults').textContent = '❌ Palavra não encontrada';
        alert('❌ Palavra não encontrada no documento.');
    }
}

// Ir para próxima ocorrência
function proximaOcorrencia() {
    if (searchResults.length === 0) {
        alert('⚠️ Faça uma busca primeiro!');
        return;
    }
    
    currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
    irParaPagina(searchResults[currentSearchIndex]);
    
    document.getElementById('searchResults').textContent = 
        `📄 Página ${searchResults[currentSearchIndex]} (${currentSearchIndex + 1}/${searchResults.length})`;
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
        alert('⚠️ Digite o número CNJ!');
        return;
    }
    
    // Tentar formatar se for só números
    let cnjFormatado = cnjInput;
    
    // Se tiver apenas números, formatar
    if (/^\d{20}$/.test(cnjInput)) {
        cnjFormatado = formatarCNJ(cnjInput);
        if (!cnjFormatado) {
            alert('❌ Número CNJ inválido! Deve ter 20 dígitos.');
            return;
        }
        alert(`✅ CNJ formatado automaticamente:\n\n${cnjInput}\n↓\n${cnjFormatado}`);
    }
    
    // Validar formato CNJ
    const regexCNJ = /^\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}$/;
    if (!regexCNJ.test(cnjFormatado)) {
        alert('❌ Formato CNJ inválido!\n\nFormato esperado: 0000000-00.0000.0.00.0000\nOu: 20 dígitos sem pontuação');
        return;
    }
    
    // Aplicar CNJ
    numeroCNJ = cnjFormatado;
    document.getElementById('detectedCNJ').innerHTML = `<span style="color: var(--success);">${numeroCNJ} ✓ (Manual)</span>`;
    document.getElementById('cnjWarning').style.display = 'none';
    
    // Atualizar preview
    atualizarPreview();
    
    alert(`✅ CNJ aplicado com sucesso!\n\n${numeroCNJ}\n\nOs PDFs serão nomeados com este número.`);
}

// Formatar bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ============= MODO PERSONALIZADO =============

// Array para armazenar divisões personalizadas
let customDivisions = [];


function showToast(title, message, type = 'info', duration = 2200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.innerHTML = `
        <div class="app-toast-title">${title}</div>
        <div class="app-toast-body">${message}</div>
    `;
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
    const btnAuto = document.getElementById('btnProcessar');
    const btnCustom = document.getElementById('btnProcessarCustom');
    if (autoPanel) autoPanel.style.display = modo === 'auto' ? 'block' : 'none';
    if (customPanel) customPanel.style.display = modo === 'custom' ? 'block' : 'none';
    if (btnAuto) btnAuto.style.display = modo === 'auto' ? 'inline-block' : 'none';
    if (btnCustom) btnCustom.style.display = modo === 'custom' ? 'inline-block' : 'none';
}

// Alternar entre modos (legado, mantido por compatibilidade)
function alternarModo(modo) {
    const modoAuto = document.getElementById('modoAutomatico');
    const modoPersonalizado = document.getElementById('modoPersonalizado');
    const selecaoPaginasAuto = document.getElementById('selecaoPaginasAutomatico');
    const selecaoPaginasPersonalizado = document.getElementById('selecaoPaginasPersonalizado');
    
    if (modo === 'auto') {
        modoAuto.style.display = 'block';
        modoPersonalizado.style.display = 'none';
        // Mostrar campos do modo automático
        if (selecaoPaginasAuto) {
            selecaoPaginasAuto.style.display = 'block';
        }
        // Ocultar campos do modo personalizado
        if (selecaoPaginasPersonalizado) {
            selecaoPaginasPersonalizado.style.display = 'none';
        }
    } else {
        modoAuto.style.display = 'none';
        modoPersonalizado.style.display = 'block';
        // Ocultar campos do modo automático
        if (selecaoPaginasAuto) {
            selecaoPaginasAuto.style.display = 'none';
        }
        // Mostrar campos do modo personalizado
        if (selecaoPaginasPersonalizado) {
            selecaoPaginasPersonalizado.style.display = 'block';
        }
    }
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
        alert('❌ Digite um nome para o arquivo!');
        return;
    }
    
    if (inicio > fim) {
        alert('❌ A página inicial não pode ser maior que a final!');
        return;
    }
    
    if (inicio < 1 || fim > pageCount) {
        alert(`❌ Páginas devem estar entre 1 e ${pageCount}!`);
        return;
    }
    
    // Verificar caracteres inválidos no nome
    const caracteresInvalidos = /[<>:"/\\|?*]/g;
    if (caracteresInvalidos.test(nome)) {
        alert('❌ O nome do arquivo contém caracteres inválidos!\n\nNão use: < > : " / \\ | ? *');
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
    
    alert(`✅ Divisão adicionada!\n\n${nome}\nPáginas ${inicio}-${fim} (${divisao.paginas} páginas)`);
}

// Renderizar lista de divisões
function renderizarListaDivisoes() {
    const container = document.getElementById('divisionsListContainer');
    const listSection = document.getElementById('customDivisionsList');
    
    if (customDivisions.length === 0) {
        listSection.style.display = 'none';
        return;
    }
    
    listSection.style.display = 'block';
    
    const sufixoCNJ = numeroCNJ ? ` - ${numeroCNJ}` : '';
    
    let html = '<div class="list-group">';
    
    customDivisions.forEach((div, index) => {
        html += `
            <div class="list-group-item" style="border-left: 4px solid var(--gondim-primary);">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1">
                            <span class="badge bg-primary me-2">#${index + 1}</span>
                            <i class="bi bi-file-pdf text-danger me-1"></i>
                            <strong>${div.nome}${sufixoCNJ}.pdf</strong>
                        </h6>
                        <p class="mb-0 text-muted">
                            <i class="bi bi-files me-1"></i>
                            Páginas ${div.inicio}-${div.fim} (${div.paginas} ${div.paginas === 1 ? 'página' : 'páginas'})
                        </p>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-danger" onclick="removerDivisaoCustom(${div.id})" title="Remover">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Adicionar resumo
    const totalPaginas = customDivisions.reduce((sum, div) => sum + div.paginas, 0);
    html += `
        <div class="alert alert-info mt-3 mb-0">
            <i class="bi bi-info-circle me-2"></i>
            <strong>Total:</strong> ${customDivisions.length} ${customDivisions.length === 1 ? 'divisão' : 'divisões'} 
            | ${totalPaginas} ${totalPaginas === 1 ? 'página' : 'páginas'}
        </div>
    `;
    
    container.innerHTML = html;
}

// Remover divisão personalizada
function removerDivisaoCustom(id) {
    if (!confirm('❌ Deseja remover esta divisão?')) {
        return;
    }
    
    customDivisions = customDivisions.filter(div => div.id !== id);
    renderizarListaDivisoes();
}

// Limpar todas as divisões
function limparDivisoesCustom() {
    if (!confirm('❌ Deseja limpar todas as divisões criadas?')) {
        return;
    }
    
    customDivisions = [];
    renderizarListaDivisoes();
}

// Processar divisões personalizadas
async function processarDivisoesCustom() {
    if (customDivisions.length === 0) {
        alert('❌ Nenhuma divisão criada!\n\nCrie ao menos uma divisão antes de processar.');
        return;
    }
    
    const sufixoCNJ = numeroCNJ ? ` - ${numeroCNJ}` : '';
    
    showToast('Processando Divisões', `Processando ${customDivisions.length} divisão(ões)...`, 'info', 2000);
    
    // Desabilitar botão
    const btnProcessar = document.getElementById('btnProcessarCustom');
    btnProcessar.disabled = true;
    btnProcessar.textContent = '⏳ Processando...';
    
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
        atualizarStatusFila(currentFileIndex, '✅ Concluído', 'completed');
        
        // Mostrar resultado
        setTimeout(() => {
            progressSection.style.display = 'none';
            resultSection.style.display = 'block';
            
            document.getElementById('resultMessage').innerHTML = `
                <strong>Arquivo ${currentFileIndex + 1}/${filesQueue.length} processado!</strong><br><br>
                📄 ${totalDivisoes} PDF(s) criado(s) com sucesso!<br><br>
                ${currentFileIndex + 1 < filesQueue.length ? 
                    '<strong>⏭️ Carregando próximo arquivo...</strong>' : 
                    '<strong>🎉 Todos os arquivos foram processados!</strong>'}
            `;
            
            // Resetar botão
            btnProcessar.disabled = false;
            btnProcessar.innerHTML = '<i class="bi bi-scissors me-2"></i>Processar Todas as Divisões';
            
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
        alert(`❌ Erro ao processar divisões!\n\n${erro.message}`);
        
        progressSection.style.display = 'none';
        btnProcessar.disabled = false;
        btnProcessar.innerHTML = '<i class="bi bi-scissors me-2"></i>Processar Todas as Divisões';
    }
}
