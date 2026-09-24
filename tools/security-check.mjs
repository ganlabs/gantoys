#!/usr/bin/env node
/**
 * Checagens de segurança estáticas do projeto.
 *
 *   npm run security
 *
 * Olha o código que entra no entregável (app, toys, shared, build) procurando
 * padrões que já causaram problema em aplicação de navegador: execução dinâmica
 * de código, HTML montado por concatenação/interpolação, recurso externo não
 * declarado, segredo no repositório e mensagem entre janelas sem validação.
 *
 * O que for aceito conscientemente entra em `tools/seguranca-allowlist.json`
 * com o motivo — risco aceito tem de estar escrito, não escondido. Falha
 * (código de saída 1) quando aparece achado de severidade `erro` fora da lista.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ALLOWLIST = path.join(RAIZ, 'tools', 'seguranca-allowlist.json');
const IGNORAR_DIR = new Set(['vendor', 'archive', 'port', 'node_modules', 'dist', '.git', '.coverage', 'coverage']);
const EXTENSOES = ['.js', '.mjs', '.html', '.css', '.json', '.yml', '.yaml', '.md'];

const REGRAS = [
    {
        id: 'execucao-dinamica',
        severidade: 'erro',
        descricao: 'execução dinâmica de código (eval/new Function/timer com string)',
        padrao: /(^|[^\w.$])eval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]/g,
    },
    {
        id: 'html-interpolado',
        severidade: 'erro',
        descricao: 'HTML montado por interpolação ou concatenação (risco de injeção)',
        padrao: /\.(?:inner|outer)HTML\s*=\s*[`](?:(?![`])[\s\S])*?\$\{|\.(?:inner|outer)HTML\s*=\s*(?!['"`\s])[^;]*\+|insertAdjacentHTML\s*\(\s*[^,]+,\s*[^)]*\$\{/g,
    },
    {
        id: 'document-write',
        severidade: 'erro',
        descricao: 'document.write',
        padrao: /document\s*\.\s*write\s*\(/g,
    },
    {
        id: 'url-javascript',
        severidade: 'erro',
        descricao: 'URL javascript:',
        padrao: /(?:href|src|action)\s*=\s*["']\s*javascript:/gi,
    },
    {
        id: 'segredo-exposto',
        severidade: 'erro',
        descricao: 'credencial/chave privada no repositório',
        padrao: /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{24,}/g,
    },
    {
        id: 'noopener',
        severidade: 'erro',
        descricao: 'target=_blank sem rel=noopener',
        padrao: /target\s*=\s*["']_blank["'](?![^>]*rel\s*=\s*["'][^"']*noopener)/gi,
    },
    {
        id: 'recurso-remoto',
        severidade: 'aviso',
        descricao: 'recurso externo (o app é offline por contrato)',
        padrao: /(?:src|href)\s*=\s*["']https?:\/\/(?!(?:localhost|127\.0\.0\.1))/gi,
    },
    {
        id: 'http-inseguro',
        severidade: 'aviso',
        descricao: 'URL http:// sem TLS',
        padrao: /["']http:\/\/(?!(?:localhost|127\.0\.0\.1|gan\.localhost))/g,
    },
    {
        id: 'postmessage-curinga',
        severidade: 'info',
        descricao: 'postMessage com targetOrigin "*" (iframes srcdoc do bundle)',
        padrao: /postMessage\s*\([^)]*,\s*['"]\*['"]/g,
    },
    {
        id: 'permissao-fs',
        severidade: 'info',
        descricao: 'pedido de permissão de leitura/escrita em pasta',
        padrao: /requestPermission\s*\(|showDirectoryPicker\s*\(/g,
    },
];

function arquivos(dir = RAIZ, saida = []) {
    for (const nome of readdirSync(dir)) {
        const caminho = path.join(dir, nome);
        if (statSync(caminho).isDirectory()) {
            if (IGNORAR_DIR.has(nome)) continue;
            arquivos(caminho, saida);
        } else if (EXTENSOES.includes(path.extname(nome))) {
            saida.push(caminho);
        }
    }
    return saida;
}

function carregarAllowlist() {
    if (!existsSync(ALLOWLIST)) return [];
    const conteudo = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
    return conteudo.aceitos || [];
}

function linhaDe(texto, indice) {
    return texto.slice(0, indice).split('\n').length;
}

const allowlist = carregarAllowlist();
const achados = [];
const allowlistUsada = new Set();

for (const arquivo of arquivos()) {
    const relativo = path.relative(RAIZ, arquivo).split(path.sep).join('/');
    const texto = readFileSync(arquivo, 'utf8');

    for (const regra of REGRAS) {
        regra.padrao.lastIndex = 0;
        let achado;
        while ((achado = regra.padrao.exec(texto)) !== null) {
            const linha = linhaDe(texto, achado.index);
            const aceito = allowlist.find((item, indice) => {
                const casa = item.arquivo === relativo
                    && item.regra === regra.id
                    && (item.linha === undefined || item.linha === linha || item.linha === `${linha}`);
                if (casa) allowlistUsada.add(indice);
                return casa;
            });
            achados.push({
                arquivo: relativo,
                linha,
                regra: regra.id,
                severidade: regra.severidade,
                descricao: regra.descricao,
                trecho: texto.slice(achado.index, achado.index + 90).split('\n')[0].trim(),
                aceito: Boolean(aceito),
                motivo: aceito?.motivo,
            });
        }
    }
}

const erros = achados.filter((item) => item.severidade === 'erro' && !item.aceito);
const avisos = achados.filter((item) => item.severidade === 'aviso' && !item.aceito);
const infos = achados.filter((item) => item.severidade === 'info');

const mostrar = (titulo, lista) => {
    if (lista.length === 0) return;
    console.log(`\n${titulo} (${lista.length})`);
    for (const item of lista) {
        console.log(`  [${item.regra}] ${item.arquivo}:${item.linha} — ${item.descricao}`);
        console.log(`      ${item.trecho}${item.motivo ? `\n      aceito: ${item.motivo}` : ''}`);
    }
};

console.log('Checagem de segurança estática');
mostrar('ERROS', erros);
mostrar('AVISOS', avisos);
mostrar('INFORMAÇÃO', infos);

const aceitos = achados.filter((item) => item.aceito);
if (aceitos.length) console.log(`\nRiscos aceitos por escrito: ${aceitos.length} (tools/seguranca-allowlist.json)`);

// Entrada que não casa mais nada indica linha deslocada ou risco já corrigido:
// sem esse aviso, a lista vira lixo que ninguém revisa.
const obsoletas = allowlist.filter((_, indice) => !allowlistUsada.has(indice));
if (obsoletas.length) {
    console.log(`\nEntradas do allowlist que não casaram nenhum achado (${obsoletas.length}):`);
    for (const item of obsoletas) console.log(`  ${item.arquivo} [${item.regra}]${item.linha ? `:${item.linha}` : ''} — ${item.motivo || 'sem motivo'}`);
    console.log('  (revise: a linha mudou ou o risco foi corrigido)');
}

console.log(`\nArquivos analisados: ${arquivos().length}. Erros: ${erros.length}. Avisos: ${avisos.length}.`);

if (erros.length > 0) {
    console.error('\nFALHA: há achados de segurança de severidade erro. Conserte ou registre o risco aceito com motivo.');
    process.exit(1);
}
console.log('SEGURANÇA OK');
