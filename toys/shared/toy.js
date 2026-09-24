/* ==========================================================================
   GAN Toys — combobox compartilhado.

   O popup nativo do <select> é desenhado pelo sistema operacional e ignora o
   CSS do produto (no Linux/Chrome abre uma lista clara com seleção azul).
   Este script troca a APARÊNCIA do select por um combobox próprio, mantendo o
   <select> original no DOM (escondido) como fonte de valor: nome, `value`,
   `change` e `getSettings` continuam funcionando como antes.

   Uso: a página do toy carrega `../shared/toy.js` (o bundle embute o arquivo).
   Seletores marcados com `data-combo="skip"` não são convertidos.
   ========================================================================== */

(function () {
    'use strict';

    var instances = new WeakMap();

    function optionLabel(option) {
        return option.label || option.textContent || '';
    }

    function buildList(select, list, state) {
        list.textContent = '';
        Array.from(select.options).forEach(function (option, index) {
            var item = document.createElement('li');
            item.className = 'combo-option';
            item.setAttribute('role', 'option');
            item.id = (select.id || 'combo') + '-option-' + index;
            item.dataset.value = option.value;
            item.textContent = optionLabel(option);
            if (option.disabled) item.classList.add('is-disabled');
            list.appendChild(item);
        });
        sync(select, list, state);
    }

    function sync(select, list, state) {
        var current = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
        state.value.textContent = current ? optionLabel(current) : '';
        state.value.classList.toggle('is-placeholder', !current);
        state.button.disabled = select.disabled;

        var highlighted = null;
        Array.from(list.children).forEach(function (item) {
            // Compara pelo objeto <option>, não pelo value: valores repetidos existem.
            var selected = current !== null && select.options[indexOfItem(item)] === current;
            item.setAttribute('aria-selected', selected ? 'true' : 'false');
            if (selected) highlighted = item;
        });

        if (!list.querySelector('.is-highlighted') && highlighted) {
            list.dataset.highlightId = highlighted.id;
        }
        highlight(list, list.dataset.highlightId);
    }

    function indexOfItem(item) {
        return Number(item.id.split('-').pop());
    }

    function highlight(list, id) {
        Array.from(list.children).forEach(function (item) {
            item.classList.toggle('is-highlighted', item.id === id);
        });
        if (id) list.setAttribute('aria-activedescendant', id);
        else list.removeAttribute('aria-activedescendant');
    }

    function open(combo, select, list, state) {
        closeAll(combo);
        combo.classList.add('is-open');
        state.button.setAttribute('aria-expanded', 'true');
        var selected = list.querySelector('[aria-selected="true"]') || list.querySelector('.combo-option:not(.is-disabled)');
        if (selected) {
            list.dataset.highlightId = selected.id;
            highlight(list, selected.id);
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    function close(combo, state) {
        combo.classList.remove('is-open');
        state.button.setAttribute('aria-expanded', 'false');
    }

    function closeAll(except) {
        document.querySelectorAll('.combo.is-open').forEach(function (combo) {
            // istanbul ignore next -- open() nunca roda num combo já aberto (o clique alterna)
            if (combo === except) return;
            var instance = instances.get(combo);
            if (instance) close(combo, instance);
        });
    }

    function choose(select, list, state, item) {
        if (!item || item.classList.contains('is-disabled')) {
            // Nada escolhido (lista vazia, item desabilitado): o popup fecha do
            // mesmo jeito, como acontece no select nativo.
            close(state.combo, state);
            return;
        }
        close(state.combo, state);
        var index = Number(item.id.split('-').pop());
        var option = select.options[index];
        // istanbul ignore next -- item obsoleto entre o clique e o rebuild da lista
        if (!option) return;
        var changed = select.selectedIndex !== index;
        select.selectedIndex = index;
        list.dataset.highlightId = item.id;
        sync(select, list, state);
        // O toy reage a `change` (campos condicionais, contadores, etc.).
        if (changed) {
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function move(list, stepOrEdge) {
        var items = Array.from(list.children).filter(function (item) {
            return !item.classList.contains('is-disabled');
        });
        if (!items.length) return;
        var currentIndex = items.findIndex(function (item) {
            return item.id === list.dataset.highlightId;
        });
        var nextIndex;
        if (stepOrEdge === 'first') nextIndex = 0;
        else if (stepOrEdge === 'last') nextIndex = items.length - 1;
        else nextIndex = ((currentIndex < 0 ? 0 : currentIndex + stepOrEdge) + items.length) % items.length;
        list.dataset.highlightId = items[nextIndex].id;
        highlight(list, items[nextIndex].id);
        items[nextIndex].scrollIntoView({ block: 'nearest' });
    }

    function upgrade(select) {
        if (select.dataset.combo === 'ready' || select.multiple) return;
        if (select.dataset.combo === 'skip') return;
        select.dataset.combo = 'ready';

        var combo = document.createElement('div');
        combo.className = 'combo';

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'combo-button';
        button.setAttribute('role', 'combobox');
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');

        var value = document.createElement('span');
        value.className = 'combo-value';

        var arrow = document.createElement('span');
        arrow.className = 'combo-arrow';
        arrow.setAttribute('aria-hidden', 'true');

        var list = document.createElement('ul');
        list.className = 'combo-list';
        list.setAttribute('role', 'listbox');
        list.tabIndex = -1;
        if (select.id) list.id = select.id + '-listbox';

        button.append(value, arrow);
        combo.append(button, list);
        select.parentNode.insertBefore(combo, select);
        select.classList.add('combo-native');
        select.setAttribute('tabindex', '-1');
        button.setAttribute('aria-controls', list.id);

        var state = { combo: combo, button: button, value: value, list: list };
        instances.set(combo, state);

        buildList(select, list, state);

        button.addEventListener('click', function () {
            if (combo.classList.contains('is-open')) close(combo, state);
            else open(combo, select, list, state);
        });

        button.addEventListener('keydown', function (event) {
            var isOpen = combo.classList.contains('is-open');
            switch (event.key) {
                case 'ArrowDown':
                case 'ArrowUp':
                    event.preventDefault();
                    if (!isOpen) open(combo, select, list, state);
                    else move(list, event.key === 'ArrowDown' ? 1 : -1);
                    break;
                case 'Home':
                case 'End':
                    if (!isOpen) return;
                    event.preventDefault();
                    move(list, event.key === 'Home' ? 'first' : 'last');
                    break;
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    if (!isOpen) open(combo, select, list, state);
                    else choose(select, list, state, list.querySelector('.is-highlighted'));
                    break;
                case 'Escape':
                    if (isOpen) {
                        event.preventDefault();
                        close(combo, state);
                    }
                    break;
            }
        });

        list.addEventListener('click', function (event) {
            var item = event.target.closest('.combo-option');
            if (!item) return;
            choose(select, list, state, item);
            button.focus();
        });

        list.addEventListener('mousemove', function (event) {
            var item = event.target.closest('.combo-option');
            if (item && !item.classList.contains('is-disabled')) highlight(list, item.id);
        });

        document.addEventListener('click', function (event) {
            if (!combo.contains(event.target)) close(combo, state);
        });

        // O valor pode ser trocado por fora (restauração de estado do app,
        // `Limpar` do toy): reflete no rótulo e re-renderiza se as opções mudarem.
        select.addEventListener('change', function () { sync(select, list, state); });
        new MutationObserver(function (mutations) {
            if (mutations.some(function (m) { return m.type === 'childList'; })) {
                buildList(select, list, state);
            } else {
                sync(select, list, state);
            }
        }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    }

    function upgradeAll(root) {
        // istanbul ignore next -- upgradeAll sempre recebe um nó ou o documento
        (root || document).querySelectorAll('select:not([data-combo])').forEach(upgrade);
    }

    function init() {
        upgradeAll(document);
        // Toys criam seletores depois do load (configurações geradas por script).
        new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    if (node.tagName === 'SELECT') upgrade(node);
                    else upgradeAll(node);
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    // istanbul ignore else -- o script sempre roda durante o carregamento da página
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
