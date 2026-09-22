const CONFIG = {
    type: 'normalize-iris'
};

initTool(CONFIG);

function initTool(config) {
    const input = document.getElementById('toolInput');
    const runButton = document.getElementById('runButton');
    const copyButton = document.getElementById('copyButton');
    const clearButton = document.getElementById('clearButton');
    const settings = document.getElementById('settings');
    let copiedText = '';

    renderSettings(config, settings);
    runButton.addEventListener('click', () => {
        const result = runTool(config.type, input.value, getSettings(settings));
        renderResult(result);
    });
    clearButton.addEventListener('click', () => {
        input.value = '';
        settings.querySelectorAll('input, select').forEach((field) => {
            if (field.type === 'checkbox') field.checked = false;
            else field.value = field.defaultValue;
        });
        document.getElementById('resultsSection').classList.add('hidden');
        document.getElementById('results').innerHTML = '';
        document.getElementById('errorMessage').classList.add('hidden');
        copiedText = '';
        input.focus();
    });

    copyButton.addEventListener('click', async () => {
        if (!copiedText) return;
        try {
            await navigator.clipboard.writeText(copiedText);
            copyButton.textContent = 'Copiado';
        } catch (error) {
            const fallback = document.createElement('textarea');
            fallback.value = copiedText;
            fallback.style.position = 'fixed';
            fallback.style.opacity = '0';
            document.body.appendChild(fallback);
            fallback.select();
            document.execCommand('copy');
            fallback.remove();
            copyButton.textContent = 'Copiado';
        }
        window.setTimeout(() => { copyButton.textContent = 'Copiar resultado'; }, 1600);
    });

    function renderResult(result) {
        const section = document.getElementById('resultsSection');
        const results = document.getElementById('results');
        const summary = document.getElementById('resultSummary');
        const error = document.getElementById('errorMessage');
        section.classList.remove('hidden');
        error.classList.add('hidden');
        results.innerHTML = '';
        copiedText = '';

        if (result.error) {
            error.textContent = result.error;
            error.classList.remove('hidden');
            summary.textContent = '';
            return;
        }

        summary.textContent = `${result.rows.length} ${result.rows.length === 1 ? 'linha processada' : 'linhas processadas'}.`;
        copiedText = result.rows
            .map((row) => row.map((value) => String(value ?? '')).join('\t'))
            .join('\n');
        results.appendChild(createTable(result.headers, result.rows));
    }
}

function renderSettings(config, container) {
    const options = {
        'normalize-iris': []
    }[config.type] || [];

    if (!options.length) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = '';
    options.forEach((option) => {
        const label = document.createElement('label');
        if (option.type === 'checkbox') {
            label.className = 'check';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = option.name;
            checkbox.checked = Boolean(option.default);
            label.append(checkbox, document.createTextNode(option.label));
        } else {
            label.textContent = option.label;
            const input = document.createElement('input');
            input.type = option.type || 'text';
            input.name = option.name;
            input.value = option.default ?? '';
            label.appendChild(input);
        }
        container.appendChild(label);
    });
}

function getSettings(container) {
    const settings = {};
    container.querySelectorAll('input, select').forEach((field) => {
        settings[field.name] = field.type === 'checkbox' ? field.checked : field.value;
    });
    return settings;
}

function createTable(headers, rows) {
    const table = document.createElement('table');
    table.className = 'results-table';
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach((header) => {
        const cell = document.createElement('th');
        cell.textContent = header;
        headerRow.appendChild(cell);
    });
    head.appendChild(headerRow);
    const body = document.createElement('tbody');
    rows.forEach((row) => {
        const tableRow = document.createElement('tr');
        row.forEach((value) => {
            const cell = document.createElement('td');
            cell.textContent = value ?? '';
            tableRow.appendChild(cell);
        });
        body.appendChild(tableRow);
    });
    table.append(head, body);
    return table;
}

function inputLines(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeIris(text) {
    function clean(value) {
        let trimmed = String(value || '').trim();
        // Remove prefixo IRIS (case-insensitive) se existir
        trimmed = trimmed.replace(/^iris\s*[-_:/]?\s*/i, '');
        // Se após remover o prefixo (ou se for apenas números) tiver zeros à esquerda antes de dígitos
        trimmed = trimmed.replace(/^0+(?=\d)/, '');
        return trimmed;
    }
    return {
        headers: ['Normalizado'],
        rows: inputLines(text).map((value) => [clean(value)])
    };
}

function runTool(type, text, settings) {
    if (type === 'normalize-iris') return normalizeIris(text);
    return { error: 'Ferramenta não configurada.' };
}
