import { test } from 'node:test';
import { verificarPreambuloDeTema } from '../testkit/preambulo.js';
import { toysDoProjeto } from '../testkit/coverage/relatorio.mjs';

// O preâmbulo de tema é copiado no <head> de cada toy. Aqui ele é verificado
// uma vez por toy: aplicar o tema salvo, injetar o CSS, reagir à mensagem do
// app e repassar o ponteiro. Cobertura e regressão para os dezesseis de uma vez.
for (const slug of toysDoProjeto()) {
    test(`preâmbulo de tema — ${slug}`, async (t) => {
        await verificarPreambuloDeTema(t, slug);
    });
}
