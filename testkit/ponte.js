/**
 * Ponte entre um toy e o app hospedeiro.
 *
 * Os toys que mexem em pastas não abrem o seletor sozinhos: enviam
 * `gantoys-directory-picker-request`, `gantoys-copy-request`,
 * `gantoys-file-request` ou `gantoys-renamer-request` para `window.parent` e
 * esperam a resposta. Aqui o app é o de verdade (`app.js` carregado pelo
 * harness), então o protocolo, o motor de cópia, o plano de renomeação e as
 * mensagens de erro exercitados no teste são o código de produção.
 *
 * O toy roda na própria janela do jsdom, onde `window.parent === window`: a
 * mensagem que ele posta chega no seu próprio listener, e a ponte a repassa
 * para a janela do app. A resposta do app volta por um `source` falso que
 * dispara o evento na janela do toy.
 */

export function conectarPonte(paginaApp, paginaToy) {
    const janelaApp = paginaApp.janela;
    const janelaToy = paginaToy.janela;

    const enviados = [];
    const respostas = [];

    const origemFalsa = {
        postMessage(dados) {
            respostas.push(dados);
            janelaToy.dispatchEvent(new janelaToy.MessageEvent('message', { data: dados, origin: 'null' }));
        },
    };

    const aoMensagemDoToy = (evento) => {
        const dados = evento.data;
        if (!dados || typeof dados.type !== 'string' || !dados.type.startsWith('gantoys-')) return;
        enviados.push(dados);
        janelaApp.dispatchEvent(new janelaApp.MessageEvent('message', {
            data: dados,
            source: origemFalsa,
            origin: 'null',
        }));
    };
    janelaToy.addEventListener('message', aoMensagemDoToy);

    return {
        enviados,
        respostas,
        origemFalsa,
        /** Tipos já enviados pelo toy, na ordem. */
        tipos: () => enviados.map((mensagem) => mensagem.type),
        /** Uma resposta do app pelo tipo, opcionalmente pelo `requestId`. */
        resposta(tipo, requestId) {
            return respostas.find((mensagem) => mensagem.type === tipo && (requestId === undefined || mensagem.requestId === requestId));
        },
        /** O app abriu o diálogo de escolha de pasta? */
        modalDePastaAberto: () => paginaApp.seletor('#directoryPickerModal').hidden === false,
        /** Confirma a escolha de pasta no diálogo do app (usa a próxima pasta preparada). */
        async confirmarPasta() {
            paginaApp.clicar('#directoryPickerConfirm');
            await paginaApp.tick(0);
            await paginaToy.tick(0);
        },
        async cancelarPasta() {
            paginaApp.clicar('#directoryPickerCancel');
            await paginaApp.tick(0);
            await paginaToy.tick(0);
        },
        desconectar() {
            janelaToy.removeEventListener('message', aoMensagemDoToy);
        },
    };
}
