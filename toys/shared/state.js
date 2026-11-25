/* ==========================================================================
   GAN Toys — estado persistente de cada toy.

   Cada página de toy carrega este script e declara o próprio nome em
   `<html data-toy="…">`. O script faz três coisas:

   1. injeta a barra de estado (checkbox "Guardar estado" e botão
      "Limpar estado") logo abaixo do cabeçalho do toy;
   2. salva no localStorage o valor dos campos (input, select e textarea) e
      restaura na abertura seguinte — com o checkbox marcado, que é o padrão;
   3. expõe `window.GanToyState` para o toy guardar o que não é campo de
      formulário (ex.: a aba ativa):

          GanToyState.set('aba', 'bradesco');
          GanToyState.onRestore(function (estado) {
              if (estado.habilitado && estado.extras.aba) abrirAba(estado.extras.aba);
          });

   Com o checkbox desmarcado o toy não guarda nada: o registro fica com
   `habilitado: false` (para a escolha sobreviver ao recarregamento) e os
   valores são descartados. "Limpar estado" apaga o registro salvo, devolve os
   campos ao valor inicial e recarrega o toy para zerar também o estado que
   vive só na memória da página.

   File inputs não entram no estado: o navegador não permite repor arquivos
   escolhidos, e uma pasta/arquivo não pode ser restaurado sem nova permissão.
   ========================================================================== */

(function () {
    'use strict';

    var PREFIXO = 'gantoys_toy_state_v1:';
    var VERSAO = 1;
    var ATRASO = 80;
    var SALTAR = '[data-gan-state="skip"]';
    var TIPOS_IGNORADOS = ['file', 'password', 'hidden', 'submit', 'button', 'reset', 'image'];

    var toy = document.documentElement.getAttribute('data-toy') || inferirToy();
    var chave = PREFIXO + toy;
    var estado = { habilitado: true, campos: {}, extras: {} };
    var pronto = false;
    var suprimido = false;
    var limpando = false;
    var agendado = null;
    var restaurarHandlers = [];
    var limparHandlers = [];

    function inferirToy() {
        var achado = /\/toys\/([^/]+)\//.exec(location.pathname);
        return achado ? achado[1] : 'desconhecido';
    }

    function ler() {
        try {
            var bruto = localStorage.getItem(chave);
            if (!bruto) return;
            var dados = JSON.parse(bruto);
            if (!dados || dados.versao !== VERSAO) return;
            estado.habilitado = dados.habilitado !== false;
            estado.campos = dados.campos && typeof dados.campos === 'object' ? dados.campos : {};
            estado.extras = dados.extras && typeof dados.extras === 'object' ? dados.extras : {};
        } catch (erro) {
            console.warn('Cannot read toy state:', erro);
        }
    }

    /** Campo que pode ser guardado: fora da barra de estado e de tipos vetados. */
    function elegivel(elemento) {
        if (!elemento || typeof elemento.closest !== 'function') return false;
        if (elemento.closest(SALTAR)) return false;
        return TIPOS_IGNORADOS.indexOf(elemento.type) < 0;
    }

    /** Identidade estável de um campo: id, depois name, por último a posição. */
    function chaveDe(elemento) {
        // Radios do mesmo grupo guardam um valor só (o do marcado).
        if (elemento.type === 'radio') return 'grupo:' + (elemento.name || caminho(elemento));
        if (elemento.id) return 'id:' + elemento.id;
        if (elemento.name) return 'nome:' + elemento.name;
        return 'caminho:' + caminho(elemento);
    }

    function caminho(elemento) {
        var partes = [];
        var atual = elemento;
        while (atual && atual.nodeType === 1 && atual !== document.body) {
            var pai = atual.parentElement;
            if (!pai) break;
            var iguais = Array.prototype.filter.call(pai.children, function (filho) {
                return filho.tagName === atual.tagName;
            });
            partes.unshift(atual.tagName.toLowerCase() + ':' + (iguais.indexOf(atual) + 1));
            atual = pai;
        }
        return partes.join('>');
    }

    function coletar() {
        var campos = {};
        Array.prototype.forEach.call(document.querySelectorAll('input, select, textarea'), function (elemento) {
            if (!elegivel(elemento)) return;
            var nome = chaveDe(elemento);
            if (elemento.type === 'radio') {
                if (elemento.checked) campos[nome] = elemento.value;
                return;
            }
            campos[nome] = elemento.type === 'checkbox' ? elemento.checked : elemento.value;
        });
        return campos;
    }

    function gravar() {
        if (agendado) {
            clearTimeout(agendado);
            agendado = null;
        }
        // O recarregamento do "Limpar estado" emite blur/pagehide: sem a
        // trava, esses eventos regravariam o estado que acabou de ser apagado.
        if (limpando) return;
        try {
            localStorage.setItem(chave, JSON.stringify({
                versao: VERSAO,
                habilitado: estado.habilitado,
                campos: estado.habilitado ? coletar() : {},
                extras: estado.habilitado ? estado.extras : {}
            }));
        } catch (erro) {
            console.warn('Cannot save toy state:', erro);
        }
    }

    function agendar() {
        if (!pronto || suprimido || !estado.habilitado) return;
        clearTimeout(agendado);
        agendado = setTimeout(gravar, ATRASO);
    }

    function avisar(elemento) {
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        elemento.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function restaurar() {
        var valores = estado.campos;
        var grupos = {};
        suprimido = true;
        try {
            Array.prototype.forEach.call(document.querySelectorAll('input, select, textarea'), function (elemento) {
                if (!elegivel(elemento)) return;
                var nome = chaveDe(elemento);
                if (!Object.prototype.hasOwnProperty.call(valores, nome)) return;

                if (elemento.type === 'radio') {
                    if (!grupos[nome]) grupos[nome] = [];
                    grupos[nome].push(elemento);
                    return;
                }
                if (elemento.type === 'checkbox') {
                    if (elemento.checked === valores[nome]) return;
                    elemento.checked = Boolean(valores[nome]);
                    avisar(elemento);
                    return;
                }
                if (elemento.tagName === 'SELECT') {
                    var existe = Array.prototype.some.call(elemento.options, function (opcao) {
                        return opcao.value === valores[nome];
                    });
                    if (!existe || elemento.value === valores[nome]) return;
                    elemento.value = valores[nome];
                    avisar(elemento);
                    return;
                }
                if (elemento.value === valores[nome]) return;
                elemento.value = valores[nome];
                avisar(elemento);
            });

            Object.keys(grupos).forEach(function (nome) {
                var escolhido = grupos[nome].filter(function (elemento) {
                    return elemento.value === valores[nome];
                })[0];
                if (!escolhido || escolhido.checked) return;
                escolhido.checked = true;
                avisar(escolhido);
            });
        } finally {
            suprimido = false;
        }
    }

    /** Devolve os campos ao valor declarado no HTML (o "estado vazio"). */
    function zerarCampos() {
        suprimido = true;
        try {
            Array.prototype.forEach.call(document.querySelectorAll('input, select, textarea'), function (elemento) {
                if (!elegivel(elemento)) return;
                if (elemento.type === 'checkbox' || elemento.type === 'radio') {
                    if (elemento.checked === elemento.defaultChecked) return;
                    elemento.checked = elemento.defaultChecked;
                    avisar(elemento);
                    return;
                }
                if (elemento.value === elemento.defaultValue) return;
                elemento.value = elemento.defaultValue;
                avisar(elemento);
            });
        } finally {
            suprimido = false;
        }
    }

    function limpar() {
        limpando = true;
        estado.campos = {};
        estado.extras = {};
        zerarCampos();
        try {
            localStorage.removeItem(chave);
        } catch (erro) {
            console.warn('Cannot clear toy state:', erro);
        }
        limparHandlers.forEach(function (handler) {
            try {
                handler();
            } catch (erro) {
                console.warn('Toy clear handler failed:', erro);
            }
        });
        // Desligado, o registro precisa sobreviver ao recarregamento para a
        // escolha continuar valendo (só a preferência, sem campos).
        if (!estado.habilitado) {
            limpando = false;
            gravar();
        }
        try {
            window.location.reload();
        } catch (erro) {
            // Ambiente sem navegação (jsdom): a tela já foi zerada acima.
        }
    }

    function construirBarra() {
        var shell = document.querySelector('main.shell');
        if (!shell || document.getElementById('ganStateBar')) return;

        var barra = document.createElement('div');
        barra.id = 'ganStateBar';
        barra.className = 'state-bar';
        // A barra não faz parte do estado guardado.
        barra.setAttribute('data-gan-state', 'skip');

        var rotulo = document.createElement('label');
        rotulo.className = 'check-row';
        rotulo.htmlFor = 'ganStateEnabled';
        var caixa = document.createElement('input');
        caixa.type = 'checkbox';
        caixa.id = 'ganStateEnabled';
        caixa.checked = estado.habilitado;
        var texto = document.createElement('span');
        texto.textContent = 'Guardar estado';
        rotulo.append(caixa, texto);

        var botao = document.createElement('button');
        botao.type = 'button';
        botao.id = 'ganStateClear';
        botao.className = 'btn btn-outline btn-small';
        var icone = document.createElement('i');
        icone.className = 'bi bi-arrow-counterclockwise';
        icone.setAttribute('aria-hidden', 'true');
        botao.append(icone, document.createTextNode(' Limpar estado'));

        caixa.addEventListener('change', function () {
            estado.habilitado = caixa.checked;
            if (!estado.habilitado) {
                estado.campos = {};
                estado.extras = {};
            }
            gravar();
        });

        botao.addEventListener('click', limpar);

        barra.append(rotulo, botao);
        var marca = shell.querySelector('.brand');
        if (marca && marca.parentElement === shell) shell.insertBefore(barra, marca.nextSibling);
        else shell.insertBefore(barra, shell.firstChild);
    }

    function iniciar() {
        if (pronto) return;
        ler();
        construirBarra();
        if (estado.habilitado) restaurar();
        pronto = true;

        // `input` cobre digitação; `change` cobre select, checkbox e colagem
        // feita por script de terceiros. Os dois são delegados: campos criados
        // depois do carregamento (configurações do kit) entram sozinhos.
        document.addEventListener('input', function (evento) {
            if (elegivel(evento.target)) agendar();
        }, true);
        document.addEventListener('change', function (evento) {
            if (elegivel(evento.target)) agendar();
        }, true);

        // O iframe do app pode ser destruído sem `beforeunload`; `pagehide`, a
        // página oculta e a perda de foco (clique no menu lateral) gravam antes.
        window.addEventListener('pagehide', gravar);
        window.addEventListener('blur', gravar);
        document.addEventListener('focusout', gravar, true);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') gravar();
        });

        var extras = estado.habilitado ? estado.extras : {};
        restaurarHandlers.forEach(function (handler) {
            try {
                handler({ extras: extras, habilitado: estado.habilitado });
            } catch (erro) {
                console.warn('Toy restore handler failed:', erro);
            }
        });
        restaurarHandlers = [];
    }

    window.GanToyState = {
        toy: toy,
        get: function (nome, padrao) {
            return Object.prototype.hasOwnProperty.call(estado.extras, nome) ? estado.extras[nome] : padrao;
        },
        set: function (nome, valor) {
            estado.extras[nome] = valor;
            agendar();
        },
        onRestore: function (handler) {
            if (typeof handler !== 'function') return;
            if (!pronto) {
                restaurarHandlers.push(handler);
                return;
            }
            handler({ extras: estado.habilitado ? estado.extras : {}, habilitado: estado.habilitado });
        },
        onClear: function (handler) {
            if (typeof handler === 'function') limparHandlers.push(handler);
        },
        flush: gravar,
        limpar: limpar
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
