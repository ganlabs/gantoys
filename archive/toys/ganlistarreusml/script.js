const CONFIG = {
    type: 'list-reus-ml'
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
        copiedText = [result.headers, ...result.rows]
            .map((row) => row.map((value) => String(value ?? '')).join('\t'))
            .join('\n');
        results.appendChild(createTable(result.headers, result.rows));
    }
}

function renderSettings(config, container) {
    const options = {
        'extract-polos': [{ key: 'polo', label: 'Polo a filtrar', value: 'ATIVO' }],
        'extract-columns': [{ key: 'cols', label: 'Colunas (separadas por vírgula)', value: '' }],
        'resolve-carteira-reu': [{ key: 'duo', label: 'Modo duo (duas colunas separadas por tabulação)', type: 'checkbox' }],
        'strip-suffix': [{ key: 'suffix', label: 'Sufixo a remover', value: '-PI' }]
    }[config.type] || [];

    if (!options.length) return;
    container.classList.remove('hidden');
    options.forEach((option) => {
        const label = document.createElement('label');
        if (option.type === 'checkbox') {
            label.className = 'check';
            label.innerHTML = `<input type="checkbox" name="${option.key}"> ${option.label}`;
        } else {
            label.textContent = option.label;
            const field = document.createElement('input');
            field.type = 'text';
            field.name = option.key;
            field.value = option.value;
            label.appendChild(field);
        }
        container.appendChild(label);
    });
}

function getSettings(container) {
    return Object.fromEntries([...container.querySelectorAll('[name]')].map((field) => [
        field.name,
        field.type === 'checkbox' ? field.checked : field.value
    ]));
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

function runTool(type, text, settings) {
    if (type === 'classify-court') return classifyCourt(text);
    if (type === 'convert-rito') return convertRito(text);
    if (type === 'extract-money') return extractMoney(text);
    if (type === 'extract-polos') return extractPolos(text, settings.polo);
    if (type === 'extract-columns') return extractColumns(text, settings.cols);
    if (type === 'extract-columns-santander') return extractColumnsSantander(text);
    if (type === 'list-reus-ml') return listReusMl();
    if (type === 'lookup-oab') return lookupOab(text);
    if (type === 'normalize-documents') return normalizeDocuments(text);
    if (type === 'normalize-names') return normalizeNames(text);
    if (type === 'resolve-carteira-reu') return resolveCarteiraReu(text, settings.duo);
    if (type === 'strip-suffix') return stripSuffix(text, settings.suffix);
    return { error: 'Ferramenta não configurada.' };
}

function normalizeAscii(text, allowed = ' _-') {
    return String(text || '').normalize('NFKD').replace(new RegExp(`[^A-Za-z0-9${allowed}]`, 'g'), '').toUpperCase().trim();
}

function classifyCourt(text) {
    const writtenNumbers = { PRIMEIRA: '1', PRIMEIRO: '1', SEGUNDA: '2', SEGUNDO: '2', TERCEIRA: '3', TERCEIRO: '3', QUARTA: '4', QUINTA: '5', SEXTA: '6', SETIMA: '7', SETIMO: '7', OITAVA: '8', NONA: '9', NONO: '9', DECIMA: '10', DECIMO: '10' };
    const romans = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    function extractNumber(value) {
        const match = value.match(/(\d+)[ªº°]?/);
        if (match) return match[1];
        for (const word of value.split(/\s+/)) {
            const normalized = word.replace(/[ .-]/g, '');
            if (writtenNumbers[normalized]) return writtenNumbers[normalized];
            if (romans[normalized]) return String(romans[normalized]);
        }
        return '';
    }
    function extractComarca(value) {
        let comarca = value.toUpperCase().trim().replace(/\/[A-Z]{2}$/, '').replace(/\.+$/, '');
        if (comarca.includes('DA COMARCA DE ')) comarca = comarca.split('DA COMARCA DE ', 2)[1];
        if (comarca.includes(' - ')) comarca = comarca.split(' - ', 2)[1];
        comarca = normalizeAscii(comarca);
        const patterns = [
            /(?:VARA\s+(?:DO\s+)?(?:JEC\s+)?(?:CIVEL|JUDICIAL)?|JUIZADO\s+ESP(?:ECIAL)?\s+CIVEL(?:\s+E)?\s+CRIM(?:INAL)?|JUIZADO\s+ESP(?:ECIAL)?\s+CIVEL|JUIZ?\s+ESP\s+CIV(?:\s+CRIM)?|JUIZADO)\s*/gi,
            /\d+[ªº°]?\s*|PRIMEIRA\s+|PRIMEIRO\s+|SEGUNDA\s+|TERCEIRA\s+|TERCEIRO\s+|QUARTA\s+|QUINTA\s+|SEXTA\s+|SETIMA\s+|SETIMO\s+|OITAVA\s+|NONA\s+|NONO\s+|DECIMA\s+|DECIMO\s+/gi,
            /\b[IVXL]+\b\s*/gi
        ];
        patterns.forEach((pattern) => { comarca = comarca.replace(pattern, '').trim(); });
        return comarca.replace(/^DE\s+/, '').replace(/\s+/g, ' ').trim();
    }
    const rows = inputLines(text).map((court) => {
        const upper = court.toUpperCase().trim();
        const isJec = /\bJEC\b/.test(upper) || /JUIZADO/.test(upper) || /\bJUI[\s.]/.test(upper);
        const number = extractNumber(upper) || (isJec ? '0' : '1');
        return [isJec ? 'Juizados' : 'Comum', number, isJec ? 'JEC' : 'VC', extractComarca(court)];
    });
    return { headers: ['Tipo', 'Nº', 'Classe', 'Comarca'], rows };
}

function convertRito(text) {
    return { headers: ['Convertido'], rows: inputLines(text).map((value) => {
        const normalized = value.toUpperCase();
        return [normalized === 'VC' ? 'Comum' : normalized === 'JEC' ? 'Juizados' : value];
    }) };
}

function extractMoney(text) {
    function extract(value) {
        let number = value.split('|')[0].replace(/[^\d,.-]/g, '');
        if (!number) return '';
        if (number.includes(',') && number.includes('.')) {
            if (number.lastIndexOf(',') > number.lastIndexOf('.')) number = number.replace(/\./g, '').replace(',', '.');
            else number = number.replace(/,/g, '');
            number = number.replace(/\./g, ',');
        } else if (number.includes('.')) number = number.replace(/\./g, ',');
        return number.endsWith(',00') ? number.slice(0, -3) : number;
    }
    return { headers: ['Extraído'], rows: inputLines(text).map((value) => [extract(value)]) };
}

function parseTable(text) {
    const lines = text.trimEnd().split(/\r?\n/);
    if (!lines[0]) return { headers: [], rows: [] };
    const separator = lines[0].includes('\t') ? '\t' : / {2,}/;
    const split = (line) => line.split(separator).map((value) => value.trim());
    const headers = split(lines[0]);
    const rows = lines.slice(1).filter((line) => line.trim()).map((line) => {
        const values = split(line);
        while (values.length < headers.length) values.push('');
        return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    });
    return { headers, rows };
}

function formatDocument(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length === 14) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    return digits;
}

function extractPolos(text, polo = 'ATIVO') {
    const parsed = parseTable(text);
    const required = ['Processo', 'Polo', 'Nome', 'Número do Documento'];
    const missing = required.filter((header) => !parsed.headers.includes(header));
    if (missing.length) return { error: `Coluna obrigatória não encontrada: ${missing.join(', ')}.` };
    const lawyerColumns = [];
    const headers = ['Processo', 'Nome', 'Documento'];
    for (let index = 1; index <= 9; index += 1) {
        const name = `Nome Advogado ${index}`;
        if (!parsed.headers.includes(name)) break;
        lawyerColumns.push(name, `OAB Advogado ${index}`, `CPF Advogado ${index}`);
        headers.push(`Nome_Adv_${index}`, `OAB_Adv_${index}`, `CPF_Adv_${index}`);
    }
    const rows = parsed.rows.filter((row) => String(row.Polo || '').toUpperCase() === String(polo || 'ATIVO').toUpperCase()).map((row) => {
        const output = [row.Processo || '', normalizeAscii(row.Nome), formatDocument(row['Número do Documento'])];
        for (let index = 0; index < lawyerColumns.length; index += 3) {
            output.push(normalizeAscii(row[lawyerColumns[index]]), row[lawyerColumns[index + 1]] || '', formatDocument(row[lawyerColumns[index + 2]]));
        }
        return output;
    });
    return { headers, rows };
}

function extractColumns(text, rawColumns) {
    const parsed = parseTable(text);
    const selected = rawColumns && rawColumns.trim() ? rawColumns.split(',').map((value) => value.trim()).filter(Boolean) : parsed.headers;
    const missing = selected.filter((header) => !parsed.headers.includes(header));
    if (missing.length) return { error: `Coluna não encontrada: ${missing.join(', ')}. Disponíveis: ${parsed.headers.join(', ')}.` };
    return { headers: selected, rows: parsed.rows.map((row) => selected.map((header) => row[header] || '')) };
}

function extractColumnsSantander(text) {
    const volatile = new Set(['Assunto GNA', 'Migrado', 'CNPJ', 'Workflow', 'Natureza']);
    const wanted = ['Pasta Iris', 'Contratação', 'Núm. Processo', 'Pasta Cliente', 'Carteira', 'Num', 'Órgão', 'Comarca', 'Parte Autora', 'CPFAUTOR', 'Distribuição', 'Valor da Causa', 'Tipo Sistema', 'Parte Ré', 'Causa Raiz', 'Advogado Adverso', 'OAB Advogado Adverso', 'UF OAB Advogado Adverso', 'Data Audiencia', 'Hora Audicencia', 'Tipo Audiencia'];
    const lines = text.trimEnd().split(/\r?\n/);
    const headers = (lines[0] || '').split('\t');
    const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
    const missing = wanted.filter((header) => indexes[header] === undefined);
    if (missing.length) return { error: `Coluna não encontrada no cabeçalho: ${missing.join(', ')}.` };
    const rows = lines.slice(1).filter((line) => line.trim()).map((line) => {
        const data = line.split('\t');
        const missingVolatile = [];
        let changed = true;
        while (changed) {
            changed = false;
            for (let headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
                if (!volatile.has(headers[headerIndex]) || missingVolatile.includes(headerIndex)) continue;
                const shift = missingVolatile.filter((index) => index < headerIndex).length;
                const dataIndex = headerIndex - shift;
                if (dataIndex >= data.length || (data[dataIndex] || '').trim().length > 1) {
                    missingVolatile.push(headerIndex);
                    changed = true;
                    break;
                }
            }
        }
        return wanted.map((header) => {
            const headerIndex = indexes[header];
            const shift = missingVolatile.filter((index) => index < headerIndex).length;
            return data[headerIndex - shift]?.trim() || '';
        });
    });
    return { headers: wanted, rows };
}

function listReusMl() {
    return { headers: ['Réu'], rows: ['EBAZAR.COM.BR LTDA.', 'MERCADOLIVRE.COM ATIVIDADES DE INTERNET LTDA.', 'MERCADO CRÉDITO SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO S.A.', 'MERCADO ENVIOS TRANSPORTE LTDA.', 'MERCADO PAGO INSTITUICAO DE PAGAMENTO LTDA', 'KANGU PARTICIPAÇÕES S.A.', 'K21 INTERMEDIACAO LTDA.', 'IBAZAR.COM ATIVIDADES DE INTERNET LTDA.'].map((name) => [name]) };
}

function lookupOab(text) {
    const references = { 244109: 'RJ', 215984: 'RJ', 138434: 'RJ', 97301: 'RS', 15600: 'RO', 60501: 'SC', 62176: 'SC', 8772: 'SE', 15790: 'SE', 527608: 'SP', 182536: 'SP', 148622: 'RJ', 152176: 'RJ', 8146: 'RN', 17793: 'RN', 6070: 'ES', 22033: 'MT', 225990: 'RJ', 12518: 'GO', 18913: 'ES', 44200: 'ES', 100275: 'RJ', 165202: 'RJ', 24595: 'ES', 94978: 'RJ', 206127: 'RJ', 209356: 'RJ', 28446: 'ES' };
    const rows = inputLines(text).map((line) => {
        const [name = '', rawOab = ''] = line.split('\t');
        const oab = rawOab.trim().replace(/\D/g, '');
        const uf = !oab ? 'TJ' : references[oab] || `? OAB ${name.trim()} ${oab}`;
        return [name.trim(), rawOab.trim(), uf];
    });
    return { headers: ['Advogado', 'OAB', 'UF'], rows };
}

function normalizeDocuments(text) {
    return { headers: ['Tipo', 'Normalizado'], rows: inputLines(text).map((line) => {
        const digits = line.split('|')[0].replace(/\D/g, '');
        if (digits.length === 11) return ['CPF', formatDocument(digits)];
        if (digits.length === 14) return ['CNPJ', formatDocument(digits)];
        return ['INVÁLIDO', digits];
    }) };
}

function normalizeNames(text) {
    return { headers: ['Normalizado'], rows: inputLines(text).map((line) => {
        let value = normalizeAscii(line.split(/[;|]/)[0]);
        if (value === 'SEM ADV') value = 'SEM ADVOGADO';
        if (value === 'SEM OAB') value = '0';
        if (value === 'SEM UF') value = 'TJ';
        return [value];
    }) };
}

function resolveCarteiraReu(text, duo) {
    const refs = [
        ['Saneamento - Águas do Rio 4', 'AGUAS DO RIO 4 SPE S.A.'], ['Saneamento - Águas do Rio 1', 'AGUAS DO RIO 1 SPE S.A.'], ['Saneamento - Rio+', 'RIO+ SANEAMENTO BL3 S.A.'], ['Mercado Livre - Mercado Livre - JC', 'REU A DEFINIR'], ['Mercado Livre - Mercado Livre - JEC', 'REU A DEFINIR'], ['Saneamento - Prolagos - Consumidor', 'PROLAGOS S.A. - CONCESSIONÁRIA DE SERVIÇOS PÚBLICOS DE ÁGUA E ESGOTO'], ['Saneamento - Prolagos - Cobranca', 'PROLAGOS S.A. - CONCESSIONÁRIA DE SERVIÇOS PÚBLICOS DE ÁGUA E ESGOTO'], ['Saneamento - FAB', 'F.AB. ZONA OESTE S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – REGIÃO METROPOLITANA DO RECIFE/GOIANA SPE S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL BLUMENAU S.A'], ['Saneamento - BRK', 'BRK AMBIENTAL – CAÇADOR S.A'], ['Saneamento - BRK', 'BRK AMBIENTAL – CACHOEIRO DE ITAPEMIRIM S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – GOIAS S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – LIMEIRA S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – MACAÉ S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – REGIÃO METROPOLITANA DE MACEIO S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – MARANHÃO S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – MAUÁ S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL PARTICIPAÇÕES'], ['Saneamento - BRK', 'BRK AMBIENTAL – PORTO FERREIRA S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – RIO CLARO S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – SANTA GERTRUDES S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL SUMARÉ S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – ARAGUAIA SANEAMENTO S.A.'], ['Saneamento - BRK', 'BRK AMBIENTAL – URUGUAIANA S.A.'], ['Saneamento - BRK', 'SANEAQUA MAIRINQUE S.A.'], ['Saneamento - BRK', 'Companhia de Saneamento do Tocantins – SANEATINS'], ['Mercado Livre', 'EBAZAR.COM.BR LTDA.'], ['Mercado Livre', 'MERCADOLIVRE.COM ATIVIDADES DE INTERNET LTDA.'], ['Mercado Livre', 'MERCADO CRÉDITO SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO S.A.'], ['Mercado Livre', 'MERCADO ENVIOS TRANSPORTE LTDA.'], ['Mercado Livre', 'MERCADO PAGO INSTITUICAO DE PAGAMENTO LTDA'], ['Mercado Livre', 'KANGU PARTICIPAÇÕES S.A.'], ['Mercado Livre', 'K21 INTERMEDIACAO LTDA.'], ['Mercado Livre', 'IBAZAR.COM ATIVIDADES DE INTERNET LTDA.'], ['Naturgy - Naturgy', 'CEG RIO S.A.'], ['Naturgy - Naturgy', 'COMPANHIA DISTRIBUIDORA DE GAS DO RIO DE JANEIRO - CEG'], ['Naturgy - Naturgy', 'GAS NATURAL SERVICOS S.A.'], ['Bradesco - Indenizatória', 'BANCO BRADESCO SA']
    ];
    const aliases = { mlvc: 3, 'ml vc': 3, ml: 3, vc: 3, mljec: 4, 'ml jec': 4, jec: 4, cejusc: 4, 'mercado livre vc': 3, 'mercado livre jec': 4, distribuidora: 1, 'agua do rio distribuidora': 1, 'aguas do rio distribuidora': 1, fab: 7, prolagos: 5, 'prolagos consumidor': 5, 'prolagos cobranca': 6, brk: 8, 'brk recife': 8, 'brk goiana': 8, 'brk blumenau': 9, 'brk cacaor': 10, 'brk cachoeiro': 11, 'brk goias': 12, 'brk limeira': 13, 'brk macae': 14, 'brk maceio': 15, 'brk maranhao': 16, 'brk maua': 17, 'brk participacoes': 18, 'brk porto ferreira': 19, 'brk rio claro': 20, 'brk santa gertrudes': 21, 'brk sumare': 22, 'brk araguaia': 23, 'brk uruguaiana': 24, saneaqua: 25, saneatins: 26, 'mercado livre': 28, 'mercado pago': 31, 'mercado credito': 29, 'mercado envios': 30, ebazar: 27, ibazar: 34, kangu: 32, k21: 33, naturgy: 35, ceg: 35, 'ceg rio': 35, 'gas natural': 37, 'gas natural servicos': 37, 'companhia distribuidora de gas': 36, 'distribuidora de gas do rio': 36, 'ceg distribuidora': 36, bradesco: 38, 'banco bradesco': 38 };
    const norm = (value) => String(value || '').normalize('NFKD').replace(/[^A-Za-z0-9+]/g, ' ').replace(/\s+/g, ' ').toUpperCase().trim();
    const normalizedAliases = Object.fromEntries(Object.entries(aliases).map(([key, value]) => [norm(key), value]));
    const tokens = (value) => new Set(norm(value).split(/\s+/).filter(Boolean));
    const find = (query) => {
        const normalized = norm(query);
        if (!normalized) return null;
        if (normalizedAliases[normalized] !== undefined) return refs[normalizedAliases[normalized]];
        const exactReu = refs.find((ref) => normalized.includes(norm(ref[1])));
        if (exactReu) return exactReu;
        const variants = [...new Set([normalized, normalized.replace(/\s+/g, ''), normalized.replace(/([A-Z])(\d)/g, '$1 $2')])];
        let best = null;
        let score = 0;
        refs.forEach((ref) => {
            const combined = `${norm(ref[0])} ${norm(ref[1])}`;
            const refTokens = new Set([...tokens(ref[0]), ...tokens(ref[1])]);
            variants.forEach((variant) => {
                let candidate = 0;
                if (variant === norm(ref[0]) || variant === norm(ref[1])) candidate = 10000;
                else if (combined.includes(variant)) candidate = 5000 + variant.length;
                else candidate = [...tokens(variant)].filter((token) => token.length > 1 && refTokens.has(token)).length * 100;
                if (candidate > score) { score = candidate; best = ref; }
            });
        });
        return best;
    };
    const rows = inputLines(text).map((line) => {
        if (duo && line.includes('\t')) {
            const [left, right] = line.split('\t', 2);
            const leftMatch = find(left);
            const rightMatch = find(right);
            return [line, leftMatch?.[0] || rightMatch?.[0] || '', rightMatch?.[1] || leftMatch?.[1] || ''];
        }
        const match = find(line);
        return [line, match?.[0] || '', match?.[1] || ''];
    });
    return { headers: ['Consulta', 'Carteira', 'Réu'], rows };
}

function stripSuffix(text, suffix = '-PI') {
    return { headers: ['Sem sufixo'], rows: inputLines(text).map((value) => [suffix && value.endsWith(suffix) ? value.slice(0, -suffix.length) : value]) };
}
