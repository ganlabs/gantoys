const { PDFDocument } = PDFLib;

const state = {
    selectedDirHandle: null,
    subfolders: [],
    isProcessing: false
};

const elements = {
    folderBtn: document.getElementById('folderBtn'),
    folderInput: document.getElementById('folderInput'),
    folderInfo: document.getElementById('folderInfo'),
    folderPath: document.getElementById('folderPath'),
    folderCount: document.getElementById('folderCount'),
    pdfCount: document.getElementById('pdfCount'),
    subfoldersList: document.getElementById('subfoldersList'),
    mergeBtn: document.getElementById('mergeBtn'),
    progressContainer: document.getElementById('progressContainer'),
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    progressCurrent: document.getElementById('progressCurrent'),
    progressDetail: document.getElementById('progressDetail'),
    results: document.getElementById('results'),
    resultsList: document.getElementById('resultsList')
};

async function selectFolder() {
    if (!('showDirectoryPicker' in window)) {
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
        elements.folderBtn.innerHTML = `<span class="folder-icon">📂</span><span>${handle.name}</span>`;
        elements.folderInfo.classList.add('visible');
        elements.folderPath.textContent = handle.name;

        renderSubfolders();
        elements.mergeBtn.disabled = state.subfolders.length === 0;

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Erro ao selecionar pasta:', err);
            alert('Erro ao selecionar pasta. Tente novamente.');
        }
    }
}

async function selectFolderFromFiles(fileList) {
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
    elements.folderBtn.innerHTML = `<span class="folder-icon">📂</span><span>${rootName}</span>`;
    elements.folderInfo.classList.add('visible');
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
        elements.subfoldersList.innerHTML = '';
        elements.subfoldersList.classList.remove('visible');
        return;
    }

    const html = state.subfolders.map(sf => `
        <div class="subfolder-item">
          <span class="subfolder-name">📁 ${sf.name}</span>
          <span class="subfolder-count">${sf.files.length}</span>
        </div>
      `).join('');

    elements.subfoldersList.innerHTML = `
        <div class="section-title" style="margin-top: 1.5rem;">Subpastas</div>
        ${html}
      `;
    elements.subfoldersList.classList.add('visible');
}

async function mergePdfs() {
    if (state.subfolders.length === 0 || state.isProcessing) return;

    state.isProcessing = true;
    elements.mergeBtn.disabled = true;
    elements.progressContainer.classList.add('visible');
    elements.results.classList.remove('visible');

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

async function renderResults(results) {
    const html = await Promise.all(results.map(async r => {
        if (r.success) {
            const file = r.blob
                ? new File([r.blob], r.name, { type: 'application/pdf' })
                : await (await state.selectedDirHandle.getFileHandle(r.name)).getFile();
            const url = URL.createObjectURL(file);
            return `
            <div class="result-item ${r.success ? 'success' : 'error'}">
              <div>
                <a href="${url}" target="_blank" class="result-name">📄 ${r.name}</a>
                <div class="result-count">${r.pages} páginas</div>
              </div>
              <span class="result-status ${r.success ? 'success' : 'error'}">
                ${r.success ? '✓' : '✗'}
              </span>
            </div>
          `;
        } else {
            return `
            <div class="result-item ${r.success ? 'success' : 'error'}">
              <div>
                <div class="result-name">📄 ${r.name}</div>
                <div class="result-count">${r.error}</div>
              </div>
              <span class="result-status ${r.success ? 'success' : 'error'}">
                ${r.success ? '✓' : '✗'}
              </span>
            </div>
          `;
        }
    }));

    elements.resultsList.innerHTML = html.join('');
    elements.results.classList.add('visible');

    const successfulResults = results.filter(r => r.success);
    for (const r of successfulResults) {
        const file = r.blob
            ? new File([r.blob], r.name, { type: 'application/pdf' })
            : await (await state.selectedDirHandle.getFileHandle(r.name)).getFile();
        const url = URL.createObjectURL(file);
        window.open(url, '_blank');
    }
}

elements.folderBtn.addEventListener('click', selectFolder);
elements.folderInput.addEventListener('change', (event) => {
    selectFolderFromFiles(event.target.files);
    event.target.value = '';
});
elements.mergeBtn.addEventListener('click', mergePdfs);
