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
            if (doc && doc.head) {
                const html = doc.documentElement;

                html.setAttribute('data-theme', theme);
                html.setAttribute('data-visual', visual);

                const existingStyle = doc.getElementById('gantoys-theme-inject');
                if (existingStyle) existingStyle.remove();

                const style = doc.createElement('style');
                style.id = 'gantoys-theme-inject';
                style.textContent = css;
                doc.head.appendChild(style);
            }
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
                --toy-surface-solid: ${v.surfaceSolid};
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
                --toy-success: #4CAF50;
                --toy-warning: #FF9800;
                --toy-danger: #F44336;
                --toy-font: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                --toy-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
            }

            html, body {
                background: var(--toy-page-bg) !important;
                background-attachment: fixed !important;
                color: var(--toy-text) !important;
            }
        `;
    },

    updateThemeInAllIframes() {
        const theme = document.documentElement.getAttribute('data-theme');
        const visual = document.documentElement.getAttribute('data-visual');
        const css = this.getThemeCSS(theme, visual);

        this.persistThemePayload(theme, visual, css);

        document.querySelectorAll('.toy-iframe').forEach(iframe => {
            // As duas vias são independentes: em iframes `srcdoc` abertos via
            // `file://` o `postMessage` pode falhar ("Illegal invocation") e,
            // se estivesse no mesmo try, derrubaria também a injeção direta.
            try {
                const win = iframe.contentWindow;
                if (win && win.postMessage) {
                    win.postMessage({ type: 'theme', theme: theme, visual: visual, css: css }, '*');
                }
            } catch (e) {
                console.warn('Cannot post theme message:', e);
            }

            try {
                const doc = iframe.contentDocument;
                if (!doc || !doc.documentElement || !doc.head) return;

                doc.documentElement.setAttribute('data-theme', theme);
                doc.documentElement.setAttribute('data-visual', visual);

                const style = doc.getElementById('gantoys-theme-inject');
                if (style) {
                    style.textContent = css;
                } else {
                    const newStyle = doc.createElement('style');
                    newStyle.id = 'gantoys-theme-inject';
                    newStyle.textContent = css;
                    doc.head.appendChild(newStyle);
                }
            } catch (e) {
                console.warn('Cannot inject theme styles:', e);
            }
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
                if (!el.name) return;
                // Radios formam UM valor por nome: guardar o value de cada um
                // sobrescreveria o grupo (e o value do primeiro radio virava o
                // do último escolhido, corrompendo o formulário).
                if (el.type === 'radio') {
                    if (el.checked) state[el.name] = el.value;
                    return;
                }
                if (el.type === 'checkbox') {
                    state[el.name] = el.checked;
                    return;
                }
                state[el.name] = el.value;
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
                const fields = doc.querySelectorAll(`[name="${key}"]`);
                if (!fields.length) return;

                // Notifica o toy do valor restaurado: cada um mantém UI derivada
                // (painéis condicionais, contadores) reagindo a input/change.
                const notify = (el) => {
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                };

                const first = fields[0];
                if (first.type === 'radio') {
                    const target = [...fields].find(el => el.type === 'radio' && el.value === String(state[key]));
                    if (!target || target.checked) return;
                    fields.forEach(el => { if (el.type === 'radio') el.checked = el === target; });
                    notify(target);
                    return;
                }
                if (first.type === 'checkbox') {
                    const raw = state[key];
                    const on = raw === true || raw === 'true' || raw === 'on' || raw === 1 || raw === '1';
                    fields.forEach(el => {
                        if (el.type !== 'checkbox' || el.checked === on) return;
                        el.checked = on;
                        notify(el);
                    });
                    return;
                }
                if (first.value === String(state[key])) return;
                first.value = state[key];
                notify(first);
            });
        } catch (e) {
            console.warn('Cannot restore state:', e);
        }
    }
};

window.showGanToysDirectoryPicker = async (mode = 'readwrite') => {
    if (!('showDirectoryPicker' in window)) {
        throw new Error('Este navegador não expõe o seletor de pastas. Use o Chrome ou o Edge.');
    }

    return window.showDirectoryPicker({ mode });
};

// Sem a File System Access API não há como escolher uma pasta para leitura/escrita.
// A mensagem usa o erro do próprio navegador: o motivo varia por contexto
// (navegador sem suporte, permissão negada, gesto do usuário ausente).
const DIRETORIO_INDISPONIVEL = 'Não foi possível abrir o seletor de pastas.';

function diretorioIndisponivel(error) {
    if (error && error.name === 'AbortError') return null;
    return error && error.message ? `${DIRETORIO_INDISPONIVEL} ${error.message}` : DIRETORIO_INDISPONIVEL;
}

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

/* ---------------------------------------------------------------------------
 * Busca por processo
 *
 * Cada processo é normalizado uma única vez (minúsculas + somente dígitos) e
 * todos os padrões viram um único RegExp alternativo, executado nativamente
 * sobre o caminho já normalizado. Antes, as duas normalizações do caminho eram
 * refeitas para cada processo de cada arquivo varrido (custo O(arquivos ×
 * processos) com regex e alocação por célula), o que dominava a varredura.
 * ------------------------------------------------------------------------- */

function buildProcessTerm(process) {
    const text = String(process);
    return {
        lower: text.toLowerCase(),
        digits: text.replace(/\D/g, ''),
        hasNonDigit: /[^\d]/.test(text)
    };
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileSearchRegExp(patterns) {
    const unique = [...new Set(patterns)].filter(Boolean);
    if (unique.length === 0) return null;
    return new RegExp(unique.map(escapeRegExp).join('|'));
}

function createProcessSearch(processes) {
    const terms = processes.map(buildProcessTerm);
    return {
        terms,
        // processos só de dígitos já são cobertos pela busca por dígitos
        byName: compileSearchRegExp(terms.filter((term) => term.hasNonDigit).map((term) => term.lower)),
        byDigits: compileSearchRegExp(terms.map((term) => term.digits))
    };
}

function pathForms(path) {
    return { lower: path.toLowerCase(), digits: path.replace(/\D/g, '') };
}

function termMatchesForms(term, forms) {
    return (term.hasNonDigit && forms.lower.includes(term.lower))
        || (term.digits.length > 0 && forms.digits.includes(term.digits));
}

function searchMatchesForms(search, forms) {
    return (search.byName !== null && search.byName.test(forms.lower))
        || (search.byDigits !== null && search.byDigits.test(forms.digits));
}

/**
 * Compara dois arquivos sem carregar tudo na memória: tamanho primeiro, depois
 * blocos de 1 MB (arquivos idênticos param no primeiro byte diferente).
 */
async function filesAreEqual(a, b) {
    if (a.size !== b.size) return false;

    const CHUNK = 1 << 20;
    for (let offset = 0; offset < a.size; offset += CHUNK) {
        const [bufferA, bufferB] = await Promise.all([
            a.slice(offset, offset + CHUNK).arrayBuffer(),
            b.slice(offset, offset + CHUNK).arrayBuffer()
        ]);
        const bytesA = new Uint8Array(bufferA);
        const bytesB = new Uint8Array(bufferB);
        for (let i = 0; i < bytesA.length; i += 1) {
            if (bytesA[i] !== bytesB[i]) return false;
        }
    }
    return true;
}

/**
 * Decide o que fazer com um arquivo da origem no destino:
 *  - 'same-file': origem e destino são o MESMO arquivo (nada a fazer);
 *  - 'identical': já existe no destino com o mesmo conteúdo (nada a fazer);
 *  - 'overwrite': já existe no destino com conteúdo diferente (sobrescreve);
 *  - 'create':    não existe no destino (copia).
 * Nada é renomeado: o nome no destino é sempre o nome final combinado.
 */
async function planFileCopy(sourceHandle, destinationDirectory, destinationName) {
    const sourceFile = await sourceHandle.getFile();

    let destinationHandle = null;
    try {
        destinationHandle = await destinationDirectory.getFileHandle(destinationName);
    } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
    }

    if (!destinationHandle) return { action: 'create', sourceFile };

    if (typeof sourceHandle.isSameEntry === 'function' && await sourceHandle.isSameEntry(destinationHandle)) {
        return { action: 'same-file', sourceFile };
    }

    const destinationFile = await destinationHandle.getFile();
    if (await filesAreEqual(sourceFile, destinationFile)) return { action: 'identical', sourceFile };

    return { action: 'overwrite', sourceFile };
}

/** Grava o arquivo no destino (createWritable trunca: sobrescreve quando existe). */
async function writeDestinationFile(destinationDirectory, destinationName, sourceFile) {
    const target = await destinationDirectory.getFileHandle(destinationName, { create: true });
    const writable = await target.createWritable();
    await writable.write(sourceFile);
    await writable.close();
}

/** Resultado legível para um arquivo que não precisou ser copiado. */
function skipReason(action) {
    return action === 'same-file'
        ? 'origem e destino são o mesmo arquivo'
        : 'já existe no destino com o mesmo conteúdo';
}

function createProgressReporter(source, requestId) {
    let lastSent = 0;
    return (progress, force = false) => {
        const now = Date.now();
        if (!force && now - lastSent < 120) return;
        lastSent = now;
        respondToToyRequest(source, 'gantoys-copy-progress', requestId, { progress });
    };
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

        const reportProgress = createProgressReporter(source, request.requestId);

        if (request.mode === 'santander') {
            const search = createProcessSearch(request.processes);
            const results = [];
            const resolved = new Set();
            let scanned = 0;
            let found = 0;
            let copied = 0;

            for await (const item of walkDirectoryFiles(sourceDirectory, true)) {
                scanned += 1;
                const forms = pathForms(item.path);
                if (!searchMatchesForms(search, forms)) {
                    reportProgress({ scanned, found, copied });
                    continue;
                }

                // Só nos arquivos aprovados pelo filtro rápido: descobre quais
                // processos eles atendem, para depois listar os que ficaram sem arquivo.
                const matchedProcesses = [];
                search.terms.forEach((term, index) => {
                    if (!termMatchesForms(term, forms)) return;
                    resolved.add(index);
                    matchedProcesses.push(request.processes[index]);
                });

                found += 1;
                try {
                    const plan = await planFileCopy(item.handle, destinationDirectory, item.handle.name);
                    if (plan.action === 'same-file' || plan.action === 'identical') {
                        // Mesmo arquivo ou mesmo conteúdo: não copia nem renomeia.
                        results.push({
                            status: 'same',
                            reference: matchedProcesses.join('\n'),
                            message: `${item.path}: ${skipReason(plan.action)}`
                        });
                    } else {
                        await writeDestinationFile(destinationDirectory, item.handle.name, plan.sourceFile);
                        copied += 1;
                        results.push({
                            status: plan.action === 'overwrite' ? 'updated' : 'ok',
                            message: plan.action === 'overwrite' ? `${item.path} (sobrescrito)` : item.path
                        });
                    }
                } catch (error) {
                    // a lista copiada pelo toy leva só os números dos processos afetados
                    results.push({ status: 'fail', reference: matchedProcesses.join('\n'), message: `${item.path}: ${error.message}` });
                }
                reportProgress({ scanned, found, copied });
            }

            // "reference" alimenta a lista de não copiados exibida pelo toy.
            request.processes.forEach((process, index) => {
                if (resolved.has(index)) return;
                results.push({ status: 'missing', reference: process, message: `${process}: nenhum arquivo localizado na origem.` });
            });
            if (results.length === 0) results.push({ status: 'missing', reference: '', message: 'Nenhum arquivo encontrado para os processos informados.' });

            reportProgress({ scanned, found, copied }, true);
            respondToToyRequest(source, 'gantoys-copy-result', request.requestId, { result: { total: found, results } });
            return;
        }

        if (request.mode === 'bradesco') {
            const search = createProcessSearch(request.processes);
            const results = Array(request.processes.length);
            let scanned = 0;
            let copied = 0;
            let pending = request.processes.length;

            for await (const item of walkDirectoryFiles(sourceDirectory, true)) {
                if (pending === 0) break;
                scanned += 1;
                if (!item.handle.name.toLowerCase().endsWith('.pdf')) {
                    reportProgress({ scanned, copied, total: request.processes.length });
                    continue;
                }

                const forms = pathForms(item.path);
                if (!searchMatchesForms(search, forms)) {
                    reportProgress({ scanned, copied, total: request.processes.length });
                    continue;
                }

                for (let index = 0; index < search.terms.length; index += 1) {
                    if (results[index] || !termMatchesForms(search.terms[index], forms)) continue;
                    const targetName = `INICIAL ${request.clients[index]}.pdf`;
                    try {
                        const plan = await planFileCopy(item.handle, destinationDirectory, targetName);
                        if (plan.action === 'same-file' || plan.action === 'identical') {
                            results[index] = {
                                status: 'same',
                                reference: request.processes[index],
                                message: `${request.processes[index]} → ${targetName}: ${skipReason(plan.action)}`
                            };
                        } else {
                            await writeDestinationFile(destinationDirectory, targetName, plan.sourceFile);
                            copied += 1;
                            results[index] = {
                                status: plan.action === 'overwrite' ? 'updated' : 'ok',
                                message: plan.action === 'overwrite'
                                    ? `${request.processes[index]} → ${targetName} (sobrescrito)`
                                    : `${request.processes[index]} → ${targetName}`
                            };
                        }
                    } catch (error) {
                        results[index] = { status: 'fail', reference: request.processes[index], message: `${request.processes[index]}: ${error.message}` };
                    }
                    pending -= 1;
                }
                reportProgress({ scanned, copied, total: request.processes.length });
            }

            for (let index = 0; index < request.processes.length; index += 1) {
                if (!results[index]) results[index] = { status: 'missing', reference: request.processes[index], message: `${request.processes[index]}: nenhum PDF localizado.` };
            }
            reportProgress({ scanned, copied, total: request.processes.length }, true);
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

        try {
            const handle = await window.showGanToysDirectoryPicker(request.mode);
            closeDirectoryPickerModal();
            pendingDirectoryPickerRequest = null;
            const directoryId = crypto.randomUUID();
            GAN_TOYS_DIRECTORY_HANDLES.set(directoryId, handle);
            respondToDirectoryPickerRequest(request, { directory: { id: directoryId, name: handle.name } });
        } catch (error) {
            const aviso = diretorioIndisponivel(error);
            if (!aviso) {
                respondToDirectoryPickerRequest(request, {
                    error: { name: error.name, message: error.message }
                });
                closeDirectoryPickerModal();
                pendingDirectoryPickerRequest = null;
                return;
            }
            // Indisponível neste contexto: o diálogo explica e o toy recebe um
            // AbortError para não abrir um alerta redundante por cima.
            respondToDirectoryPickerRequest(request, {
                error: { name: 'AbortError', message: 'Seleção de pasta indisponível neste contexto.' }
            });
            pendingDirectoryPickerRequest = null;
            const message = document.getElementById('directoryPickerMessage');
            if (message) message.textContent = aviso;
        }
    });
});
