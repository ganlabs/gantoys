const processInput = document.getElementById('processInput');
const processBtn = document.getElementById('processBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsList = document.getElementById('resultsList');
const resultSummary = document.getElementById('resultSummary');
const copyBtn = document.getElementById('copyBtn');
const emptyState = document.getElementById('emptyState');

let lastOutputLines = [];

function getSelectedMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : 'pontuar';
}

function onlyDigits(value) {
    return value.replace(/\D/g, '');
}

function formatCnj(digits) {
    return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

function convertLine(line, mode) {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const digits = onlyDigits(trimmed);

    if (digits.length !== 20) {
        return {
            status: 'error',
            original: trimmed,
            value: trimmed,
            message: 'Linha inválida: o CNJ precisa ter 20 dígitos.'
        };
    }

    return {
        status: 'success',
        original: trimmed,
        value: mode === 'pontuar' ? formatCnj(digits) : digits,
        message: mode === 'pontuar' ? 'Convertido para formato pontuado.' : 'Convertido para formato despontuado.'
    };
}

function renderResults(items) {
    resultsList.innerHTML = '';
    resultsSection.classList.remove('hidden');

    if (items.length === 0) {
        emptyState.classList.remove('hidden');
        copyBtn.disabled = true;
        resultSummary.textContent = 'Nenhuma linha para processar.';
        lastOutputLines = [];
        return;
    }

    emptyState.classList.add('hidden');

    let successCount = 0;
    lastOutputLines = items.map((item) => item.value);

    items.forEach((item) => {
        const isOk = item.status === 'success';
        if (isOk) successCount += 1;

        const card = document.createElement('div');
        card.className = isOk ? 'result-item ok' : 'result-item fail';

        const head = document.createElement('div');
        head.className = 'result-item-head';

        const value = document.createElement('span');
        value.className = 'result-value';
        value.textContent = item.value;

        const status = document.createElement('span');
        status.className = isOk ? 'result-status ok' : 'result-status fail';
        status.textContent = isOk ? 'OK' : 'Inválido';

        head.append(value, status);
        card.append(head);

        // Convertidas: origem + o que foi feito. Recusadas: o motivo, em tom de falha.
        const details = isOk ? [`Original: ${item.original}`, item.message] : [item.message];

        details.forEach((text) => {
            const meta = document.createElement('p');
            meta.className = isOk ? 'result-meta' : 'result-meta error';
            meta.textContent = text;
            card.append(meta);
        });

        resultsList.appendChild(card);
    });

    resultSummary.textContent = `${successCount} de ${items.length} linhas convertidas.`;
    copyBtn.disabled = lastOutputLines.length === 0;
}

function processLines() {
    const mode = getSelectedMode();
    const lines = processInput.value.split(/\r?\n/);
    const items = lines.map((line) => convertLine(line, mode)).filter(Boolean);
    renderResults(items);
}

async function copyResults() {
    if (lastOutputLines.length === 0) return;

    const text = lastOutputLines.join('\n');
    try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copiado';
        window.setTimeout(() => {
            copyBtn.textContent = 'Copiar para a Memória';
        }, 1600);
    } catch (error) {
        copyBtn.textContent = 'Falha ao copiar';
        window.setTimeout(() => {
            copyBtn.textContent = 'Copiar para a Memória';
        }, 1600);
    }
}

processBtn.addEventListener('click', processLines);
copyBtn.addEventListener('click', copyResults);
