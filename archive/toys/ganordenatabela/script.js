/**
 * Formata uma string numérica para o padrão CNJ (NNNNNNN-DD.YYYY.J.TR.OOOO)
 */
function formatCNJ(s) {
    if (!s) return "";
    s = String(s);
    
    // Remove caracteres não numéricos
    let d = s.replace(/\D/g, '');

    if (d === "") return s;

    // CNJ padrão tem 20 dígitos. Adiciona zeros à esquerda se necessário.
    if (d.length < 20) {
        d = d.padStart(20, '0');
    } else if (d.length > 20) {
        // Se tiver mais de 20, pegamos os últimos 20 dígitos
        d = d.slice(-20);
    }

    // Formata: NNNNNNN-DD.YYYY.J.TR.OOOO
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

function getFileExtension(fileName) {
    const parts = String(fileName || '').toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : '';
}

function getExcelSupportMessage(fileName) {
    const extension = getFileExtension(fileName);

    if (extension === 'xls') {
        return 'Arquivos .xls nao sao suportados. Salve a planilha como .xlsx ou .xlsm e tente novamente.';
    }

    if (extension && !['xlsx', 'xlsm'].includes(extension)) {
        return 'Formato de arquivo nao suportado. Use um arquivo .xlsx ou .xlsm.';
    }

    return '';
}

function getFirstWorksheetPath(workbookXml, relsXml) {
    const stripBOM = (str) => str.charCodeAt(0) === 65279 ? str.slice(1) : str;
    workbookXml = stripBOM(workbookXml);
    relsXml = stripBOM(relsXml);

    const getElementsByTagNameNS = (doc, localName) => {
        return Array.from(doc.getElementsByTagName('*')).filter(
            (node) => node.localName === localName || node.nodeName.endsWith(':' + localName)
        );
    };

    const parser = new DOMParser();
    const workbookDoc = parser.parseFromString(workbookXml, 'application/xml');
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');

    const firstSheet = getElementsByTagNameNS(workbookDoc, 'sheet')[0];

    if (!firstSheet) {
        throw new Error('Nenhuma aba foi encontrada no workbook.');
    }

    let relationId = firstSheet.getAttribute('r:id') || firstSheet.getAttribute('id');

    if (!relationId) {
        for (const attr of Array.from(firstSheet.attributes)) {
            if (attr.name.includes('r:id') || attr.value) {
                relationId = attr.value;
                break;
            }
        }
    }

    if (!relationId) {
        throw new Error('ID de relacao nao encontrado.');
    }

    const relationships = getElementsByTagNameNS(relsDoc, 'Relationship');
    const relationship = relationships.find((node) => node.getAttribute('Id') === relationId);

    if (!relationship) {
        const firstRel = relationships[0];
        if (firstRel) {
            return firstRel.getAttribute('Target').startsWith('xl/') 
                ? firstRel.getAttribute('Target') 
                : `xl/${firstRel.getAttribute('Target').replace(/^\/+/, '')}`;
        }
        throw new Error('Nao foi possivel localizar o arquivo da primeira aba.');
    }

    const target = relationship.getAttribute('Target');
    if (!target) {
        throw new Error('A relacao da primeira aba nao possui destino.');
    }

    return target.startsWith('xl/') ? target : `xl/${target.replace(/^\/+/, '')}`;
}

function getSharedStrings(sharedStringsXml) {
    const parser = new DOMParser();
    const sharedStringsDoc = parser.parseFromString(sharedStringsXml, 'application/xml');
    const items = Array.from(sharedStringsDoc.getElementsByTagName('*')).filter((node) => node.localName === 'si');

    return items.map((item) => {
        const textNodes = Array.from(item.getElementsByTagName('*')).filter((node) => node.localName === 't');
        return textNodes.map((node) => node.textContent || '').join('');
    });
}

function parseXmlFragment(fragment) {
    const parser = new DOMParser();
    return parser.parseFromString(`<root xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fragment}</root>`, 'application/xml');
}

function getRowNumber(rowXml) {
    const match = rowXml.match(/\br="(\d+)"/);
    return match ? Number(match[1]) : 0;
}

function getCellValueFromRowXml(rowXml, columnLetter, rowNumber, sharedStrings) {
    const fragmentDoc = parseXmlFragment(rowXml);
    const cells = Array.from(fragmentDoc.getElementsByTagName('*')).filter((node) => node.localName === 'c');
    const cell = cells.find((node) => node.getAttribute('r') === `${columnLetter}${rowNumber}`);

    if (!cell) {
        return '';
    }

    const cellType = cell.getAttribute('t') || '';

    if (cellType === 'inlineStr') {
        const textNodes = Array.from(cell.getElementsByTagName('*')).filter((node) => node.localName === 't');
        return textNodes.map((node) => node.textContent || '').join('');
    }

    const valueNode = Array.from(cell.childNodes).find((node) => node.nodeType === Node.ELEMENT_NODE && node.localName === 'v');
    if (!valueNode) {
        return '';
    }

    const rawValue = valueNode.textContent || '';
    if (cellType === 's') {
        const index = Number(rawValue);
        return Number.isInteger(index) ? (sharedStrings[index] || '') : '';
    }

    return rawValue;
}

function escapeXmlText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeXmlAttribute(value) {
    return escapeXmlText(value).replace(/"/g, '&quot;');
}

function formatCellAsInlineString(rowXml, columnLetter, targetRowNumber, textValue) {
    const cellRegex = new RegExp(`(<c[^>]* r="${columnLetter}${targetRowNumber}"[^>]*>)[\\s\\S]*?<\\/c>`, 'i');
    const match = rowXml.match(cellRegex);

    if (!match) {
        return rowXml;
    }

    const cellOpen = match[1];
    const preservedAttributes = cellOpen
        .replace(/^<c\b/, '')
        .replace(/(\s+[a-z]+="[^"]*")/g, (_, attr) => {
            if (attr.startsWith(' r=') || attr.startsWith(' t=')) return '';
            return attr;
        })
        .replace(/\s*r="[^"]*"/, '')
        .replace(/\s*t="[^"]*"/, '')
        .trim();
    
    const formattedCellXml = `<c r="${columnLetter}${targetRowNumber}"${preservedAttributes ? ' ' + preservedAttributes : ''} t="inlineStr"><is><t>${escapeXmlText(textValue)}</t></is></c>`;

    return rowXml.replace(match[0], formattedCellXml);
}

function rewriteRowForTarget(rowXml, targetRowNumber) {
    const updatedRow = rowXml.replace(
        /(<(?:\w+:)?row\b[^>]*\br=")\d+("[^>]*>)/i,
        `$1${targetRowNumber}$2`
    );

    return updatedRow.replace(
        /(<(?:\w+:)?c\b[^>]*\br=")([A-Z]+)\d+("[^>]*>)/g,
        (_, prefix, column, suffix) => `${prefix}${column}${targetRowNumber}${suffix}`
    );
}

async function buildSortedWorkbookBlob(file, prioritiesRaw) {
    if (!window.JSZip) {
        throw new Error('A biblioteca JSZip local nao foi carregada. Verifique se o arquivo jszip.min.js esta ao lado do index.html.');
    }

    const priorityMap = new Map();
    prioritiesRaw.forEach((priority, index) => {
        const formatted = formatCNJ(priority);
        if (!priorityMap.has(formatted)) {
            priorityMap.set(formatted, index + 1);
        }
    });

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const workbookXmlFile = zip.file('xl/workbook.xml');
    const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels');

    if (!workbookXmlFile || !workbookRelsFile) {
        throw new Error('Estrutura do arquivo XLSX invalida.');
    }

    const worksheetPath = getFirstWorksheetPath(
        await workbookXmlFile.async('string'),
        await workbookRelsFile.async('string')
    );
    const worksheetFile = zip.file(worksheetPath);

    if (!worksheetFile) {
        throw new Error('Nao foi possivel localizar a primeira aba do arquivo.');
    }

    const sharedStrings = zip.file('xl/sharedStrings.xml')
        ? getSharedStrings(await zip.file('xl/sharedStrings.xml').async('string'))
        : [];
    const worksheetXml = await worksheetFile.async('string');
    const sheetDataMatch = worksheetXml.match(/(<(?:\w+:)?sheetData[^>]*>)([\s\S]*?)(<\/(?:\w+:)?sheetData>)/i);

    if (!sheetDataMatch) {
        throw new Error('Nao foi possivel localizar os dados da planilha.');
    }

    const rowMatches = [...sheetDataMatch[2].matchAll(/(<(?:\w+:)?row\b[\s\S]*?<\/(?:\w+:)?row>)/gi)];
    const rows = rowMatches.map((match) => match[1]);

    if (rows.length < 2) {
        throw new Error('Planilha invalida ou sem dados suficientes.');
    }

    const headerRows = rows.filter((rowXml) => getRowNumber(rowXml) <= 1);
    const dataRows = rows.filter((rowXml) => getRowNumber(rowXml) > 1);
    const targetRowNumbers = dataRows.map((rowXml) => getRowNumber(rowXml));

    const records = dataRows.map((rowXml, index) => {
        const rowNumber = getRowNumber(rowXml);
        const cellHValue = getCellValueFromRowXml(rowXml, 'H', rowNumber, sharedStrings);
        const sortValue = formatCNJ(cellHValue);
        const rank = priorityMap.get(sortValue) !== undefined ? priorityMap.get(sortValue) : 999999;
        
        return {
            position: index,
            rank: rank,
            rowXml: rowXml,
            sortValue: sortValue
        };
    });

    records.sort((a, b) => {
        if (a.rank !== b.rank) {
            return a.rank - b.rank;
        }
        return a.position - b.position;
    });

    const rebuiltRows = headerRows.slice();
    
    targetRowNumbers.forEach((targetRowNumber, index) => {
        const record = records[index];
        const rewrittenRow = rewriteRowForTarget(record.rowXml, targetRowNumber);
        const rawValue = getCellValueFromRowXml(record.rowXml, 'H', getRowNumber(record.rowXml), sharedStrings);
        const formattedSortValue = formatCNJ(rawValue);
        
        const updatedRow = formatCellAsInlineString(rewrittenRow, 'H', targetRowNumber, formattedSortValue);
        rebuiltRows.push(updatedRow);
    });

    const newSheetData = `${sheetDataMatch[1]}${rebuiltRows.join('')}${sheetDataMatch[3]}`;
    const newWorksheetXml = `${worksheetXml.slice(0, sheetDataMatch.index)}${newSheetData}${worksheetXml.slice(sheetDataMatch.index + sheetDataMatch[0].length)}`;

    zip.file(worksheetPath, newWorksheetXml);
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
}

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (sunIcon && moonIcon) {
        updateThemeIcons(savedTheme);
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcons(newTheme);
        });
    }

    function updateThemeIcons(theme) {
        if (!sunIcon || !moonIcon) return;
        if (theme === 'dark') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    }

    const fileInput = document.getElementById('fileInput');
    const fileName = document.getElementById('fileName');
    const prioritiesText = document.getElementById('priorities');
    const sortBtn = document.getElementById('sortBtn');
    const btnText = document.getElementById('btnText');
    const loader = document.getElementById('loader');
    const statusBox = document.getElementById('statusBox');

    let selectedFile = null;

    async function selectFile() {
        fileInput.click();
    }

    // Listener para o botão de escolher arquivo personalizado
    document.querySelector('.btn-gold').onclick = (e) => {
        e.preventDefault();
        selectFile();
    };

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            fileName.textContent = selectedFile.name;
            updateStatus('Arquivo selecionado: ' + selectedFile.name);
        }
    });

sortBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            updateStatus('Selecione um arquivo primeiro!', 'error');
            return;
        }

        const supportMessage = getExcelSupportMessage(selectedFile.name);
        if (supportMessage) {
            updateStatus(supportMessage, 'error');
            return;
        }

        const prioritiesRaw = prioritiesText.value.split('\n').map(p => p.trim()).filter(p => p !== "");
        if (prioritiesRaw.length === 0) {
            updateStatus('Insira a lista de prioridades!', 'error');
            return;
        }

        startLoading();

        try {
            const outBlob = await buildSortedWorkbookBlob(selectedFile, prioritiesRaw);

            const url = URL.createObjectURL(outBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = selectedFile.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            updateStatus('Tabela ordenada com sucesso!', 'success');
        } catch (err) {
            console.error(err);
            updateStatus('Erro ao processar: ' + err.message, 'error');
            stopLoading();
        }
    });

    function updateStatus(msg, type = '') {
        statusBox.textContent = msg;
        statusBox.className = 'status-box ' + type;
    }

    function startLoading() {
        sortBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'block';
        updateStatus('Processando...', '');
    }

    function stopLoading() {
        sortBtn.disabled = false;
        btnText.style.display = 'block';
        loader.style.display = 'none';
    }
});
