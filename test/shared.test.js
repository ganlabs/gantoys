/* ==========================================================================
   Combobox compartilhado (`toys/shared/toy.js`).

   O script troca a APARÊNCIA do `<select>` nativo por um combobox próprio,
   mantendo o `<select>` no DOM como fonte do valor. Os testes carregam uma
   página de toy de verdade (que inclui o script) e criam os seletores no
   corpo, que é o caminho que os toys usam quando montam a tela por script.
   ========================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarToy } from '../testkit/index.js';

async function abrirPagina(t) {
    const pagina = await carregarToy('ganrenomeador');
    t.after(() => pagina.fechar());
    return pagina;
}

/**
 * Injeta o HTML no corpo e espera o observador de mutações converter o select.
 * `direto: true` entrega o próprio `<select>` ao observador (o outro caminho é
 * o container, que cai no `upgradeAll`).
 */
async function inserir(pagina, html, { direto = false } = {}) {
    const doc = pagina.documento;
    const host = doc.createElement('div');
    host.innerHTML = html;
    const select = host.querySelector('select');
    doc.body.appendChild(direto ? select : host);
    await pagina.tick(0);
    return select;
}

/** Referências do combobox que substitui o select. */
function comboDe(select) {
    const combo = select.previousElementSibling;
    return {
        combo,
        botao: combo.querySelector('button'),
        valor: combo.querySelector('.combo-value'),
        lista: combo.querySelector('ul'),
        // A lista é reconstruída quando as opções mudam: consultar sempre na hora.
        itens: () => [...combo.querySelectorAll('li')],
        seletorDoBotao: `[aria-controls="${combo.querySelector('ul').id}"]`,
    };
}

/** Atributos observáveis de cada item da lista, na ordem. */
function itensVisiveis(combo) {
    return combo.itens().map((item) => [
        item.id,
        item.className,
        item.dataset.value,
        item.textContent,
        item.getAttribute('role'),
        item.getAttribute('aria-selected'),
    ]);
}

function selecionados(combo) {
    return combo.itens().map((item) => item.getAttribute('aria-selected'));
}

test('Combobox — a marcação criada acompanha o select original', async (t) => {
    const pagina = await abrirPagina(t);
    const select = await inserir(pagina, `
        <select id="cor">
            <option value="">Selecione</option>
            <option value="azul" selected>Azul</option>
            <option value="verde" disabled>Verde</option>
            <option label="Rotulo" value="r">Texto</option>
        </select>`);
    const combo = comboDe(select);

    assert.equal(combo.combo.tagName, 'DIV');
    assert.equal(combo.combo.className, 'combo');
    assert.equal(combo.combo.nextElementSibling, select);
    assert.equal(select.className, 'combo-native');
    assert.equal(select.getAttribute('tabindex'), '-1');
    assert.equal(select.dataset.combo, 'ready');

    assert.equal(combo.botao.className, 'combo-button');
    assert.equal(combo.botao.type, 'button');
    assert.equal(combo.botao.getAttribute('role'), 'combobox');
    assert.equal(combo.botao.getAttribute('aria-haspopup'), 'listbox');
    assert.equal(combo.botao.getAttribute('aria-expanded'), 'false');
    assert.equal(combo.botao.getAttribute('aria-controls'), 'cor-listbox');
    assert.equal(combo.botao.querySelector('.combo-arrow').getAttribute('aria-hidden'), 'true');

    assert.equal(combo.valor.className, 'combo-value');
    assert.equal(combo.valor.textContent, 'Azul');
    assert.equal(combo.valor.classList.contains('is-placeholder'), false);

    assert.equal(combo.lista.className, 'combo-list');
    assert.equal(combo.lista.getAttribute('role'), 'listbox');
    assert.equal(combo.lista.id, 'cor-listbox');
    assert.equal(combo.lista.tabIndex, -1);
    assert.equal(combo.lista.getAttribute('aria-activedescendant'), 'cor-option-1');

    assert.deepEqual(itensVisiveis(combo), [
        ['cor-option-0', 'combo-option', '', 'Selecione', 'option', 'false'],
        ['cor-option-1', 'combo-option is-highlighted', 'azul', 'Azul', 'option', 'true'],
        ['cor-option-2', 'combo-option is-disabled', 'verde', 'Verde', 'option', 'false'],
        ['cor-option-3', 'combo-option', 'r', 'Rotulo', 'option', 'false'],
    ]);
});

test('Combobox — abre e fecha por clique, e o clique fora fecha o aberto', async (t) => {
    const pagina = await abrirPagina(t);
    const um = await inserir(pagina, '<select id="um"><option value="a">A</option><option value="b" selected>B</option></select>');
    const dois = await inserir(pagina, '<select id="dois"><option value="x">X</option></select>');
    const comboUm = comboDe(um);
    const comboDois = comboDe(dois);

    assert.equal(comboUm.combo.classList.contains('is-open'), false);

    pagina.clicar(comboUm.seletorDoBotao);
    assert.equal(comboUm.combo.classList.contains('is-open'), true);
    assert.equal(comboUm.botao.getAttribute('aria-expanded'), 'true');
    assert.equal(comboUm.lista.dataset.highlightId, 'um-option-1');
    assert.equal(comboUm.lista.getAttribute('aria-activedescendant'), 'um-option-1');

    // Abrir o outro combobox fecha o primeiro.
    pagina.clicar(comboDois.seletorDoBotao);
    assert.equal(comboUm.combo.classList.contains('is-open'), false);
    assert.equal(comboUm.botao.getAttribute('aria-expanded'), 'false');
    assert.equal(comboDois.combo.classList.contains('is-open'), true);
    assert.equal(comboDois.lista.dataset.highlightId, 'dois-option-0');

    // Clicar no próprio botão fecha.
    pagina.clicar(comboDois.seletorDoBotao);
    assert.equal(comboDois.combo.classList.contains('is-open'), false);

    // Clique dentro da lista (fora de uma opção) não fecha pela via do documento.
    pagina.clicar(comboDois.seletorDoBotao);
    pagina.clicar('#dois-listbox');
    assert.equal(comboDois.combo.classList.contains('is-open'), true);

    // Clique fora fecha.
    pagina.clicar('body');
    assert.equal(comboDois.combo.classList.contains('is-open'), false);
    assert.equal(comboDois.botao.getAttribute('aria-expanded'), 'false');
});

test('Combobox — teclado: setas, Home/End, Enter, espaço e Escape', async (t) => {
    const pagina = await abrirPagina(t);
    const select = await inserir(pagina, `
        <select id="nav">
            <option value="um">Um</option>
            <option value="dois">Dois</option>
            <option value="tres" disabled>Três</option>
            <option value="quatro">Quatro</option>
        </select>`);
    const combo = comboDe(select);
    const teclar = (tecla) => pagina.teclar(combo.seletorDoBotao, tecla);

    // Setas para baixo abertos: abrem já no item selecionado.
    teclar('ArrowDown');
    assert.equal(combo.combo.classList.contains('is-open'), true);
    assert.equal(combo.lista.dataset.highlightId, 'nav-option-0');

    // A navegação pula o item desabilitado e dá a volta na lista.
    teclar('ArrowDown');
    assert.equal(combo.lista.dataset.highlightId, 'nav-option-1');
    teclar('ArrowDown');
    assert.equal(combo.lista.dataset.highlightId, 'nav-option-3');
    teclar('ArrowDown');
    assert.equal(combo.lista.dataset.highlightId, 'nav-option-0');
    teclar('ArrowUp');
    assert.equal(combo.lista.dataset.highlightId, 'nav-option-3');
    teclar('End');
    assert.equal(combo.lista.dataset.highlightId, 'nav-option-3');
    teclar('Home');
    assert.equal(combo.lista.dataset.highlightId, 'nav-option-0');

    // Escape fecha; com a lista fechada Home/End/Escape não mexem em nada.
    teclar('Escape');
    assert.equal(combo.combo.classList.contains('is-open'), false);
    teclar('Home');
    assert.equal(combo.combo.classList.contains('is-open'), false);
    assert.equal(combo.lista.dataset.highlightId, 'nav-option-0');
    teclar('Escape');
    assert.equal(combo.combo.classList.contains('is-open'), false);

    const eventos = [];
    select.addEventListener('input', () => eventos.push(`input:${select.value}`));
    select.addEventListener('change', () => eventos.push(`change:${select.value}`));

    // Espaço abre; Enter escolhe o destacado e fecha.
    teclar(' ');
    assert.equal(combo.combo.classList.contains('is-open'), true);
    teclar('ArrowDown');
    teclar('Enter');
    assert.equal(select.value, 'dois');
    assert.equal(select.selectedIndex, 1);
    assert.equal(combo.combo.classList.contains('is-open'), false);
    assert.deepEqual(eventos, ['input:dois', 'change:dois']);
    assert.equal(combo.valor.textContent, 'Dois');
    assert.deepEqual(selecionados(combo), ['false', 'true', 'false', 'false']);

    // Enter com a lista fechada só abre, sem escolher de novo.
    teclar('Enter');
    assert.equal(combo.combo.classList.contains('is-open'), true);
    assert.equal(select.value, 'dois');
    assert.deepEqual(eventos, ['input:dois', 'change:dois']);
});

test('Combobox — a escolha por clique atualiza o select e dispara change', async (t) => {
    const pagina = await abrirPagina(t);
    const select = await inserir(pagina, `
        <select id="escolha">
            <option value="a">A</option>
            <option value="b" selected>B</option>
            <option value="c" disabled>C</option>
        </select>`);
    const combo = comboDe(select);
    const eventos = [];
    select.addEventListener('input', () => eventos.push(`input:${select.value}`));
    select.addEventListener('change', () => eventos.push(`change:${select.value}`));

    // O mouse destaca, mas não destaca item desabilitado.
    pagina.todos('#escolha-listbox > li')[2].dispatchEvent(new pagina.janela.MouseEvent('mousemove', { bubbles: true }));
    assert.equal(combo.lista.getAttribute('aria-activedescendant'), 'escolha-option-1');
    pagina.todos('#escolha-listbox > li')[0].dispatchEvent(new pagina.janela.MouseEvent('mousemove', { bubbles: true }));
    assert.equal(combo.lista.getAttribute('aria-activedescendant'), 'escolha-option-0');
    assert.deepEqual(combo.itens().filter((item) => item.classList.contains('is-highlighted')).map((item) => item.id),
        ['escolha-option-0']);

    // Item desabilitado não é escolhido.
    pagina.clicar('#escolha-option-2');
    assert.equal(select.value, 'b');
    assert.equal(select.selectedIndex, 1);
    assert.deepEqual(eventos, []);

    // Clique na lista fora de uma opção não escolhe nem fecha.
    pagina.clicar(combo.seletorDoBotao);
    pagina.clicar('#escolha-listbox');
    assert.equal(select.value, 'b');
    assert.equal(combo.combo.classList.contains('is-open'), true);

    // Clique numa opção escolhe, fecha e avisa o toy.
    pagina.clicar('#escolha-option-0');
    assert.equal(select.value, 'a');
    assert.equal(select.selectedIndex, 0);
    assert.equal(combo.combo.classList.contains('is-open'), false);
    assert.deepEqual(eventos, ['input:a', 'change:a']);
    assert.equal(combo.valor.textContent, 'A');
    assert.equal(combo.lista.dataset.highlightId, 'escolha-option-0');
    assert.deepEqual(selecionados(combo), ['true', 'false', 'false']);

    // Escolher de novo o mesmo item não repete o aviso.
    pagina.clicar('#escolha-option-0');
    assert.deepEqual(eventos, ['input:a', 'change:a']);
});

test('Combobox — o valor mudado por fora sincroniza e as opções novas recriam a lista', async (t) => {
    const pagina = await abrirPagina(t);
    const select = await inserir(pagina, `
        <select id="sinc">
            <option value="a">A</option>
            <option value="b">B</option>
            <option value="c">C</option>
        </select>`);
    const combo = comboDe(select);

    assert.deepEqual(selecionados(combo), ['true', 'false', 'false']);

    // Troca por fora (restauração de estado do app, "Limpar" do toy).
    pagina.selecionar('#sinc', 'c');
    assert.equal(combo.valor.textContent, 'C');
    assert.deepEqual(selecionados(combo), ['false', 'false', 'true']);

    // O select desabilitado desabilita o botão.
    select.disabled = true;
    await pagina.tick(0);
    assert.equal(combo.botao.disabled, true);
    select.disabled = false;
    await pagina.tick(0);
    assert.equal(combo.botao.disabled, false);

    // Opções novas reconstroem a lista inteira.
    const nova = pagina.documento.createElement('option');
    nova.value = 'd';
    nova.textContent = 'D';
    select.appendChild(nova);
    await pagina.tick(0);
    assert.deepEqual(itensVisiveis(combo), [
        ['sinc-option-0', 'combo-option', 'a', 'A', 'option', 'false'],
        ['sinc-option-1', 'combo-option', 'b', 'B', 'option', 'false'],
        ['sinc-option-2', 'combo-option is-highlighted', 'c', 'C', 'option', 'true'],
        ['sinc-option-3', 'combo-option', 'd', 'D', 'option', 'false'],
    ]);

    // Sem opção nenhuma o rótulo vira placeholder.
    select.innerHTML = '';
    await pagina.tick(0);
    assert.equal(combo.itens().length, 0);
    assert.equal(combo.valor.textContent, '');
    assert.equal(combo.valor.classList.contains('is-placeholder'), true);
});

test('Combobox — valores repetidos são distinguidos pela opção, não pelo value', async (t) => {
    const pagina = await abrirPagina(t);
    const select = await inserir(pagina, `
        <select id="rep">
            <option value="x">Um</option>
            <option value="x">Dois</option>
            <option value="y">Três</option>
        </select>`);
    const combo = comboDe(select);

    pagina.clicar('#rep-option-1');
    assert.equal(select.value, 'x');
    assert.equal(select.selectedIndex, 1);
    assert.equal(combo.valor.textContent, 'Dois');
    assert.deepEqual(selecionados(combo), ['false', 'true', 'false']);

    pagina.clicar('#rep-option-2');
    assert.equal(select.value, 'y');
    assert.equal(select.selectedIndex, 2);
    assert.equal(combo.valor.textContent, 'Três');
    assert.deepEqual(selecionados(combo), ['false', 'false', 'true']);
});

test('Combobox — selects marcados ou múltiplos não são convertidos', async (t) => {
    const pagina = await abrirPagina(t);

    // O select da própria página do toy já vem convertido no carregamento.
    const preset = pagina.seletor('#preset');
    assert.equal(preset.dataset.combo, 'ready');
    assert.equal(pagina.todos('#preset-listbox > li').length, preset.options.length);

    const pulado = await inserir(pagina, '<select id="pulado" data-combo="skip"><option>a</option></select>', { direto: true });
    assert.equal(pulado.className, '');
    assert.equal(pulado.dataset.combo, 'skip');
    assert.equal(pulado.hasAttribute('tabindex'), false);
    assert.equal(pagina.existe('#pulado-listbox'), false);

    const multiplo = await inserir(pagina, '<select id="muitos" multiple><option>a</option></select>', { direto: true });
    assert.equal(multiplo.classList.contains('combo-native'), false);
    assert.equal(multiplo.dataset.combo, undefined);
    assert.equal(pagina.existe('#muitos-listbox'), false);
});

test('Combobox — opção selecionada desabilitada: a seta retoma do começo da lista', async (t) => {
    const pagina = await abrirPagina(t);
    const select = await inserir(pagina, `
        <select id="sel">
            <option value="a">A</option>
            <option value="b" disabled selected>B</option>
            <option value="c">C</option>
        </select>`);
    const combo = comboDe(select);

    assert.equal(select.selectedIndex, 1);
    assert.equal(combo.valor.textContent, 'B');
    assert.deepEqual(selecionados(combo), ['false', 'true', 'false']);
    assert.deepEqual(combo.itens().filter((item) => item.classList.contains('is-highlighted')).map((item) => item.id),
        ['sel-option-1']);

    pagina.clicar(combo.seletorDoBotao);
    assert.equal(combo.lista.dataset.highlightId, 'sel-option-1');

    // O item destacado está fora da lista navegável: a primeira seta parte do início.
    pagina.teclar(combo.seletorDoBotao, 'ArrowDown');
    assert.equal(combo.lista.dataset.highlightId, 'sel-option-0');
    pagina.teclar(combo.seletorDoBotao, 'ArrowDown');
    assert.equal(combo.lista.dataset.highlightId, 'sel-option-2');

    pagina.teclar(combo.seletorDoBotao, 'Enter');
    assert.equal(select.value, 'c');
    assert.equal(select.selectedIndex, 2);
    assert.equal(combo.valor.textContent, 'C');
    assert.deepEqual(selecionados(combo), ['false', 'false', 'true']);
});

test('Combobox — select sem id e sem opções', async (t) => {
    const pagina = await abrirPagina(t);
    const anonimo = await inserir(pagina, '<select><option value="z">Z</option><option value="w"></option></select>');
    const combo = comboDe(anonimo);

    assert.equal(combo.lista.id, '');
    assert.equal(combo.lista.hasAttribute('id'), false);
    assert.equal(combo.botao.getAttribute('aria-controls'), '');
    // Sem rótulo (nem atributo `label`, nem texto) o item sai vazio.
    assert.deepEqual(combo.itens().map((item) => [item.id, item.textContent, item.dataset.value]), [
        ['combo-option-0', 'Z', 'z'],
        ['combo-option-1', '', 'w'],
    ]);

    // Sem opções a lista abre vazia e o teclado não move nada.
    const vazio = await inserir(pagina, '<select id="vazio"></select>');
    const comboVazio = comboDe(vazio);
    assert.equal(comboVazio.valor.textContent, '');
    assert.equal(comboVazio.valor.classList.contains('is-placeholder'), true);
    assert.equal(comboVazio.lista.hasAttribute('aria-activedescendant'), false);

    const eventos = [];
    vazio.addEventListener('input', () => eventos.push('input'));
    vazio.addEventListener('change', () => eventos.push('change'));

    pagina.clicar(comboVazio.seletorDoBotao);
    assert.equal(comboVazio.combo.classList.contains('is-open'), true);
    pagina.teclar(comboVazio.seletorDoBotao, 'ArrowDown');
    assert.equal(comboVazio.lista.hasAttribute('aria-activedescendant'), false);
    // Sem item destacado o Enter não escolhe nada (e não avisa o toy).
    pagina.teclar(comboVazio.seletorDoBotao, 'Enter');
    assert.equal(vazio.value, '');
    assert.equal(vazio.selectedIndex, -1);
    assert.deepEqual(eventos, []);
});
