const GANTOYS = {
    currentToy: null,
    toyStates: {},

    init() {
        this.persistThemePayload();
        this.setupOrbMotion();
        window.addEventListener('beforeunload', () => {
            this.persistCurrentToyState();
        });
    },

    setupOrbMotion() {
        const orb = document.getElementById('bgOrb');
        if (!orb) return;

        orb.style.setProperty('--orb-x', '50vw');
        orb.style.setProperty('--orb-y', '50vh');
    },

    ensurePdfWorker() {
        try {
            if (window.__ganPdfWorkerUrl) return window.__ganPdfWorkerUrl;
            const b64 = window.GANTOYS_PDF_WORKER_B64;
            if (!b64) return null;
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            window.__ganPdfWorkerUrl = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
            return window.__ganPdfWorkerUrl;
        } catch (error) {
            console.warn('Cannot create bundled PDF worker:', error);
            return null;
        }
    },

    loadToy(toyName) {
        if (this.currentToy && this.currentToy !== toyName) {
            this.saveState(this.currentToy);
        }

        this.currentToy = toyName;

        const toyFrame = document.getElementById('toyFrame');
        if (!toyFrame) return;

        toyFrame.innerHTML = `<iframe class="toy-iframe" id="toyIframe" allow="clipboard-read *; clipboard-write *"></iframe>`;

        const iframe = document.getElementById('toyIframe');
        this.persistThemePayload();
        this.ensurePdfWorker();

        const bundled = (window.GANTOYS_TOYS && window.GANTOYS_TOYS[toyName]) || null;
        if (bundled) {
            iframe.srcdoc = bundled;
        } else {
            iframe.src = `toys/${toyName}/index.html`;
        }

        iframe.addEventListener('load', () => {
            this.injectThemeStyles(iframe);
            this.restoreState(toyName);
        });
    },

    injectThemeStyles(iframe) {
        const theme = document.documentElement.getAttribute('data-theme');
        const visual = document.documentElement.getAttribute('data-visual');
        const css = this.getThemeCSS(theme, visual);

        this.persistThemePayload(theme, visual, css);

        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc.head) return;

            const html = doc.documentElement;

            html.setAttribute('data-theme', theme);
            html.setAttribute('data-visual', visual);

            const existingStyle = doc.getElementById('gantoys-theme-inject');
            if (existingStyle) existingStyle.remove();

            const style = doc.createElement('style');
            style.id = 'gantoys-theme-inject';
            style.textContent = css;
            doc.head.appendChild(style);
        } catch (e) {
            console.warn('Cannot inject styles:', e);
        }

        try {
            const win = iframe.contentWindow;
            if (win && win.postMessage) {
                win.postMessage({ type: 'theme', theme: theme, visual: visual, css: css }, '*');
            }
        } catch (e) {
            console.warn('Cannot sync theme message:', e);
        }
    },

    persistThemePayload(theme = document.documentElement.getAttribute('data-theme'), visual = document.documentElement.getAttribute('data-visual'), css = null) {
        try {
            const resolvedTheme = theme === 'light' ? 'light' : 'dark';
            const resolvedVisual = visual || 'glassmorphism';
            const resolvedCss = css || this.getThemeCSS(resolvedTheme, resolvedVisual);

            localStorage.setItem('theme', resolvedTheme);
            localStorage.setItem('visual', resolvedVisual);
            localStorage.setItem('gantoys_theme_css', resolvedCss);
        } catch (e) {
            console.warn('Cannot persist theme payload:', e);
        }
    },

    getThemeCSS(theme, visual) {
        const visualThemes = {
            glassmorphism: {
                dark: {
                    body: "#2a2a2e",
                    surface: "rgba(50, 50, 55, 0.72)",
                    surfaceSolid: "#323237",
                    border: "rgba(255, 255, 255, 0.10)",
                    text: "#e8e8ec",
                    textSecondary: "#a0a0a8",
                    shadowLight: "rgba(255, 255, 255, 0.05)",
                    shadowDark: "rgba(0, 0, 0, 0.45)",
                    blur: "20px",
                    cardShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
                    hardShadow: "3px 3px 0 #FFFFFF"
                },
                light: {
                    body: "#d4d8e0",
                    surface: "rgba(255, 255, 255, 0.70)",
                    surfaceSolid: "#ffffff",
                    border: "rgba(0, 0, 0, 0.10)",
                    text: "#2a2a30",
                    textSecondary: "#5a5a65",
                    shadowLight: "rgba(255, 255, 255, 0.85)",
                    shadowDark: "rgba(0, 0, 0, 0.12)",
                    blur: "15px",
                    cardShadow: "0 8px 24px rgba(0, 0, 0, 0.10)",
                    hardShadow: "3px 3px 0 #000000"
                }
            },
            neumorphism: {
                dark: {
                    body: "#2D2D2D",
                    surface: "#2D2D2D",
                    surfaceSolid: "#2D2D2D",
                    border: "transparent",
                    text: "#e8e8ec",
                    textSecondary: "#a0a0a8",
                    shadowLight: "#404040",
                    shadowDark: "#1a1a1a",
                    blur: "0px",
                    cardShadow: "8px 8px 16px #1a1a1a, -8px -8px 16px #404040",
                    hardShadow: "3px 3px 0 #FFFFFF"
                },
                light: {
                    body: "#E0E0E0",
                    surface: "#E0E0E0",
                    surfaceSolid: "#E0E0E0",
                    border: "transparent",
                    text: "#1a1a1a",
                    textSecondary: "#5a5a5a",
                    shadowLight: "#FFFFFF",
                    shadowDark: "#BEBEBE",
                    blur: "0px",
                    cardShadow: "8px 8px 16px #BEBEBE, -8px -8px 16px #FFFFFF",
                    hardShadow: "3px 3px 0 #000000"
                }
            },
            neobrutalism: {
                dark: {
                    body: "#1a1a1a",
                    surface: "#2D2D2D",
                    surfaceSolid: "#2D2D2D",
                    border: "#FFFFFF",
                    text: "#F5F5F5",
                    textSecondary: "#B0B0B0",
                    shadowLight: "#4a4a4a",
                    shadowDark: "#0f0f0f",
                    blur: "0px",
                    cardShadow: "4px 4px 0px #FFFFFF",
                    hardShadow: "4px 4px 0 #FFFFFF"
                },
                light: {
                    body: "#F5F5F5",
                    surface: "#FFFFFF",
                    surfaceSolid: "#FFFFFF",
                    border: "#000000",
                    text: "#1a1a1a",
                    textSecondary: "#5a5a5a",
                    shadowLight: "#FFFFFF",
                    shadowDark: "#C7C7C7",
                    blur: "0px",
                    cardShadow: "4px 4px 0px #000000",
                    hardShadow: "4px 4px 0 #000000"
                }
            },
            material: {
                dark: {
                    body: "#121212",
                    surface: "#1E1E1E",
                    surfaceSolid: "#1E1E1E",
                    border: "rgba(255, 255, 255, 0.12)",
                    text: "#e8e8ec",
                    textSecondary: "#a0a0a8",
                    shadowLight: "rgba(255, 255, 255, 0.04)",
                    shadowDark: "rgba(0, 0, 0, 0.40)",
                    blur: "0px",
                    cardShadow: "0 2px 10px rgba(0, 0, 0, 0.35)",
                    hardShadow: "3px 3px 0 #FFFFFF"
                },
                light: {
                    body: "#F5F5F5",
                    surface: "#FFFFFF",
                    surfaceSolid: "#FFFFFF",
                    border: "rgba(0, 0, 0, 0.10)",
                    text: "#212121",
                    textSecondary: "#757575",
                    shadowLight: "rgba(255, 255, 255, 0.80)",
                    shadowDark: "rgba(0, 0, 0, 0.15)",
                    blur: "0px",
                    cardShadow: "0 2px 10px rgba(0, 0, 0, 0.12)",
                    hardShadow: "3px 3px 0 #000000"
                }
            },
            claymorphism: {
                dark: {
                    body: "#2C2825",
                    surface: "#363230",
                    surfaceSolid: "#363230",
                    border: "rgba(255, 255, 255, 0.06)",
                    text: "#E8E2DC",
                    textSecondary: "#A0948C",
                    shadowLight: "rgba(80, 72, 66, 0.3)",
                    shadowDark: "rgba(0, 0, 0, 0.4)",
                    blur: "0px",
                    cardShadow: "8px 8px 20px rgba(0, 0, 0, 0.4), -4px -4px 16px rgba(80, 72, 66, 0.3)",
                    hardShadow: "3px 3px 0 #FFFFFF"
                },
                light: {
                    body: "#E8E0D9",
                    surface: "#F2EBE7",
                    surfaceSolid: "#F2EBE7",
                    border: "rgba(139, 119, 101, 0.15)",
                    text: "#3D3632",
                    textSecondary: "#7A706A",
                    shadowLight: "rgba(255, 255, 255, 0.8)",
                    shadowDark: "rgba(139, 119, 101, 0.25)",
                    blur: "0px",
                    cardShadow: "8px 8px 20px rgba(139, 119, 101, 0.25), -4px -4px 16px rgba(255, 255, 255, 0.8)",
                    hardShadow: "3px 3px 0 #000000"
                }
            },
            japandi: {
                dark: {
                    body: "#1A1816",
                    surface: "#242120",
                    surfaceSolid: "#242120",
                    border: "rgba(255, 255, 255, 0.08)",
                    text: "#E8E2DC",
                    textSecondary: "#9A928A",
                    shadowLight: "rgba(255, 255, 255, 0.03)",
                    shadowDark: "rgba(0, 0, 0, 0.3)",
                    blur: "0px",
                    cardShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
                    hardShadow: "1px 1px 0 #FFFFFF"
                },
                light: {
                    body: "#F5F2ED",
                    surface: "#FFFCF8",
                    surfaceSolid: "#FFFCF8",
                    border: "rgba(68, 60, 52, 0.12)",
                    text: "#3D3632",
                    textSecondary: "#7A706A",
                    shadowLight: "rgba(255, 255, 255, 0.9)",
                    shadowDark: "rgba(68, 60, 52, 0.08)",
                    blur: "0px",
                    cardShadow: "0 1px 3px rgba(68, 60, 52, 0.08)",
                    hardShadow: "1px 1px 0 #000000"
                }
            }
        };

        const chosenVisual = visualThemes[visual] ? visual : "glassmorphism";
        const mode = theme === "light" ? "light" : "dark";
        const v = visualThemes[chosenVisual][mode];
        const radiusCard = chosenVisual === "neobrutalism" ? "0px" : chosenVisual === "material" ? "12px" : chosenVisual === "japandi" ? "4px" : chosenVisual === "claymorphism" ? "24px" : "16px";
        const radiusControl = chosenVisual === "neobrutalism" ? "0px" : chosenVisual === "japandi" ? "4px" : "12px";
        const borderWidth = chosenVisual === "neobrutalism" ? "2px" : "1px";
        const backdrop = chosenVisual === "glassmorphism" ? `blur(${v.blur})` : "none";
        const surfaceAlt =
            chosenVisual === "glassmorphism"
                ? mode === "dark"
                    ? "rgba(255, 255, 255, 0.04)"
                    : "rgba(255, 255, 255, 0.42)"
                : chosenVisual === "material"
                  ? mode === "dark"
                      ? "#252525"
                      : "#F7F7F7"
                : chosenVisual === "claymorphism"
                  ? mode === "dark"
                      ? "#403C38"
                      : "#FAF7F4"
                  : chosenVisual === "japandi"
                    ? mode === "dark"
                        ? "#2A2725"
                        : "#F8F6F2"
                    : v.surfaceSolid;
        const accentSoft = mode === "dark" ? "rgba(255, 215, 0, 0.10)" : "rgba(255, 215, 0, 0.14)";
        const secondaryHover = mode === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)";
        const inputBg =
            chosenVisual === "glassmorphism"
                ? mode === "dark"
                    ? "rgba(18, 18, 22, 0.35)"
                    : "rgba(255, 255, 255, 0.55)"
                : v.surfaceSolid;
        const pageBg =
            chosenVisual === "glassmorphism"
                ? mode === "dark"
                    ? "radial-gradient(circle at 20% 0%, rgba(255, 215, 0, 0.10) 0%, transparent 28%), radial-gradient(circle at 80% 100%, rgba(255, 255, 255, 0.05) 0%, transparent 34%), linear-gradient(180deg, #1c1c20 0%, #2a2a2e 100%)"
                    : "radial-gradient(circle at 20% 0%, rgba(255, 215, 0, 0.14) 0%, transparent 28%), radial-gradient(circle at 80% 100%, rgba(255, 255, 255, 0.50) 0%, transparent 34%), linear-gradient(180deg, #edf1f6 0%, #d4d8e0 100%)"
                : chosenVisual === "material"
                  ? mode === "dark"
                      ? "linear-gradient(180deg, #121212 0%, #1b1b1b 100%)"
                      : "linear-gradient(180deg, #fafafa 0%, #f0f0f0 100%)"
                : chosenVisual === "japandi"
                  ? mode === "dark"
                      ? "linear-gradient(180deg, #1A1816 0%, #242120 100%)"
                      : "linear-gradient(180deg, #F5F2ED 0%, #EBE7DE 100%)"
                : chosenVisual === "claymorphism"
                  ? mode === "dark"
                      ? "linear-gradient(180deg, #2C2825 0%, #363230 100%)"
                      : "linear-gradient(180deg, #E8E0D9 0%, #DDD5CC 100%)"
                  : v.body;
        const cardShadow =
            chosenVisual === "neobrutalism"
                ? v.hardShadow
                : chosenVisual === "neumorphism" || chosenVisual === "claymorphism"
                  ? v.cardShadow
                  : v.cardShadow;
        const secondaryShadow =
            chosenVisual === "neobrutalism"
                ? v.hardShadow
                : chosenVisual === "neumorphism" || chosenVisual === "claymorphism"
                  ? `6px 6px 12px ${v.shadowDark}, -6px -6px 12px ${v.shadowLight}`
                  : `0 2px 8px ${v.shadowDark}`;
        const inputShadow =
            chosenVisual === "neumorphism" || chosenVisual === "claymorphism"
                ? `inset 4px 4px 8px ${v.shadowDark}, inset -4px -4px 8px ${v.shadowLight}`
                : "none";
        const buttonPrimaryShadow =
            chosenVisual === "neobrutalism"
                ? v.hardShadow
                : chosenVisual === "neumorphism" || chosenVisual === "claymorphism"
                  ? `6px 6px 12px ${v.shadowDark}, -6px -6px 12px ${v.shadowLight}`
                  : `0 6px 18px rgba(255, 215, 0, 0.20)`;

        return `
            :root {
                --egg-yellow: #FFD700;
                --lead-gray: #4A4A4A;
                --gondim-gold: #FFD700;
                --gondim-dark-gold: #FFA000;
                --gondim-light-gold: #FFECB3;
                --success: #4CAF50;
                --warning: #FF9800;
                --error: #F44336;
                --danger: #F44336;
                --info: #2196F3;

                --text-primary: ${v.text};
                --text-secondary: ${v.textSecondary};
                --glass-bg: ${v.body};
                --glass-surface: ${v.surface};
                --glass-border: ${v.border};
                --glass-shadow: ${v.shadowDark};
                --glass-blur: ${v.blur};
                --glass-highlight: ${v.shadowLight};

                --gondim-black: ${v.text};
                --gondim-gray-dark: ${v.text};
                --gondim-gray: ${v.textSecondary};
                --gondim-gray-light: ${v.textSecondary};
                --gondim-white: ${v.surfaceSolid};
                --gondim-bg: ${v.body};

                --primary-color: #FFD700;
                --primary-hover: #E0B500;
                --bg-color: ${v.body};
                --container-bg: ${v.surfaceSolid};
                --border-color: ${v.border};

                --bg: ${v.body};
                --card-bg: ${v.surfaceSolid};
                --text-main: ${v.text};
                --text-muted: ${v.textSecondary};
                --text-light: ${v.textSecondary};
                --gold: #FFD700;
                --gold-hover: #E0B500;
                --shadow-light: ${v.shadowLight};
                --shadow-dark: ${v.shadowDark};

                --bg-gradient: ${pageBg};
                --accent: #FFD700;
                --accent-hover: #E0B500;
                --radius-sm: ${radiusControl};
                --radius-md: ${radiusControl};
                --radius-lg: ${radiusCard};
                --shadow-card: ${cardShadow};

                --shadow-sm: ${secondaryShadow};
                --shadow-md: ${cardShadow};
                --shadow-lg: ${cardShadow};
                --shadow-gold: ${buttonPrimaryShadow};

                --toy-page-bg: ${pageBg};
                --toy-surface: ${v.surfaceSolid};
                --toy-surface-alt: ${surfaceAlt};
                --toy-border: ${v.border};
                --toy-text: ${v.text};
                --toy-muted: ${v.textSecondary};
                --toy-accent: #FFD700;
                --toy-accent-hover: #E0B500;
                --toy-accent-ink: #1a1a1a;
                --toy-accent-soft: ${accentSoft};
                --toy-input-bg: ${inputBg};
                --toy-card-radius: ${radiusCard};
                --toy-control-radius: ${radiusControl};
                --toy-card-shadow: ${cardShadow};
                --toy-secondary-shadow: ${secondaryShadow};
                --toy-input-shadow: ${inputShadow};
                --toy-backdrop: ${backdrop};
            }

            html, body {
                background: var(--toy-page-bg) !important;
                background-attachment: fixed !important;
                color: var(--toy-text) !important;
            }

            .theme-toggle,
            #themeToggle {
                display: none !important;
            }

            .main-logo,
            .logo {
                height: 72px !important;
                max-width: 100% !important;
                object-fit: contain !important;
            }

            .main-content {
                padding-top: 24px !important;
                padding-bottom: 24px !important;
            }

            .container {
                width: 100% !important;
                max-width: none !important;
            }

            /* Largura padrão: o container principal de cada toy acompanha o Divisor PDF. */
            body > .glass-container,
            body > .glass-card,
            body > .tool-card,
            body > .shell {
                box-sizing: border-box !important;
                width: min(100%, calc(100vw - 48px)) !important;
                max-width: none !important;
                margin-left: auto !important;
                margin-right: auto !important;
            }

            @media (max-width: 640px) {
                body > .glass-container,
                body > .glass-card,
                body > .tool-card,
                body > .shell {
                    width: 100% !important;
                }
            }

            .app-header,
            .logo-container,
            .logo-wrapper,
            header {
                margin-bottom: 20px !important;
            }
        `;
    },

    updateThemeInAllIframes() {
        const theme = document.documentElement.getAttribute('data-theme');
        const visual = document.documentElement.getAttribute('data-visual');
        const css = this.getThemeCSS(theme, visual);

        this.persistThemePayload(theme, visual, css);

        document.querySelectorAll('.toy-iframe').forEach(iframe => {
            try {
                const win = iframe.contentWindow;
                const doc = iframe.contentDocument;
                if (win && win.postMessage) {
                    win.postMessage({ type: 'theme', theme: theme, visual: visual, css: css }, '*');
                }

                if (!doc || !doc.documentElement) return;

                // Set data attributes
                doc.documentElement.setAttribute('data-theme', theme);
                doc.documentElement.setAttribute('data-visual', visual);

                // Inject theme CSS
                const style = doc.getElementById('gantoys-theme-inject');
                if (style) {
                    style.textContent = css;
                } else {
                    const newStyle = doc.createElement('style');
                    newStyle.id = 'gantoys-theme-inject';
                    newStyle.textContent = css;
                    doc.head.appendChild(newStyle);
                }

            } catch (e) {}
        });
    },

    persistCurrentToyState() {
        if (!this.currentToy) return;
        this.saveState(this.currentToy);
    },

    saveState(toyName) {
        try {
            const iframe = document.getElementById('toyIframe');
            if (!iframe) return;

            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const state = {};

            doc.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.name) {
                    state[el.name] = el.value;
                }
            });

            localStorage.setItem('toy_state_' + toyName, JSON.stringify(state));
        } catch (e) {
            console.warn('Cannot save state:', e);
        }
    },

    restoreState(toyName) {
        try {
            const savedState = localStorage.getItem('toy_state_' + toyName);
            if (!savedState) return;

            const state = JSON.parse(savedState);
            const iframe = document.getElementById('toyIframe');
            if (!iframe) return;

            const doc = iframe.contentDocument || iframe.contentWindow.document;

            Object.keys(state).forEach(key => {
                const el = doc.querySelector(`[name="${key}"]`);
                if (el) {
                    el.value = state[key];
                }
            });
        } catch (e) {
            console.warn('Cannot restore state:', e);
        }
    }
};

window.showGanToysDirectoryPicker = async (mode = 'readwrite') => {
    if (!('showDirectoryPicker' in window)) {
        throw new Error('Este navegador não suporta a seleção de pastas. Abra o GAN Toys no Google Chrome ou Microsoft Edge.');
    }

    return window.showDirectoryPicker({ mode });
};

let pendingDirectoryPickerRequest = null;
const GAN_TOYS_DIRECTORY_HANDLES = new Map();
const GAN_TOYS_RENAME_PLANS = new Map();

function respondToDirectoryPickerRequest(request, result) {
    request.source?.postMessage({
        type: 'gantoys-directory-picker-result',
        requestId: request.requestId,
        ...result
    }, '*');
}

function respondToToyRequest(source, type, requestId, result) {
    source?.postMessage({ type, requestId, ...result }, '*');
}

function closeDirectoryPickerModal() {
    const modal = document.getElementById('directoryPickerModal');
    if (modal) modal.hidden = true;
}

function compileWildcardPattern(pattern) {
    const characters = [...String(pattern || '')];
    let source = '';

    for (let index = 0; index < characters.length; index += 1) {
        const character = characters[index];
        if (character === '*') {
            source += '(.*)';
            continue;
        }
        if (character === '?') {
            let count = 1;
            while (characters[index + count] === '?') count += 1;
            source += `(.{${count}})`;
            index += count - 1;
            continue;
        }
        source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    return new RegExp(source, 'i');
}

function normalizeFileExtension(name) {
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return name;
    const extension = name.slice(dot);
    return extension === extension.toLowerCase() ? name : name.slice(0, dot) + extension.toLowerCase();
}

async function* walkDirectoryFiles(directoryHandle, includeSubfolders, parentPath = '') {
    for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file') {
            yield { handle: entry, parent: directoryHandle, path: `${parentPath}${entry.name}` };
        } else if (entry.kind === 'directory' && includeSubfolders) {
            yield* walkDirectoryFiles(entry, includeSubfolders, `${parentPath}${entry.name}/`);
        }
    }
}

async function handleRenamerRequest(source, request) {
    try {
        if (request.action === 'preview') {
            const directory = GAN_TOYS_DIRECTORY_HANDLES.get(request.directoryId);
            if (!directory) throw new Error('A pasta selecionada não está mais disponível. Selecione-a novamente.');

            const matcher = compileWildcardPattern(request.pattern);
            const rows = [];
            let total = 0;
            for await (const item of walkDirectoryFiles(directory, Boolean(request.includeSubfolders))) {
                total += 1;
                if (!matcher.test(item.handle.name)) continue;
                let newName = item.handle.name.replace(matcher, request.replacement || '');
                if (request.normalizeExtension) newName = normalizeFileExtension(newName);
                if (newName === item.handle.name) continue;
                rows.push({ ...item, newName });
            }

            const planId = crypto.randomUUID();
            GAN_TOYS_RENAME_PLANS.set(planId, rows);
            respondToToyRequest(source, 'gantoys-renamer-result', request.requestId, {
                result: { planId, total, rows: rows.map((row) => ({ path: row.path, newName: row.newName })) }
            });
            return;
        }

        if (request.action === 'apply') {
            const rows = GAN_TOYS_RENAME_PLANS.get(request.planId);
            if (!rows) throw new Error('A prévia expirou. Gere uma nova prévia antes de renomear.');

            const results = [];
            for (const row of rows) {
                try {
                    try {
                        await row.parent.getFileHandle(row.newName);
                        throw new Error('já existe um arquivo com esse nome');
                    } catch (error) {
                        if (error.message.startsWith('já existe')) throw error;
                        if (error.name !== 'NotFoundError') throw error;
                    }
                    await row.handle.move(row.newName);
                    results.push({ status: 'ok', message: `${row.path} → ${row.newName}` });
                } catch (error) {
                    results.push({ status: 'fail', message: `${row.path}: ${error.message}` });
                }
            }
            GAN_TOYS_RENAME_PLANS.delete(request.planId);
            respondToToyRequest(source, 'gantoys-renamer-result', request.requestId, { result: { results } });
            return;
        }

        throw new Error('Operação de renomeação inválida.');
    } catch (error) {
        respondToToyRequest(source, 'gantoys-renamer-result', request.requestId, {
            error: { name: error.name, message: error.message }
        });
    }
}

async function requestDirectoryAccess(handle, writable) {
    const options = { mode: writable ? 'readwrite' : 'read' };
    if (await handle.queryPermission(options) === 'granted') return true;
    return (await handle.requestPermission(options)) === 'granted';
}

function fileMatchesProcessName(fileName, process) {
    const normalized = String(process).replace(/\D/g, '');
    return fileName.toLowerCase().includes(String(process).toLowerCase()) || (normalized.length > 0 && fileName.replace(/\D/g, '').includes(normalized));
}

async function fileExistsInDirectory(directory, name) {
    try {
        await directory.getFileHandle(name);
        return true;
    } catch (error) {
        if (error.name === 'NotFoundError') return false;
        throw error;
    }
}

async function availableFileName(directory, name) {
    if (!(await fileExistsInDirectory(directory, name))) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    let suffix = 2;
    while (await fileExistsInDirectory(directory, `${base} (${suffix})${extension}`)) suffix += 1;
    return `${base} (${suffix})${extension}`;
}

async function copyDirectoryFile(sourceHandle, destinationDirectory, destinationName) {
    const sourceFile = await sourceHandle.getFile();
    const target = await destinationDirectory.getFileHandle(destinationName, { create: true });
    const writable = await target.createWritable();
    await writable.write(sourceFile);
    await writable.close();
}

async function handleFileRequest(source, request) {
    try {
        const directory = GAN_TOYS_DIRECTORY_HANDLES.get(request.directoryId);
        if (!directory) throw new Error('A pasta selecionada não está mais disponível. Selecione-a novamente.');

        if (request.action === 'write') {
            if (!await requestDirectoryAccess(directory, true)) throw new Error('É necessário conceder permissão de escrita na pasta de destino.');
            const fileHandle = await directory.getFileHandle(request.name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(request.bytes);
            await writable.close();
            respondToToyRequest(source, 'gantoys-file-result', request.requestId, { result: {} });
            return;
        }

        if (request.action === 'read') {
            if (!await requestDirectoryAccess(directory, false)) throw new Error('É necessário conceder permissão de leitura na pasta de destino.');
            const fileHandle = await directory.getFileHandle(request.name);
            const file = await fileHandle.getFile();
            respondToToyRequest(source, 'gantoys-file-result', request.requestId, {
                result: { bytes: await file.arrayBuffer() }
            });
            return;
        }

        throw new Error('Operação de arquivo inválida.');
    } catch (error) {
        respondToToyRequest(source, 'gantoys-file-result', request.requestId, {
            error: { name: error.name, message: error.message }
        });
    }
}

async function handleCopyRequest(source, request) {
    try {
        const sourceDirectory = GAN_TOYS_DIRECTORY_HANDLES.get(request.sourceId);
        const destinationDirectory = GAN_TOYS_DIRECTORY_HANDLES.get(request.destinationId);
        if (!sourceDirectory || !destinationDirectory) throw new Error('Selecione novamente as pastas de origem e destino.');
        if (!await requestDirectoryAccess(sourceDirectory, false) || !await requestDirectoryAccess(destinationDirectory, true)) {
            throw new Error('É necessário conceder permissão de leitura na origem e escrita no destino.');
        }

        if (request.mode === 'santander') {
            const results = [];
            let found = 0;
            for await (const item of walkDirectoryFiles(sourceDirectory, true)) {
                if (!request.processes.some((process) => fileMatchesProcessName(item.path, process))) continue;
                found += 1;
                try {
                    const name = await availableFileName(destinationDirectory, item.handle.name);
                    await copyDirectoryFile(item.handle, destinationDirectory, name);
                    results.push({ status: 'ok', message: name === item.handle.name ? item.path : `${item.path} → ${name}` });
                } catch (error) {
                    results.push({ status: 'fail', message: `${item.path}: ${error.message}` });
                }
            }
            if (found === 0) results.push({ status: 'missing', message: 'Nenhum arquivo encontrado para os processos informados.' });
            respondToToyRequest(source, 'gantoys-copy-result', request.requestId, { result: { total: found, results } });
            return;
        }

        if (request.mode === 'bradesco') {
            const results = Array(request.processes.length);
            const copiedProcesses = new Set();
            for await (const item of walkDirectoryFiles(sourceDirectory, true)) {
                if (!item.handle.name.toLowerCase().endsWith('.pdf')) continue;
                for (let index = 0; index < request.processes.length; index += 1) {
                    if (copiedProcesses.has(index) || !fileMatchesProcessName(item.path, request.processes[index])) continue;
                    const targetName = `INICIAL ${request.clients[index]}.pdf`;
                    try {
                        await copyDirectoryFile(item.handle, destinationDirectory, targetName);
                        copiedProcesses.add(index);
                        results[index] = { status: 'ok', message: `${request.processes[index]} → ${targetName}` };
                    } catch (error) {
                        copiedProcesses.add(index);
                        results[index] = { status: 'fail', message: `${request.processes[index]}: ${error.message}` };
                    }
                }
            }
            for (let index = 0; index < request.processes.length; index += 1) {
                if (!results[index]) results[index] = { status: 'missing', message: `${request.processes[index]}: nenhum PDF localizado.` };
            }
            respondToToyRequest(source, 'gantoys-copy-result', request.requestId, { result: { total: request.processes.length, results } });
            return;
        }

        throw new Error('Operação de cópia inválida.');
    } catch (error) {
        respondToToyRequest(source, 'gantoys-copy-result', request.requestId, {
            error: { name: error.name, message: error.message }
        });
    }
}

window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'gantoys-directory-picker-request') {
        if (pendingDirectoryPickerRequest) {
            respondToDirectoryPickerRequest(pendingDirectoryPickerRequest, {
                error: { name: 'AbortError', message: 'Uma nova seleção de pasta foi iniciada.' }
            });
        }

        pendingDirectoryPickerRequest = {
            source: event.source,
            requestId: event.data.requestId,
            mode: event.data.mode || 'readwrite'
        };

        const modal = document.getElementById('directoryPickerModal');
        const message = document.getElementById('directoryPickerMessage');
        if (message) message.textContent = 'Confirme para selecionar uma pasta local no seu computador.';
        if (modal) modal.hidden = false;
        return;
    }

    if (event.data.type === 'gantoys-renamer-request') {
        handleRenamerRequest(event.source, event.data);
        return;
    }

    if (event.data.type === 'gantoys-copy-request') {
        handleCopyRequest(event.source, event.data);
        return;
    }

    if (event.data.type === 'gantoys-file-request') {
        handleFileRequest(event.source, event.data);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    GANTOYS.init();

    const confirmButton = document.getElementById('directoryPickerConfirm');
    const cancelButton = document.getElementById('directoryPickerCancel');

    cancelButton?.addEventListener('click', () => {
        if (pendingDirectoryPickerRequest) {
            respondToDirectoryPickerRequest(pendingDirectoryPickerRequest, {
                error: { name: 'AbortError', message: 'Seleção de pasta cancelada.' }
            });
            pendingDirectoryPickerRequest = null;
        }
        closeDirectoryPickerModal();
    });

    confirmButton?.addEventListener('click', async () => {
        const request = pendingDirectoryPickerRequest;
        if (!request) return;

        closeDirectoryPickerModal();
        pendingDirectoryPickerRequest = null;
        try {
            const handle = await window.showGanToysDirectoryPicker(request.mode);
            const directoryId = crypto.randomUUID();
            GAN_TOYS_DIRECTORY_HANDLES.set(directoryId, handle);
            respondToDirectoryPickerRequest(request, { directory: { id: directoryId, name: handle.name } });
        } catch (error) {
            respondToDirectoryPickerRequest(request, {
                error: { name: error.name, message: error.message }
            });
        }
    });
});
