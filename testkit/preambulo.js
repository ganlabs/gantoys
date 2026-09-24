/**
 * Verificação do preâmbulo de tema que todo toy carrega no `<head>`.
 *
 * Esse bloco é o mesmo (com pequenas variações) em todos os toys: aplica o tema
 * salvo, injeta o CSS do tema, escuta a mensagem do app e — em alguns toys —
 * repassa o ponteiro para a janela de cima. Como é código do toy, entra na
 * cobertura; como é igual em todos, o teste também é único e roda para a lista
 * inteira de toys.
 */

import assert from 'node:assert/strict';
import { carregarToy } from './toy.js';

const CSS_SALVO = '.marca{color:#fff}';

export async function verificarPreambuloDeTema(t, slug) {
    // 1) Sem nada salvo: o preâmbulo aplica o padrão do sistema e não injeta CSS.
    const semTema = await carregarToy(slug);
    t.after(() => semTema.fechar());

    const temaInicial = semTema.documento.documentElement.getAttribute('data-theme');
    assert.ok(['dark', 'light'].includes(temaInicial), `data-theme inesperado em ${slug}: ${temaInicial}`);
    assert.equal(semTema.documento.getElementById('gantoys-theme-inject'), null, `${slug}: nenhum CSS de tema deveria estar injetado`);

    // 2) Com tema salvo: tema, visual e CSS guardados são aplicados no carregamento.
    const pagina = await carregarToy(slug, {
        armazenamento: {
            theme: 'light',
            visual: 'japandi',
            gantoys_theme_css: CSS_SALVO,
        },
    });
    t.after(() => pagina.fechar());

    assert.equal(pagina.documento.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(pagina.documento.documentElement.getAttribute('data-visual'), 'japandi');
    assert.equal(pagina.documento.getElementById('gantoys-theme-inject')?.textContent, CSS_SALVO);

    const enviarMensagem = (dados) => pagina.janela.dispatchEvent(
        new pagina.janela.MessageEvent('message', { data: dados })
    );

    // 3) Mensagem do app: troca tema/visual, guarda o CSS e substitui o <style>.
    enviarMensagem({ type: 'theme', theme: 'dark', visual: 'material', css: '.a{}' });
    assert.equal(pagina.documento.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(pagina.documento.documentElement.getAttribute('data-visual'), 'material');
    assert.equal(pagina.janela.localStorage.getItem('gantoys_theme_css'), '.a{}');

    enviarMensagem({ type: 'theme', theme: 'dark', visual: 'material', css: '.b{}' });
    assert.equal(pagina.documento.querySelectorAll('#gantoys-theme-inject').length, 1, `${slug}: o CSS de tema anterior precisa sair`);
    assert.equal(pagina.documento.getElementById('gantoys-theme-inject').textContent, '.b{}');

    // 4) Mensagem de outro tipo, mensagem sem dados e mensagem sem CSS: nada quebra.
    enviarMensagem({ type: 'outro' });
    enviarMensagem(undefined);
    enviarMensagem({ type: 'theme' });
    assert.equal(pagina.documento.getElementById('gantoys-theme-inject').textContent, '.b{}', `${slug}: mensagem sem CSS reusa o CSS salvo`);

    // 5) Ponteiro: com `parent === window` (página solta) nada é repassado.
    pagina.janela.dispatchEvent(new pagina.janela.Event('pointermove'));
    pagina.janela.dispatchEvent(new pagina.janela.Event('mousemove'));

    // 6) Ponteiro dentro do app (parent real): repassa as coordenadas; se o
    //    postMessage do parent falhar, o erro é engolido sem derrubar a página.
    const recebidos = [];
    Object.defineProperty(pagina.janela, 'parent', {
        configurable: true,
        value: { postMessage: (dados) => recebidos.push(dados) },
    });
    pagina.janela.dispatchEvent(new pagina.janela.MouseEvent('pointermove', { clientX: 10, clientY: 20 }));
    pagina.janela.dispatchEvent(new pagina.janela.MouseEvent('mousemove', { clientX: 1, clientY: 2 }));

    for (const recebido of recebidos) {
        assert.equal(recebido.type, 'toy-pointer');
        assert.equal(typeof recebido.x, 'number');
        assert.equal(typeof recebido.y, 'number');
    }

    Object.defineProperty(pagina.janela, 'parent', {
        configurable: true,
        value: { postMessage() { throw new Error('parent indisponível'); } },
    });
    pagina.janela.dispatchEvent(new pagina.janela.MouseEvent('pointermove', { clientX: 3, clientY: 4 }));
}
