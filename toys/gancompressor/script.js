pdfjsLib.GlobalWorkerOptions.workerSrc = '../../vendor/pdfjs/pdf.worker.min.js';

let selectedFile = null;
let compressedBlob = null;

document.addEventListener('DOMContentLoaded', () => {
    const pdfInput = document.getElementById('pdfInput');
    pdfInput.addEventListener('change', handleFileSelect);
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        selectedFile = file;
        document.getElementById('fileInfo').textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        document.getElementById('settingsCard').style.display = 'block';
        document.getElementById('originalSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    }
}

async function compressPDF() {
    if (!selectedFile) return;
    
    const originalSize = selectedFile.size;
    const quality = document.getElementById('quality').value;
    
    const arrayBuffer = await selectedFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    
    const { jsPDF } = window.jspdf;
    const newPdf = new jsPDF();
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        
        if (i > 1) newPdf.addPage();
        const imgData = canvas.toDataURL('image/jpeg', quality === 'high' ? 0.92 : quality === 'medium' ? 0.75 : 0.5);
        newPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width / scale * 0.28, viewport.height / scale * 0.28);
    }
    
    const pdfBlob = newPdf.output('blob');
    compressedBlob = pdfBlob;
    
    const compressedSize = pdfBlob.size;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    
    document.getElementById('compressedSize').textContent = `${(compressedSize / 1024 / 1024).toFixed(2)} MB`;
    document.getElementById('reductionPercent').textContent = `${reduction}%`;
    document.getElementById('resultCard').style.display = 'block';
}

function downloadCompressed() {
    if (compressedBlob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(compressedBlob);
        link.download = 'comprimido.pdf';
        link.click();
    }
}
