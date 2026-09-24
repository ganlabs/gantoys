import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const AJUDA = path.join(RAIZ, 'toys', 'help', 'index.html');
const DIR_MANUAIS = path.join(RAIZ, 'toys', 'help', 'manual');
const BUNDLE = path.join(RAIZ, 'dist', 'index.html');

const ARQUIVOS = readdirSync(DIR_MANUAIS).filter((nome) => nome.endsWith('.md')).sort();
const SLUGS = ARQUIVOS.map((nome) => nome.replace(/\.md$/, ''));

function executar(script) {
    const resultado = spawnSync(process.execPath, [script], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(resultado.status, 0, `${script} saiu com ${resultado.status}:\n${resultado.stdout}\n${resultado.stderr}`);
    return resultado.stdout;
}

function manualEmDisco(slug) {
    return readFileSync(path.join(DIR_MANUAIS, `${slug}.md`), 'utf8');
}

function tituloDoArquivo(md) {
    const achado = md.match(/^#\s+(.+?)\s*$/m);
    assert.ok(achado, 'o manual precisa abrir com um título `# `');
    return achado[1];
}

/**
 * Blocos `<script type="text/markdown" data-manual="…">` de um HTML, com o
 * corpo exatamente como está no arquivo (coluna 0) e o texto original inteiro.
 */
function extrairBlocos(html) {
    const blocos = new Map();
    const re = /^ {4}<script type="text\/markdown" data-manual="([^"]+)" data-title="([^"]*)">\n([\s\S]*?)\n {4}<\/script>$/gm;
    for (const achado of html.matchAll(re)) {
        blocos.set(achado[1], { titulo: achado[2], corpo: achado[3], bloco: achado[0] });
    }
    return blocos;
}

function extrairCards(html) {
    return [...html.matchAll(/<button class="tile manual-card" type="button" data-manual="([^"]+)">/g)].map((a) => a[1]);
}

function contarToys() {
    const dir = path.join(RAIZ, 'toys');
    return readdirSync(dir)
        .filter((nome) => statSync(path.join(dir, nome)).isDirectory())
        .filter((nome) => existsSync(path.join(dir, nome, 'index.html')))
        .length;
}

test('Build — gerar os manuais duas vezes não muda toys/help/index.html', async () => {
    const antes = readFileSync(AJUDA);
    const somaDeBytes = ARQUIVOS.reduce((total, nome) => total + manualEmDisco(nome.replace(/\.md$/, '')).length, 0);
    const saidaEsperada = `[manual] ${ARQUIVOS.length} manuais embutidos em toys/help/index.html (${(somaDeBytes / 1024).toFixed(0)} KB de Markdown)\n`;

    assert.equal(executar('build/manual.mjs'), saidaEsperada);
    assert.deepEqual(readFileSync(AJUDA), antes, 'a primeira geração não pode alterar o arquivo versionado');

    assert.equal(executar('build/manual.mjs'), saidaEsperada, 'a segunda geração reporta o mesmo resumo');
    assert.deepEqual(readFileSync(AJUDA), antes, 'gerar de novo é idempotente');
});

test('Build — todo manual de toys/help/manual está embutido no toy de Ajuda, na coluna 0', async () => {
    const html = readFileSync(AJUDA, 'utf8');
    const blocos = extrairBlocos(html);

    assert.deepEqual([...blocos.keys()].sort(), SLUGS, 'um bloco embutido por arquivo de manual');
    assert.deepEqual(extrairCards(html).sort(), SLUGS, 'um card na grade por arquivo de manual');

    for (const arquivo of ARQUIVOS) {
        const slug = arquivo.replace(/\.md$/, '');
        const md = manualEmDisco(slug);
        const titulo = tituloDoArquivo(md);
        const bloco = blocos.get(slug);

        assert.equal(bloco.titulo, titulo, `data-title de ${slug}`);
        assert.equal(bloco.corpo, md.replace(/\s+$/, ''), `conteúdo embutido de ${slug}`);
        assert.equal(bloco.corpo.split('\n')[0], `# ${titulo}`, `o título de ${slug} precisa abrir o bloco`);
        assert.deepEqual(
            bloco.corpo.split('\n').filter((linha) => /^\s+#/.test(linha)),
            [],
            `nenhum título de ${slug} pode sair indentado`
        );
    }
});

test('Build — o bundle valida e embute o toy de Ajuda com os 17 manuais', async () => {
    const saida = executar('build/bundle.mjs');
    const tamanho = readFileSync(BUNDLE, 'utf8').length;
    const ultimaLinha = saida.trimEnd().split('\n').at(-1);
    assert.equal(
        ultimaLinha,
        `[bundle] dist/index.html: ${(tamanho / 1024 / 1024).toFixed(2)} MB (${contarToys()} toys embutidos)`
    );

    const html = readFileSync(BUNDLE, 'utf8');
    const marcador = '<script>window.GANTOYS_TOYS = ';
    const inicio = html.indexOf(marcador);
    assert.notEqual(inicio, -1, 'o bundle precisa expor o mapa de toys');
    const fim = html.indexOf('};</script>', inicio + marcador.length);
    assert.notEqual(fim, -1, 'o mapa de toys precisa fechar antes do fim do script');

    const regiao = html.slice(inicio + marcador.length, fim);
    assert.equal(regiao.includes('</script'), false, 'o mapa de toys não pode conter </script> cru');
    assert.equal(regiao.includes('<\\/script'), true, 'as sequências </script dos srcdoc precisam sair escapadas');

    const mapa = JSON.parse(`${regiao}}`);
    const ajuda = mapa.help;
    assert.equal(typeof ajuda, 'string', 'o bundle precisa embutir o toy help');

    const doBundle = extrairBlocos(ajuda);
    const doToy = extrairBlocos(readFileSync(AJUDA, 'utf8'));
    assert.deepEqual([...doBundle.keys()].sort(), SLUGS, 'os 17 manuais precisam chegar ao bundle');
    for (const slug of SLUGS) {
        assert.equal(doBundle.get(slug).bloco, doToy.get(slug).bloco, `manual ${slug} no bundle`);
    }

    const validacao = executar('build/check-bundle.mjs');
    assert.equal(validacao.trimEnd().split('\n').at(-1), 'VALIDAÇÃO OK');
});
