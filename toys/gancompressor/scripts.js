// Configurar PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '../../vendor/pdfjs/pdf.worker.min.js';

// Estado global
let filesQueue = [];
let fileStatuses = []; // 'pending', 'processing', 'completed', 'error'
let baseResolution = 72; // default dpi pra cálculos

document.addEventListener('DOMContentLoaded', () => {
    const pdfInput = document.getElementById('pdfInput');
    pdfInput.addEventListener('change', handleFilesSelect);
});

// Manipular seleção de arquivos
function handleFilesSelect(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    // Filtrar PDFs
    const newFiles = files.filter(f => f.type === 'application/pdf');
    
    if (newFiles.length === 0) {
        showToast('Aviso', 'Selecione arquivos PDF válidos.', 'warn');
        return;
    }
    
    filesQueue = newFiles;
    fileStatuses = newFiles.map(() => 'pending');
    
    // Esconder seção 1, mostrar seção 2
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('settingsSection').style.display = 'block';
    
    renderizarFilaArquivos();
}

// Badge de estado do arquivo: sempre o `.badge` do shared, com o tom do estado.
function badgeDoEstado(status) {
    if (status === 'processing') return { classe: 'badge badge-accent', texto: 'Processando...' };
    if (status === 'completed') return { classe: 'badge badge-ok', texto: 'Concluído' };
    if (status === 'error') return { classe: 'badge badge-fail', texto: 'Erro' };
    return { classe: 'badge', texto: 'Aguardando' };
}

function renderizarFilaArquivos() {
    const container = document.getElementById('filesListContainer');
    container.innerHTML = '';
    
    filesQueue.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'tile file-item';
        item.id = `file-item-${index}`;
        
        const badge = badgeDoEstado(fileStatuses[index]);

        item.innerHTML = `
            <div class="file-item-info">
                <div class="file-item-top">
                    <span class="file-item-name" title="${file.name}">${file.name}</span>
                    <span class="${badge.classe}" id="badge-${index}">${badge.texto}</span>
                </div>
                <span class="file-item-status" id="file-size-${index}">Original: ${formatBytes(file.size)}</span>
                <div class="progress-wrap hidden" id="progress-container-${index}">
                    <div class="progress-bar" id="progress-fill-${index}"></div>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

function atualizarStatusArquivo(index, status, progresso = null) {
    fileStatuses[index] = status;
    
    const badge = document.getElementById(`badge-${index}`);
    const progressContainer = document.getElementById(`progress-container-${index}`);
    const progressFill = document.getElementById(`progress-fill-${index}`);
    
    if (!badge) return;

    const estado = badgeDoEstado(status);
    badge.className = estado.classe;
    badge.textContent = estado.texto;

    // A barra fina do arquivo só aparece enquanto ele está sendo processado.
    progressContainer.classList.toggle('hidden', status !== 'processing');
    if (status === 'processing' && progresso !== null) {
        progressFill.style.width = `${progresso}%`;
    }
}

async function iniciarCompressaoLote() {
    const btnProcessar = document.getElementById('btnProcessar');
    const btnLimpar = document.getElementById('btnLimpar');
    
    const qualidadeInput = document.querySelector('input[name="qualidade"]:checked');
    const dpiInput = document.querySelector('input[name="dpi"]:checked');
    
    const qualidade = qualidadeInput ? parseFloat(qualidadeInput.value) : 0.6;
    const dpi = dpiInput ? parseInt(dpiInput.value) : 150;
    
    btnProcessar.disabled = true;
    btnLimpar.disabled = true;
    
    // Scale em pdf.js é baseado em 72 DPI interno. 
    // Então scale = DPI desjada / 72.
    const renderScale = dpi / 72;
    
    // Progresso geral: `.progress-area` do shared, visível pela classe `.visible`.
    const globalSection = document.getElementById('progressGlobalSection');
    const globalFill = document.getElementById('progressGlobalFill');
    const globalText = document.getElementById('progressGlobalText');
    globalSection.classList.add('visible');
    
    let concluidos = 0;
    
    for (let i = 0; i < filesQueue.length; i++) {
        if (fileStatuses[i] === 'completed' || fileStatuses[i] === 'error') continue; // Pular se já foi processado
        
        atualizarStatusArquivo(i, 'processing', 0);
        const file = filesQueue[i];
        
        try {
            const resultBytes = await comprimirPDF(file, qualidade, renderScale, (progresso) => {
                atualizarStatusArquivo(i, 'processing', progresso);
            });
            
            const originalSize = file.size;
            const finalSize = resultBytes.byteLength;
            let percentText = "";
            let colorHelper = "";
            let bytesToDownload = resultBytes;
            
            if (finalSize < originalSize) {
                const percent = (((originalSize - finalSize) / originalSize) * 100).toFixed(1);
                percentText = `(Redução de ${percent}%)`;
                colorHelper = "color: var(--toy-success); font-weight: bold;";
            } else {
                percentText = `(Já otimizado. Original mantido)`;
                colorHelper = "color: var(--toy-warning); font-weight: bold;";
                bytesToDownload = await file.arrayBuffer(); // Mantém o backup original
            }
            
            const sizeSpan = document.getElementById(`file-size-${i}`);
            if (sizeSpan) {
                if (finalSize < originalSize) {
                    sizeSpan.innerHTML = `Original: ${formatBytes(originalSize)} <i class="bi bi-arrow-right file-item-arrow"></i> Final: ${formatBytes(finalSize)} <span class="file-item-delta" style="${colorHelper}">${percentText}</span>`;
                } else {
                    sizeSpan.innerHTML = `Original: ${formatBytes(originalSize)} <i class="bi bi-arrow-right file-item-arrow"></i> Final: Mantido <span class="file-item-delta" style="${colorHelper}">${percentText}</span>`;
                }
            }

            // Gerar nome do arquivo comprimido
            const originalName = file.name;
            const basename = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
            const newName = `${basename}_comprimido.pdf`;
            
            baixarArquivo(bytesToDownload, newName);
            
            atualizarStatusArquivo(i, 'completed');
            concluidos++;
        } catch (err) {
            console.error('Erro comprimindo arquivo', file.name, err);
            atualizarStatusArquivo(i, 'error');
            showToast('Erro', `Falha ao comprimir ${file.name}`, 'fail');
        }
        
        // Update global progress
        globalFill.style.width = `${((i + 1) / filesQueue.length) * 100}%`;
        globalText.textContent = `${concluidos} / ${filesQueue.length} concluídos`;
    }
    
    // Fim
    // Mantendo a listagem de arquivos vísivel (settingsSection não será ocultada)
    document.getElementById('resultSection').style.display = 'block';
    
    // Rolar a tela suavemente até a seção de resultados caso a lista de arquivos seja muito longa
    document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    btnProcessar.disabled = false;
    btnLimpar.disabled = false;
    
    showToast('Sucesso', 'Processamento do lote concluído!', 'ok', 3000);
}

/**
 * Função principal de compressão via rasterização
 */
async function comprimirPDF(file, quality, scale, onProgress) {
    return new Promise(async (resolve, reject) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfData = new Uint8Array(arrayBuffer);
            
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            const pdfDoc = await loadingTask.promise;
            const numPages = pdfDoc.numPages;
            
            const canvas = document.getElementById('renderCanvas');
            const ctx = canvas.getContext('2d');
            
            let newPdf = null;
            
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                
                // Dimensões originais da página para o PDF final
                const originalViewport = page.getViewport({ scale: 1 });
                const widthPt = originalViewport.width;
                const heightPt = originalViewport.height;
                const isLandscape = widthPt > heightPt;
                const orientation = isLandscape ? 'landscape' : 'portrait';

                // Dimensões dimensionadas para renderização(DPI) no Canvas
                const viewport = page.getViewport({ scale: scale });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({
                    canvasContext: ctx,
                    viewport: viewport
                }).promise;
                
                // Converter canvas para JPEG Data URL
                const imgData = canvas.toDataURL('image/jpeg', quality);
                
                if (pageNum === 1) {
                    newPdf = new jspdf.jsPDF({
                        orientation: orientation,
                        unit: 'pt',
                        format: [widthPt, heightPt],
                        compress: true
                    });
                } else {
                    newPdf.addPage([widthPt, heightPt], orientation);
                }
                
                // Adicionar a imagem
                newPdf.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt);
                
                if (onProgress) {
                    onProgress(Math.round((pageNum / numPages) * 100));
                }
            }
            
            // Retorna o novo PDF como ArrayBuffer
            const outputBytes = newPdf.output('arraybuffer');
            resolve(outputBytes);
            
        } catch (error) {
            reject(error);
        }
    });
}

function baixarArquivo(bytes, nomeArquivo) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function limparTudo() {
    filesQueue = [];
    fileStatuses = [];
    
    document.getElementById('pdfInput').value = '';
    
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('settingsSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('progressGlobalSection').classList.remove('visible');
    
    const btnProcessar = document.getElementById('btnProcessar');
    const btnLimpar = document.getElementById('btnLimpar');
    btnProcessar.disabled = false;
    btnLimpar.disabled = false;
    
    // Limpar listas e inputs
    document.getElementById('filesListContainer').innerHTML = '';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Pequeno helper de Toast apoiado no `.toast` do shared.
// tone: '' (accent padrão), 'ok', 'warn' ou 'fail'.
function showToast(title, message, tone = '', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = tone ? `toast ${tone}` : 'toast';

    toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-body">${message}</div>
    `;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 220);
    }, duration);
}
