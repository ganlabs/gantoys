/* Toy Cadastro (planilha) — casca da página.

   Baseline da cadeia TDD do Work 0001: a página existe e os controles estão
   ligados, mas nada é lido, processado ou gravado ainda. O comportamento entra
   pela implementação, guiado por test/toys/gancadastro.test.js. */

const elementos = {
    arquivo: document.getElementById('arquivo'),
    escolherPlanilha: document.getElementById('escolher-planilha'),
    planilhaNome: document.getElementById('planilha-nome'),
    escolherDestino: document.getElementById('escolher-destino'),
    destinoNome: document.getElementById('destino-nome'),
    processar: document.getElementById('processar')
};

elementos.escolherPlanilha.addEventListener('click', () => {
    elementos.arquivo.click();
});

elementos.escolherDestino.addEventListener('click', async () => {
    // A escolha da pasta de destino passa pela ponte do app.
});

elementos.processar.addEventListener('click', async () => {
    // O processamento da planilha entra aqui.
});
