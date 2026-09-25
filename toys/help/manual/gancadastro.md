# Cadastro (planilha)

Processa uma planilha de cadastro em `.xlsx` e grava uma cópia padronizada na pasta que você escolher. A cópia é o mesmo arquivo: mesmas abas, mesmos nomes, mesma formatação — só os valores das colunas de cadastro mudam.

## O que ele processa

- **Núm. Processo** — o número vira CNJ pontuado (`NNNNNNN-DD.AAAA.J.T.R.OOOO`). Vale para o valor cru (só dígitos) e para o já pontuado.
- **Advogado Adverso**, **OAB Advogado Adverso**, **UF OAB Advogado Adverso** e **Comarca** — passam pela normalização de nomes: maiúsculas, sem acento, corte no primeiro `|` e as traduções `SEM ADV` → `SEM ADVOGADO`, `SEM OAB` → `0`, `SEM UF` → `TJ`.
- **Valor da Causa** — passa pelo extrator de valores: separadores no padrão brasileiro e sufixo de centavos zerado removido (`R$ 20.000,00` → `20000`, `1.234,56` → `1234,56`).

## Como usar

- Clique em **Escolher planilha** e selecione o arquivo `.xlsx` ou `.xlsm`.
- Confira o diagnóstico: ele lista as abas na ordem do arquivo, quantas linhas cada uma tem e quais colunas de cadastro foram reconhecidas.
- Clique em **Escolher pasta de destino** e confirme a pasta no diálogo do app.
- Clique em **Processar**. O arquivo é gravado como `Cadastro-DD-MM-AAAA_HH-MM.xlsx`, no relógio local.

## O que a saída preserva

- Todas as abas do arquivo original, com os mesmos nomes e na mesma ordem.
- A formatação: estilos, números, larguras, mesclagens e o restante do pacote saem como estavam.
- A célula reescrita mantém o índice de estilo dela; ela passa a guardar texto.

## Regras e limites

- A linha 1 de cada aba é o cabeçalho. Aba sem nenhuma coluna reconhecida sai intacta.
- Apenas a célula cujo valor muda é reescrita. Célula já normalizada, célula vazia e célula com fórmula ficam como estavam.
- Célula com fórmula é contada como ignorada: reescrevê-la apagaria a fórmula.
- Célula sem o atributo `r` (endereço) não é processada, porque não há como localizá-la no arquivo.
- Nomes de coluna aceitos para o processo: `Núm. Processo`, `Num Processo`, `Número do Processo` e `Núm Proc`. A comparação ignora acento, caixa e pontuação.
- `.xls` não é aceito. `.xlsm` é lido como pacote OOXML: as macros não são interpretadas nem executadas.
- O toy precisa da pasta escolhida pelo app; o arquivo é gravado pela ponte, sem download alternativo.

## Relatório na tela

O cartão de resultado mostra quantas células foram alteradas, quantas já estavam no formato, quantas foram ignoradas (vazias ou com fórmula) e quantas não puderam ser convertidas — número de processo que não chega a 20 dígitos, por exemplo.
