// Configuração de estado global
const state = {
    db: null,
    dbHandle: null,
    dbName: '',
    columns: [
        'id_registro', 'data_solicitacao', 'vinculado', 'observacao', 'arquivos',
        'prioridade', 'num_processo', 'parte_autora', 'status', 'pasta_iris',
        'carteira', 'pasta_cliente', 'uf', 'tipo_sistema', 'executor', 'integrador_iris'
    ],
    originalHeaders: [
        'ID Reg.', 'Data da Solicitação', 'Vinculado', 'Observação', 'Arquivos',
        '🔥 PRIORIDADE', 'Núm Proc', 'Solicitante', 'status', 'Pasta',
        'carteira', 'Núm Cli', 'Estado', 'Tipo de Sistema', 'Executor', '⚠️ Integrador Iris'
    ],
    data: [], // cache dos dados renderizados
    filters: JSON.parse(localStorage.getItem('gondim_filters_v2')) || {},
    sortCol: null,
    sortDir: 1,
    visibleCols: JSON.parse(localStorage.getItem('gondim_viz_cols_v2')) || Array(16).fill(true),
    statusColors: JSON.parse(localStorage.getItem('gondim_status_colors')) || {}
};

let SQL = null;

const headerDisplayNames = {
    'ID Reg.': 'ID',
    'Núm. Processo': 'Número do Processo',
    'Núm Proc': 'Número do Processo',
    'Núm Cli': 'Número do Cliente',
    'status': 'Status',
    'Pasta': 'Pasta Iris',
    'carteira': 'Carteira',
    'Estado': 'Estado/UF',
    'solicitante': 'Parte Autora',
    'Solicitante': 'Parte Autora',
    'Data da Solicitação': 'Solicitação',
    '🔥 PRIORIDADE': 'Prioridade'
};

function getDisplayName(header) {
    return headerDisplayNames[header] || header;
}

function getVisualOrder() {
    if (!state.originalHeaders) return [];
    return state.originalHeaders.map((_, i) => i);
}

const booleanColumns = new Set(['vinculado']);

function isBooleanColumnByIndex(idx) {
    return booleanColumns.has(state.columns[idx]);
}

function ensureVisibleColsLength() {
    if (!Array.isArray(state.visibleCols)) {
        state.visibleCols = Array(state.columns.length).fill(true);
    }
    if (state.visibleCols.length !== state.columns.length) {
        state.visibleCols = state.columns.map((_, i) => !!state.visibleCols[i]);
        localStorage.setItem('gondim_viz_cols_v2', JSON.stringify(state.visibleCols));
    }
}

// IndexedDB Wrapper for caching the Session
const idb = {
    isAvailable() {
        return typeof indexedDB !== 'undefined';
    },
    async getDB() {
        if (!this.isAvailable()) return null;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('GondimAppSession', 1);
            req.onupgradeneeded = e => e.target.result.createObjectStore('store');
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e);
        });
    },
    async set(key, val) {
        const db = await this.getDB();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('store', 'readwrite');
            tx.objectStore('store').put(val, key);
            tx.oncomplete = () => resolve();
            tx.onerror = e => reject(e);
        });
    },
    async get(key) {
        const db = await this.getDB();
        if (!db) return undefined;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('store', 'readonly');
            const req = tx.objectStore('store').get(key);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e);
        });
    },
    async remove(key) {
        const db = await this.getDB();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('store', 'readwrite');
            tx.objectStore('store').delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = e => reject(e);
        });
    }
};

// Inicialização da biblioteca SQL.js
async function initSQL() {
    try {
        SQL = await initSqlJs();
        console.log("SQL.js initialized!");
    } catch (err) {
        console.error("Erro ao inicializar SQL.js", err);
        alert("Erro fatal ao carregar o motor de banco de dados SQLite.");
    }
}

function getCurrentDbName() {
    return state.dbHandle?.name || state.dbName || 'sessao_local.sqlite';
}

function isOfflineFileMode() {
    return window.location.protocol === 'file:';
}

async function startLocalDatabaseSession() {
    if (!SQL) {
        throw new Error('SQL.js nao inicializado.');
    }

    state.dbHandle = null;
    state.dbName = isOfflineFileMode() ? 'sessao_local_offline.sqlite' : 'sessao_local.sqlite';

    try {
        await idb.remove('dbHandle');
    } catch (err) {
        console.warn('Nao foi possivel limpar handle salvo:', err);
    }

    state.db = new SQL.Database();
    checkAndCreateTable();
    await persistDatabase();

    const suffix = idb.isAvailable() ? '' : ' (somente nesta aba)';
    updateUIStatus(true, `Conectado: ${getCurrentDbName()}${suffix}`);
    enableImport();
    loadDataAndRender();
}

async function openDatabaseFromFile(file) {
    if (!SQL) {
        throw new Error('SQL.js nao inicializado.');
    }

    state.dbHandle = null;
    state.dbName = file.name;
    try {
        await idb.remove('dbHandle');
    } catch (err) {
        console.warn('Nao foi possivel limpar handle salvo:', err);
    }

    const arrayBuffer = await file.arrayBuffer();

    if (arrayBuffer.byteLength > 0) {
        state.db = new SQL.Database(new Uint8Array(arrayBuffer));
    } else {
        state.db = new SQL.Database();
    }

    checkAndCreateTable();
    await idb.set('dbData', state.db.export());

    updateUIStatus(true, `Conectado: ${getCurrentDbName()}`);
    enableImport();
    loadDataAndRender();
}

// Abrir Banco Existente via File System Access API
async function openDatabase() {
    try {
        if (!SQL) {
            throw new Error('SQL.js nao inicializado.');
        }

        if (isOfflineFileMode() || !('showOpenFilePicker' in window)) {
            document.getElementById('db-file-upload').click();
            return;
        }

        const [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'Banco de Dados SQLite', accept: {'application/x-sqlite3': ['.sqlite', '.db']} }]
        });
        state.dbHandle = fileHandle;
        state.dbName = fileHandle.name;
        await idb.set('dbHandle', fileHandle);
        
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        
        if (arrayBuffer.byteLength > 0) {
            state.db = new SQL.Database(new Uint8Array(arrayBuffer));
            checkAndCreateTable();
        } else {
            state.db = new SQL.Database();
            checkAndCreateTable();
        }
        await idb.set('dbData', state.db.export());
        
        updateUIStatus(true, `Conectado: ${getCurrentDbName()}`);
        enableImport();
        loadDataAndRender();
    } catch (err) {
        if (err && err.name === 'AbortError') {
            console.warn("Abertura cancelada pelo usuario.");
            return;
        }
        console.error("Erro ao abrir banco:", err);
        updateUIStatus(false, 'Erro ao abrir banco local.', 'danger');
        alert('Nao foi possivel abrir o banco selecionado.');
    }
}

// Criar Novo Banco de Dados
async function createDatabase() {
    try {
        if (!SQL) {
            throw new Error('SQL.js nao inicializado.');
        }

        if (isOfflineFileMode() || !('showSaveFilePicker' in window)) {
            await startLocalDatabaseSession();
            return;
        }

        const fileHandle = await window.showSaveFilePicker({
            suggestedName: 'meubanco.sqlite',
            types: [{ description: 'Banco de Dados SQLite', accept: {'application/x-sqlite3': ['.sqlite', '.db']} }]
        });
        state.dbHandle = fileHandle;
        state.dbName = fileHandle.name;
        await idb.set('dbHandle', fileHandle);
        
        state.db = new SQL.Database();
        checkAndCreateTable();
        await persistDatabase();
        
        updateUIStatus(true, `Conectado: ${getCurrentDbName()}`);
        enableImport();
        loadDataAndRender();
    } catch (err) {
        if (err && err.name === 'AbortError') {
            console.warn("Criacao cancelada pelo usuario.");
            return;
        }

        console.error("Erro ao criar banco:", err);

        if (isOfflineFileMode() || err.name === 'SecurityError' || err.name === 'NotAllowedError') {
            console.warn('Fallback para sessao local offline.');
            await startLocalDatabaseSession();
            return;
        }

        updateUIStatus(false, 'Erro ao criar banco.', 'danger');
        alert('Nao foi possivel criar o banco.');
    }
}

// Salvar as alterações de volta pro arquivo
async function persistDatabase() {
    if (!state.db) return;
    try {
        const data = state.db.export();
        await idb.set('dbData', data);
        
        if (state.dbHandle) {
            const opts = { mode: 'readwrite' };
            if ((await state.dbHandle.queryPermission(opts)) !== 'granted') {
                if ((await state.dbHandle.requestPermission(opts)) !== 'granted') {
                    throw new Error("Permissão negada ao salvar arquivo local.");
                }
            }
            const writable = await state.dbHandle.createWritable();
            await writable.write(data);
            await writable.close();
            updateUIStatus(true, `Salvo com sucesso: ${getCurrentDbName()}`);
        }
    } catch (err) {
        console.error("Erro ao salvar arquivo:", err);
        updateUIStatus(false, `Salvo na sessão local (Arquivo desconectado)`, 'warning');
    }
}

// Cria a tabela se não existir e migra colunas antigas para o padrão novo (Forçando ordem do Schema)
function checkAndCreateTable() {
    const fieldsDef = state.columns.map(c => `${c} TEXT`).join(',\n            ');
    const createQuery = `
        CREATE TABLE IF NOT EXISTS registros (
            ${fieldsDef.replace('id_registro TEXT', 'id_registro TEXT PRIMARY KEY')}
        );
    `;
    state.db.run(createQuery);

    const tableInfo = state.db.exec("PRAGMA table_info(registros)");
    const currentCols = tableInfo.length > 0 ? tableInfo[0].values.map(v => String(v[1])) : [];
    const currentColsSet = new Set(currentCols);
    const expectedColsSet = new Set(state.columns);
    const hasExtraColumns = currentCols.some(c => !expectedColsSet.has(c));
    const hasMissingColumns = state.columns.some(c => !currentColsSet.has(c));

    const shouldRebuild = hasExtraColumns || hasMissingColumns || currentColsSet.has('cadastrado') || currentColsSet.has('num_proc') || currentColsSet.has('pasta') || currentColsSet.has('num_cli');

    if (shouldRebuild) {
        const tempTable = 'registros_legacy_backup';
        try { state.db.run(`DROP TABLE IF EXISTS ${tempTable};`); } catch(e) {}
        state.db.run(`ALTER TABLE registros RENAME TO ${tempTable};`);
        state.db.run(createQuery);

        const legacyInfo = state.db.exec(`PRAGMA table_info(${tempTable})`);
        const legacyCols = legacyInfo.length > 0 ? legacyInfo[0].values.map(v => String(v[1])) : [];
        const hasLegacyCol = (name) => legacyCols.includes(name);

        const sourceExpr = {
            id_registro: hasLegacyCol('id_registro') ? 'id_registro' : "''",
            data_solicitacao: hasLegacyCol('data_solicitacao') ? 'data_solicitacao' : (hasLegacyCol('cadastrado') ? 'cadastrado' : "''"),
            vinculado: hasLegacyCol('vinculado') ? 'vinculado' : "''",
            observacao: hasLegacyCol('observacao') ? 'observacao' : "''",
            arquivos: hasLegacyCol('arquivos') ? 'arquivos' : "''",
            prioridade: hasLegacyCol('prioridade') ? 'prioridade' : "''",
            num_processo: hasLegacyCol('num_processo') ? 'num_processo' : (hasLegacyCol('num_proc') ? 'num_proc' : "''"),
            parte_autora: hasLegacyCol('parte_autora') ? 'parte_autora' : (hasLegacyCol('solicitante') ? 'solicitante' : "''"),
            status: hasLegacyCol('status') ? 'status' : "''",
            pasta_iris: hasLegacyCol('pasta_iris') ? 'pasta_iris' : (hasLegacyCol('pasta') ? 'pasta' : "''"),
            carteira: hasLegacyCol('carteira') ? 'carteira' : "''",
            pasta_cliente: hasLegacyCol('pasta_cliente') ? 'pasta_cliente' : (hasLegacyCol('num_cli') ? 'num_cli' : "''"),
            uf: hasLegacyCol('uf') ? 'uf' : (hasLegacyCol('estado') ? 'estado' : "''"),
            tipo_sistema: hasLegacyCol('tipo_sistema') ? 'tipo_sistema' : "''",
            executor: hasLegacyCol('executor') ? 'executor' : "''",
            integrador_iris: hasLegacyCol('integrador_iris') ? 'integrador_iris' : (hasLegacyCol('workflow') ? 'workflow' : "''")
        };

        const insertCols = state.columns.join(', ');
        const selectCols = state.columns.map(c => `${sourceExpr[c]} AS ${c}`).join(', ');
        state.db.run(`INSERT INTO registros (${insertCols}) SELECT ${selectCols} FROM ${tempTable};`);
        state.db.run(`DROP TABLE ${tempTable};`);
    }

    // Auto Cleanup: Remove duplicates keeping the OLDEST record (MIN id_registro) to preserve existing manual edits (like Observações)
    try {
        state.db.run(`
            DELETE FROM registros 
            WHERE id_registro NOT IN (
                SELECT MIN(id_registro) 
                FROM registros 
                WHERE num_processo IS NOT NULL AND num_processo != ''
                GROUP BY num_processo, pasta_cliente
            )
            AND num_processo IS NOT NULL AND num_processo != ''
        `);
    } catch(e) { console.warn("Auto-cleanup deduplication:", e); }
}

// Lógica para gerar o ID Incremental por Dia (YYYYMMDDnnnn)
function generateNextIdBatch(count) {
    const hoje = new Date();
    const yyyy = hoje.getFullYear().toString();
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const dd = String(hoje.getDate()).padStart(2, '0');
    const prefix = `${yyyy}${mm}${dd}`;

    const query = `SELECT id_registro FROM registros WHERE id_registro LIKE '${prefix}%' ORDER BY id_registro DESC LIMIT 1`;
    const res = state.db.exec(query);
    
    let nextNum = 1;
    if (res.length > 0 && res[0].values.length > 0) {
        const lastId = res[0].values[0][0]; 
        nextNum = parseInt(lastId.substring(8)) + 1;
    }

    const ids = [];
    for(let i = 0; i < count; i++) {
        ids.push(`${prefix}${String(nextNum + i).padStart(4, '0')}`);
    }
    return ids;
}

// Processar arquivo Excel
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    updateUIStatus(true, `Carregando planilha...`, 'warning');

    const reader = new FileReader();
    reader.onload = async (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        if (json.length > 0) {
            // Build a Map of existing combinations to prevent duplicates and enable merging
            const existingMap = new Map();
            const existingRes = state.db.exec("SELECT id_registro, num_processo, pasta_cliente FROM registros");
            if (existingRes.length > 0) {
                existingRes[0].values.forEach(r => {
                    const idReg = r[0];
                    const proc = String(r[1] || "").trim().toLowerCase();
                    const pat = String(r[2] || "").trim().toLowerCase();
                    if (proc) existingMap.set(`${proc}|${pat}`, idReg);
                });
            }

            const ids = generateNextIdBatch(json.length);
            
            state.db.run("BEGIN TRANSACTION");
            const fields = state.columns.join(', ');
            const placeholders = state.columns.map(() => '?').join(', ');
            const stmtInsert = state.db.prepare(`INSERT INTO registros (${fields}) VALUES (${placeholders})`);
            
            let insertedRows = 0;
            let updatedRows = 0;
            let skippedRows = 0;
            
            const idxProc = state.columns.indexOf('num_processo');
            const idxPastaCli = state.columns.indexOf('pasta_cliente');
            
            for (let i = 0; i < json.length; i++) {
                const row = json[i];
                
                const normalize = (value) => String(value || "")
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^\w]+/g, '');

                const rowNormalized = {};
                Object.keys(row).forEach((k) => {
                    rowNormalized[normalize(k)] = row[k];
                });

                const getByAliases = (aliases) => {
                    for (const alias of aliases) {
                        const val = rowNormalized[normalize(alias)];
                        if (val !== undefined && val !== null && String(val).trim() !== "") return val;
                    }
                    return "";
                };

                const baseValues = state.columns.map((colName, idx) => {
                    if (idx === 0) return ids[i];
                    if (colName === 'data_solicitacao') return getByAliases(['Data da Solicitação', 'data solicitacao', 'cadastrado']);
                    if (colName === 'vinculado') return getByAliases(['Vinculado']);
                    if (colName === 'observacao') return getByAliases(['Observação', 'Observacao', 'Obs']);
                    if (colName === 'arquivos') return getByAliases(['Arquivos', 'Arquivo']);
                    if (colName === 'prioridade') return getByAliases(['🔥 PRIORIDADE', 'Prioridade']);
                    if (colName === 'num_processo') return getByAliases(['Núm Proc', 'Num Proc', 'Núm. Processo', 'Número do Processo']);
                    if (colName === 'parte_autora') return getByAliases(['Solicitante', 'Parte Autora']);
                    if (colName === 'status') return getByAliases(['status', 'Status']);
                    if (colName === 'pasta_iris') return getByAliases(['Pasta', 'Pasta Iris']);
                    if (colName === 'carteira') return getByAliases(['carteira', 'Carteira']);
                    if (colName === 'pasta_cliente') return getByAliases(['Núm Cli', 'Num Cli', 'Pasta Cliente']);
                    if (colName === 'uf') return getByAliases(['Estado', 'UF']);
                    if (colName === 'tipo_sistema') return getByAliases(['Tipo de Sistema', 'Tipo Sistema']);
                    if (colName === 'executor') return getByAliases(['Executor']);
                    if (colName === 'integrador_iris') return getByAliases(['⚠️ Integrador Iris', 'Integrador Iris']);
                    return "";
                });
                
                // Force array to string types for SQLite to prevent floating-point formatting inconsistencies 
                const boundValues = baseValues.map(v => v === null || v === undefined ? "" : String(v));
                
                const processNumRaw = boundValues[idxProc].trim();
                const pastaCliRaw = boundValues[idxPastaCli].trim();
                
                if (!processNumRaw) {
                    skippedRows++;
                    continue; // do not import blank targets
                }
                
                const processNum = processNumRaw.toLowerCase();
                const pastaCli = pastaCliRaw.toLowerCase();
                
                const uniqueKey = `${processNum}|${pastaCli}`;
                
                if (existingMap.has(uniqueKey)) {
                    // It's a duplicate. We need to merge/update
                    const existingId = existingMap.get(uniqueKey);
                    
                    const updateFields = [];
                    const updateValues = [];
                    
                    // Iterate through boundValues and state.columns, skipping id_registro (index 0)
                    for (let j = 1; j < state.columns.length; j++) {
                        // Only update if the new value is not empty
                        if(boundValues[j] && boundValues[j] !== "") {
                            updateFields.push(`${state.columns[j]} = ?`);
                            updateValues.push(boundValues[j]);
                        }
                    }
                    
                    if(updateFields.length > 0) {
                        updateValues.push(existingId);
                        // Using explicit run instead of prepare for arbitrary number of fields per row
                        // Might be slightly slower but safe since it's a batch transaction
                        state.db.run(`UPDATE registros SET ${updateFields.join(', ')} WHERE id_registro = ?`, updateValues);
                        updatedRows++;
                    } else {
                        skippedRows++; // Nothing to merge
                    }
                } else {
                    // Not a duplicate, insert new row
                    existingMap.set(uniqueKey, ids[i]); // Prevent self-duplicates within the same sheet
                    stmtInsert.run(boundValues);
                    insertedRows++;
                }
            }
            
            stmtInsert.free();
            state.db.run("COMMIT");
            await persistDatabase();
            
            let alertMsg = `${insertedRows} registros novos inseridos e ${updatedRows} registros atualizados!`;
            if (skippedRows > 0) alertMsg += ` (${skippedRows} linhas ignoradas/vazias)`;
            alert(alertMsg);
        } else {
            alert("Não foram encontrados dados na planilha selecionada.");
        }
        
        updateUIStatus(true, `Conectado: ${getCurrentDbName()}`);
        e.target.value = ''; 
        loadDataAndRender();
    };
    reader.readAsArrayBuffer(file);
}

// Manual Data Entry Record
async function saveNewRecord() {
    if (!state.db) return;
    
    const procIdx = state.originalHeaders.findIndex(h => h.includes('Núm Proc') || h.includes('Núm. Processo'));
    const procInput = document.getElementById(`new-input-${procIdx}`).value.trim();
    if (!procInput) {
        alert("O campo 'Número do Processo' é obrigatório.");
        return;
    }
    
    const ids = generateNextIdBatch(1); 
    const values = [ids[0]];
    
    for(let i = 1; i < state.originalHeaders.length; i++) {
        const el = document.getElementById(`new-input-${i}`);
        let inputVal = '';
        if (isBooleanColumnByIndex(i)) {
            inputVal = el.checked ? '1' : '0';
        } else {
            inputVal = el.value;
        }
        values.push(inputVal);
    }
    
    const placeholders = state.columns.map(() => '?').join(', ');
    const fields = state.columns.join(', ');
    const stmt = state.db.prepare(`INSERT INTO registros (${fields}) VALUES (${placeholders})`);
    
    stmt.run(values);
    stmt.free();
    
    await persistDatabase();
    closeAllModals();
    loadDataAndRender();
}



// Renderizar Tabela
function loadDataAndRender() {
    if (!state.db) return;
    
    // Explicit Select to maintain mapped state arrays vs SQLite memory mapping 
    const fields = state.columns.join(', ');
    const res = state.db.exec(`SELECT ${fields} FROM registros ORDER BY id_registro DESC`);
    
    if (res.length > 0) {
        state.data = res[0].values;
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('row-count').innerText = `${state.data.length} registros`;
        
        updateDatalists(); // Atualiza listas (ex: Observações)
        
        renderHeaders();
        renderTableRows();
    } else {
        state.data = [];
        updateDatalists();
        document.getElementById('table-body').innerHTML = '';
        renderHeaders();
        renderTableRows();
    }
}

// Render Heads and Filters
function renderHeaders() {
    const thead = document.getElementById('table-headers');
    const fhead = document.getElementById('table-filters');
    
    // Only render if empty to avoid losing focus on filters. But if cols vis changed, we clear it first.
    if (thead.children.length === 0) {
        thead.innerHTML = '';
        fhead.innerHTML = '';
        
        const visualOrder = getVisualOrder();
        
        visualOrder.forEach(idx => {
            const thText = state.originalHeaders[idx];
            if (!state.visibleCols[idx]) return; // Skip Hidden

            const th = document.createElement('th');
            if (isBooleanColumnByIndex(idx)) th.classList.add('col-boolean');
            let sortSymbol = '';
            if (state.sortCol === idx) {
                sortSymbol = state.sortDir === 1 ? ' ▲' : ' ▼';
            }
            
            const isBoolean = isBooleanColumnByIndex(idx);
            const justify = isBoolean ? 'center' : 'space-between';
            const copyBtn = isBoolean ? '' : '<button class="btn-copy" title="Copiar Coluna Inteira" onclick="copyColumn(' + idx + ')">📋</button>';

            th.innerHTML = `
                <div style="display:flex; justify-content:${justify}; align-items:center;">
                    <span style="cursor:pointer; user-select:none; filter: brightness(0.8);" onclick="toggleSort(${idx})" title="Clique para ordenar">
                        ${getDisplayName(thText)} <span style="color:var(--shell-accent, var(--accent)); font-size:10px;">${sortSymbol}</span>
                    </span>
                    ${copyBtn}
                </div>
            `;
            thead.appendChild(th);
            
            const tf = document.createElement('th');
            
            const hasEmpty = state.data.some(row => !row[idx] || String(row[idx]).trim() === "");
            
            const uniqueValues = [...new Set(state.data.map(row => row[idx]))]
                .filter(val => val !== null && val !== undefined && val !== "")
                .sort();
            
            const allPossibleValues = hasEmpty ? ['[VAZIO]', ...uniqueValues] : uniqueValues;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'filter-dropdown-wrapper';
            wrapper.id = `fwrapper-${idx}`;
            
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.innerText = getFilterBtnText(idx) + ' ▾';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.filter-menu').forEach(m => {
                    if (m.id !== `fmenu-${idx}`) m.style.display = 'none';
                });
                const menu = document.getElementById(`fmenu-${idx}`);
                const willOpen = menu.style.display !== 'block';
                menu.style.display = willOpen ? 'block' : 'none';
                if (willOpen) {
                    const input = menu.querySelector('.filter-menu-search');
                    if (input) input.value = '';
                    menu.querySelectorAll('.filter-option').forEach(lbl => { lbl.style.display = 'flex'; });
                }
            };
            
            const menu = document.createElement('div');
            menu.className = 'filter-menu';
            menu.id = `fmenu-${idx}`;
            menu.style.display = 'none';
            // Previne que o click dentro do menu feche ele mesmo com o listener global
            menu.onclick = (e) => e.stopPropagation();
            
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Buscar...';
            searchInput.className = 'filter-menu-search';
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                menu.querySelectorAll('.filter-option').forEach(lbl => {
                    lbl.style.display = lbl.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
                });
            };
            menu.appendChild(searchInput);
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'filter-menu-actions';
            actionsDiv.innerHTML = `
                <span class="btn-text" onclick='selectAllFilter(${idx}, ${JSON.stringify(allPossibleValues).replace(/'/g, "&apos;")})'>Todos</span>
                <span class="btn-text" onclick="clearFilter(${idx})">Limpar</span>
            `;
            menu.appendChild(actionsDiv);
            
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'filter-options-list';
            optionsDiv.id = `foptions-${idx}`;
            
            const selected = state.filters[idx] || [];
            allPossibleValues.forEach(val => {
                const lbl = document.createElement('label');
                lbl.className = 'filter-option';
                
                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.value = val;
                chk.checked = selected.includes(val);
                chk.onchange = (e) => updateFilter(idx, val, e.target.checked);
                
                let displayTxt = val;
                if (val === '[VAZIO]') {
                    displayTxt = '(Vazio)';
                }
                
                lbl.appendChild(chk);
                lbl.appendChild(document.createTextNode(displayTxt));
                optionsDiv.appendChild(lbl);
            });
            
            menu.appendChild(optionsDiv);
            wrapper.appendChild(btn);
            wrapper.appendChild(menu);
            tf.appendChild(wrapper);
            fhead.appendChild(tf);
            
        });
    }
}

// Helper to get filtered and sorted data state
function getFilteredAndSortedData() {
    if (!state.data) return [];
    
    const filteredData = state.data.filter(row => {
        for (const [colIdxStr, selectedValues] of Object.entries(state.filters)) {
            const colIdx = parseInt(colIdxStr);
            if (selectedValues && selectedValues.length > 0) {
                const cellVal = row[colIdx];
                const cellValStr = (cellVal === null || cellVal === undefined) ? "" : String(cellVal).trim();
                
                let matches = false;
                for(const val of selectedValues) {
                    if (val === '[VAZIO]') {
                        if (cellValStr === "") { matches = true; break; }
                    } else {
                        if (cellValStr.toLowerCase() === val.toLowerCase()) { matches = true; break; }
                    }
                }
                
                if (!matches) return false;
            }
        }
        return true;
    });

    if (state.sortCol !== null) {
        filteredData.sort((a, b) => {
            const valA = a[state.sortCol] || "";
            const valB = b[state.sortCol] || "";
            if (valA < valB) return -1 * state.sortDir;
            if (valA > valB) return 1 * state.sortDir;
            return 0;
        });
    }
    
    return filteredData;
}

function getRowHighlightColor(row) {
    const idxObs = state.columns.indexOf('observacao');
    const idxArquivos = state.columns.indexOf('arquivos');
    const idxCarteira = state.columns.indexOf('carteira');
    const idxPrioridade = state.columns.indexOf('prioridade');

    const obsVal = row[idxObs];
    const arquivosVal = String(row[idxArquivos] || '').trim();
    const carteiraVal = String(row[idxCarteira] || '').trim().toUpperCase();
    const prioridadeVal = String(row[idxPrioridade] || '').trim();

    const arquivosCount = arquivosVal ? arquivosVal.split(';').map(s => s.trim()).filter(s => s.length > 0).length : 0;
    let rowColor = 'transparent';

    if (arquivosCount >= 1) rowColor = '#BBDEFB';
    if (carteiraVal.includes('SANTANDER') && arquivosCount >= 3) rowColor = '#E1BEE7';
    if (carteiraVal.includes('CLARO') && arquivosCount >= 1) rowColor = '#FFCDD2';
    if (prioridadeVal.toLowerCase() === 'sim') rowColor = '#FFF9C4';
    if (obsVal && state.statusColors[obsVal]) rowColor = state.statusColors[obsVal];

    return rowColor;
}

// Render Rows com filtros e cores aplicados
function renderTableRows() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    document.getElementById('empty-state').style.display = 'none';
    
    if (document.getElementById('table-headers').children.length === 0) {
        renderHeaders();
    }
    
    let visibleCount = 0;
    
    const filteredData = getFilteredAndSortedData();

    const hasActiveFilters = Object.values(state.filters).some(arr => arr && arr.length > 0);
    const clearBtn = document.getElementById('btn-clear-filters');
    if (clearBtn) {
        clearBtn.style.display = hasActiveFilters ? 'inline-block' : 'none';
    }

    filteredData.forEach(row => {
        const tr = document.createElement('tr');
        const rowColor = getRowHighlightColor(row);

        if (rowColor !== 'transparent') {
            tr.style.setProperty('--status-color', rowColor);
        }
        
        const idRegistro = row[0]; 
        
        let visualColCounter = 0;
        const visualOrder = getVisualOrder();
        visualOrder.forEach(colIdx => {
            const cellData = row[colIdx];
            if (!state.visibleCols[colIdx]) return; // Visibilidade

            const td = document.createElement('td');
            if (isBooleanColumnByIndex(colIdx)) td.classList.add('col-boolean');
            td.dataset.vrow = visibleCount;
            td.dataset.vcol = visualColCounter++;
            td.dataset.idregistro = idRegistro;
            td.dataset.dbname = state.columns[colIdx];

            
            if (colIdx === 0) {
                td.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${cellData}</span>
                    <span style="cursor:pointer; font-size:14px; margin-left:8px;" title="Editar Registro Completo" onclick="openEditModal('${idRegistro}')">✏️</span>
                </div>`;
            } else if (isBooleanColumnByIndex(colIdx)) {
                const isChecked = cellData === 'true' || cellData === '1' || cellData === true || cellData === 1;
                td.innerHTML = `<div style="display:flex; justify-content:center; align-items:center;">
                    <input type="checkbox" style="transform: scale(1.2); cursor: pointer;" ${isChecked ? 'checked' : ''} onchange="(async (e) => {
                        const newVal = e.target.checked ? '1' : '0';
                        const colName = state.columns[${colIdx}];
                        state.db.run(\`UPDATE registros SET \${colName} = ? WHERE id_registro = ?\`, [newVal, '${idRegistro}']);
                        const dataRowIndex = state.data.findIndex(r => r[0] === '${idRegistro}');
                        if(dataRowIndex > -1) state.data[dataRowIndex][${colIdx}] = newVal;
                        await persistDatabase();
                    })(event)">
                </div>`;
            } else {
                td.innerText = cellData;
                
                td.addEventListener('dblclick', () => {
                    if (td.classList.contains('editing')) return;
                    
                    td.classList.add('editing');
                    const currentVal = td.innerText;
                    td.innerHTML = '';
                    if (colIdx === 3) {
                        const wrap = document.createElement('div');
                        wrap.className = 'cell-combo-group';
                        
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = currentVal;
                        
                        const select = document.createElement('select');
                        select.className = 'obs-combo';
                        select.title = "Ver Sugestões";
                        select.onchange = () => { 
                            if(select.value) input.value = select.value; 
                            select.value = ''; 
                            input.focus(); 
                        };
                        
                        wrap.appendChild(input);
                        wrap.appendChild(select);
                        td.appendChild(wrap);
                        
                        updateDatalists();
                        input.focus();
                        
                        var inputRef = input;
                    } else {
                        const input = document.createElement('input');
                        input.className = 'cell-input';
                        input.value = currentVal;
                        td.appendChild(input);
                        input.focus();
                        var inputRef = input;
                    }
                    
                    const finishEditing = async () => {
                        const newVal = inputRef.value;
                        td.classList.remove('editing');
                        td.innerText = newVal;
                        
                        if (newVal !== currentVal) {
                            const colName = state.columns[colIdx];
                            state.db.run(`UPDATE registros SET ${colName} = ? WHERE id_registro = ?`, [newVal, idRegistro]);
                            
                            const dataRowIndex = state.data.findIndex(r => r[0] === idRegistro);
                            if(dataRowIndex > -1) state.data[dataRowIndex][colIdx] = newVal;
                            
                            // If observação/arquivos/carteira changed, re-render row colors
                            if (['observacao', 'arquivos', 'carteira'].includes(colName)) {
                                await persistDatabase();
                                loadDataAndRender();
                                return;
                            }
                            
                            await persistDatabase();
                            if (colIdx === 3) updateDatalists();
                        }
                    };
                    
                    inputRef.addEventListener('blur', (e) => {
                        // avoid blur if clicking on select
                        if (e.relatedTarget && e.relatedTarget.classList.contains('obs-combo')) return;
                        // wait a bit in case click is resolving
                        setTimeout(finishEditing, 150);
                    });
                    inputRef.addEventListener('keydown', (e) => {
                        if(e.key === 'Enter') finishEditing();
                        if(e.key === 'Escape') {
                            td.classList.remove('editing');
                            td.innerText = currentVal;
                        }
                    });
                });
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
        visibleCount++;
    });
    
    document.getElementById('row-count').innerText = `${visibleCount} registros filtrados (Total: ${state.data.length})`;
}

// Formata números de processo CNJ (20 dígitos purgados de outros caracteres)
function formatCNJ(str) {
    if (!str) return "";
    let clean = String(str).replace(/\D/g, '');
    if (clean.length === 20) {
        return clean.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})$/, "$1-$2.$3.$4.$5.$6");
    }
    return str; // Preserva original
}

// Utilitários de Navegação e Interface
function updateUIStatus(isOk, text, mode='success') {
    const status = document.getElementById('db-status');
    status.className = `status-indicator ${mode}`;
    status.querySelector('span:last-child').innerText = text;
}

function enableImport() {
    document.getElementById('div-import-export-group').style.display = 'inline-block';
    
    document.getElementById('btn-new-record').style.display = 'flex';
    document.getElementById('div-settings').style.display = 'inline-block';
    document.getElementById('div-copiar-group').style.display = 'inline-block';
    
    const newBtns = [
        'btn-verificar-arquivos'
    ];
    newBtns.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'flex';
    });
    
    const btnDBOpen = document.getElementById('btn-db-open');
    if(btnDBOpen) {
        btnDBOpen.className = 'btn primary';
        btnDBOpen.innerHTML = `<span class="icon">🔌</span> Desconectar Banco`;
        btnDBOpen.style.pointerEvents = 'auto';
        btnDBOpen.style.opacity = '1';
        btnDBOpen.removeEventListener('click', openDatabase);
        btnDBOpen.addEventListener('click', disconnectSession);
    }
    const btnDBCreate = document.getElementById('btn-db-create');
    if(btnDBCreate) btnDBCreate.style.display = 'none';
    
    document.getElementById('btn-verificar-arquivos').disabled = false;
    document.getElementById('btn-copiar-santander').disabled = false;
    document.getElementById('btn-copiar-claro').disabled = false;
    document.getElementById('btn-copiar-bradesco').disabled = false;
}

async function loadSession() {
    try {
        const cachedData = await idb.get('dbData');
        const handle = await idb.get('dbHandle');
        
        if (cachedData && cachedData.byteLength > 0) {
            state.db = new SQL.Database(cachedData);
            if (handle) {
                state.dbHandle = handle;
                state.dbName = handle.name;
                updateUIStatus(true, `Recuperado (arquivo: ${handle.name})`);
            } else {
                state.dbName = 'sessao_local.sqlite';
                updateUIStatus(true, `Recuperado da última sessão local`);
            }
            enableImport();
            loadDataAndRender();
        }
    } catch (err) {
        console.error('Nenhuma sessão anterior encontrada ou erro ao carregar:', err);
    }
}

async function disconnectSession() {
    if (confirm("Deseja realmente desconectar e fechar o banco atual?")) {
        state.db = null;
        state.dbHandle = null;
        state.dbName = '';
        await idb.remove('dbData');
        await idb.remove('dbHandle');
        location.reload();
    }
}

function toggleDropdown(id) {
    document.getElementById(id).classList.toggle('show');
}
window.onclick = function(event) {
    if (!event.target.closest('#div-settings')) {
        const menu = document.getElementById("settings-menu");
        if (menu && menu.classList.contains('show')) menu.classList.remove('show');
    }
    if (!event.target.closest('#div-copiar-group')) {
        const menu = document.getElementById("copiar-menu");
        if (menu && menu.classList.contains('show')) menu.classList.remove('show');
    }
    if (!event.target.closest('#div-import-export-group')) {
        const menu = document.getElementById("import-export-menu");
        if (menu && menu.classList.contains('show')) menu.classList.remove('show');
    }
    if (!event.target.closest('.filter-dropdown-wrapper')) {
        document.querySelectorAll('.filter-menu').forEach(m => m.style.display = 'none');
    }
}

// Funções de Modal
function openModal(id) {
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById(id).classList.add('active');
    
    if(id === 'modal-new') {
        const form = document.getElementById('form-new');
        form.innerHTML = '';
        
        const visualOrder = getVisualOrder();
        visualOrder.forEach(i => {
            if (i === 0) return; // Hide ID from forms
            
            const isMandatory = state.originalHeaders[i].includes('Núm Proc') || state.originalHeaders[i].includes('Núm. Processo');
            const placeholder = isMandatory ? 'Digite... (Obrigatório)' : 'Digite... (ou deixe vazio)';
            const displayName = getDisplayName(state.originalHeaders[i]);
            
            if (i === 3) {
                form.innerHTML += `
                    <div class="form-group">
                        <label>${displayName} ${isMandatory ? '<span style="color:var(--danger)">*</span>' : ''}</label>
                        <div class="modal-combo-group">
                            <input type="text" id="new-input-${i}" placeholder="${placeholder}" autocomplete="off">
                            <select class="obs-combo" title="Ver Opções Anteriores" onchange="const inp = document.getElementById('new-input-${i}'); if(this.value) inp.value = this.value; this.value=''; inp.focus();"></select>
                        </div>
                    </div>
                `;
            } else if (isBooleanColumnByIndex(i)) {
                form.innerHTML += `
                    <div class="form-group" style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="new-input-${i}" style="transform: scale(1.2); cursor: pointer;">
                        <label style="margin-bottom:0; cursor:pointer;" for="new-input-${i}">${displayName}</label>
                    </div>
                `;
            } else {
                form.innerHTML += `
                    <div class="form-group">
                        <label>${displayName} ${isMandatory ? '<span style="color:var(--danger)">*</span>' : ''}</label>
                        <input type="text" id="new-input-${i}" placeholder="${placeholder}" autocomplete="off">
                    </div>
                `;
            }
        });
        updateDatalists();
    }
    else if(id === 'modal-cols') {
        const list = document.getElementById('cols-list');
        list.innerHTML = `
            <div style="display:flex; gap:10px; margin-bottom: 16px;">
                <button type="button" class="btn secondary" onclick="document.querySelectorAll('.col-checkbox').forEach(cb => cb.checked = true)" style="padding: 6px 12px; font-size:0.8rem; flex:1;">✔️ Marcar Todas</button>
                <button type="button" class="btn secondary" onclick="document.querySelectorAll('.col-checkbox').forEach(cb => cb.checked = false)" style="padding: 6px 12px; font-size:0.8rem; flex:1;">❌ Desmarcar Todas</button>
            </div>
            <div id="cols-checkboxes" style="display:flex; flex-direction:column; gap:8px;"></div>
        `;
        const cbContainer = list.querySelector('#cols-checkboxes');
        
        const visualOrder = getVisualOrder();
        visualOrder.forEach(idx => {
            const h = state.originalHeaders[idx];
            const checked = state.visibleCols[idx] ? 'checked' : '';
            cbContainer.innerHTML += `
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="chk-col-${idx}" class="col-checkbox" ${checked}> ${getDisplayName(h)}
                </label>
            `;
        });
    }
    else if(id === 'modal-colors') {
        const list = document.getElementById('colors-list');
        list.innerHTML = '';
        const statusIdx = 3; // 3 = Observação (was 1)
        const uniqueStatus = [...new Set(state.data.map(r => r[statusIdx]))].filter(v => typeof v === 'string' && v.trim() !== "");
        
        uniqueStatus.forEach(st => {
            const color = state.statusColors[st] || '#ffffff';
            const b64st = btoa(unescape(encodeURIComponent(st))).replace(/=/g, ''); // safe ID
            list.innerHTML += `
                <div class="color-item">
                    <span>${st}</span>
                    <input type="color" id="color-for-${b64st}" value="${color}">
                </div>
            `;
        });
        if(uniqueStatus.length === 0) {
            list.innerHTML = '<p style="color:var(--danger); font-size:12px;">Nenhuma observação cadastrada no banco de dados ainda para escolher a cor.</p>';
        }
    }
}

window.openEditModal = function(idRegistro) {
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('modal-edit').classList.add('active');
    
    const row = state.data.find(r => r[0] === idRegistro);
    if (!row) return;

    const form = document.getElementById('form-edit');
    form.innerHTML = '';
    
    const visualOrder = getVisualOrder();
    visualOrder.forEach(i => {
        if (i === 0) return; // Hide ID
        
        const val = row[i] !== null && row[i] !== undefined ? String(row[i]).replace(/"/g, '&quot;') : '';
        const isMandatory = state.originalHeaders[i].includes('Núm Proc') || state.originalHeaders[i].includes('Núm. Processo');
        const displayName = getDisplayName(state.originalHeaders[i]);
        
        if (i === 3) {
            form.innerHTML += `
                <div class="form-group">
                    <label>${displayName} ${isMandatory ? '<span style="color:var(--danger)">*</span>' : ''}</label>
                    <div class="modal-combo-group">
                        <input type="text" id="edit-input-${i}" value="${val}" autocomplete="off">
                        <select class="obs-combo" title="Ver Opções Anteriores" onchange="const inp = document.getElementById('edit-input-${i}'); if(this.value) inp.value = this.value; this.value=''; inp.focus();"></select>
                    </div>
                </div>
            `;
        } else if (isBooleanColumnByIndex(i)) {
            const isChecked = val === 'true' || val === '1' || val === true || val === 1;
            form.innerHTML += `
                <div class="form-group" style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="edit-input-${i}" style="transform: scale(1.2); cursor: pointer;" ${isChecked ? 'checked' : ''}>
                    <label style="margin-bottom:0; cursor:pointer;" for="edit-input-${i}">${displayName}</label>
                </div>
            `;
        } else {
            form.innerHTML += `
                <div class="form-group">
                    <label>${displayName} ${isMandatory ? '<span style="color:var(--danger)">*</span>' : ''}</label>
                    <input type="text" id="edit-input-${i}" value="${val}" autocomplete="off">
                </div>
            `;
        }
    });
    updateDatalists();

    document.getElementById('btn-update-record').onclick = () => saveEditRecord(idRegistro);
};

window.saveEditRecord = async function(idRegistro) {
    if (!state.db) return;
    
    const procIdx = state.originalHeaders.findIndex(h => h.includes('Núm Proc') || h.includes('Núm. Processo'));
    const procInput = document.getElementById(`edit-input-${procIdx}`).value.trim();
    if (!procInput) {
        alert("O campo 'Número do Processo' é obrigatório.");
        return;
    }
    
    const updates = [];
    const values = [];
    
    for(let i = 1; i < state.originalHeaders.length; i++) {
        const el = document.getElementById(`edit-input-${i}`);
        let inputVal = '';
        if (isBooleanColumnByIndex(i)) {
            inputVal = el.checked ? '1' : '0';
        } else {
            inputVal = el.value;
        }
        const colName = state.columns[i];
        updates.push(`${colName} = ?`);
        values.push(inputVal);
    }
    values.push(idRegistro);
    
    const query = `UPDATE registros SET ${updates.join(', ')} WHERE id_registro = ?`;
    const stmt = state.db.prepare(query);
    stmt.run(values);
    stmt.free();
    
    await persistDatabase();
    closeAllModals();
    loadDataAndRender();
};

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    document.getElementById('modal-overlay').classList.remove('active');
}

function toggleColumn(idx, isVisible) {
    state.visibleCols[idx] = isVisible;
    localStorage.setItem('gondim_viz_cols_v2', JSON.stringify(state.visibleCols));
    loadDataAndRender();
}

function toggleAllColumns(isVisible) {
    document.querySelectorAll('.col-checkbox').forEach(cb => cb.checked = isVisible);
    state.originalHeaders.forEach((_, i) => state.visibleCols[i] = isVisible);
    localStorage.setItem('gondim_viz_cols_v2', JSON.stringify(state.visibleCols));
    loadDataAndRender();
}

function saveColVis() {
    state.originalHeaders.forEach((h, idx) => {
        state.visibleCols[idx] = document.getElementById(`chk-col-${idx}`).checked;
    });
    localStorage.setItem('gondim_viz_cols_v2', JSON.stringify(state.visibleCols));
    document.getElementById('table-headers').innerHTML = '';
    document.getElementById('table-filters').innerHTML = '';
    renderTableRows();
}

function saveColors() {
    const statusIdx = 3;
    const uniqueStatus = [...new Set(state.data.map(r => r[statusIdx]))].filter(v => v);
    
    uniqueStatus.forEach(st => {
        const b64st = btoa(unescape(encodeURIComponent(st))).replace(/=/g, '');
        const val = document.getElementById(`color-for-${b64st}`).value;
        if (val !== '#ffffff') {
            state.statusColors[st] = val;
        } else {
            delete state.statusColors[st];
        }
    });
    localStorage.setItem('gondim_status_colors', JSON.stringify(state.statusColors));
    renderTableRows();
}

// Alternar ordenação
window.toggleSort = function(idx) {
    if (state.sortCol === idx) {
        if (state.sortDir === 1) state.sortDir = -1;
        else { state.sortCol = null; state.sortDir = 1; }
    } else {
        state.sortCol = idx;
        state.sortDir = 1;
    }
    document.getElementById('table-headers').innerHTML = '';
    document.getElementById('table-filters').innerHTML = '';
    renderTableRows();
};

// Helpers para os novos filtros múltiplos
window.updateFilter = function(colIdx, value, isChecked) {
    if (!state.filters[colIdx]) state.filters[colIdx] = [];
    if (isChecked) {
        if (!state.filters[colIdx].includes(value)) state.filters[colIdx].push(value);
    } else {
        state.filters[colIdx] = state.filters[colIdx].filter(v => v !== value);
    }
    
    localStorage.setItem('gondim_filters_v2', JSON.stringify(state.filters));
    
    console.log(`Filtro atualizado na coluna ${colIdx}:`, state.filters[colIdx]);
    const btn = document.querySelector(`#fwrapper-${colIdx} .filter-btn`);
    if(btn) btn.innerText = getFilterBtnText(colIdx) + ' ▾';
    renderTableRows();
};

window.selectAllFilter = function(colIdx, values) {
    state.filters[colIdx] = [...values];
    localStorage.setItem('gondim_filters_v2', JSON.stringify(state.filters));
    document.querySelectorAll(`#foptions-${colIdx} input[type="checkbox"]`).forEach(c => c.checked = true);
    document.querySelector(`#fwrapper-${colIdx} .filter-btn`).innerText = getFilterBtnText(colIdx) + ' ▾';
    renderTableRows();
};

window.clearFilter = function(colIdx) {
    state.filters[colIdx] = [];
    localStorage.setItem('gondim_filters_v2', JSON.stringify(state.filters));
    document.querySelectorAll(`#foptions-${colIdx} input[type="checkbox"]`).forEach(c => c.checked = false);
    document.querySelector(`#fwrapper-${colIdx} .filter-btn`).innerText = getFilterBtnText(colIdx) + ' ▾';
    renderTableRows();
};

window.clearAllFilters = function() {
    state.filters = {};
    localStorage.removeItem('gondim_filters_v2');
    document.getElementById('table-headers').innerHTML = '';
    document.getElementById('table-filters').innerHTML = '';
    renderTableRows();
};

window.getFilterBtnText = function(colIdx) {
    const selected = state.filters[colIdx] || [];
    if (selected.length === 0) return 'Todos';
    if (selected.length === 1) {
        let val = selected[0];
        if (val === '[VAZIO]') val = '(Vazio)';
        return val.length > 15 ? val.substring(0, 15) + '...' : val;
    }
    return `${selected.length} selec.`;
};

// Toggle de Visão (Vinculação)
window.toggleView = function(viewName) {
    // reset visibility to false for all
    state.originalHeaders.forEach((_, i) => state.visibleCols[i] = false);
    
    const setVis = (fragments) => {
        const idx = state.originalHeaders.findIndex(h => fragments.some(f => h.toLowerCase().includes(f.toLowerCase())));
        if (idx > -1) state.visibleCols[idx] = true;
    };
    
    const show = [
        ['id reg'], ['vinculado'], ['observação'], ['arquivos'],
        ['núm proc', 'núm. processo', 'numero do processo', 'processo'],
        ['pasta iris', 'pasta'], ['carteira'],
        ['núm cli', 'pasta cliente', 'numero cliente'],
        ['estado', 'uf'], ['tipo de sistema', 'tipo sistema'], ['executor']
    ];
    show.forEach(setVis);
    
    localStorage.setItem('gondim_current_view', 'vinculacao');
    localStorage.setItem('gondim_viz_cols_v2', JSON.stringify(state.visibleCols));
    document.getElementById('table-headers').innerHTML = '';
    document.getElementById('table-filters').innerHTML = '';
    renderTableRows();
};

// Copiar coluna visível
window.copyColumn = function(colIdx) {
    if (!state.data || state.data.length === 0) return;
    const tableBody = document.getElementById('table-body');
    const rows = tableBody.querySelectorAll('tr');
    
    // Obter o index real da coluna visual no DOM (pulando colunas ocultas)
    let visibleIndex = 0;
    for(let i=0; i<colIdx; i++) {
        if(state.visibleCols[i]) visibleIndex++;
    }
    
    const visibleData = [];
    rows.forEach(tr => {
        const td = tr.children[visibleIndex];
        if (td) visibleData.push(td.innerText);
    });
    
    const textToCopy = visibleData.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
        alert(`Coluna copiada! (${visibleData.length} valores)`);
    });
};

document.addEventListener('DOMContentLoaded', async () => {
    await initSQL();
    ensureVisibleColsLength();
    document.getElementById('btn-db-open').addEventListener('click', openDatabase);
    document.getElementById('btn-db-create').addEventListener('click', createDatabase);
    document.getElementById('db-file-upload').addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            await openDatabaseFromFile(file);
        } catch (err) {
            console.error('Erro ao abrir banco local:', err);
            alert('Nao foi possivel abrir o banco selecionado.');
        } finally {
            event.target.value = '';
        }
    });
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);
    document.getElementById('btn-exportar-vinculacao').addEventListener('click', exportarVinculacao);
    document.getElementById('btn-verificar-arquivos').addEventListener('click', verificarArquivos);
    document.getElementById('btn-copiar-santander').addEventListener('click', () => copiarParaPasta('santander'));
    document.getElementById('btn-copiar-claro').addEventListener('click', () => copiarParaPasta('claro'));
    document.getElementById('btn-copiar-bradesco').addEventListener('click', () => copiarParaPasta('bradesco'));
    document.getElementById('btn-copiar-repositorio').addEventListener('click', sincronizarRepositorio);
    
    
    // Mantém o app fixo na visão de vinculação
    localStorage.setItem('gondim_current_view', 'vinculacao');
    toggleView('vinculacao');

    // Tenta restaurar sessão, se houver:
    loadSession();
});

// Sincronização Automatizada de Diretórios (Workflows Diários)
window.redefinirPastasSync = async function() {
    await idb.remove('repositorioDir');
    await idb.remove('repositorioBaseDir');
    await idb.remove('vinculacaoDir');
    alert("Pastas esquecidas. Na próxima checagem você deverá escolhê-las de novo.");
    
    // Atualiza o modal se estiver aberto
    const modal = document.getElementById('modal-sync-settings');
    if (modal.classList.contains('active')) {
        document.getElementById('path-repositorio').innerText = 'Não configurado';
        document.getElementById('path-repositorio-base').innerText = 'Não configurado';
        document.getElementById('path-vinculacao').innerText = 'Não configurado';
    }

    const menu = document.getElementById("settings-menu");
    if (menu && menu.classList.contains('show')) menu.classList.remove('show');
};

window.openSyncSettingsModal = async function() {
    const repoHandle = await idb.get('repositorioDir');
    const repoBaseHandle = await idb.get('repositorioBaseDir');
    const vinculaHandle = await idb.get('vinculacaoDir');
    
    document.getElementById('path-repositorio').innerText = repoHandle ? `📁 ${repoHandle.name}` : 'Não configurado';
    document.getElementById('path-repositorio-base').innerText = repoBaseHandle ? `📁 ${repoBaseHandle.name}` : 'Não configurado';
    document.getElementById('path-vinculacao').innerText = vinculaHandle ? `📁 ${vinculaHandle.name}` : 'Não configurado';
    
    openModal('modal-sync-settings');
};

window.setRepositorioDir = async function() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await idb.set('repositorioDir', handle);
        document.getElementById('path-repositorio').innerText = `📁 ${handle.name}`;
    } catch(e) {
        console.warn("Seleção de repositório cancelada ou erro:", e);
    }
};

window.setVinculacaoDir = async function() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await idb.set('vinculacaoDir', handle);
        document.getElementById('path-vinculacao').innerText = `📁 ${handle.name}`;
    } catch(e) {
        console.warn("Seleção de vinculação cancelada ou erro:", e);
    }
};

window.setRepositorioBaseDir = async function() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await idb.set('repositorioBaseDir', handle);
        document.getElementById('path-repositorio-base').innerText = `📁 ${handle.name}`;
    } catch(e) {
        console.warn("Seleção da pasta base cancelada ou erro:", e);
    }
};

const MIN_REPOSITORIO_SYNC_FILE_SIZE = 100 * 1024; // >100KB
const CNJ_PONTUADO_REGEX = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;

async function verifyDirectoryPermission(handle, name) {
    if (!handle) return null;
    const opts = { mode: 'readwrite' };
    try {
        const permission = await handle.queryPermission(opts);
        if (permission === 'granted') return handle;
        if (await handle.requestPermission(opts) === 'granted') return handle;
    } catch (e) {
        console.error(`Erro ao verificar permissão para ${name}:`, e);
    }
    return null;
}

function formatCnjFromDigits(digits) {
    if (!digits || digits.length !== 20) return null;
    return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

function extractPontuadoCnjDigitsFromName(fileName) {
    const matches = fileName.match(CNJ_PONTUADO_REGEX) || [];
    const cnjDigits = matches
        .map(cnj => cnj.replace(/\D/g, ''))
        .filter(d => d.length === 20);
    return [...new Set(cnjDigits)];
}

function extractAnyCnjDigitsFromName(fileName) {
    const found = new Set(extractPontuadoCnjDigitsFromName(fileName));
    const rawDigits = fileName.replace(/\D/g, '');
    for (let i = 0; i <= rawDigits.length - 20; i++) {
        const candidate = rawDigits.slice(i, i + 20);
        if (/^\d{20}$/.test(candidate)) found.add(candidate);
    }
    return [...found];
}

async function getDirectoryHandleByName(parentHandle, expectedName) {
    try {
        return await parentHandle.getDirectoryHandle(expectedName);
    } catch (e) {
        if (e.name !== 'NotFoundError') throw e;
    }

    for await (const entry of parentHandle.values()) {
        if (entry.kind === 'directory' && entry.name.toLowerCase() === expectedName.toLowerCase()) {
            return entry;
        }
    }

    throw new Error(`Pasta "${expectedName}" não encontrada dentro de "${parentHandle.name}".`);
}

async function* walkFilesRecursive(dirHandle, parentPath = '') {
    for await (const entry of dirHandle.values()) {
        const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
            yield { fileHandle: entry, path: currentPath };
            continue;
        }
        if (entry.kind === 'directory') {
            yield* walkFilesRecursive(entry, currentPath);
        }
    }
}

async function sincronizarRepositorio() {
    let repoHandle = await idb.get('repositorioDir');
    repoHandle = await verifyDirectoryPermission(repoHandle, 'REPOSITORIO');
    if (!repoHandle) {
        alert("Pasta REPOSITORIO não configurada ou sem permissão. Configure nas opções de sincronização.");
        openSyncSettingsModal();
        return;
    }

    let baseHandle = await idb.get('repositorioBaseDir');
    baseHandle = await verifyDirectoryPermission(baseHandle, 'pasta base da sincronização');

    if (!baseHandle) {
        updateUIStatus(true, 'Selecione a pasta base da sincronização...', 'warning');
        try {
            baseHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            baseHandle = await verifyDirectoryPermission(baseHandle, 'pasta base da sincronização');
            if (!baseHandle) {
                updateUIStatus(false, 'Permissão da pasta base não concedida.', 'danger');
                return;
            }
            await idb.set('repositorioBaseDir', baseHandle);
        } catch (e) {
            console.warn('Seleção da pasta base cancelada ou erro:', e);
            updateUIStatus(false, 'Sincronização cancelada (pasta base não selecionada).', 'warning');
            return;
        }
    }

    updateUIStatus(true, 'Sincronizando REPOSITORIO com MANUELA e LEANDRO-BAIXADOS...', 'warning');
    showToast('Mapeando arquivos do REPOSITORIO...', 0);

    try {
        const manuelaHandle = await getDirectoryHandleByName(baseHandle, 'MANUELA');
        const leandroHandle = await getDirectoryHandleByName(baseHandle, 'LEANDRO-BAIXADOS');

        const existingRepoCnjs = new Set();
        for await (const { path } of walkFilesRecursive(repoHandle, repoHandle.name)) {
            const cnjsInName = extractAnyCnjDigitsFromName(path.split('/').pop() || '');
            cnjsInName.forEach(cnj => existingRepoCnjs.add(cnj));
        }

        const sourceEntries = [];
        const sourceDirs = [
            { label: 'MANUELA', handle: manuelaHandle },
            { label: 'LEANDRO-BAIXADOS', handle: leandroHandle }
        ];

        for (const sourceDir of sourceDirs) {
            for await (const item of walkFilesRecursive(sourceDir.handle, sourceDir.label)) {
                if (!item.fileHandle.name.toLowerCase().endsWith('.pdf')) continue;
                sourceEntries.push(item);
            }
        }

        const total = sourceEntries.length;
        let processed = 0;
        let copiedCount = 0;
        let ignoredByRepoMatch = 0;
        let ignoredBySize = 0;
        let ignoredByNoCnj = 0;

        for (const item of sourceEntries) {
            processed++;
            const percent = total > 0 ? Math.floor((processed / total) * 100) : 100;
            updateToast(percent, `Analisando: ${item.path}`);

            const cnjDigitsList = extractPontuadoCnjDigitsFromName(item.fileHandle.name);
            if (cnjDigitsList.length === 0) {
                ignoredByNoCnj++;
                continue;
            }

            const sourceFile = await item.fileHandle.getFile();
            if (sourceFile.size <= MIN_REPOSITORIO_SYNC_FILE_SIZE) {
                ignoredBySize++;
                continue;
            }

            const cnjDigits = cnjDigitsList[0];
            if (existingRepoCnjs.has(cnjDigits)) {
                ignoredByRepoMatch++;
                continue;
            }

            const normalizedCnj = formatCnjFromDigits(cnjDigits);
            if (!normalizedCnj) {
                ignoredByNoCnj++;
                continue;
            }

            const normalizedName = `Integral_${normalizedCnj}.pdf`;
            const targetHandle = await repoHandle.getFileHandle(normalizedName, { create: true });
            const writable = await targetHandle.createWritable();
            await writable.write(sourceFile);
            await writable.close();

            existingRepoCnjs.add(cnjDigits);
            copiedCount++;
        }

        hideToast();
        updateUIStatus(true, `Sincronização concluída. ${copiedCount} copiados | ${ignoredByRepoMatch} já existiam por CNJ | ${ignoredBySize} ignorados por tamanho | ${ignoredByNoCnj} sem CNJ pontuado.`);
        alert(`Sincronização concluída.\nCopiados: ${copiedCount}\nIgnorados (CNJ já no REPOSITORIO): ${ignoredByRepoMatch}\nIgnorados (<=100KB): ${ignoredBySize}\nIgnorados (sem CNJ pontuado): ${ignoredByNoCnj}`);
    } catch (e) {
        console.error('Erro na sincronização do repositório:', e);
        hideToast();
        updateUIStatus(false, 'Erro ao sincronizar REPOSITORIO com pastas externas.', 'danger');
        alert(`Erro durante a sincronização: ${e.message || e}`);
    }
}

async function verificarArquivos() {
    if (!state.data || state.data.length === 0) {
        alert("Não há registros. Filtre ou carregue um banco primeiro.");
        return;
    }
    
    let repoHandle = await idb.get('repositorioDir');
    let vinculaHandle = await idb.get('vinculacaoDir');
    
    // Pede pasta/permissão
    const verifyDir = async (handle, name) => {
        if (handle) {
            const opts = { mode: 'readwrite' };
            try {
                const permission = await handle.queryPermission(opts);
                if (permission === 'granted') return handle;
                if (await handle.requestPermission(opts) === 'granted') return handle;
            } catch(e) {
                console.error(`Erro ao verificar permissão para ${name}:`, e);
            }
        }
        return null; // Retorna null se não tiver permissão ou handle
    };
    
    repoHandle = await verifyDir(repoHandle, "REPOSITORIO");
    vinculaHandle = await verifyDir(vinculaHandle, "VINCULACAO");

    if (!repoHandle || !vinculaHandle) {
        alert("As pastas de sincronia não estão configuradas ou não possuem permissão. Por favor, configure-as agora.");
        openSyncSettingsModal();
        return;
    }
    
    const statusDiv = document.getElementById('db-status').querySelector('span:last-child');
    const oldStatus = statusDiv.innerText;
    updateUIStatus(true, "Criando pastas do dia e escaneando PDFs...", "warning");
    
    // Criar pasta do dia "yyyy-mm-dd"
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const folderName = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    
    let todayHandle, baixadosHandle;
    try {
        todayHandle = await vinculaHandle.getDirectoryHandle(folderName, {create: true});
        baixadosHandle = await todayHandle.getDirectoryHandle('Baixados', {create: true});
        await todayHandle.getDirectoryHandle('Claro', {create: true});
        await todayHandle.getDirectoryHandle('Bradesco', {create: true});
        await todayHandle.getDirectoryHandle('Santander', {create: true});
    } catch(e) {
        console.error(e);
        updateUIStatus(false, "Erro ao criar estrutura de pastas diárias.", "danger");
        return;
    }
    
    // Filtramos os puros números de processo longos da tela atual
    const filteredData = getFilteredAndSortedData();
    const idxProc = state.originalHeaders.indexOf('Núm Proc');
    
    const procMap = {};
    filteredData.forEach(r => {
        const procFormatted = String(r[idxProc] || '').trim();
        const digits = procFormatted.replace(/\D/g, '');
        if (digits.length >= 6) {
            procMap[digits] = procFormatted;
        }
    });
    
    const procsKeys = Object.keys(procMap);
    
    if (procsKeys.length === 0) {
        updateUIStatus(true, "Pastas criadas. Nenhum Proc longo o suficiente na tela para buscar PDFs.");
        setTimeout(() => updateUIStatus(true, oldStatus), 4000);
        return;
    }

    showToast("Escaneando Repositório...", 0);

    // Build a map: procDigits -> id_registro (to be able to update arquivos column)
    const idxId = state.columns.indexOf('id_registro');
    const procToIds = {};
    filteredData.forEach(r => {
        const procFormatted = String(r[idxProc] || '').trim();
        const digits = procFormatted.replace(/\D/g, '');
        if (digits.length >= 6) {
            procToIds[digits] = r[idxId];
        }
    });

    let copiedCount = 0;
    // Map: procDigits -> Set of filenames
    const procToFiles = {};

    try {
        // 1. ESCANEAR PASTA BAIXADOS PRIMEIRO (para detectar arquivos manuais ou de rodadas anteriores)
        updateUIStatus(true, "Escaneando pasta Baixados...", "warning");
        for await (const entry of baixadosHandle.values()) {
            if (entry.kind === 'file') {
                const nameDigits = entry.name.replace(/\D/g, '');
                // any process digit from our list that is contained in this filename
                const matchedDigits = procsKeys.find(p => nameDigits.includes(p));
                if (matchedDigits) {
                    if (!procToFiles[matchedDigits]) procToFiles[matchedDigits] = new Set();
                    procToFiles[matchedDigits].add(entry.name);
                }
            }
        }

        // 2. ESCANEAR REPOSITÓRIO E COPIAR APENAS O QUE NÃO EXISTE
        showToast("Escaneando Repositório...", 0);
        const repoFiles = [];
        for await (const entry of repoHandle.values()) {
            if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
                repoFiles.push(entry);
            }
        }

        const totalFiles = repoFiles.length;
        let processedFiles = 0;

        for (const entry of repoFiles) {
            processedFiles++;
            const percent = Math.floor((processedFiles / totalFiles) * 100);
            updateToast(percent, `Verificando: ${entry.name}`);

            const nameDigits = entry.name.replace(/\D/g, '');
            const matchedDigits = procsKeys.find(p => nameDigits.includes(p));

            if (matchedDigits) {
                // SÓ copia se ainda não tivermos NENHUM arquivo para esse processo na pasta Baixados
                if (!procToFiles[matchedDigits] || procToFiles[matchedDigits].size === 0) {
                    updateToast(percent, `Processando: ${entry.name}`);
                    const procObj = procMap[matchedDigits];
                    const safeProcName = procObj.replace(/[<>:"/\\|?*]/g, '');
                    const newFileName = `Integral_${safeProcName}.pdf`;

                    updateToast(percent, `Copiando: ${newFileName}`);
                    const sourceFile = await entry.getFile();
                    const targetHandle = await baixadosHandle.getFileHandle(newFileName, {create: true});
                    const writable = await targetHandle.createWritable();
                    await writable.write(sourceFile);
                    await writable.close();
                    
                    copiedCount++;
                    if (!procToFiles[matchedDigits]) procToFiles[matchedDigits] = new Set();
                    procToFiles[matchedDigits].add(newFileName);
                }
            }
        }

        // 3. ATUALIZAR BANCO DE DADOS
        const arquivosColIdx = state.columns.indexOf('arquivos');
        let updatedArquivosCount = 0;
        state.db.run("BEGIN TRANSACTION");
        
        // Percorremos todos os processos da tela
        for (const digits of procsKeys) {
            const idRegistro = procToIds[digits];
            const filesSet = procToFiles[digits];
            const fileList = filesSet ? Array.from(filesSet).join(';') : "";
            
            // Pega o valor atual para comparar e ver se mudou
            const dataRowIndex = state.data.findIndex(r => r[idxId] === idRegistro);
            const currentFiles = dataRowIndex > -1 ? String(state.data[dataRowIndex][arquivosColIdx] || "") : "";

            if (idRegistro && fileList !== currentFiles) {
                state.db.run(`UPDATE registros SET arquivos = ? WHERE id_registro = ?`, [fileList, idRegistro]);
                if (dataRowIndex > -1) state.data[dataRowIndex][arquivosColIdx] = fileList;
                updatedArquivosCount++;
            }
        }
        state.db.run("COMMIT");

        if (updatedArquivosCount > 0) {
            await persistDatabase();
            loadDataAndRender();
        }

        updateUIStatus(true, `Sincronia concluída. ${copiedCount} PDFs novos copiados, ${updatedArquivosCount} registros com arquivos atualizados.`);
        hideToast();
        if (copiedCount > 0) alert(`${copiedCount} PDFs movidos para ${folderName}/Baixados com sucesso!\n${updatedArquivosCount} registros atualizados.`);
    } catch(e) {
        console.error("Scanning Error:", e);
        hideToast();
        updateUIStatus(false, "Erro de permissão ou leitura de arquivos durante a verificação.", "danger");
    }
}

// Lógica de Cópias Especializadas (Bancos)
async function copiarParaPasta(banco) {
    let vinculaHandle = await idb.get('vinculacaoDir');
    if (!vinculaHandle) {
        alert("Pasta de Vinculação não configurada. Use 'Verificar Arquivos' primeiro.");
        return;
    }
    
    const opLabel = banco === 'claro' ? 'Movimentando' : 'Copiando';
    updateUIStatus(true, `${opLabel} de Baixados para ${banco.toUpperCase()}...`, "warning");
    
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const folderName = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    
    let todayHandle, baixadosHandle, destHandle;
    try {
        todayHandle = await vinculaHandle.getDirectoryHandle(folderName);
        baixadosHandle = await todayHandle.getDirectoryHandle('Baixados');
        
        const folderMap = { 'santander': 'Santander', 'claro': 'Claro', 'bradesco': 'Bradesco' };
        destHandle = await todayHandle.getDirectoryHandle(folderMap[banco]);
    } catch(e) {
        alert(`A subpasta necessária em ${folderName} não foi encontrada. Rode 'Verificar Arquivos' primeiro.`);
        updateUIStatus(false, "Cancelado.");
        return;
    }
    
    const idxProc = state.originalHeaders.indexOf('Núm Proc');
    const idxCarteira = state.originalHeaders.indexOf('carteira');
    const idxPastaCli = state.originalHeaders.indexOf('Núm Cli');
    
    const filteredData = getFilteredAndSortedData();
    
    const targetRows = filteredData.filter(r => {
        const carteira = String(r[idxCarteira] || '').trim().toLowerCase();
        if (banco === 'santander') return carteira.includes('santander');
        if (banco === 'claro') return carteira.includes('claro');
        if (banco === 'bradesco') {
            return carteira === 'indenizatória' || carteira === 'indenizatoria' || carteira.includes('bradesco');
        }
        return false;
    });
    
    if (targetRows.length === 0) {
        alert(`Nenhum processo com carteira compatível com ${banco.toUpperCase()} nas linhas filtradas na tela.`);
        updateUIStatus(true, "Operação cancelada (nenhum caso).");
        return;
    }
    
    const procMap = {};
    targetRows.forEach(r => {
        const digits = String(r[idxProc] || '').replace(/\D/g, '');
        if (digits.length >= 6) {
            if (!procMap[digits]) procMap[digits] = [];
            procMap[digits].push({
                pastaCliente: r[idxPastaCli] || 'SEM_PASTA'
            });
        }
    });

    let copiedCount = 0;
    try {
        const baixadosFiles = [];
        for await (const entry of baixadosHandle.values()) {
            if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
                baixadosFiles.push(entry);
            }
        }

        const totalFiles = baixadosFiles.length;
        let processedFiles = 0;
        showToast(`${opLabel} para ${banco.toUpperCase()}...`, 0);

        for (const entry of baixadosFiles) {
            processedFiles++;
            const percent = Math.floor((processedFiles / totalFiles) * 100);
            updateToast(percent, `Verificando: ${entry.name}`);

            const nameDigits = entry.name.replace(/\D/g, '');
                const matchedProc = Object.keys(procMap).find(pDigits => nameDigits.includes(pDigits));
                
                if (matchedProc) {
                    const rowInfo = procMap[matchedProc][0];
                    
                    try {
                        await destHandle.getFileHandle(entry.name);
                        // Se for Claro e já existe no destino, removemos da origem para completar o "Mover"
                        if (banco === 'claro') {
                            await baixadosHandle.removeEntry(entry.name);
                            copiedCount++;
                        }
                    } catch (e) {
                        if (e.name === 'NotFoundError') {
                            updateToast(percent, `Copiando: ${entry.name}`);
                            const sourceFile = await entry.getFile();
                            const targetHandle = await destHandle.getFileHandle(entry.name, {create: true});
                            const writable = await targetHandle.createWritable();
                            await writable.write(sourceFile);
                            await writable.close();
                            copiedCount++;
                            
                            if (banco === 'claro') {
                                try {
                                    await baixadosHandle.removeEntry(entry.name);
                                } catch(err) { console.error("Erro ao remover original:", err); }
                            }
                        }
                    }
                    
                    if (banco === 'bradesco') {
                        const newName = `INICIAL ${rowInfo.pastaCliente}.pdf`;
                        try {
                            await destHandle.getFileHandle(newName);
                        } catch(e) {
                            if (e.name === 'NotFoundError') {
                                const sourceFile = await entry.getFile();
                                const targetHandle = await destHandle.getFileHandle(newName, {create: true});
                                const writable = await targetHandle.createWritable();
                                await writable.write(sourceFile);
                                await writable.close();
                            }
                        }
                }
            }
        }
        updateUIStatus(true, `Operação concluída em ${banco.toUpperCase()}. Total: ${copiedCount} arquivos.`);
        hideToast();
    } catch(e) {
        console.error(e);
        hideToast();
        updateUIStatus(false, "Erro durante a cópia de arquivos.", "danger");
    }
}



// Global datalists generator for Comboboxes
function updateDatalists() {
    if (!state.data) return;
    
    // Index 3 corresponds to 'Observação' (was index 1)
    const obsValues = [...new Set(state.data.map(r => r[3]))].filter(v => v && String(v).trim() !== "");
    
    // An empty disabled option guarantees the select shows just the down arrow visually
    const optionsHTML = `<option value="" disabled selected hidden></option>` + 
        obsValues.map(v => `<option value="${String(v).replace(/"/g, '&quot;')}">${v}</option>`).join('');
    
    document.querySelectorAll('.obs-combo').forEach(sel => {
        sel.innerHTML = optionsHTML;
    });
}

// --- Excel-like Cell Selection & Copy-Paste ---
let isSelecting = false;
let selectionStart = null;
let selectionEnd = null;

function clearSelection() {
    document.querySelectorAll('.cell-selected').forEach(td => td.classList.remove('cell-selected'));
    selectionStart = null;
    selectionEnd = null;
}

function updateSelection() {
    if (!selectionStart || !selectionEnd) return;
    
    document.querySelectorAll('.cell-selected').forEach(td => td.classList.remove('cell-selected'));
    
    const startRow = Math.min(selectionStart.row, selectionEnd.row);
    const endRow = Math.max(selectionStart.row, selectionEnd.row);
    const startCol = Math.min(selectionStart.col, selectionEnd.col);
    const endCol = Math.max(selectionStart.col, selectionEnd.col);
    
    const tbody = document.getElementById('table-body');
    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            const td = tbody.querySelector(`td[data-vrow="${r}"][data-vcol="${c}"]`);
            if (td) {
                td.classList.add('cell-selected');
            }
        }
    }
}

// Mouse events for selection
const tableBody = document.getElementById('table-body');
tableBody.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    
    const td = e.target.closest('td');
    if (!td || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (td.classList.contains('editing')) return;

    // Start selection
    isSelecting = true;
    document.body.classList.add('is-grid-selecting');
    window.getSelection().removeAllRanges();
    
    const r = parseInt(td.dataset.vrow);
    const c = parseInt(td.dataset.vcol);
    selectionStart = { row: r, col: c };
    selectionEnd = { row: r, col: c };
    
    updateSelection();
});

tableBody.addEventListener('mouseover', (e) => {
    if (!isSelecting) return;
    const td = e.target.closest('td');
    if (!td) return;
    
    const r = parseInt(td.dataset.vrow);
    const c = parseInt(td.dataset.vcol);
    
    if (selectionEnd && selectionEnd.row === r && selectionEnd.col === c) return;
    
    selectionEnd = { row: r, col: c };
    updateSelection();
});

document.addEventListener('mouseup', () => {
    isSelecting = false;
    document.body.classList.remove('is-grid-selecting');
});

// Hide context menu on global click
document.addEventListener('click', (e) => {
    if (e.button === 0 && !e.target.closest('.custom-context-menu')) {
        document.getElementById('custom-context-menu').style.display = 'none';
    }
});


function exportarVinculacao() {
    if (!state.data || state.data.length === 0) {
        alert("Não há dados para exportar.");
        return;
    }
    const exportData = getFilteredAndSortedData();
    if (exportData.length === 0) {
        alert("Não há dados no filtro atual para exportar.");
        return;
    }

    exportVinculacaoXLSX(exportData);
}

function rowColorHexToXlsx(hexColor) {
    if (!hexColor || hexColor === 'transparent') return null;
    return hexColor.replace('#', '').toUpperCase();
}

function exportVinculacaoXLSX(exportData) {
    const columns = [
        { header: 'ID Reg.', key: 'id_registro' },
        { header: 'Vinculado', key: 'vinculado' },
        { header: 'Observação', key: 'observacao' },
        { header: 'Arquivos', key: 'arquivos' },
        { header: 'carteira', key: 'carteira' },
        { header: 'Núm Proc', key: 'num_processo' },
        { header: 'Núm Cli', key: 'pasta_cliente' },
        { header: 'Estado', key: 'uf' },
        { header: 'Pasta', key: 'pasta_iris' },
        { header: 'Executor', key: 'executor' }
    ];

    const headers = columns.map(c => c.header);
    const mappedRows = exportData.map(row => {
        return columns.map(c => {
            const idx = state.columns.indexOf(c.key);
            return idx > -1 ? (row[idx] || "") : "";
        });
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...mappedRows]);
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: mappedRows.length } }) };
    ws['!cols'] = headers.map((_, i) => {
        const contentLengths = mappedRows.map(r => String(r[i] || '').length);
        const maxLen = Math.max(headers[i].length, ...contentLengths);
        return { wch: Math.min(Math.max(maxLen + 2, 12), 45) };
    });

    headers.forEach((_, c) => {
        const cell = ws[XLSX.utils.encode_cell({ c, r: 0 })];
        if (cell) {
            cell.s = {
                font: { bold: true, color: { rgb: 'FFFFFF' } },
                fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } }
            };
        }
    });

    exportData.forEach((row, rowIndex) => {
        const highlight = rowColorHexToXlsx(getRowHighlightColor(row));
        if (!highlight) return;
        for (let c = 0; c < headers.length; c++) {
            const cell = ws[XLSX.utils.encode_cell({ c, r: rowIndex + 1 })];
            if (cell) {
                cell.s = {
                    fill: { patternType: 'solid', fgColor: { rgb: highlight } }
                };
            }
        }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vinculacao");

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dataHoraStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    XLSX.writeFile(wb, `Vinculacao_Export_${dataHoraStr}.xlsx`);
}

// Teclas de Atalho (Cópia e Exclusão)
document.addEventListener('keydown', (e) => {
    // Ctrl+C (Cópia)
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selectedCells = document.querySelectorAll('.cell-selected');
        // Ignora se houver texto selecionado nativamente pelo usuário (ex: dentro de um input ou texto solto)
        if (selectedCells.length === 0 || window.getSelection().toString().trim().length > 0) return;
        
        // Se estiver num input que NÃO seja o nosso bridge de paste, deixa o copy normal
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') && document.activeElement.id !== 'hidden-paste-bridge') return;
        
        e.preventDefault();
        
        const rowMap = new Map();
        selectedCells.forEach(td => {
            const r = parseInt(td.dataset.vrow);
            if (!rowMap.has(r)) rowMap.set(r, []);
            rowMap.get(r).push(td);
        });
        
        const sortedRows = Array.from(rowMap.keys()).sort((a,b) => a - b);
        let tsvOutput = "";
        let htmlOutput = '<html><body><table style="border-collapse: collapse; font-family: sans-serif;">';
        
        sortedRows.forEach(r => {
            const rowCells = rowMap.get(r).sort((a, b) => parseInt(a.dataset.vcol) - parseInt(b.dataset.vcol));
            tsvOutput += rowCells.map(td => td.innerText.replace(/\t/g, ' ')).join("\t") + "\n";
            htmlOutput += "<tr>";
            rowCells.forEach(td => {
                // Captura a cor de fundo real (pode estar no TD ou no TR pai)
                let style = window.getComputedStyle(td);
                let bgColor = style.backgroundColor;
                if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
                    bgColor = window.getComputedStyle(td.parentElement).backgroundColor;
                }
                
                htmlOutput += `<td style="background-color: ${bgColor}; border: 1px solid #ccc; padding: 4px; color: #000; min-width: 100px;">${td.innerText}</td>`;
            });
            htmlOutput += "</tr>";
        });
        htmlOutput += "</table></body></html>";

        // Tenta Clipboard API moderna primeiro
        if (navigator.clipboard && navigator.clipboard.write) {
            try {
                const clipboardItem = new ClipboardItem({
                    'text/plain': new Blob([tsvOutput.trim()], { type: 'text/plain' }),
                    'text/html': new Blob([htmlOutput], { type: 'text/html' })
                });
                navigator.clipboard.write([clipboardItem]).then(() => {
                    console.log("Copiado com Clipboard API");
                }).catch(err => {
                    console.warn("Falha ao usar Clipboard API, usando fallback:", err);
                    fallbackCopy(tsvOutput);
                });
            } catch (err) {
                fallbackCopy(tsvOutput);
            }
        } else {
            fallbackCopy(tsvOutput);
        }
    }

    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text.trim();
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try { 
            const successful = document.execCommand('copy');
            if (successful) console.log("Copiado com execCommand");
        } catch(err) {
            console.error("Erro fatal ao copiar:", err);
        }
        document.body.removeChild(textarea);
    }

    // Delete / Backspace (Limpar Células)
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedCells = document.querySelectorAll('.cell-selected');
        if (selectedCells.length === 0) return;
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.isContentEditable)) return;

        e.preventDefault();
        let needsReRender = false;
        state.db.run("BEGIN TRANSACTION");
        selectedCells.forEach(td => {
            const idRegistro = td.dataset.idregistro;
            const colName = td.dataset.dbname;
            if (!idRegistro || !colName) return;

            state.db.run(`UPDATE registros SET ${colName} = ? WHERE id_registro = ?`, ["", idRegistro]);
            const colIdx = state.columns.indexOf(colName);
            const dataRowIndex = state.data.findIndex(r => r[0] === idRegistro);
            if (dataRowIndex > -1) state.data[dataRowIndex][colIdx] = "";
            td.innerText = "";
            if (colName === 'observacao' || colName === 'arquivos' || colName === 'carteira') needsReRender = true;
        });
        state.db.run("COMMIT");
        (async () => {
            await persistDatabase();
            if (needsReRender) loadDataAndRender();
            else updateDatalists();
        })();
    }
});

// Paste Context Menu Logic
let pasteTargetCell = null;

// --- Listener de paste no textarea oculto (menu nativo do browser) ---
// Estratégia para file://: foca o textarea oculto no contextmenu
// para que o "Colar" nativo do browser funcione sem precisar de Ctrl+V extra.
const hiddenPasteBridge = document.getElementById('hidden-paste-bridge');

hiddenPasteBridge.addEventListener('paste', async (ev) => {
    ev.preventDefault();
    hiddenPasteBridge.style.display = 'none';
    hiddenPasteBridge.value = '';
    
    const text = (ev.clipboardData || window.clipboardData).getData('text');
    if (text && pasteTargetCell) {
        const count = await performPaste(pasteTargetCell, text);
        if (count === 0) {
            showToast('ℹ️ Nenhuma célula alterada (valores já eram idênticos).');
        } else {
            showToast(`✅ ${count} célula(s) colada(s) com sucesso!`);
        }
    }
});

tableBody.addEventListener('contextmenu', (e) => {
    const td = e.target.closest('td');
    // Permite menu default fora de células ou em inputs
    if (!td || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    // Salva a célula alvo
    pasteTargetCell = td;
    
    // Foca o textarea oculto ANTES do menu aparecer.
    // Assim o browser habilita a opção "Colar" no menu nativo,
    // e quando o usuário clica nela, o evento paste dispara no textarea.
    hiddenPasteBridge.value = '';
    hiddenPasteBridge.style.display = 'block';
    hiddenPasteBridge.focus();
    
    // NÃO chama e.preventDefault() — deixa o menu nativo do browser aparecer
    
    // Cleanup: se o usuário não colar, esconde o textarea após o menu fechar ou perder foco
    const hideBridge = () => {
        hiddenPasteBridge.style.display = 'none';
        document.removeEventListener('click', hideBridge);
        hiddenPasteBridge.removeEventListener('blur', hideBridge);
    };
    document.addEventListener('click', hideBridge, { once: true, capture: true });
    hiddenPasteBridge.addEventListener('blur', hideBridge, { once: true });
});

async function performPaste(pasteTargetCell, text) {
    if (!text) return 0;
    
    // Suporte para \r\n (Windows), \n (Linux/Mac) e \r (Mac antigo)
    const rows = text.split(/\r\n|\n|\r/).filter(r => r.trim() !== '');
    if (rows.length === 0) return 0;
    
    const tbody = document.getElementById('table-body');
    let needsSave = false;
    let pastedCellsCount = 0;
    
    // Verifica se é uma colagem de VALOR ÚNICO em MÚLTIPLAS CÉLULAS (estilo Excel Fill)
    const selectedCells = document.querySelectorAll('.cell-selected');
    const isSingleValue = (rows.length === 1 && rows[0].split('\t').length === 1);
    
    if (isSingleValue && selectedCells.length > 1) {
        // MODO PREENCHIMENTO: Aplica o valor único em todas as células selecionadas
        const singleValue = rows[0].trim();
        for (const targetTd of selectedCells) {
            const idRegistro = targetTd.dataset.idregistro;
            const dbName = targetTd.dataset.dbname;
            const currentVal = targetTd.innerText;
            
            let didChange = false;
            if (singleValue !== currentVal) {
                try {
                    state.db.run(`UPDATE registros SET "${dbName}" = ? WHERE id_registro = ?`, [singleValue, idRegistro]);
                    targetTd.innerText = singleValue;
                    needsSave = true;
                    pastedCellsCount++;
                    didChange = true;
                    
                    const dataRowIndex = state.data.findIndex(r => r[0] === idRegistro);
                    if (dataRowIndex > -1) {
                        const dbColIdx = state.columns.indexOf(dbName);
                        state.data[dataRowIndex][dbColIdx] = singleValue;
                    }
                    
                    if (dbName === 'status') {
                        if (state.statusColors[singleValue]) {
                            targetTd.parentElement.style.setProperty('--status-color', state.statusColors[singleValue]);
                        } else {
                            targetTd.parentElement.style.setProperty('--status-color', 'transparent');
                        }
                    }
                } catch (err) {
                    console.error("Paste Error updating DB:", err);
                    alert(`Erro ao salvar no banco (Coluna: ${dbName}): ` + err.message);
                }
            }
            
            const originalBg = targetTd.style.backgroundColor;
            targetTd.style.backgroundColor = didChange ? 'rgba(76, 175, 80, 0.3)' : 'rgba(200, 200, 200, 0.4)';
            setTimeout(() => { targetTd.style.backgroundColor = originalBg; }, 800);
        }
    } else {
        // MODO BLOCO: Cola o bloco a partir da célula alvo para baixo/direita
        const startRowIdx = parseInt(pasteTargetCell.dataset.vrow);
        const startColIdx = parseInt(pasteTargetCell.dataset.vcol);
        
        for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].split('\t');
            for (let j = 0; j < cells.length; j++) {
                const targetRow = startRowIdx + i;
                const targetCol = startColIdx + j;
                
                const targetTd = tbody.querySelector(`td[data-vrow="${targetRow}"][data-vcol="${targetCol}"]`);
                if (targetTd) {
                    const idRegistro = targetTd.dataset.idregistro;
                    const dbName = targetTd.dataset.dbname;
                    const newVal = cells[j].trim();
                    const currentVal = targetTd.innerText;
                    
                    let didChange = false;
                    if (newVal !== currentVal) {
                        try {
                            state.db.run(`UPDATE registros SET "${dbName}" = ? WHERE id_registro = ?`, [newVal, idRegistro]);
                            targetTd.innerText = newVal;
                            needsSave = true;
                            pastedCellsCount++;
                            didChange = true;
                            
                            const dataRowIndex = state.data.findIndex(r => r[0] === idRegistro);
                            if (dataRowIndex > -1) {
                                const dbColIdx = state.columns.indexOf(dbName);
                                state.data[dataRowIndex][dbColIdx] = newVal;
                            }
                            
                            if (dbName === 'status') {
                                if (state.statusColors[newVal]) {
                                    targetTd.parentElement.style.setProperty('--status-color', state.statusColors[newVal]);
                                } else {
                                    targetTd.parentElement.style.setProperty('--status-color', 'transparent');
                                }
                            }
                        } catch (err) {
                            console.error("Paste Error updating DB:", err);
                            alert(`Erro ao salvar no banco (Coluna: ${dbName}): ` + err.message);
                        }
                    }
                    
                    const originalBg = targetTd.style.backgroundColor;
                    targetTd.style.backgroundColor = didChange ? 'rgba(76, 175, 80, 0.3)' : 'rgba(200, 200, 200, 0.4)';
                    setTimeout(() => { targetTd.style.backgroundColor = originalBg; }, 800);
                }
            }
        }
    }
    
    if (needsSave) {
        await persistDatabase();
        updateDatalists(); 
    }
    return pastedCellsCount;
}

// Notificação flutuante não-bloqueante (substitui alert)
function showToast(msg, durationMs = 3000) {
    let toast = document.getElementById('paste-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'paste-toast';
        toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: var(--shell-surface, #1e293b); color: var(--shell-text, #e2e8f0); padding: 10px 20px;
            border-radius: 8px; font-size: 14px; z-index: 99999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: opacity 0.3s;
            pointer-events: none; white-space: nowrap;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, durationMs);
}






document.addEventListener('paste', async (e) => {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'TEXTAREA')) return;

    
    let targetTd = pasteTargetCell;
    const selectedCells = document.querySelectorAll('.cell-selected');
    if (selectedCells.length > 0) {
        targetTd = selectedCells[0]; 
    }
    
    if (!targetTd) {
        // Ignora e deixa o paste normal acontecer caso não haja célula da grade selecionada
        return;
    }
    
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text) {
        e.preventDefault();
        const count = await performPaste(targetTd, text);
        if (count === 0) {
            alert("Aviso: As informações coladas com Ctrl+V são *idênticas* ao que já estava nestas células. Veja-as piscando em cinza na tela.");
        }
    }
});
// Toast Notification System
window.showToast = function(title, percent = 0) {
    const container = document.getElementById('toast-container');
    container.innerHTML = `
        <div class="toast" id="active-toast">
            <div class="toast-header">
                <span class="toast-title">${title}</span>
                <span class="toast-percent" id="toast-percent">${percent}%</span>
            </div>
            <div class="toast-progress">
                <div class="toast-bar" id="toast-bar" style="width: ${percent}%"></div>
            </div>
        </div>
    `;
};

window.updateToast = function(percent, title) {
    const bar = document.getElementById('toast-bar');
    const pctLabel = document.getElementById('toast-percent');
    if (bar) bar.style.width = `${percent}%`;
    if (pctLabel) pctLabel.innerText = `${percent}%`;
    if (title) {
        const titleEl = document.querySelector('.toast-title');
        if (titleEl) titleEl.innerText = title;
    }
};

window.hideToast = function(delay = 2000) {
    setTimeout(() => {
        const toast = document.getElementById('active-toast');
        if (toast) {
            toast.style.animation = 'toast-in 0.3s reverse forwards';
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                if (container) container.innerHTML = '';
            }, 300);
        }
    }, delay);
};
