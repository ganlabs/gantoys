/* ==========================================================================
   Estado persistente compartilhado (toys/shared/state.js).

   Todo toy carrega o script, que injeta a barra "Guardar estado / Limpar
   estado" e salva os campos no localStorage. O teste usa o gancopy porque ele
   tem textarea, checkbox e aba (estado extra via GanToyState).
   ========================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../testkit/index.js';

const CHAVE = 'gantoys_toy_state_v1:gancopy';

function registro(campos = {}, extras = {}, habilitado = true) {
    return JSON.stringify({ versao: 1, habilitado, campos, extras });
}

async function abrir(t, opcoes = {}) {
    const pagina = await carregarToy('gancopy', opcoes);
    t.after(() => pagina.fechar());
    return pagina;
}

test('estado — a barra "Guardar estado / Limpar estado" aparece em todo toy', async (t) => {
    const gancopy = await abrir(t);
    const ganjuntar = await carregarToy('ganjuntar');
    t.after(() => ganjuntar.fechar());

    for (const pagina of [gancopy, ganjuntar]) {
        assert.equal(pagina.existe('#ganStateBar'), true, `${pagina.relativo} sem barra de estado`);
        assert.equal(pagina.seletor('#ganStateEnabled').checked, true);
        assert.equal(pagina.texto('#ganStateBar .check-row'), 'Guardar estado');
        assert.equal(pagina.texto('#ganStateClear'), 'Limpar estado');
        // A barra fica logo depois do cabeçalho do toy.
        assert.equal(
            pagina.seletor('#ganStateBar').previousElementSibling.classList.contains('brand'),
            true
        );
        // Os controles da barra não fazem parte do estado guardado.
        assert.equal(pagina.seletor('#ganStateBar').getAttribute('data-gan-state'), 'skip');
    }
});

test('estado — digitar e marcar salva os campos e a próxima abertura restaura', async (t) => {
    const pagina = await abrir(t);
    pagina.digitar('#santander-processes', '111\n222');
    pagina.marcar('#santander-move');
    pagina.script('GanToyState.flush()');

    const salvo = JSON.parse(pagina.janela.localStorage.getItem(CHAVE));
    assert.equal(salvo.versao, 1);
    assert.equal(salvo.habilitado, true);
    assert.equal(salvo.campos['id:santander-processes'], '111\n222');
    assert.equal(salvo.campos['id:santander-move'], true);

    const reaberta = await abrir(t, { armazenamento: { [CHAVE]: pagina.janela.localStorage.getItem(CHAVE) } });
    assert.equal(reaberta.seletor('#santander-processes').value, '111\n222');
    assert.equal(reaberta.seletor('#santander-move').checked, true);
    assert.equal(reaberta.texto('#santander-copy'), 'Mover arquivos');
    assert.equal(reaberta.texto('#santander-count'), '2 processos');
    assert.equal(reaberta.seletor('#ganStateEnabled').checked, true);
});

test('estado — a aba ativa do gancopy também é restaurada', async (t) => {
    const pagina = await abrir(t, { armazenamento: { [CHAVE]: registro({}, { aba: 'bradesco' }) } });

    assert.equal(pagina.seletor('#panel-bradesco').hidden, false);
    assert.equal(pagina.atributo('#tab-bradesco', 'aria-selected'), 'true');
    assert.equal(pagina.atributo('#tab-santander', 'aria-selected'), 'false');
});

test('estado — desmarcar "Guardar estado" descarta o que estava salvo e para de gravar', async (t) => {
    const pagina = await abrir(t);
    pagina.digitar('#santander-processes', '111');
    pagina.script('GanToyState.flush()');

    pagina.marcar('#ganStateEnabled');
    assert.equal(pagina.seletor('#ganStateEnabled').checked, false);

    const desligado = JSON.parse(pagina.janela.localStorage.getItem(CHAVE));
    assert.equal(desligado.habilitado, false);
    assert.deepEqual(desligado.campos, {});
    assert.deepEqual(desligado.extras, {});

    // Com a opção desligada, nada novo é guardado.
    pagina.digitar('#santander-processes', '222');
    pagina.script('GanToyState.flush()');
    assert.deepEqual(JSON.parse(pagina.janela.localStorage.getItem(CHAVE)).campos, {});

    // O registro desligado não restaura campos antigos ao reabrir.
    const reaberta = await abrir(t, {
        armazenamento: { [CHAVE]: registro({ 'id:santander-processes': 'antigo' }, { aba: 'bradesco' }, false) }
    });
    assert.equal(reaberta.seletor('#santander-processes').value, '');
    assert.equal(reaberta.seletor('#ganStateEnabled').checked, false);
    assert.equal(reaberta.seletor('#panel-bradesco').hidden, true);
    assert.equal(reaberta.atributo('#tab-santander', 'aria-selected'), 'true');
});

test('estado — "Limpar estado" remove o registro e devolve os campos ao valor inicial', async (t) => {
    const pagina = await abrir(t);
    pagina.digitar('#santander-processes', '111');
    pagina.marcar('#santander-move');
    pagina.clicar('#tab-bradesco');
    pagina.script('GanToyState.flush()');
    assert.notEqual(pagina.janela.localStorage.getItem(CHAVE), null);

    pagina.clicar('#ganStateClear');

    assert.equal(pagina.janela.localStorage.getItem(CHAVE), null);
    assert.equal(pagina.seletor('#santander-processes').value, '');
    assert.equal(pagina.seletor('#santander-move').checked, false);
    assert.equal(pagina.texto('#santander-copy'), 'Copiar arquivos');
    assert.equal(pagina.texto('#santander-count'), '0 processos');
    assert.equal(pagina.seletor('#panel-santander').hidden, false);
});

test('estado — cada toy guarda o próprio registro e estado corrompido não quebra', async (t) => {
    const pagina = await abrir(t);
    pagina.digitar('#santander-processes', '111');
    pagina.script('GanToyState.flush()');
    assert.equal(pagina.janela.localStorage.getItem('gantoys_toy_state_v1:ganjuntar'), null);

    const quebrada = await abrir(t, { armazenamento: { [CHAVE]: '{nao-e-json' } });
    assert.equal(quebrada.seletor('#santander-processes').value, '');
    assert.equal(quebrada.seletor('#ganStateEnabled').checked, true);
    assert.equal(
        quebrada.mensagens('warn').some((linha) => linha.texto.startsWith('Cannot read toy state:')),
        true
    );

    // Versão desconhecida do registro é ignorada sem aviso.
    const futura = await abrir(t, { armazenamento: { [CHAVE]: JSON.stringify({ versao: 99, habilitado: true, campos: { 'id:santander-processes': 'x' } }) } });
    assert.equal(futura.seletor('#santander-processes').value, '');
});
