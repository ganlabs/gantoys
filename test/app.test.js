/* ==========================================================================
   App hospedeiro (`index.html` + `app.js`).

   O app é o outro lado do protocolo dos toys: atende `gantoys-*-request` por
   `postMessage`, guarda as pastas escolhidas e é quem mexe no DOM do app
   (navegação, tema, estado dos toys). Aqui o app roda de verdade dentro do
   jsdom; o "toy" é uma caixa de correio que entrega a mensagem e recolhe a
   resposta do app.
   ========================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp, montarArvore } from '../testkit/index.js';

/** Caixa de correio falsa no lugar da janela do toy. */
function correio() {
    const mensagens = [];
    return {
        mensagens,
        postMessage(dados) { mensagens.push(dados); },
        de(tipo, requestId) {
            return mensagens.find((m) => m.type === tipo && (requestId === undefined || m.requestId === requestId));
        },
        tipos() { return mensagens.map((m) => m.type); },
        limpar() { mensagens.length = 0; },
    };
}

function enviar(app, carta, dados) {
    app.janela.dispatchEvent(new app.janela.MessageEvent('message', { data: dados, source: carta }));
}

/** Normaliza um objeto vindo do contexto da página para o contexto do teste. */
function plano(valor) {
    return JSON.parse(JSON.stringify(valor));
}

/** Confirma a escolha de uma pasta no diálogo do app e devolve o id registrado. */
async function registrarPasta(app, carta, arvore, requestId, mode = 'readwrite') {
    return registrarHandle(app, carta, arvore.handle, requestId, mode, arvore.nome);
}

/** Igual a `registrarPasta`, mas com um handle próprio (dublê sobre a pasta). */
async function registrarHandle(app, carta, handle, requestId, mode = 'readwrite', nome = undefined) {
    app.enfileirarPasta({ handle });
    enviar(app, carta, { type: 'gantoys-directory-picker-request', requestId, mode });
    await app.tick(0);
    app.clicar('#directoryPickerConfirm');
    await app.tick(0);
    await app.tick(0);
    const resposta = carta.de('gantoys-directory-picker-result', requestId);
    assert.ok(resposta && resposta.directory, `pasta ${requestId} não registrada: ${JSON.stringify(resposta)}`);
    if (nome !== undefined) assert.equal(resposta.directory.name, nome);
    return resposta.directory.id;
}

/** Envia um pedido e espera a resposta de mesmo `requestId`. */
async function pedir(app, carta, dados, tipoResposta) {
    carta.limpar();
    enviar(app, carta, dados);
    await app.aguardar(() => Boolean(carta.de(tipoResposta, dados.requestId)), {
        descricao: `${tipoResposta} (${dados.requestId})`,
    });
    return carta.de(tipoResposta, dados.requestId);
}

async function abrirApp(t, opcoes) {
    const app = await carregarApp(opcoes);
    t.after(() => app.fechar());
    return app;
}

const AVISO_PASTA = 'Não foi possível abrir o seletor de pastas.';

/* ---------------------------------------------------------------------------
 * Protocolo da pasta
 * ------------------------------------------------------------------------- */

test('App — o diálogo confirma, devolve um id reaproveitável e cancela com AbortError', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const origem = montarArvore('Origem', { 'a.pdf': 'conteudo' });

    assert.equal(app.seletor('#directoryPickerModal').hidden, true);
    assert.equal(app.texto('#directoryPickerMessage'), 'Selecione uma pasta local para continuar.');

    app.enfileirarPasta(origem);
    enviar(app, carta, { type: 'gantoys-directory-picker-request', requestId: 'pasta-1', mode: 'read' });

    assert.equal(app.seletor('#directoryPickerModal').hidden, false);
    assert.equal(app.texto('#directoryPickerMessage'), 'Confirme para selecionar uma pasta local no seu computador.');
    assert.deepEqual(carta.tipos(), []);

    app.clicar('#directoryPickerConfirm');
    await app.tick(0);
    await app.tick(0);

    const resposta = carta.de('gantoys-directory-picker-result', 'pasta-1');
    assert.equal(resposta.requestId, 'pasta-1');
    assert.equal(resposta.error, undefined);
    assert.equal(resposta.directory.name, 'Origem');
    assert.match(resposta.directory.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(origem.modoUsado, 'read');
    assert.equal(app.seletor('#directoryPickerModal').hidden, true);

    // O id continua valendo para os outros pedidos do protocolo.
    const gravacao = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'arq-1', action: 'write',
        directoryId: resposta.directory.id, name: 'prova.txt', bytes: new Uint8Array([65, 66]),
    }, 'gantoys-file-result');
    assert.deepEqual(plano(gravacao.result), {});
    assert.deepEqual([...origem.paraObjeto()['prova.txt']], [65, 66]);

    // Cancelar responde AbortError e fecha o diálogo.
    carta.limpar();
    enviar(app, carta, { type: 'gantoys-directory-picker-request', requestId: 'pasta-2', mode: 'readwrite' });
    assert.equal(app.seletor('#directoryPickerModal').hidden, false);
    app.clicar('#directoryPickerCancel');
    await app.tick(0);

    assert.deepEqual(plano(carta.mensagens), [{
        type: 'gantoys-directory-picker-result',
        requestId: 'pasta-2',
        error: { name: 'AbortError', message: 'Seleção de pasta cancelada.' },
    }]);
    assert.equal(app.seletor('#directoryPickerModal').hidden, true);

    // Sem solicitação pendente o confirma não fala com o seletor.
    app.clicar('#directoryPickerConfirm');
    await app.tick(0);
    assert.equal(carta.mensagens.length, 1);
    assert.equal(app.filaDePastas.length, 0);

    // Pedido sem `mode` vira leitura e escrita (o padrão do app).
    const semModo = montarArvore('SemModo', {});
    app.enfileirarPasta(semModo);
    enviar(app, carta, { type: 'gantoys-directory-picker-request', requestId: 'pasta-3' });
    app.clicar('#directoryPickerConfirm');
    await app.tick(0);
    await app.tick(0);
    assert.equal(semModo.modoUsado, 'readwrite');
    assert.equal(carta.de('gantoys-directory-picker-result', 'pasta-3').directory.name, 'SemModo');
});

test('App — as falhas do seletor viram AbortError e o aviso fica na tela', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();

    const pedirPasta = async (requestId) => {
        carta.limpar();
        enviar(app, carta, { type: 'gantoys-directory-picker-request', requestId, mode: 'read' });
        app.clicar('#directoryPickerConfirm');
        await app.tick(0);
        await app.tick(0);
        return carta.de('gantoys-directory-picker-result', requestId);
    };

    // O seletor recusa (permissão, gesto ausente): aviso na tela, AbortError no toy.
    app.janela.showDirectoryPicker = async () => {
        const erro = new Error('permissão negada pelo usuário');
        erro.name = 'NotAllowedError';
        throw erro;
    };
    const recusa = await pedirPasta('falha-1');
    assert.deepEqual(plano(recusa.error), { name: 'AbortError', message: 'Seleção de pasta indisponível neste contexto.' });
    assert.equal(app.texto('#directoryPickerMessage'), `${AVISO_PASTA} permissão negada pelo usuário`);
    assert.equal(app.seletor('#directoryPickerModal').hidden, false);

    // Navegador sem a File System Access API: o aviso cita o caminho alternativo.
    delete app.janela.showDirectoryPicker;
    const semApi = await pedirPasta('falha-2');
    assert.deepEqual(plano(semApi.error), { name: 'AbortError', message: 'Seleção de pasta indisponível neste contexto.' });
    assert.equal(app.texto('#directoryPickerMessage'),
        `${AVISO_PASTA} Este navegador não expõe o seletor de pastas. Use o Chrome ou o Edge.`);

    // Erro sem mensagem: fica só o aviso genérico.
    app.janela.showDirectoryPicker = async () => { throw { name: 'Weird' }; };
    const semMensagem = await pedirPasta('falha-3');
    assert.deepEqual(plano(semMensagem.error), { name: 'AbortError', message: 'Seleção de pasta indisponível neste contexto.' });
    assert.equal(app.texto('#directoryPickerMessage'), AVISO_PASTA);

    // Cancelamento do próprio navegador: nada de aviso, o erro do seletor passa.
    app.janela.showDirectoryPicker = async () => {
        const erro = new Error('cancelado pelo usuário');
        erro.name = 'AbortError';
        throw erro;
    };
    const cancelado = await pedirPasta('falha-4');
    assert.deepEqual(plano(cancelado.error), { name: 'AbortError', message: 'cancelado pelo usuário' });
    // O novo pedido repõe a instrução e o cancelamento não escreve aviso por cima.
    assert.equal(app.texto('#directoryPickerMessage'), 'Confirme para selecionar uma pasta local no seu computador.');
    assert.equal(app.seletor('#directoryPickerModal').hidden, true);
});

test('App — uma nova solicitação de pasta cancela a anterior', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Escolhida', {});

    app.enfileirarPasta(pasta);
    enviar(app, carta, { type: 'gantoys-directory-picker-request', requestId: 'antiga', mode: 'read' });
    enviar(app, carta, { type: 'gantoys-directory-picker-request', requestId: 'nova', mode: 'readwrite' });
    await app.tick(0);

    assert.deepEqual(plano(carta.de('gantoys-directory-picker-result', 'antiga')), {
        type: 'gantoys-directory-picker-result',
        requestId: 'antiga',
        error: { name: 'AbortError', message: 'Uma nova seleção de pasta foi iniciada.' },
    });
    assert.equal(app.seletor('#directoryPickerModal').hidden, false);

    app.clicar('#directoryPickerConfirm');
    await app.tick(0);
    await app.tick(0);

    assert.equal(carta.de('gantoys-directory-picker-result', 'antiga').directory, undefined);
    assert.equal(carta.de('gantoys-directory-picker-result', 'nova').directory.name, 'Escolhida');
    assert.equal(pasta.modoUsado, 'readwrite');
});

test('App — mensagens de outro tipo ou sem dados não quebram o protocolo', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Depois', { 'x.txt': 'x' });

    app.janela.dispatchEvent(new app.janela.MessageEvent('message'));
    enviar(app, carta, { type: 'gantoys-desconhecido', requestId: 'z' });
    await app.tick(0);
    assert.deepEqual(carta.mensagens, []);

    // O app continua atendendo normalmente depois do ruído.
    const id = await registrarPasta(app, carta, pasta, 'pasta-ok');
    assert.match(id, /^[0-9a-f-]{36}$/);
});

test('App — o seletor do app repassa o modo pedido e assume leitura e escrita', async (t) => {
    const app = await abrirApp(t);
    const modos = [];

    app.janela.showDirectoryPicker = async (opcoes) => {
        modos.push(opcoes.mode);
        return montarArvore('Direta', {}).handle;
    };

    const leitura = await app.janela.showGanToysDirectoryPicker('read');
    const padrao = await app.janela.showGanToysDirectoryPicker();

    assert.deepEqual(modos, ['read', 'readwrite']);
    assert.equal(leitura.name, 'Direta');
    assert.equal(padrao.name, 'Direta');
});

/* ---------------------------------------------------------------------------
 * Motor de cópia por processo
 * ------------------------------------------------------------------------- */

test('App — cópia por processo: copia, sobrescreve o diferente e marca igual e não localizado', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const origem = montarArvore('Origem', {
        '12345/peca.pdf': 'conteudo-1',
        '67890/doc.pdf': 'conteudo-2',
        'ruido/leiame.txt': 'texto',
        'sub/12345/anexo.pdf': 'conteudo-1',
    });
    // Mesmo tamanho e conteúdo diferente: a comparação chega a olhar os bytes.
    const destino = montarArvore('Destino', { 'peca.pdf': 'conteudo-1', 'doc.pdf': 'conteudo-X' });

    const sourceId = await registrarPasta(app, carta, origem, 'origem');
    const destinationId = await registrarPasta(app, carta, destino, 'destino');

    carta.limpar();
    enviar(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-1', mode: 'santander',
        sourceId, destinationId, processes: ['12345', '67890', '99999'],
    });
    await app.aguardar(() => Boolean(carta.de('gantoys-copy-result', 'copia-1')), { descricao: 'resultado da cópia' });

    const progressos = carta.mensagens.filter((m) => m.type === 'gantoys-copy-progress');
    assert.deepEqual(plano(progressos[0].progress), { scanned: 1, found: 1, copied: 0 });
    assert.deepEqual(plano(progressos.at(-1).progress), { scanned: 4, found: 3, copied: 2 });
    for (const progresso of progressos) assert.equal(progresso.requestId, 'copia-1');

    const resultado = carta.de('gantoys-copy-result', 'copia-1');
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.result.total, 3);
    assert.deepEqual(plano(resultado.result.results), [
        { status: 'same', reference: '12345', message: '12345/peca.pdf: já existe no destino com o mesmo conteúdo' },
        { status: 'updated', message: '67890/doc.pdf (sobrescrito)' },
        { status: 'ok', message: 'sub/12345/anexo.pdf' },
        { status: 'missing', reference: '99999', message: '99999: nenhum arquivo localizado na origem.' },
    ]);
    assert.deepEqual(destino.caminhos(), ['anexo.pdf', 'doc.pdf', 'peca.pdf']);
    assert.equal(destino.conteudo('doc.pdf'), 'conteudo-2');
    assert.equal(destino.conteudo('anexo.pdf'), 'conteudo-1');
    assert.equal(destino.conteudo('peca.pdf'), 'conteudo-1');
    assert.deepEqual(origem.caminhos(), ['12345/peca.pdf', '67890/doc.pdf', 'ruido/leiame.txt', 'sub/12345/anexo.pdf']);
});

test('App — cópia por processo: o mesmo arquivo na origem e no destino não é tocado', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Unica', { 'a.pdf': 'AAA', 'b.pdf': 'BBB' });

    const id = await registrarPasta(app, carta, pasta, 'unica');
    const resposta = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-2', mode: 'santander',
        sourceId: id, destinationId: id, processes: ['a', 'b'],
    }, 'gantoys-copy-result');

    assert.equal(resposta.result.total, 2);
    assert.deepEqual(plano(resposta.result.results), [
        { status: 'same', reference: 'a', message: 'a.pdf: origem e destino são o mesmo arquivo' },
        { status: 'same', reference: 'b', message: 'b.pdf: origem e destino são o mesmo arquivo' },
    ]);
    assert.deepEqual(pasta.caminhos(), ['a.pdf', 'b.pdf']);
    assert.equal(pasta.conteudo('a.pdf'), 'AAA');
    assert.equal(pasta.escritas.length, 0);
});

test('App — cópia por processo: nenhum processo resolvido responde o aviso de lote vazio', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const origem = montarArvore('Vazia', { '12345/a.pdf': 'a' });
    const destino = montarArvore('Destino', {});

    const sourceId = await registrarPasta(app, carta, origem, 'origem-vazia');
    const destinationId = await registrarPasta(app, carta, destino, 'destino-vazio');

    const resposta = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-3', mode: 'santander',
        sourceId, destinationId, processes: [],
    }, 'gantoys-copy-result');

    assert.equal(resposta.result.total, 0);
    assert.deepEqual(plano(resposta.result.results), [{
        status: 'missing', reference: '', message: 'Nenhum arquivo encontrado para os processos informados.',
    }]);
    assert.deepEqual(destino.caminhos(), []);
});

test('App — cópia: item que falha no meio do lote vira status fail e o lote continua', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const origem = montarArvore('Falha', { '777/a.pdf': 'A', '888/b.pdf': 'B' });
    const destino = montarArvore('Travado', {});
    destino.negarCriacao = true;

    const sourceId = await registrarPasta(app, carta, origem, 'origem-falha');
    const destinationId = await registrarPasta(app, carta, destino, 'destino-travado');

    const resposta = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-4', mode: 'santander',
        sourceId, destinationId, processes: ['777', '888'],
    }, 'gantoys-copy-result');

    assert.equal(resposta.result.total, 2);
    assert.deepEqual(plano(resposta.result.results), [
        { status: 'fail', reference: '777', message: '777/a.pdf: O arquivo ou diretório "a.pdf" não existe.' },
        { status: 'fail', reference: '888', message: '888/b.pdf: O arquivo ou diretório "b.pdf" não existe.' },
    ]);
    assert.deepEqual(destino.caminhos(), []);
});

test('App — cópia: permissão negada na origem ou no destino responde o erro exato', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();

    const origemLivre = montarArvore('Livre', { '111/a.pdf': 'a' });
    const destinoNegado = montarArvore('Negado', {});
    destinoNegado.negarPermissao = true;
    const origemNegada = montarArvore('SemLeitura', { '111/a.pdf': 'a' });
    origemNegada.negarPermissao = true;
    const destinoLivre = montarArvore('LivreDestino', {});

    const livre = await registrarPasta(app, carta, origemLivre, 'livre');
    const negado = await registrarPasta(app, carta, destinoNegado, 'negado');
    const semLeitura = await registrarPasta(app, carta, origemNegada, 'sem-leitura');
    const livreDestino = await registrarPasta(app, carta, destinoLivre, 'livre-destino');

    const destinoBarrado = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-5', mode: 'santander',
        sourceId: livre, destinationId: negado, processes: ['111'],
    }, 'gantoys-copy-result');
    assert.deepEqual(plano(destinoBarrado.error), {
        name: 'Error', message: 'É necessário conceder permissão de leitura na origem e escrita no destino.',
    });

    const origemBarrada = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-6', mode: 'santander',
        sourceId: semLeitura, destinationId: livreDestino, processes: ['111'],
    }, 'gantoys-copy-result');
    assert.deepEqual(plano(origemBarrada.error), {
        name: 'Error', message: 'É necessário conceder permissão de leitura na origem e escrita no destino.',
    });
    assert.deepEqual(destinoLivre.caminhos(), []);
});

test('App — cópia: pasta fora do mapa e modo desconhecido respondem erro', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const origem = montarArvore('Origem', { '111/a.pdf': 'a' });

    const sourceId = await registrarPasta(app, carta, origem, 'origem-mapa');

    const semOrigem = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-7', mode: 'santander',
        sourceId: 'id-fantasma', destinationId: sourceId, processes: ['111'],
    }, 'gantoys-copy-result');
    assert.deepEqual(plano(semOrigem.error), {
        name: 'Error', message: 'Selecione novamente as pastas de origem e destino.',
    });

    const semDestino = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-8', mode: 'santander',
        sourceId, destinationId: undefined, processes: ['111'],
    }, 'gantoys-copy-result');
    assert.deepEqual(plano(semDestino.error), {
        name: 'Error', message: 'Selecione novamente as pastas de origem e destino.',
    });

    const modoRuim = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-9', mode: 'outro-banco',
        sourceId, destinationId: sourceId, processes: ['111'],
    }, 'gantoys-copy-result');
    assert.deepEqual(plano(modoRuim.error), { name: 'Error', message: 'Operação de cópia inválida.' });
});

test('App — cópia: a busca casa por dígitos, não interpreta regex e compara arquivos grandes', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const grande = 'x'.repeat((1 << 20) + 10);
    const origem = montarArvore('Mista', {
        'docs/12/345/ficha.pdf': 'a',
        'cliente-x/contrato.pdf': 'b',
        'aXb/armadilha.pdf': 'c',
        'grande/g.pdf': grande,
    });
    const destino = montarArvore('Destino', { 'ficha.pdf': 'a', 'g.pdf': grande });

    const sourceId = await registrarPasta(app, carta, origem, 'origem-mista');
    const destinationId = await registrarPasta(app, carta, destino, 'destino-misto');

    // `12345` casa com o caminho quebrado em pastas (só os dígitos contam);
    // `a.b` é literal — `aXb` não pode casar; o arquivo de 1 MB é comparado em
    // blocos e, sendo o mesmo conteúdo, não é reescrito.
    const resposta = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-10', mode: 'santander',
        sourceId, destinationId, processes: ['12345', 'a.b', 'cliente-x', 'g'],
    }, 'gantoys-copy-result');

    assert.equal(resposta.result.total, 3);
    assert.deepEqual(plano(resposta.result.results), [
        { status: 'same', reference: '12345', message: 'docs/12/345/ficha.pdf: já existe no destino com o mesmo conteúdo' },
        { status: 'ok', message: 'cliente-x/contrato.pdf' },
        { status: 'same', reference: 'g', message: 'grande/g.pdf: já existe no destino com o mesmo conteúdo' },
        { status: 'missing', reference: 'a.b', message: 'a.b: nenhum arquivo localizado na origem.' },
    ]);
    assert.deepEqual(destino.caminhos(), ['contrato.pdf', 'ficha.pdf', 'g.pdf']);
});

test('App — cópia: erro de disco no destino falha só aquele arquivo', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const origem = montarArvore('Origem', { '555/a.pdf': 'a', '666/b.pdf': 'b' });
    const destino = montarArvore('Destino', {});

    // Fora do "não existe", o erro do sistema de arquivos sobe e marca a linha.
    const handle = new Proxy(destino.handle, {
        get(alvo, propriedade) {
            if (propriedade === 'getFileHandle') {
                return async () => { throw new Error('disco ruim'); };
            }
            return alvo[propriedade];
        },
    });

    const sourceId = await registrarPasta(app, carta, origem, 'origem-disco');
    const destinationId = await registrarHandle(app, carta, handle, 'destino-disco', 'readwrite', 'Destino');

    const resposta = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'copia-11', mode: 'santander',
        sourceId, destinationId, processes: ['555', '666'],
    }, 'gantoys-copy-result');

    assert.equal(resposta.result.total, 2);
    assert.deepEqual(plano(resposta.result.results), [
        { status: 'fail', reference: '555', message: '555/a.pdf: disco ruim' },
        { status: 'fail', reference: '666', message: '666/b.pdf: disco ruim' },
    ]);
    assert.deepEqual(destino.caminhos(), []);
});

/* ---------------------------------------------------------------------------
 * Motor de cópia Bradesco (processo → pasta cliente)
 * ------------------------------------------------------------------------- */

test('App — Bradesco: pareia processo e pasta cliente pela ordem das linhas e para ao resolver tudo', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const origem = montarArvore('Origem', {
        'zzz/outro.pdf': 'nenhum processo',
        'a/111/doc.pdf': 'um',
        'x/nota.txt': 'n',
        'b/222/doc.pdf': 'dois',
        'c/111/doc2.pdf': 'tres',
    });
    const destino = montarArvore('Destino', {});

    const sourceId = await registrarPasta(app, carta, origem, 'origem-bradesco');
    const destinationId = await registrarPasta(app, carta, destino, 'destino-bradesco');

    carta.limpar();
    enviar(app, carta, {
        type: 'gantoys-copy-request', requestId: 'bradesco-1', mode: 'bradesco',
        sourceId, destinationId, processes: ['111', '222'], clients: ['Cliente A', 'Cliente B'],
    });
    await app.aguardar(() => Boolean(carta.de('gantoys-copy-result', 'bradesco-1')), { descricao: 'resultado do Bradesco' });

    const progressos = carta.mensagens.filter((m) => m.type === 'gantoys-copy-progress');
    // O primeiro PDF não casa com nenhum processo: é varrido e ignorado.
    assert.deepEqual(plano(progressos[0].progress), { scanned: 1, copied: 0, total: 2 });
    assert.deepEqual(plano(progressos.at(-1).progress), { scanned: 4, copied: 2, total: 2 });

    const resultado = carta.de('gantoys-copy-result', 'bradesco-1');
    assert.equal(resultado.result.total, 2);
    assert.deepEqual(plano(resultado.result.results), [
        { status: 'ok', message: '111 → INICIAL Cliente A.pdf' },
        { status: 'ok', message: '222 → INICIAL Cliente B.pdf' },
    ]);
    // Com os dois processos resolvidos a varredura para: o arquivo seguinte não é copiado.
    assert.deepEqual(destino.caminhos(), ['INICIAL Cliente A.pdf', 'INICIAL Cliente B.pdf']);
    assert.equal(destino.conteudo('INICIAL Cliente A.pdf'), 'um');
    assert.equal(destino.conteudo('INICIAL Cliente B.pdf'), 'dois');
});

test('App — Bradesco: igual, sobrescrito, falha de gravação e processo sem PDF', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const origem = montarArvore('Origem', {
        '111/x.pdf': 'um',
        '111/nota.txt': 'ignorada',
        '222/y.pdf': 'dois',
        '333/z.pdf': 'tres',
    });
    const destino = montarArvore('Destino', { 'INICIAL A.pdf': 'um', 'INICIAL B.pdf': 'outro' });
    destino.negarCriacao = true;

    const sourceId = await registrarPasta(app, carta, origem, 'origem-br2');
    const destinationId = await registrarPasta(app, carta, destino, 'destino-br2');

    const resposta = await pedir(app, carta, {
        type: 'gantoys-copy-request', requestId: 'bradesco-2', mode: 'bradesco',
        sourceId, destinationId,
        processes: ['111', '222', '333', '444'],
        clients: ['A', 'B', 'C', 'D'],
    }, 'gantoys-copy-result');

    assert.equal(resposta.result.total, 4);
    assert.deepEqual(plano(resposta.result.results), [
        { status: 'same', reference: '111', message: '111 → INICIAL A.pdf: já existe no destino com o mesmo conteúdo' },
        { status: 'updated', message: '222 → INICIAL B.pdf (sobrescrito)' },
        { status: 'fail', reference: '333', message: '333: O arquivo ou diretório "INICIAL C.pdf" não existe.' },
        { status: 'missing', reference: '444', message: '444: nenhum PDF localizado.' },
    ]);
    assert.deepEqual(destino.caminhos(), ['INICIAL A.pdf', 'INICIAL B.pdf']);
    assert.equal(destino.conteudo('INICIAL B.pdf'), 'dois');
});

/* ---------------------------------------------------------------------------
 * Motor de renomeação
 * ------------------------------------------------------------------------- */

test('App — renomeação: a prévia devolve planId, total e linhas na ordem da varredura', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Pasta', {
        'Integral - 123.pdf': 'a',
        'Integral - 456.pdf': 'b',
        'Outro.pdf': 'c',
        'sub/Integral - 789.pdf': 'd',
    });

    const id = await registrarPasta(app, carta, pasta, 'pasta-ren');

    const previa = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'previa-1', action: 'preview', directoryId: id,
        pattern: 'Integral - *.pdf', replacement: 'Integra_$1.pdf',
        normalizeExtension: false, includeSubfolders: false,
    }, 'gantoys-renamer-result');

    assert.equal(previa.error, undefined);
    assert.match(previa.result.planId, /^[0-9a-f-]{36}$/);
    assert.equal(previa.result.total, 3);
    assert.deepEqual(plano(previa.result.rows), [
        { path: 'Integral - 123.pdf', newName: 'Integra_123.pdf' },
        { path: 'Integral - 456.pdf', newName: 'Integra_456.pdf' },
    ]);

    const comSubpastas = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'previa-2', action: 'preview', directoryId: id,
        pattern: 'Integral - *.pdf', replacement: 'Integra_$1.pdf', includeSubfolders: true,
    }, 'gantoys-renamer-result');

    assert.equal(comSubpastas.result.total, 4);
    assert.deepEqual(plano(comSubpastas.result.rows), [
        { path: 'Integral - 123.pdf', newName: 'Integra_123.pdf' },
        { path: 'Integral - 456.pdf', newName: 'Integra_456.pdf' },
        { path: 'sub/Integral - 789.pdf', newName: 'Integra_789.pdf' },
    ]);
    assert.notEqual(comSubpastas.result.planId, previa.result.planId);

    // Sem substituição o padrão é removido do nome.
    const semSubstituicao = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'previa-3', action: 'preview', directoryId: id,
        pattern: 'Outro',
    }, 'gantoys-renamer-result');
    assert.equal(semSubstituicao.result.total, 3);
    assert.deepEqual(plano(semSubstituicao.result.rows), [{ path: 'Outro.pdf', newName: '.pdf' }]);

    // Sem padrão nenhum nada casa: a varredura conta os arquivos, sem linhas.
    const semPadrao = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'previa-4', action: 'preview', directoryId: id,
    }, 'gantoys-renamer-result');
    assert.equal(semPadrao.result.total, 3);
    assert.deepEqual(plano(semPadrao.result.rows), []);
});

test('App — renomeação: aplicar renomeia a árvore e consome a prévia', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Pasta', {
        'Integral - 123.pdf': 'a',
        'Integral - 456.pdf': 'b',
        'Outro.pdf': 'c',
    });

    const id = await registrarPasta(app, carta, pasta, 'pasta-apply');
    const previa = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'previa-a', action: 'preview', directoryId: id,
        pattern: 'Integral - *.pdf', replacement: 'Integra_$1.pdf',
    }, 'gantoys-renamer-result');

    const aplicacao = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'aplicar-1', action: 'apply', planId: previa.result.planId,
    }, 'gantoys-renamer-result');

    assert.equal(aplicacao.error, undefined);
    assert.deepEqual(plano(aplicacao.result.results), [
        { status: 'ok', message: 'Integral - 123.pdf → Integra_123.pdf' },
        { status: 'ok', message: 'Integral - 456.pdf → Integra_456.pdf' },
    ]);
    assert.deepEqual(pasta.caminhos(), ['Integra_123.pdf', 'Integra_456.pdf', 'Outro.pdf']);
    assert.equal(pasta.conteudo('Integra_123.pdf'), 'a');

    const repetida = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'aplicar-2', action: 'apply', planId: previa.result.planId,
    }, 'gantoys-renamer-result');
    assert.deepEqual(plano(repetida.error), {
        name: 'Error', message: 'A prévia expirou. Gere uma nova prévia antes de renomear.',
    });
    assert.deepEqual(pasta.caminhos(), ['Integra_123.pdf', 'Integra_456.pdf', 'Outro.pdf']);
});

test('App — renomeação: conflito de nome falha a linha e mantém a árvore', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Pasta', { 'Integral - 123.pdf': 'a', 'Integra_123.pdf': 'existente' });

    const id = await registrarPasta(app, carta, pasta, 'pasta-conflito');
    const previa = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'previa-c', action: 'preview', directoryId: id,
        pattern: 'Integral - *.pdf', replacement: 'Integra_$1.pdf',
    }, 'gantoys-renamer-result');
    assert.deepEqual(plano(previa.result.rows), [{ path: 'Integral - 123.pdf', newName: 'Integra_123.pdf' }]);

    const aplicacao = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'aplicar-c', action: 'apply', planId: previa.result.planId,
    }, 'gantoys-renamer-result');

    assert.deepEqual(plano(aplicacao.result.results), [
        { status: 'fail', message: 'Integral - 123.pdf: já existe um arquivo com esse nome' },
    ]);
    assert.deepEqual(pasta.caminhos(), ['Integra_123.pdf', 'Integral - 123.pdf']);
    assert.equal(pasta.conteudo('Integra_123.pdf'), 'existente');
});

test('App — renomeação: erro de disco ao conferir o nome falha a linha', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Pasta', { 'Integral - 1.pdf': 'a' });

    const handle = new Proxy(pasta.handle, {
        get(alvo, propriedade) {
            if (propriedade === 'getFileHandle') {
                return async () => { throw new Error('disco ruim'); };
            }
            return alvo[propriedade];
        },
    });

    const id = await registrarHandle(app, carta, handle, 'pasta-disco', 'readwrite', 'Pasta');
    const previa = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'previa-d', action: 'preview', directoryId: id,
        pattern: 'Integral - *.pdf', replacement: 'Integra_$1.pdf',
    }, 'gantoys-renamer-result');
    assert.deepEqual(plano(previa.result.rows), [{ path: 'Integral - 1.pdf', newName: 'Integra_1.pdf' }]);

    const aplicacao = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'aplicar-d', action: 'apply', planId: previa.result.planId,
    }, 'gantoys-renamer-result');

    assert.deepEqual(plano(aplicacao.result.results), [
        { status: 'fail', message: 'Integral - 1.pdf: disco ruim' },
    ]);
    assert.deepEqual(pasta.caminhos(), ['Integral - 1.pdf']);
});

test('App — renomeação: prévia expirada, pasta ausente e ação inválida respondem erro', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Pasta', { 'a.pdf': 'a' });

    const id = await registrarPasta(app, carta, pasta, 'pasta-erros');

    const expirada = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'erro-1', action: 'apply', planId: 'plano-inexistente',
    }, 'gantoys-renamer-result');
    assert.deepEqual(plano(expirada.error), {
        name: 'Error', message: 'A prévia expirou. Gere uma nova prévia antes de renomear.',
    });

    const pastaAusente = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'erro-2', action: 'preview', directoryId: 'id-fantasma', pattern: '*',
    }, 'gantoys-renamer-result');
    assert.deepEqual(plano(pastaAusente.error), {
        name: 'Error', message: 'A pasta selecionada não está mais disponível. Selecione-a novamente.',
    });

    const acaoInvalida = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'erro-3', action: 'renomear', directoryId: id,
    }, 'gantoys-renamer-result');
    assert.deepEqual(plano(acaoInvalida.error), { name: 'Error', message: 'Operação de renomeação inválida.' });
    assert.deepEqual(pasta.caminhos(), ['a.pdf']);
});

test('App — renomeação: extensão normalizada', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Ext', { xPDF: '1', fim: '2', 'ja.pdf': '3', 'AB.PDF': '4' });

    const id = await registrarPasta(app, carta, pasta, 'pasta-ext');
    const previa = async (requestId, pattern, replacement) => (await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId, action: 'preview', directoryId: id,
        pattern, replacement, normalizeExtension: true,
    }, 'gantoys-renamer-result')).result;

    // Nome que começa com ponto: a normalização não mexe.
    const semExtensao = await previa('ext-1', 'x*', '.$1');
    assert.deepEqual(plano(semExtensao.rows), [{ path: 'xPDF', newName: '.PDF' }]);
    // Nome terminando em ponto: também fica como está.
    const pontoFinal = await previa('ext-2', 'fim', 'fim.');
    assert.deepEqual(plano(pontoFinal.rows), [{ path: 'fim', newName: 'fim.' }]);
    // Extensão já minúscula: sem mudança.
    const minuscula = await previa('ext-3', 'ja*', 'novo$1');
    assert.deepEqual(plano(minuscula.rows), [{ path: 'ja.pdf', newName: 'novo.pdf' }]);
    // Extensão em maiúsculas: vira minúscula.
    const maiuscula = await previa('ext-4', 'AB*', 'CD$1');
    assert.deepEqual(plano(maiuscula.rows), [{ path: 'AB.PDF', newName: 'CD.pdf' }]);

    const aplicacao = await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId: 'ext-5', action: 'apply', planId: maiuscula.planId,
    }, 'gantoys-renamer-result');
    assert.deepEqual(plano(aplicacao.result.results), [{ status: 'ok', message: 'AB.PDF → CD.pdf' }]);
    assert.deepEqual(pasta.caminhos(), ['CD.pdf', 'fim', 'ja.pdf', 'xPDF']);
});

test('App — renomeação: curingas ignoram maiúsculas e contam cada ?', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Curingas', {
        'Rel23 2020.pdf': 'a',
        'RelaB 3030.pdf': 'b',
        'RelX23 fim.pdf': 'c',
        'Nada.txt': 'd',
    });

    const id = await registrarPasta(app, carta, pasta, 'pasta-curinga');
    const previa = async (requestId, pattern, replacement) => (await pedir(app, carta, {
        type: 'gantoys-renamer-request', requestId, action: 'preview', directoryId: id, pattern, replacement,
    }, 'gantoys-renamer-result')).result;

    // `??` consome exatamente dois caracteres; `*` captura o resto.
    const doisCuringas = await previa('cur-1', 'Rel?? *', 'R$1_$2');
    assert.equal(doisCuringas.total, 4);
    assert.deepEqual(plano(doisCuringas.rows), [
        { path: 'Rel23 2020.pdf', newName: 'R23_2020.pdf' },
        { path: 'RelaB 3030.pdf', newName: 'RaB_3030.pdf' },
    ]);

    // Um `?` consome um caractere só, e o curinga da cauda leva o resto do nome.
    const umCuringa = await previa('cur-2', 'Rel?23 *', 'X$1$2');
    assert.equal(umCuringa.total, 4);
    assert.deepEqual(plano(umCuringa.rows), [{ path: 'RelX23 fim.pdf', newName: 'XXfim.pdf' }]);

    // Sem correspondência: nenhuma linha, mas o total conta a varredura.
    const semLinhas = await previa('cur-3', 'zzz*.pdf', 'nada');
    assert.equal(semLinhas.total, 4);
    assert.deepEqual(plano(semLinhas.rows), []);
    assert.deepEqual(pasta.caminhos(), ['Nada.txt', 'Rel23 2020.pdf', 'RelX23 fim.pdf', 'RelaB 3030.pdf']);
});

/* ---------------------------------------------------------------------------
 * Pedidos de arquivo
 * ------------------------------------------------------------------------- */

test('App — arquivo: grava e lê os bytes exatos', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Pasta', { 'existente.bin': 'abc' });

    const id = await registrarPasta(app, carta, pasta, 'pasta-arquivo');

    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const gravacao = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'arq-w', action: 'write',
        directoryId: id, name: 'saida.bin', bytes,
    }, 'gantoys-file-result');
    assert.equal(gravacao.error, undefined);
    assert.deepEqual(plano(gravacao.result), {});
    assert.deepEqual(pasta.escritas, ['saida.bin']);
    assert.deepEqual([...pasta.paraObjeto()['saida.bin']], [0, 1, 2, 250, 255]);

    const leitura = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'arq-r', action: 'read', directoryId: id, name: 'existente.bin',
    }, 'gantoys-file-result');
    assert.deepEqual([...new Uint8Array(leitura.result.bytes)], [97, 98, 99]);

    const releitura = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'arq-r2', action: 'read', directoryId: id, name: 'saida.bin',
    }, 'gantoys-file-result');
    assert.deepEqual([...new Uint8Array(releitura.result.bytes)], [0, 1, 2, 250, 255]);
    assert.deepEqual(pasta.caminhos(), ['existente.bin', 'saida.bin']);
});

test('App — arquivo: permissão negada, arquivo ausente e ação inválida', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const livre = montarArvore('Livre', { 'a.txt': 'a' });
    const travada = montarArvore('Travada', {});
    travada.negarPermissao = true;

    const idLivre = await registrarPasta(app, carta, livre, 'arq-livre');
    const idTravada = await registrarPasta(app, carta, travada, 'arq-travada');

    const escritaNegada = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'neg-w', action: 'write',
        directoryId: idTravada, name: 'x.txt', bytes: new Uint8Array([1]),
    }, 'gantoys-file-result');
    assert.deepEqual(plano(escritaNegada.error), {
        name: 'Error', message: 'É necessário conceder permissão de escrita na pasta de destino.',
    });

    const leituraNegada = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'neg-r', action: 'read', directoryId: idTravada, name: 'x.txt',
    }, 'gantoys-file-result');
    assert.deepEqual(plano(leituraNegada.error), {
        name: 'Error', message: 'É necessário conceder permissão de leitura na pasta de destino.',
    });

    const ausente = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'falta', action: 'read', directoryId: idLivre, name: 'nao-existe.pdf',
    }, 'gantoys-file-result');
    assert.deepEqual(plano(ausente.error), {
        name: 'NotFoundError', message: 'O arquivo ou diretório "nao-existe.pdf" não existe.',
    });

    const acaoInvalida = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'acao', action: 'apagar', directoryId: idLivre, name: 'a.txt',
    }, 'gantoys-file-result');
    assert.deepEqual(plano(acaoInvalida.error), { name: 'Error', message: 'Operação de arquivo inválida.' });

    const pastaAusente = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'sem-pasta', action: 'read', directoryId: 'id-fantasma', name: 'a.txt',
    }, 'gantoys-file-result');
    assert.deepEqual(plano(pastaAusente.error), {
        name: 'Error', message: 'A pasta selecionada não está mais disponível. Selecione-a novamente.',
    });
    assert.deepEqual(livre.caminhos(), ['a.txt']);
});

test('App — arquivo: pasta que só concede permissão depois de pedir', async (t) => {
    const app = await abrirApp(t);
    const carta = correio();
    const pasta = montarArvore('Pedida', {});

    let pedidos = 0;
    const handle = new Proxy(pasta.handle, {
        get(alvo, propriedade) {
            if (propriedade === 'queryPermission') return async () => 'prompt';
            if (propriedade === 'requestPermission') {
                return async () => { pedidos += 1; return 'granted'; };
            }
            return alvo[propriedade];
        },
    });

    const id = await registrarHandle(app, carta, handle, 'pasta-prompt', 'readwrite', 'Pedida');

    const gravacao = await pedir(app, carta, {
        type: 'gantoys-file-request', requestId: 'prompt-w', action: 'write',
        directoryId: id, name: 'novo.txt', bytes: new Uint8Array([67]),
    }, 'gantoys-file-result');

    assert.deepEqual(plano(gravacao.result), {});
    assert.equal(pedidos, 1);
    assert.deepEqual(pasta.caminhos(), ['novo.txt']);
});

/* ---------------------------------------------------------------------------
 * Navegação, tema e estado
 * ------------------------------------------------------------------------- */

test('App — navegação: o item grava lastToy, cria o iframe e o Início limpa', async (t) => {
    const app = await abrirApp(t);
    const raiz = app.janela.document.documentElement;

    assert.equal(raiz.getAttribute('data-theme'), 'dark');
    assert.equal(raiz.getAttribute('data-visual'), 'glassmorphism');
    assert.deepEqual(app.todos('.nav-item.active').map((item) => item.dataset.toy), ['home']);
    assert.equal(app.existe('#welcomePanel'), true);
    assert.equal(app.texto('#welcomeVersion'), '');
    assert.equal(app.seletor('#welcomeVersion').style.display, 'none');
    assert.equal(app.janela.localStorage.getItem('lastToy'), null);
    assert.match(app.texto('#welcomeQuote'), /^".+"$/);

    // Clique no menu fora de um item não muda de ferramenta.
    app.clicar('#sidebarNav');
    assert.equal(app.existe('#welcomePanel'), true);
    assert.equal(app.janela.localStorage.getItem('lastToy'), null);

    app.clicar('[data-toy="gancopy"]');
    assert.equal(app.janela.localStorage.getItem('lastToy'), 'gancopy');
    assert.deepEqual(app.todos('.nav-item.active').map((item) => item.dataset.toy), ['gancopy']);
    assert.equal(app.existe('#welcomePanel'), false);
    assert.equal(app.script('GANTOYS.currentToy'), 'gancopy');

    const iframe = app.seletor('#toyIframe');
    assert.equal(iframe.getAttribute('src'), 'toys/gancopy/index.html');
    assert.equal(iframe.className, 'toy-iframe');
    assert.equal(iframe.getAttribute('allow'), 'clipboard-read *; clipboard-write *');
    assert.equal(app.todos('#toyFrame iframe').length, 1);

    app.clicar('#sidebarToggle');
    assert.equal(app.seletor('#sidebar').classList.contains('open'), true);
    app.clicar('[data-toy="ganpdf"]');
    assert.equal(app.seletor('#sidebar').classList.contains('open'), false);
    assert.equal(app.janela.localStorage.getItem('lastToy'), 'ganpdf');
    assert.equal(app.seletor('#toyIframe').getAttribute('src'), 'toys/ganpdf/index.html');
    assert.equal(app.todos('.toy-iframe').length, 1);

    app.clicar('[data-toy="home"]');
    assert.equal(app.janela.localStorage.getItem('lastToy'), null);
    assert.equal(app.existe('#toyIframe'), false);
    assert.equal(app.existe('#welcomePanel'), true);
    assert.equal(app.script('GANTOYS.currentToy'), null);
    assert.deepEqual(app.todos('.nav-item.active').map((item) => item.dataset.toy), ['home']);
});

test('App — ao abrir, o último toy, o tema e o visual salvos são restaurados', async (t) => {
    const app = await abrirApp(t, { armazenamento: { lastToy: 'gancopy', theme: 'light', visual: 'japandi' } });
    const raiz = app.janela.document.documentElement;

    assert.equal(raiz.getAttribute('data-theme'), 'light');
    assert.equal(raiz.getAttribute('data-visual'), 'japandi');
    assert.deepEqual(app.todos('.nav-item.active').map((item) => item.dataset.toy), ['gancopy']);
    assert.equal(app.seletor('#toyIframe').getAttribute('src'), 'toys/gancopy/index.html');
    assert.deepEqual(app.todos('.theme-btn.active').map((btn) => btn.id), ['visualJapandiLight']);
    assert.equal(app.todos('.theme-btn').map((btn) => btn.style.display).join(','),
        'none,none,none,none,none,none,flex,flex,flex,flex,flex,flex');

    // Toy salvo que não existe mais: cai no painel inicial, com o Início
    // destacado no menu (antes o menu ficava sem nenhum item ativo).
    const outro = await abrirApp(t, { armazenamento: { lastToy: 'fantasma' } });
    assert.equal(outro.janela.localStorage.getItem('lastToy'), null);
    assert.equal(outro.existe('#welcomePanel'), true);
    assert.equal(outro.existe('#toyIframe'), false);
    assert.deepEqual(outro.todos('.nav-item.active').map((item) => item.dataset.toy), ['home']);
});

test('App — tema e visual atualizam a raiz, o orbe, os botões e o localStorage', async (t) => {
    const app = await abrirApp(t);
    const raiz = app.janela.document.documentElement;
    const orbe = app.seletor('#bgOrb');
    // As cores do orbe são pintadas no inicializador, depois do primeiro quadro.
    await app.tick(150);

    assert.equal(orbe.style.getPropertyValue('--orb-x'), '50vw');
    assert.equal(orbe.style.getPropertyValue('--orb-y'), '50vh');
    assert.equal(orbe.style.getPropertyValue('--orb-color-1'), '#4A4A4A');
    assert.equal(orbe.style.getPropertyValue('--orb-color-2'), '#FFD700');
    assert.deepEqual(app.todos('.theme-btn.active').map((btn) => btn.id), ['visualGlassmorphism']);
    assert.equal(app.janela.localStorage.getItem('theme'), 'dark');
    assert.equal(app.janela.localStorage.getItem('visual'), 'glassmorphism');

    app.clicar('#themeToggle');
    assert.equal(raiz.getAttribute('data-theme'), 'light');
    assert.equal(app.janela.localStorage.getItem('theme'), 'light');
    assert.equal(orbe.style.getPropertyValue('--orb-color-1'), '#FFD700');
    assert.equal(orbe.style.getPropertyValue('--orb-color-2'), '#4A4A4A');
    assert.deepEqual(app.todos('.theme-btn.active').map((btn) => btn.id), ['visualGlassmorphismLight']);
    assert.equal(app.todos('.theme-btn').map((btn) => btn.style.display).join(','),
        'none,none,none,none,none,none,flex,flex,flex,flex,flex,flex');

    app.clicar('#visualNeumorphismLight');
    assert.equal(raiz.getAttribute('data-visual'), 'neumorphism');
    assert.equal(app.janela.localStorage.getItem('visual'), 'neumorphism');
    assert.deepEqual(app.todos('.theme-btn.active').map((btn) => btn.id), ['visualNeumorphismLight']);
    assert.equal(orbe.style.getPropertyValue('--orb-color-1'), '#E0E0E0');
    assert.equal(orbe.style.getPropertyValue('--orb-color-2'), '#4A4A4A');

    app.clicar('#themeToggle');
    assert.equal(raiz.getAttribute('data-theme'), 'dark');
    assert.equal(app.janela.localStorage.getItem('theme'), 'dark');
    assert.deepEqual(app.todos('.theme-btn.active').map((btn) => btn.id), ['visualNeumorphism']);
    assert.equal(orbe.style.getPropertyValue('--orb-color-1'), '#3D3D3D');
    assert.equal(app.todos('.theme-btn').map((btn) => btn.style.display).join(','),
        'flex,flex,flex,flex,flex,flex,none,none,none,none,none,none');
});

test('App — cada visual tem suas cores e o CSS exato', async (t) => {
    const app = await abrirApp(t);
    const orbe = app.seletor('#bgOrb');
    const raiz = app.janela.document.documentElement;

    const VISUAIS = [
        { nome: 'glassmorphism', escuro: 'visualGlassmorphism', claro: 'visualGlassmorphismLight', corEscura: ['#4A4A4A', '#FFD700'], corClara: ['#FFD700', '#4A4A4A'] },
        { nome: 'neumorphism', escuro: 'visualNeumorphism', claro: 'visualNeumorphismLight', corEscura: ['#3D3D3D', '#FFD700'], corClara: ['#E0E0E0', '#4A4A4A'] },
        { nome: 'neobrutalism', escuro: 'visualNeobrutalism', claro: 'visualNeobrutalismLight', corEscura: ['#FFD700', '#4A4A4A'], corClara: ['#4A4A4A', '#FFD700'] },
        { nome: 'material', escuro: 'visualMaterial', claro: 'visualMaterialLight', corEscura: ['#424242', '#FFD700'], corClara: ['#FFD700', '#424242'] },
        { nome: 'claymorphism', escuro: 'visualClaymorphism', claro: 'visualClaymorphismLight', corEscura: ['#3E3B36', '#E9C46A'], corClara: ['#E9C46A', '#8D7B68'] },
        { nome: 'japandi', escuro: 'visualJapandi', claro: 'visualJapandiLight', corEscura: ['#6B5B4D', '#C8A97E'], corClara: ['#C8A97E', '#A68A64'] },
    ];

    for (const visual of VISUAIS) {
        app.clicar(`#${visual.escuro}`);
        assert.equal(raiz.getAttribute('data-visual'), visual.nome);
        assert.equal(app.janela.localStorage.getItem('visual'), visual.nome);
        assert.deepEqual(app.todos('.theme-btn.active').map((btn) => btn.id), [visual.escuro]);
        assert.equal(orbe.style.getPropertyValue('--orb-color-1'), visual.corEscura[0]);
        assert.equal(orbe.style.getPropertyValue('--orb-color-2'), visual.corEscura[1]);

        app.clicar('#themeToggle');
        assert.equal(raiz.getAttribute('data-theme'), 'light');
        app.clicar(`#${visual.claro}`);
        assert.equal(raiz.getAttribute('data-visual'), visual.nome);
        assert.equal(orbe.style.getPropertyValue('--orb-color-1'), visual.corClara[0]);
        assert.equal(orbe.style.getPropertyValue('--orb-color-2'), visual.corClara[1]);
        assert.deepEqual(app.todos('.theme-btn.active').map((btn) => btn.id), [visual.claro]);

        app.clicar('#themeToggle');
        assert.equal(raiz.getAttribute('data-theme'), 'dark');
    }

    // A folha de estilo de cada combinação visual/tema.
    const declaracao = (visual, tema, propriedade) => {
        const css = app.script(`GANTOYS.getThemeCSS(${JSON.stringify(tema)}, ${JSON.stringify(visual)})`);
        return css.split('\n').map((linha) => linha.trim()).find((linha) => linha.startsWith(`${propriedade}:`));
    };

    assert.equal(declaracao('glassmorphism', 'dark', '--toy-backdrop'), '--toy-backdrop: blur(20px);');
    assert.equal(declaracao('glassmorphism', 'light', '--toy-backdrop'), '--toy-backdrop: blur(15px);');
    assert.equal(declaracao('glassmorphism', 'dark', '--shadow-card'), '--shadow-card: 0 8px 32px rgba(0, 0, 0, 0.35);');
    assert.equal(declaracao('glassmorphism', 'light', '--shadow-card'), '--shadow-card: 0 8px 24px rgba(0, 0, 0, 0.10);');
    assert.equal(declaracao('glassmorphism', 'dark', '--toy-page-bg'),
        '--toy-page-bg: radial-gradient(circle at 20% 0%, rgba(255, 215, 0, 0.10) 0%, transparent 28%), radial-gradient(circle at 80% 100%, rgba(255, 255, 255, 0.05) 0%, transparent 34%), linear-gradient(180deg, #1c1c20 0%, #2a2a2e 100%);');

    assert.equal(declaracao('neobrutalism', 'dark', '--radius-lg'), '--radius-lg: 0px;');
    assert.equal(declaracao('neobrutalism', 'dark', '--shadow-card'), '--shadow-card: 4px 4px 0 #FFFFFF;');
    assert.equal(declaracao('neobrutalism', 'light', '--shadow-card'), '--shadow-card: 4px 4px 0 #000000;');
    assert.equal(declaracao('neobrutalism', 'dark', '--toy-backdrop'), '--toy-backdrop: none;');

    assert.equal(declaracao('material', 'dark', '--radius-lg'), '--radius-lg: 12px;');
    assert.equal(declaracao('material', 'dark', '--toy-page-bg'), '--toy-page-bg: linear-gradient(180deg, #121212 0%, #1b1b1b 100%);');
    assert.equal(declaracao('material', 'light', '--toy-surface-alt'), '--toy-surface-alt: #F7F7F7;');

    assert.equal(declaracao('claymorphism', 'light', '--radius-lg'), '--radius-lg: 24px;');
    assert.equal(declaracao('claymorphism', 'light', '--toy-input-shadow'),
        '--toy-input-shadow: inset 4px 4px 8px rgba(139, 119, 101, 0.25), inset -4px -4px 8px rgba(255, 255, 255, 0.8);');
    assert.equal(declaracao('japandi', 'light', '--radius-lg'), '--radius-lg: 4px;');
    assert.equal(declaracao('japandi', 'light', '--toy-page-bg'), '--toy-page-bg: linear-gradient(180deg, #F5F2ED 0%, #EBE7DE 100%);');
    assert.equal(declaracao('neumorphism', 'dark', '--toy-input-shadow'),
        '--toy-input-shadow: inset 4px 4px 8px #1a1a1a, inset -4px -4px 8px #404040;');
    assert.equal(declaracao('neumorphism', 'light', '--shadow-card'), '--shadow-card: 8px 8px 16px #BEBEBE, -8px -8px 16px #FFFFFF;');

    // Visual desconhecido cai no glassmorphism; tema só é claro quando diz "light".
    assert.equal(declaracao('inexistente', 'dark', '--toy-backdrop'), '--toy-backdrop: blur(20px);');
    assert.equal(declaracao('inexistente', 'light', '--toy-backdrop'), '--toy-backdrop: blur(15px);');
});

test('App — o CSS do tema entra no iframe do toy e é persistido', async (t) => {
    const bundle = '<html><head></head><body></body></html>';
    const app = await abrirApp(t, { globais: { GANTOYS_TOYS: { gancopy: bundle } } });

    app.clicar('[data-toy="gancopy"]');
    const iframe = app.seletor('#toyIframe');
    assert.equal(iframe.srcdoc, bundle);
    assert.equal(iframe.hasAttribute('src'), false);

    const doc = iframe.contentDocument;
    assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(doc.documentElement.getAttribute('data-visual'), 'glassmorphism');
    assert.equal(doc.querySelectorAll('style#gantoys-theme-inject').length, 1);

    const css = doc.getElementById('gantoys-theme-inject').textContent;
    assert.equal(css, app.janela.localStorage.getItem('gantoys_theme_css'));
    assert.ok(css.startsWith('\n            :root {'));
    const linha = (propriedade) => css.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`${propriedade}:`));
    assert.equal(linha('--toy-accent'), '--toy-accent: #FFD700;');
    assert.equal(linha('--radius-lg'), '--radius-lg: 16px;');

    // Trocar o visual reescreve o MESMO <style> do iframe, sem duplicar.
    app.clicar('#visualNeobrutalism');
    assert.equal(doc.querySelectorAll('#gantoys-theme-inject').length, 1);
    const depois = doc.getElementById('gantoys-theme-inject').textContent;
    assert.equal(depois, app.janela.localStorage.getItem('gantoys_theme_css'));
    assert.equal(depois.split('\n').map((l) => l.trim()).find((l) => l.startsWith('--radius-lg:')), '--radius-lg: 0px;');

    // O carregamento do iframe reinjeta a folha (o <style> anterior sai).
    iframe.dispatchEvent(new app.janela.Event('load'));
    assert.equal(doc.querySelectorAll('#gantoys-theme-inject').length, 1);
    assert.equal(doc.getElementById('gantoys-theme-inject').textContent, app.janela.localStorage.getItem('gantoys_theme_css'));
    iframe.dispatchEvent(new app.janela.Event('load'));
    assert.equal(doc.querySelectorAll('#gantoys-theme-inject').length, 1);
});

test('App — o estado do toy é salvo ao trocar de ferramenta e restaurado ao carregar', async (t) => {
    const app = await abrirApp(t, { globais: { GANTOYS_TOYS: { gancopy: 'COPY', ganpdf: 'PDF' } } });

    app.clicar('[data-toy="gancopy"]');
    app.seletor('#toyIframe').contentDocument.body.innerHTML = '<input name="alvo" value="guardado"><textarea name="obs">texto</textarea>';

    app.clicar('[data-toy="home"]');
    assert.equal(app.janela.localStorage.getItem('toy_state_gancopy'), '{"alvo":"guardado","obs":"texto"}');

    app.clicar('[data-toy="gancopy"]');
    const iframe = app.seletor('#toyIframe');
    const doc = iframe.contentDocument;
    doc.body.innerHTML = '<input name="alvo" value=""><textarea name="obs"></textarea>';
    iframe.dispatchEvent(new app.janela.Event('load'));

    assert.equal(doc.querySelector('[name="alvo"]').value, 'guardado');
    assert.equal(doc.querySelector('[name="obs"]').value, 'texto');

    // Fechar a aba também persiste o estado do toy aberto.
    doc.querySelector('[name="alvo"]').value = 'ultimo';
    app.janela.dispatchEvent(new app.janela.Event('beforeunload'));
    assert.equal(app.janela.localStorage.getItem('toy_state_gancopy'), '{"alvo":"ultimo","obs":"texto"}');

    // Trocar de ferramenta salva o estado da anterior.
    doc.querySelector('[name="alvo"]').value = 'mudou';
    app.clicar('[data-toy="ganpdf"]');
    assert.equal(app.janela.localStorage.getItem('toy_state_gancopy'), '{"alvo":"mudou","obs":"texto"}');
    assert.equal(app.janela.localStorage.getItem('lastToy'), 'ganpdf');
});

test('App — saveState guarda input, select, textarea, radio e checkbox', async (t) => {
    const app = await abrirApp(t, { globais: { GANTOYS_TOYS: { gancopy: 'COPY' } } });

    app.clicar('[data-toy="gancopy"]');
    app.seletor('#toyIframe').contentDocument.body.innerHTML = `
        <input name="texto" value="abc">
        <select name="modo"><option value="x">X</option><option value="y" selected>Y</option></select>
        <textarea name="obs">linha</textarea>
        <input type="radio" name="turno" value="manha" checked>
        <input type="radio" name="turno" value="tarde">
        <input type="checkbox" name="ativo" checked>
        <input type="checkbox" name="extra">
        <input value="sem-nome">
        <input name="desligado" value="" disabled>
    `;

    app.script('GANTOYS.saveState("gancopy")');

    assert.equal(app.janela.localStorage.getItem('toy_state_gancopy'),
        '{"texto":"abc","modo":"y","obs":"linha","turno":"manha","ativo":true,"extra":false,"desligado":""}');
});

test('App — restoreState aplica os valores, avisa as mudanças e ignora as iguais', async (t) => {
    const app = await abrirApp(t, { globais: { GANTOYS_TOYS: { gancopy: 'COPY' } } });

    app.clicar('[data-toy="gancopy"]');
    const doc = app.seletor('#toyIframe').contentDocument;
    doc.body.innerHTML = `
        <input name="texto" value="antigo">
        <select name="modo"><option value="x">X</option><option value="y" selected>Y</option></select>
        <textarea name="obs">antiga</textarea>
        <input type="radio" name="turno" value="manha" checked>
        <input type="radio" name="turno" value="tarde">
        <input type="checkbox" name="ativo" checked>
        <input type="checkbox" name="extra">
    `;

    app.janela.localStorage.setItem('toy_state_ganx', JSON.stringify({
        texto: 'novo', modo: 'x', obs: 'outra', turno: 'tarde', ativo: false, extra: true, inexistente: 'z',
    }));

    const eventos = [];
    doc.querySelectorAll('[name]').forEach((campo) => {
        campo.addEventListener('input', () => eventos.push(`input:${campo.name}`));
        campo.addEventListener('change', () => eventos.push(`change:${campo.name}`));
    });

    app.script('GANTOYS.restoreState("ganx")');

    assert.equal(doc.querySelector('[name="texto"]').value, 'novo');
    assert.equal(doc.querySelector('[name="modo"]').value, 'x');
    assert.equal(doc.querySelector('[name="obs"]').value, 'outra');
    assert.deepEqual([...doc.querySelectorAll('[name="turno"]')].map((campo) => campo.checked), [false, true]);
    assert.equal(doc.querySelector('[name="ativo"]').checked, false);
    assert.equal(doc.querySelector('[name="extra"]').checked, true);
    assert.deepEqual(eventos, [
        'input:texto', 'change:texto',
        'input:modo', 'change:modo',
        'input:obs', 'change:obs',
        'input:turno', 'change:turno',
        'input:ativo', 'change:ativo',
        'input:extra', 'change:extra',
    ]);

    // Segunda passada: tudo já está igual, nada é anunciado de novo.
    eventos.length = 0;
    app.script('GANTOYS.restoreState("ganx")');
    assert.deepEqual(eventos, []);
    assert.equal(doc.querySelector('[name="texto"]').value, 'novo');

    // Sem estado salvo para o toy: nada muda.
    eventos.length = 0;
    app.script('GANTOYS.restoreState("ganpdf")');
    assert.deepEqual(eventos, []);
    assert.equal(doc.querySelector('[name="texto"]').value, 'novo');
});

test('App — restoreState com estado corrompido avisa e não quebra', async (t) => {
    const app = await abrirApp(t, { globais: { GANTOYS_TOYS: { gancopy: 'COPY' } } });

    app.clicar('[data-toy="gancopy"]');
    const doc = app.seletor('#toyIframe').contentDocument;
    doc.body.innerHTML = '<input name="texto" value="intacto">';
    app.janela.localStorage.setItem('toy_state_gancopy', '{nao-e-json');

    app.script('GANTOYS.restoreState("gancopy")');

    assert.equal(doc.querySelector('[name="texto"]').value, 'intacto');
    const avisos = app.mensagens('warn').map((linha) => linha.texto);
    assert.equal(avisos.length, 1);
    assert.ok(avisos[0].startsWith('Cannot restore state:'));
});

test('App — sem iframe aberto o estado não é gravado', async (t) => {
    const app = await abrirApp(t);

    assert.equal(app.existe('#toyIframe'), false);
    app.script('GANTOYS.saveState("gancopy")');
    app.script('GANTOYS.persistCurrentToyState()');
    app.janela.localStorage.setItem('toy_state_ganpdf', JSON.stringify({ texto: 'x' }));
    app.script('GANTOYS.restoreState("ganpdf")');

    assert.equal(app.janela.localStorage.getItem('toy_state_gancopy'), null);
    assert.deepEqual(app.mensagens('warn'), []);
});

test('App — falha do localStorage é avisada e não derruba o app', async (t) => {
    const app = await abrirApp(t, { globais: { GANTOYS_TOYS: { gancopy: 'COPY' } } });
    app.clicar('[data-toy="gancopy"]');

    Object.defineProperty(app.janela, 'localStorage', {
        configurable: true,
        get: () => ({
            getItem: () => null,
            setItem: () => { throw new Error('quota excedida'); },
            removeItem() {},
        }),
    });

    app.script('GANTOYS.persistThemePayload()');
    app.script('GANTOYS.saveState("gancopy")');
    app.script('GANTOYS.updateThemeInAllIframes()');

    const avisos = app.mensagens('warn').map((linha) => linha.texto);
    assert.deepEqual(avisos, [
        'Cannot persist theme payload: Error: quota excedida',
        'Cannot save state: Error: quota excedida',
        'Cannot persist theme payload: Error: quota excedida',
    ]);
    assert.equal(app.existe('#toyIframe'), true);
});

test('App — o painel inicial mostra a versão de release', async (t) => {
    const app = await abrirApp(t, { globais: { GANTOYS_RELEASE: '2.0.0' } });

    app.clicar('[data-toy="gancopy"]');
    app.clicar('[data-toy="home"]');

    assert.equal(app.texto('#welcomeVersion'), '2.0.0');
    assert.equal(app.seletor('#welcomeVersion').style.display, 'block');
});

test('App — o toy abre pelo bundle e o worker do PDF é criado uma vez', async (t) => {
    const app = await abrirApp(t, {
        globais: { GANTOYS_TOYS: { gancopy: 'BUNDLE-COPY' } },
        preparar(janela) {
            janela.ganAssetText = (conteudo) => `<html><head></head><body>${conteudo}</body></html>`;
            janela.ganAssetUrl = (caminho) => `blob:${caminho}`;
        },
    });

    assert.equal(app.janela.__ganPdfWorkerUrl, undefined);
    app.clicar('[data-toy="gancopy"]');

    assert.equal(app.seletor('#toyIframe').srcdoc, '<html><head></head><body>BUNDLE-COPY</body></html>');
    assert.equal(app.janela.__ganPdfWorkerUrl, 'blob:vendor/pdfjs/pdf.worker.min.js');

    // Toy fora do bundle usa a página própria.
    app.clicar('[data-toy="ganpdf"]');
    assert.equal(app.seletor('#toyIframe').getAttribute('src'), 'toys/ganpdf/index.html');
    assert.equal(app.janela.__ganPdfWorkerUrl, 'blob:vendor/pdfjs/pdf.worker.min.js');
});

test('App — sem empacotamento o srcdoc é o próprio bundle e não há worker', async (t) => {
    const app = await abrirApp(t, { globais: { GANTOYS_TOYS: { gancopy: '<html><head></head><body>cru</body></html>' } } });

    app.clicar('[data-toy="gancopy"]');

    assert.equal(app.seletor('#toyIframe').srcdoc, '<html><head></head><body>cru</body></html>');
    assert.equal(app.janela.__ganPdfWorkerUrl, undefined);
});

test('App — GanAssetUrl que lança avisa e segue sem worker', async (t) => {
    const app = await abrirApp(t, {
        preparar(janela) { janela.ganAssetUrl = () => { throw new Error('sem asset'); }; },
    });

    app.clicar('[data-toy="gancopy"]');

    assert.equal(app.janela.__ganPdfWorkerUrl, undefined);
    assert.deepEqual(app.mensagens('warn').map((linha) => linha.texto), ['Cannot create bundled PDF worker: Error: sem asset']);
    assert.equal(app.seletor('#toyIframe').getAttribute('src'), 'toys/gancopy/index.html');
});
