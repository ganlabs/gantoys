# Cadastro (planilha)

Processa uma planilha de cadastro em `.xlsx` e grava uma cópia padronizada na pasta que você escolher. A cópia é o mesmo arquivo: mesmas abas, mesmos nomes, mesma formatação — só os valores das colunas de cadastro mudam.

## O que ele processa

- **Núm. Processo** — o número vira CNJ pontuado (`NNNNNNN-DD.AAAA.J.T.R.OOOO`). Vale para o valor cru (só dígitos) e para o já pontuado.
- **Advogado Adverso**, **OAB Advogado Adverso**, **UF OAB Advogado Adverso** e **Comarca** — passam pela normalização de nomes: maiúsculas, sem acento, corte no primeiro `|` e as traduções `SEM ADV` → `SEM ADVOGADO`, `SEM OAB` → `0`, `SEM UF` → `TJ`.
- **Valor da Causa** — passa pelo extrator de valores: separadores no padrão brasileiro e sufixo de centavos zerado removido (`R$ 20.000,00` → `20000`, `1.234,56` → `1234,56`). A célula fica com o formato **Texto** do Excel (`numFmtId` 49) e guarda o valor como texto inline; um leitor de planilha vê `1234,56` como texto, não como número.

## Como usar

- Clique em **Escolher planilha** e selecione o arquivo `.xlsx` ou `.xlsm`.
- Confira o diagnóstico: ele lista as abas na ordem do arquivo, quantas linhas cada uma tem e quais colunas de cadastro foram reconhecidas.
- Clique em **Escolher pasta de destino** e confirme a pasta no diálogo do app.
- Clique em **Processar**. O arquivo é gravado como `Cadastro-DD-MM-AAAA_HH-MM.xlsx`, no relógio local.

## O que a saída preserva

- Todas as abas do arquivo original, com os mesmos nomes e na mesma ordem.
- A formatação: estilos, números, larguras, mesclagens e o restante do pacote saem como estavam. A exceção é o formato de número do Valor da Causa, que vira Texto.
- A célula reescrita ganha um novo índice de estilo derivado do original. O novo estilo copia os atributos e os filhos do estilo original (`alignment` e `protection`), então fontes, bordas, alinhamento e proteção ficam iguais.
- Alinhamento não é alterado em nenhuma célula, nem nas células pintadas de laranja ou vermelho.

## Regras e limites

- A linha 1 de cada aba é o cabeçalho. Aba sem nenhuma coluna reconhecida sai intacta.
- A célula é reescrita quando o valor muda ou quando o Valor da Causa precisa passar para Texto. Célula já normalizada, vazia e com fórmula ficam como estavam.
- Célula com fórmula é contada como ignorada: reescrevê-la apagaria a fórmula.
- Célula sem o atributo `r` (endereço) não é processada, porque não há como localizá-la no arquivo.
- Nomes de coluna aceitos para o processo: `Núm. Processo`, `Num Processo`, `Número do Processo` e `Núm Proc`. A comparação ignora acento, caixa e pontuação.
- `.xls` não é aceito. `.xlsm` é lido como pacote OOXML: as macros não são interpretadas nem executadas.
- O toy precisa da pasta escolhida pelo app; o arquivo é gravado pela ponte, sem download alternativo.
- A escolha da pasta não tem limite de tempo. O limite de resposta da gravação continua em 120 segundos.
- Se o navegador cancelar ou recusar a escolha, o diálogo do app permite outra tentativa.

## Regras avançadas de cadastro

- **Carteira e Parte Ré** — se a carteira contiver `Santander` (qualquer caixa), nem a Carteira nem a Parte Ré são modificadas por nenhuma regra e não são pintadas. Se contiver `Bradesco - Indenizatória`, a Parte Ré vira `BANCO BRADESCO SA`. Se a carteira não for Bradesco nem Santander, a Parte Ré é resolvida pelo resolvedor de carteira/réu; se não resolver, Carteira e Parte Ré mantêm os valores originais e são pintadas de laranja.
- **Comarca** — `capital` vira a capital correspondente à coluna UF. Com texto adicional, o toy remove `capital` e mantém o restante. `LEOPOLDINA` permanece como está, inclusive no JEC 10 e 11. Para `JACAREPAGUA`, Órgão `JEC` vira `FREGUESIA` e Órgão `VC` vira `TAQUARA`.
- **Tipo Audiência** — se estiver vazio mas houver data na coluna Data Audiência, é preenchido com `AC`.

## Destaques visuais em cores

- **Laranja** — aplicado em: Valor da Causa igual a `0`, Advogado Adverso `SEM ADVOGADO` com Órgão fora de JEC/JEA/JECrim, Num `0` com Órgão VC ou VU, Rito fora de Comum e Juizados, e exceções de Carteira e Parte Ré.
- **Vermelho** — aplicado na célula de Causa Raiz quando a carteira final não contiver Bradesco nem Santander.
- Os estilos de cor são injetados em `styles.xml` preservando fontes, bordas, formatos de número e o alinhamento de cada célula.

## Relatório na tela

O cartão de resultado mostra quantas células foram alteradas, quantas foram pintadas com destaques, quantas já estavam no formato, quantas foram ignoradas (vazias ou com fórmula) e quantas não puderam ser convertidas.
