import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import globals from 'globals';
import html from 'eslint-plugin-html';

/**
 * Lint de qualidade do GAN Toys.
 *
 * O foco é erro de verdade — variável indefinida, código inalcançável, chave
 * duplicada, execução dinâmica de código, construtor de Promise assíncrono —
 * e não preferência de estilo. Regra de formatação não entra: o repositório não
 * tem formatador e a revisão de estilo é humana.
 *
 * Dois detalhes do projeto estão resolvidos aqui:
 *  - o JS embutido nos HTML é lintado pelo `eslint-plugin-html`;
 *  - as funções chamadas por `onclick="..."` (padrão usado pelos toys) contam
 *    como usadas: os nomes são lidos dos próprios HTML, então renomear uma
 *    função sem ajustar o handler continua sendo erro.
 */

const RAIZ = path.dirname(fileURLToPath(import.meta.url));

/** Nomes de função citados em handlers inline (`onclick="fn(...)"`). */
function funcoesDosHandlersInline() {
    const nomes = new Set();
    const visitar = (dir) => {
        for (const nome of readdirSync(dir)) {
            if (['vendor', 'archive', 'port', 'node_modules', 'dist', '.git', '.coverage', 'coverage'].includes(nome)) continue;
            const caminho = path.join(dir, nome);
            if (statSync(caminho).isDirectory()) {
                visitar(caminho);
                continue;
            }
            if (!/\.(?:html|js)$/.test(nome)) continue;
            // Handlers inline aparecem no HTML e, também, dentro de template
            // strings que o JS injeta (ex.: botão de remover item de uma lista).
            const texto = readFileSync(caminho, 'utf8');
            for (const handler of texto.matchAll(/\son(?:click|input|change|submit|keyup|keydown)\s*=\s*["']([^"']*)["']/g)) {
                for (const chamada of handler[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) nomes.add(chamada[1]);
            }
        }
    };
    visitar(RAIZ);
    return [...nomes].sort();
}

const HANDLERS_INLINE = new RegExp(`^(${funcoesDosHandlersInline().join('|')})$`);

const REGRAS = {
    // Erros que já apareceram em código de verdade
    'no-undef': 'error',
    'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        varsIgnorePattern: `^_|${HANDLERS_INLINE.source}`,
    }],
    'no-redeclare': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-dupe-else-if': 'error',
    'no-unreachable': 'error',
    'no-cond-assign': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-fallthrough': 'error',
    'valid-typeof': 'error',
    'use-isnan': 'error',
    'no-self-assign': 'error',
    'no-self-compare': 'error',
    'no-control-regex': 'error',
    'no-prototype-builtins': 'error',
    'no-unsafe-negation': 'error',
    'array-callback-return': 'error',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-async-promise-executor': 'error',

    // Segurança
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',

    // Avisos úteis, sem bloquear
    'no-useless-escape': 'warn',
    'no-unmodified-loop-condition': 'warn',
    'no-template-curly-in-string': 'warn',
};

// Funções do kit compartilhado dos toys de texto. Elas são globais para o
// script do toy (script clássico na mesma página), mas não para o próprio kit.
const GLOBAIS_DO_KIT = {
    initTool: 'readonly',
    renderSettings: 'readonly',
    getSettings: 'readonly',
    createTable: 'readonly',
    inputLines: 'readonly',
    runTool: 'readonly',
};

export default [
    {
        ignores: [
            'vendor/**',
            'archive/**',
            'port/**',
            'dist/**',
            'coverage/**',
            '.coverage/**',
            'node_modules/**',
            'bench/resultados.json',
        ],
    },
    {
        // App e toys: scripts clássicos de navegador, com globais compartilhados
        // entre arquivos carregados na mesma página.
        files: ['app.js', 'toys/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                PDFLib: 'readonly',
                pdfjsLib: 'readonly',
                JSZip: 'readonly',
                XLSX: 'readonly',
                jspdf: 'readonly',
                Tesseract: 'readonly',
            },
        },
        rules: REGRAS,
    },
    {
        files: ['toys/*/script.js'],
        languageOptions: { globals: GLOBAIS_DO_KIT },
    },
    {
        // JS embutido nos HTML (preâmbulo de tema, toys com script inline,
        // handlers de atributo): o plugin extrai os blocos <script> para o lint.
        files: ['**/*.html'],
        plugins: { html },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: { ...globals.browser, PDFLib: 'readonly', pdfjsLib: 'readonly', JSZip: 'readonly', Tesseract: 'readonly', jspdf: 'readonly', GANTOYS: 'readonly' },
        },
        rules: REGRAS,
    },
    {
        // Node: ferramentas de build, harness, testes, benchmarks e checagens.
        files: [
            'build/**/*.mjs',
            'testkit/**/*.js',
            'test/**/*.js',
            'bench/**/*.mjs',
            'tools/**/*.mjs',
            'eslint.config.mjs',
        ],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: REGRAS,
    },
];
