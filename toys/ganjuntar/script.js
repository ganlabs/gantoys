const { PDFDocument } = PDFLib;

const state = {
    selectedDirHandle: null,
    subfolders: [],
    manualFiles: [],
    isProcessing: false
};

const elements = {
    tabFolders: document.getElementById('tabFolders'),
    tabFiles: document.getElementById('tabFiles'),
    panelFolders: document.getElementById('panelFolders'),
    panelFiles: document.getElementById('panelFiles'),
    folderBtn: document.getElementById('folderBtn'),
    folderInput: document.getElementById('folderInput'),
    folderInfo: document.getElementById('folderInfo'),
    folderStatus: document.getElementById('folderStatus'),
    folderPath: document.getElementById('folderPath'),
    folderCount: document.getElementById('folderCount'),
    pdfCount: document.getElementById('pdfCount'),
    subfoldersList: document.getElementById('subfoldersList'),
    mergeBtn: document.getElementById('mergeBtn'),
    filesBtn: document.getElementById('filesBtn'),
    filesInput: document.getElementById('filesInput'),
    filesStatus: document.getElementById('filesStatus'),
    filesInfo: document.getElementById('filesInfo'),
    filesCount: document.getElementById('filesCount'),
    fileOrder: document.getElementById('fileOrder'),
    outputName: document.getElementById('outputName'),
    mergeFilesBtn: document.getElementById('mergeFilesBtn'),
    progressContainer: document.getElementById('progressContainer'),
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    progressCurrent: document.getElementById('progressCurrent'),
    progressDetail: document.getElementById('progressDetail'),
    results: document.getElementById('results'),
    resultsList: document.getElementById('resultsList')
};

function podeUsarSeletorDePasta() {
    if (!('showDirectoryPicker' in window)) return false;
    // Em `file://` cada documento é uma origem opaca: dentro do iframe do app a
    // File System Access API é barrada pela permissions policy (o app, na
    // janela de cima, consegue usá-la). Nesse caso vale o seletor clássico.
    if (location.protocol === 'file:' && window.parent !== window) return false;
    return true;
}

/* ---------------------------------------------------------------------------
 * Modo de junção (abas)
 * ------------------------------------------------------------------------- */

function activateMode(mode, persistir = true) {
    const arquivos = mode === 'files';
    elements.tabFolders.setAttribute('aria-selected', String(!arquivos));
    elements.tabFiles.setAttribute('aria-selected', String(arquivos));
    elements.panelFolders.hidden = arquivos;
    elements.panelFiles.hidden = !arquivos;
    if (persistir && window.GanToyState) window.GanToyState.set('modo', mode);
}

if (window.GanToyState) {
    window.GanToyState.onRestore((estado) => {
        if (estado.habilitado && estado.extras.modo) activateMode(estado.extras.modo, false);
    });
    window.GanToyState.onClear(limparEstadoInterno);
}

/* ---------------------------------------------------------------------------
 * Modo por subpastas
 * ------------------------------------------------------------------------- */

async function selectFolder() {
    elements.folderStatus.hidden = true;
    if (!podeUsarSeletorDePasta()) {
        elements.folderInput.click();
        return;
    }

    try {
        const handle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });

        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'prompt') {
            await handle.requestPermission({ mode: 'readwrite' });
        }

        state.selectedDirHandle = handle;
        await scanSubfolders(handle);

        elements.folderBtn.classList.add('selected');
        preencherBotaoPasta(elements.folderBtn, handle.name);
        elements.folderInfo.classList.remove('hidden');
        elements.folderPath.textContent = handle.name;

        renderSubfolders();
        elements.mergeBtn.disabled = state.subfolders.length === 0;

    } catch (err) {
        // O navegador usa AbortError tanto para cancelar quanto para recusar
        // uma pasta. Informe as duas possibilidades sem abrir outro seletor.
        if (err.name === 'AbortError') {
            elements.folderStatus.textContent = 'A seleção foi cancelada ou o navegador recusou o acesso à pasta. '
                + 'Tente novamente com uma subpasta e permita o acesso.';
            elements.folderStatus.hidden = false;
            return;
        }
        console.warn('showDirectoryPicker indisponível, usando o seletor de pasta do navegador:', err);
        elements.folderInput.click();
    }
}

async function selectFolderFromFiles(fileList) {
    elements.folderStatus.hidden = true;
    const files = Array.from(fileList || []).filter(file =>
        file.name.toLowerCase().endsWith('.pdf') && !file.name.startsWith('Integral_')
    );

    if (files.length === 0) {
        alert('Nenhum PDF encontrado na pasta selecionada.');
        return;
    }

    const folderMap = new Map();
    const rootName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'Pasta selecionada';

    files.forEach(file => {
        const parts = (file.webkitRelativePath || file.name).split('/');
        const subfolderName = parts.length > 2 ? parts[1] : rootName;
        if (!folderMap.has(subfolderName)) {
            folderMap.set(subfolderName, []);
        }
        folderMap.get(subfolderName).push({
            name: file.name,
            getFile: async () => file
        });
    });

    state.selectedDirHandle = null;
    state.subfolders = Array.from(folderMap.entries())
        .map(([name, groupedFiles]) => ({
            name,
            handle: null,
            files: groupedFiles.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const totalPdfs = state.subfolders.reduce((sum, sf) => sum + sf.files.length, 0);
    elements.folderCount.textContent = state.subfolders.length;
    elements.pdfCount.textContent = totalPdfs;
    elements.folderBtn.classList.add('selected');
    preencherBotaoPasta(elements.folderBtn, rootName);
    elements.folderInfo.classList.remove('hidden');
    elements.folderPath.textContent = `${rootName} (modo offline)`;
    renderSubfolders();
    elements.mergeBtn.disabled = state.subfolders.length === 0;
}

async function scanSubfolders(dirHandle) {
    state.subfolders = [];

    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'directory') {
            const pdfs = [];
            try {
                for await (const file of entry.values()) {
                    if (file.kind === 'file' && file.name.toLowerCase().endsWith('.pdf')) {
                        if (!file.name.startsWith('Integral_')) {
                            pdfs.push(file);
                        }
                    }
                }
            } catch (e) {
                console.warn(`Não foi possível ler subpasta: ${entry.name}`);
            }

            if (pdfs.length > 0) {
                pdfs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                state.subfolders.push({
                    name: entry.name,
                    handle: entry,
                    files: pdfs
                });
            }
        }
    }

    state.subfolders.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const totalPdfs = state.subfolders.reduce((sum, sf) => sum + sf.files.length, 0);
    elements.folderCount.textContent = state.subfolders.length;
    elements.pdfCount.textContent = totalPdfs;
}

function renderSubfolders() {
    if (state.subfolders.length === 0) {
        elements.subfoldersList.replaceChildren();
        elements.subfoldersList.classList.add('hidden');
        return;
    }

    // Nome de subpasta vem do disco do usuário: montado com textContent.
    const titulo = document.createElement('div');
    titulo.className = 'section-title';
    const iconeTitulo = document.createElement('i');
    iconeTitulo.className = 'bi bi-folder2-open';
    titulo.append(iconeTitulo, document.createTextNode('Subpastas'));

    const linhas = state.subfolders.map((sf) => {
        const linha = document.createElement('div');
        linha.className = 'tile';

        const nome = document.createElement('span');
        const icone = document.createElement('i');
        icone.className = 'bi bi-folder2-open';
        icone.setAttribute('aria-hidden', 'true');
        nome.append(icone, document.createTextNode(` ${sf.name}`));

        const contagem = document.createElement('span');
        contagem.className = 'badge badge-accent';
        contagem.textContent = sf.files.length;

        linha.append(nome, contagem);
        return linha;
    });

    elements.subfoldersList.replaceChildren(titulo, ...linhas);
    elements.subfoldersList.classList.remove('hidden');
}

/** Rótulo do botão de pasta: ícone + nome da pasta, sem passar por HTML. */
function preencherBotaoPasta(botao, nome) {
    const icone = document.createElement('i');
    icone.className = 'bi bi-folder2-open';
    icone.setAttribute('aria-hidden', 'true');
    const rotulo = document.createElement('span');
    rotulo.textContent = nome;
    botao.replaceChildren(icone, rotulo);
}

async function mergePdfs() {
    if (state.subfolders.length === 0 || state.isProcessing) return;

    state.isProcessing = true;
    elements.mergeBtn.disabled = true;
    elements.progressContainer.classList.add('visible');
    elements.results.classList.add('hidden');

    const results = [];
    const totalFolders = state.subfolders.length;
    let processed = 0;

    for (const subfolder of state.subfolders) {
        if (subfolder.files.length === 0) {
            processed++;
            continue;
        }

        try {
            elements.progressCurrent.textContent = subfolder.name;
            elements.progressDetail.textContent = `0/${subfolder.files.length} PDFs`;

            const mergedPdf = await PDFDocument.create();
            let pageCount = 0;

            for (let i = 0; i < subfolder.files.length; i++) {
                const fileHandle = subfolder.files[i];
                try {
                    const fileData = await fileHandle.getFile();
                    const arrayBuffer = await fileData.arrayBuffer();

                    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                    const pageIndices = pdf.getPageIndices();
                    if (pageIndices.length > 0) {
                        const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
                        copiedPages.forEach(page => mergedPdf.addPage(page));
                        pageCount += pdf.getPageCount();
                    }
                } catch (err) {
                    console.warn(`Erro ao processar ${fileHandle.name}:`, err);
                }

                const progress = Math.round(((processed + (i + 1) / subfolder.files.length) / totalFolders) * 100);
                elements.progressPercent.textContent = `${progress}%`;
                elements.progressFill.style.width = `${progress}%`;
                elements.progressDetail.textContent = `${i + 1}/${subfolder.files.length} - ${fileHandle.name}`;

                await new Promise(r => setTimeout(r, 10));
            }

            const mergedPdfBytes = await mergedPdf.save();
            const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
            const fileName = `${subfolder.name}.pdf`;

            if (state.selectedDirHandle) {
                const outputHandle = await state.selectedDirHandle.getFileHandle(fileName, { create: true });
                const writable = await outputHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            }

            results.push({
                name: fileName,
                pages: pageCount,
                success: true,
                blob
            });

        } catch (err) {
            console.error(`Erro ao processar ${subfolder.name}:`, err);
            results.push({
                name: subfolder.name,
                error: err.message,
                success: false
            });
        }

        processed++;
    }

    elements.progressContainer.classList.remove('visible');
    elements.mergeBtn.disabled = false;
    state.isProcessing = false;

    renderResults(results);
}

/* ---------------------------------------------------------------------------
 * Modo arquivos selecionados (ordem definida pelo usuário)
 * ------------------------------------------------------------------------- */

function selectFiles(fileList) {
    elements.filesStatus.hidden = true;
    const files = Array.from(fileList || []).filter(file => /\.pdf$/i.test(file.name));
    if (files.length === 0) {
        elements.filesStatus.textContent = 'Selecione pelo menos um arquivo PDF.';
        elements.filesStatus.hidden = false;
        return;
    }

    state.manualFiles = files;
    elements.filesCount.textContent = files.length;
    elements.filesInfo.classList.remove('hidden');
    renderFileOrder();
    elements.mergeFilesBtn.disabled = state.isProcessing;
}

function renderFileOrder() {
    if (state.manualFiles.length === 0) {
        elements.fileOrder.replaceChildren();
        elements.fileOrder.classList.add('hidden');
        return;
    }

    // Nome de arquivo vem do disco do usuário: montado com textContent.
    const linhas = state.manualFiles.map((file, indice) => {
        const linha = document.createElement('div');
        linha.className = 'tile';

        const numero = document.createElement('span');
        numero.className = 'file-order-index';
        numero.textContent = indice + 1;

        const nome = document.createElement('span');
        nome.className = 'file-order-name';
        nome.textContent = file.name;

        const acoes = document.createElement('span');
        acoes.className = 'file-order-actions';
        const botoes = [
            ['up', 'bi-arrow-up', 'Mover para cima', indice === 0],
            ['down', 'bi-arrow-down', 'Mover para baixo', indice === state.manualFiles.length - 1],
            ['remove', 'bi-x-lg', 'Remover da lista', false]
        ];
        botoes.forEach(([acao, iconeClasse, rotulo, desabilitado]) => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'btn btn-outline btn-small btn-icon';
            botao.dataset.action = acao;
            botao.dataset.index = indice;
            botao.setAttribute('aria-label', `${rotulo}: ${file.name}`);
            botao.title = rotulo;
            botao.disabled = desabilitado;
            const icone = document.createElement('i');
            icone.className = `bi ${iconeClasse}`;
            icone.setAttribute('aria-hidden', 'true');
            botao.appendChild(icone);
            acoes.appendChild(botao);
        });

        linha.append(numero, nome, acoes);
        return linha;
    });

    elements.fileOrder.replaceChildren(...linhas);
    elements.fileOrder.classList.remove('hidden');
}

function moverArquivo(indice, passo) {
    if (state.isProcessing) return;
    const destino = indice + passo;
    if (destino < 0 || destino >= state.manualFiles.length) return;
    const [arquivo] = state.manualFiles.splice(indice, 1);
    state.manualFiles.splice(destino, 0, arquivo);
    renderFileOrder();
}

function removerArquivo(indice) {
    if (state.isProcessing) return;
    state.manualFiles.splice(indice, 1);
    elements.filesCount.textContent = state.manualFiles.length;
    elements.filesInfo.classList.toggle('hidden', state.manualFiles.length === 0);
    elements.mergeFilesBtn.disabled = state.manualFiles.length === 0;
    renderFileOrder();
}

function nomeSaida() {
    const base = elements.outputName.value.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'PDFs unidos';
    return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/** Grava o PDF final: seletor de arquivo quando disponível, senão download. */
async function salvarBlob(blob, nome) {
    if (typeof window.showSaveFilePicker === 'function') {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: nome,
                types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (erro) {
            // Cancelar o diálogo encerra a operação; falha de contexto (iframe,
            // file://) cai para o download abaixo.
            if (erro && erro.name === 'AbortError') throw erro;
        }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function mergeSelectedFiles() {
    if (state.manualFiles.length === 0 || state.isProcessing) return;

    state.isProcessing = true;
    elements.mergeFilesBtn.disabled = true;
    elements.progressContainer.classList.add('visible');
    elements.results.classList.add('hidden');
    elements.progressCurrent.textContent = 'Arquivos selecionados';
    elements.progressPercent.textContent = '0%';
    elements.progressFill.style.width = '0%';

    try {
        const mergedPdf = await PDFDocument.create();
        let pageCount = 0;
        const arquivos = state.manualFiles.slice();
        const total = arquivos.length;

        for (let i = 0; i < total; i++) {
            const file = arquivos[i];
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                const pageIndices = pdf.getPageIndices();
                if (pageIndices.length > 0) {
                    const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
                    copiedPages.forEach(page => mergedPdf.addPage(page));
                    pageCount += pdf.getPageCount();
                }
            } catch (err) {
                console.warn(`Erro ao processar ${file.name}:`, err);
            }

            const progress = Math.round(((i + 1) / total) * 100);
            elements.progressPercent.textContent = `${progress}%`;
            elements.progressFill.style.width = `${progress}%`;
            elements.progressDetail.textContent = `${i + 1}/${total} - ${file.name}`;
            await new Promise(r => setTimeout(r, 10));
        }

        if (pageCount === 0) throw new Error('Nenhuma página pôde ser lida nos PDFs selecionados.');

        const bytes = await mergedPdf.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const nome = nomeSaida();
        try {
            await salvarBlob(blob, nome);
        } catch (err) {
            // Cancelar o diálogo de salvar não perde a união: o resultado
            // continua disponível no link do cartão.
            if (!err || err.name !== 'AbortError') throw err;
        }

        elements.progressPercent.textContent = '100%';
        elements.progressFill.style.width = '100%';
        renderResults([{ name: nome, pages: pageCount, success: true, blob }], false);
    } catch (err) {
        console.error('Erro ao juntar os arquivos selecionados:', err);
        renderResults([{ name: nomeSaida(), error: err.message, success: false }], false);
    } finally {
        elements.progressContainer.classList.remove('visible');
        elements.mergeFilesBtn.disabled = state.manualFiles.length === 0;
        state.isProcessing = false;
    }
}

async function renderResults(results, abrirLinks = true) {
    // Cada item é montado com DOM + textContent: nome de subpasta/arquivo e
    // mensagem de erro vêm do disco do usuário.
    const itens = await Promise.all(results.map(async (r) => {
        const item = document.createElement('div');
        item.className = r.success ? 'result-item ok' : 'result-item fail';

        const cabecalho = document.createElement('div');
        cabecalho.className = 'result-item-head';

        if (r.success) {
            const file = r.blob
                ? new File([r.blob], r.name, { type: 'application/pdf' })
                : await (await state.selectedDirHandle.getFileHandle(r.name)).getFile();
            const url = URL.createObjectURL(file);

            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            // A aba nova não deve ter acesso à janela que a abriu.
            link.rel = 'noopener';
            link.className = 'result-name';
            const iconeLink = document.createElement('i');
            iconeLink.className = 'bi bi-file-earmark-pdf';
            link.append(iconeLink, document.createTextNode(` ${r.name}`));

            const status = document.createElement('span');
            status.className = 'result-status ok';
            const iconeStatus = document.createElement('i');
            iconeStatus.className = 'bi bi-check-lg';
            status.append(iconeStatus, document.createTextNode(' OK'));

            cabecalho.append(link, status);
            item.appendChild(cabecalho);

            const meta = document.createElement('p');
            meta.className = 'result-meta';
            meta.textContent = `${r.pages} páginas`;
            item.appendChild(meta);
            return item;
        }

        const nome = document.createElement('span');
        nome.className = 'result-name';
        const iconeNome = document.createElement('i');
        iconeNome.className = 'bi bi-file-earmark-pdf';
        nome.append(iconeNome, document.createTextNode(` ${r.name}`));

        const status = document.createElement('span');
        status.className = 'result-status fail';
        const iconeStatus = document.createElement('i');
        iconeStatus.className = 'bi bi-x-lg';
        status.append(iconeStatus, document.createTextNode(' Falha'));

        cabecalho.append(nome, status);
        item.appendChild(cabecalho);

        const erro = document.createElement('p');
        erro.className = 'result-meta error';
        erro.textContent = r.error;
        item.appendChild(erro);
        return item;
    }));

    elements.resultsList.replaceChildren(...itens);
    elements.results.classList.remove('hidden');

    if (!abrirLinks) return;
    const successfulResults = results.filter(r => r.success);
    for (const r of successfulResults) {
        const file = r.blob
            ? new File([r.blob], r.name, { type: 'application/pdf' })
            : await (await state.selectedDirHandle.getFileHandle(r.name)).getFile();
        const url = URL.createObjectURL(file);
        window.open(url, '_blank');
    }
}

/** Zera o estado que vive só na memória (botão "Limpar estado"). */
function limparEstadoInterno() {
    state.selectedDirHandle = null;
    state.subfolders = [];
    state.manualFiles = [];
    state.isProcessing = false;

    elements.folderBtn.classList.remove('selected');
    preencherBotaoPasta(elements.folderBtn, 'Selecionar Pasta');
    elements.folderInfo.classList.add('hidden');
    elements.folderStatus.hidden = true;
    elements.folderCount.textContent = '0';
    elements.pdfCount.textContent = '0';
    elements.subfoldersList.replaceChildren();
    elements.subfoldersList.classList.add('hidden');
    elements.mergeBtn.disabled = true;

    elements.filesInfo.classList.add('hidden');
    elements.filesStatus.hidden = true;
    elements.filesCount.textContent = '0';
    elements.fileOrder.replaceChildren();
    elements.fileOrder.classList.add('hidden');
    elements.mergeFilesBtn.disabled = true;

    elements.progressContainer.classList.remove('visible');
    elements.progressCurrent.textContent = '-';
    elements.progressPercent.textContent = '0%';
    elements.progressDetail.textContent = '-';
    elements.progressFill.style.width = '';
    elements.results.classList.add('hidden');
    elements.resultsList.replaceChildren();
}

elements.tabFolders.addEventListener('click', () => activateMode('folders'));
elements.tabFiles.addEventListener('click', () => activateMode('files'));
elements.folderBtn.addEventListener('click', selectFolder);
elements.folderInput.addEventListener('change', (event) => {
    selectFolderFromFiles(event.target.files);
    event.target.value = '';
});
elements.mergeBtn.addEventListener('click', mergePdfs);
elements.filesBtn.addEventListener('click', () => elements.filesInput.click());
elements.filesInput.addEventListener('change', (event) => {
    selectFiles(event.target.files);
    event.target.value = '';
});
elements.fileOrder.addEventListener('click', (event) => {
    const botao = event.target.closest('button[data-action]');
    if (!botao) return;
    const indice = Number(botao.dataset.index);
    if (botao.dataset.action === 'up') moverArquivo(indice, -1);
    else if (botao.dataset.action === 'down') moverArquivo(indice, 1);
    else if (botao.dataset.action === 'remove') removerArquivo(indice);
});
elements.mergeFilesBtn.addEventListener('click', mergeSelectedFiles);
