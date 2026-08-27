document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileNameDisplay = document.getElementById('file-name');
    const fileSizeInfo = document.getElementById('file-size-info');
    const processBtn = document.getElementById('process-btn');
    const maxSizeInput = document.getElementById('max-size');
    
    const statusSection = document.getElementById('status-section');
    const progressBar = document.getElementById('progress-bar');
    const statusMessage = document.getElementById('status-message');
    
    const resultsSection = document.getElementById('results-section');
    const resultSummary = document.getElementById('result-summary');
    const downloadBtn = document.getElementById('download-btn');
    const individualFilesDiv = document.getElementById('individual-files');

    let selectedFile = null;
    let splitBlobs = [];
    let originalFileName = "documento";

    // --- File Drag & Drop Handlers ---
    
    const handleFileSelect = (file) => {
        if (file && file.type === "application/pdf") {
            selectedFile = file;
            originalFileName = file.name.replace('.pdf', '');
            fileNameDisplay.innerHTML = `<strong>${file.name}</strong> selecionado`;
            
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            fileSizeInfo.textContent = `Tamanho Original: ${sizeMB} MB`;
            
            processBtn.disabled = false;
        } else {
            alert('Por favor, selecione um arquivo PDF válido.');
            resetSelection();
        }
    };

    const resetSelection = () => {
        selectedFile = null;
        fileNameDisplay.innerHTML = `Arraste seu PDF ou <strong>clique aqui</strong>`;
        fileSizeInfo.textContent = '';
        processBtn.disabled = true;
        fileInput.value = '';
    };

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    // --- Processing Logic ---

    const updateStatus = (message, percent) => {
        statusMessage.textContent = message;
        progressBar.style.width = `${percent}%`;
    };

    processBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        const maxMB = parseFloat(maxSizeInput.value);
        if (isNaN(maxMB) || maxMB <= 0) {
            alert("Por favor, insira um tamanho máximo válido.");
            return;
        }

        const maxBytes = maxMB * 1024 * 1024;

        // UI Reset
        processBtn.disabled = true;
        statusSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        splitBlobs = [];
        individualFilesDiv.innerHTML = '';

        try {
            updateStatus("Lendo arquivo original...", 5);
            const arrayBuffer = await selectedFile.arrayBuffer();
            
            updateStatus("Otimizando e carregando PDF...", 15);
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            const totalPages = pdfDoc.getPageCount();

            updateStatus(`Analisando ${totalPages} páginas...`, 20);

            let splits = [];
            let currentPagesCount = 0;
            let lastValidBytes = null;
            let startPageIndexForCurrentSplit = 0;

            for (let i = 0; i < totalPages; i++) {
                updateStatus(`Processando página ${i + 1} de ${totalPages}...`, 20 + ((i / totalPages) * 60));
                
                // Create a temporary document to test the new size
                const testPdf = await PDFLib.PDFDocument.create();
                
                // Get all indices for the current split attempt
                const pagesToCopyIndices = [];
                for (let j = 0; j <= currentPagesCount; j++) {
                    pagesToCopyIndices.push(startPageIndexForCurrentSplit + j);
                }
                
                const copiedPages = await testPdf.copyPages(pdfDoc, pagesToCopyIndices);
                copiedPages.forEach(p => testPdf.addPage(p));
                
                const testBytes = await testPdf.save();
                
                // If appending this page exceeds max bytes and we already have at least 1 page in the current split
                if (testBytes.byteLength > maxBytes && currentPagesCount > 0) {
                    // The valid chunk is what we had previously (lastValidBytes)
                    splits.push(lastValidBytes);
                    
                    // Reset current tracking variables. The current page 'i' becomes the first page of the new split
                    currentPagesCount = 1;
                    startPageIndexForCurrentSplit = i;
                    
                    const resetPdf = await PDFLib.PDFDocument.create();
                    const [newPage] = await resetPdf.copyPages(pdfDoc, [i]);
                    resetPdf.addPage(newPage);
                    lastValidBytes = await resetPdf.save();
                } else {
                    // Accepts the new page into current split block
                    currentPagesCount++;
                    lastValidBytes = testBytes;
                }

                // If this is a massive single page that exceeds max bytes, it will be added as its own split eventually
            }

            if (lastValidBytes) {
                splits.push(lastValidBytes);
            }

            updateStatus("Finalizando arquivos...", 90);

            // Generate Blobs
            splits.forEach((bytes, index) => {
                const blob = new Blob([bytes], { type: 'application/pdf' });
                splitBlobs.push({
                    name: `${originalFileName}_parte_${index + 1}.pdf`,
                    blob: blob
                });
            });

            // Update UI success
            updateStatus("Concluído!", 100);
            setTimeout(() => {
                statusSection.classList.add('hidden');
                resultsSection.classList.remove('hidden');
                
                resultSummary.textContent = `O arquivo foi dividido em ${splitBlobs.length} parte(s) menores que ${maxMB} MB.`;
                
                // List individual files for optional direct download
                splitBlobs.forEach(fileObj => {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(fileObj.blob);
                    link.download = fileObj.name;
                    link.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> ${fileObj.name} (${(fileObj.blob.size / (1024*1024)).toFixed(2)} MB)`;
                    individualFilesDiv.appendChild(link);
                });
            }, 800);

        } catch (error) {
            console.error(error);
            alert("Ocorreu um erro ao processar o arquivo. Detalhes no console.");
            updateStatus("Erro no processamento.", 0);
        } finally {
            processBtn.disabled = false;
        }
    });

    // --- ZIP and Download ---

    downloadBtn.addEventListener('click', async () => {
        if (splitBlobs.length === 0) return;
        
        const zip = new JSZip();
        splitBlobs.forEach(fileObj => {
            zip.file(fileObj.name, fileObj.blob);
        });

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${originalFileName}_dividido.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

});
