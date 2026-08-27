// Configurar PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = '../../vendor/pdfjs/pdf.worker.min.js';

let pdfDoc = null;
let pageNum = 1;
let pageCount = 0;
let scale = 1.5;
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');

let filesQueue = [];
let currentFileIndex = 0;

function renderPage(num) {
    pageRendering = true;
    pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({scale: scale});
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const renderContext = { canvasContext: ctx, viewport: viewport };
        page.render(renderContext).promise().then(() => {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
        document.getElementById('pageIndicator').textContent = `Página ${num} de ${pageCount}`;
        document.getElementById('pageNumber').value = num;
    });
    pageRendering = false;
}

function irParaPagina(num) {
    if (num < 1) num = 1;
    if (num > pageCount) num = pageCount;
    if (pageRendering) {
        pageNumPending = num;
        return;
    }
    pageNum = num;
    renderPage(pageNum);
}

function alternarModoDivisao() {
    const modo = document.querySelector('input[name="modoDivisao"]:checked').value;
    document.getElementById('modoDivisaoAuto').style.display = modo === 'auto' ? 'block' : 'none';
    document.getElementById('modoDivisaoPersonalizado').style.display = modo === 'custom' ? 'block' : 'none';
    if (modo === 'auto') {
        document.getElementById('btnProcessar').style.display = 'inline-block';
        document.getElementById('btnProcessarCustom').style.display = 'none';
    } else {
        document.getElementById('btnProcessar').style.display = 'none';
        document.getElementById('btnProcessarCustom').style.display = 'inline-block';
    }
}

async function processarDivisao() {
    alert('Funcionalidade em desenvolvimento');
}

function limparTudo() {
    filesQueue = [];
    currentFileIndex = 0;
    pdfDoc = null;
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('viewerSection').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const pdfInput = document.getElementById('pdfInput');
    pdfInput.addEventListener('change', handleFilesSelect);
    document.getElementById('btnPrevPage').addEventListener('click', () => irParaPagina(pageNum - 1));
    document.getElementById('btnNextPage').addEventListener('click', () => irParaPagina(pageNum + 1));
    document.getElementById('pageNumber').addEventListener('change', function() {
        irParaPagina(parseInt(this.value));
    });
});

function handleFilesSelect(event) {
    const files = Array.from(event.target.files);
    filesQueue = files.filter(f => f.type === 'application/pdf');
    if (filesQueue.length > 0) {
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('viewerSection').style.display = 'block';
        currentFileIndex = 0;
        carregarArquivoAtual();
    }
}

async function carregarArquivoAtual() {
    if (currentFileIndex >= filesQueue.length) return;
    const file = filesQueue[currentFileIndex];
    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    pageCount = pdfDoc.numPages;
    document.getElementById('pageCount').textContent = `de ${pageCount}`;
    document.getElementById('currentFileName').textContent = file.name;
    document.getElementById('currentFileNumber').textContent = `${currentFileIndex + 1}/${filesQueue.length}`;
    renderPage(1);
}
