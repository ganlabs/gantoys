# Conversor de Rito

Converte as siglas de rito `VC` e `JEC` na descrição correspondente (`Comum` e `Juizados`). A entrada é uma lista de siglas colada na tela, uma por linha, e a saída é uma tabela de uma coluna exibida na própria página, também copiável em formato TSV.

## Requisitos

- O processamento roda inteiramente no navegador; nada é enviado para a internet.
- A entrada vem apenas do campo de texto da página; o toy não lê arquivos nem pastas.
- Cada sigla deve ficar em uma linha. Linhas vazias são descartadas antes do processamento.

## Passo a passo

1. Cole as siglas no campo `Dados`, uma por linha.
2. Clique em `Processar`.
3. A seção `Resultado` aparece com o resumo acima da tabela.
4. Clique em `Copiar resultado` para levar a coluna convertida para outro programa. O rótulo do botão passa a `Copiado` e volta a `Copiar resultado` logo depois.
5. Clique em `Limpar` para esvaziar a entrada e voltar ao estado inicial.

## Campos e controles

- **Dados** — área de texto com o marcador `Cole os dados aqui...`. Aceita qualquer texto, sem validação de formato. A dica fixa acima do campo é `Cole os dados, um por linha.`
- **Processar** — reprocessa o conteúdo atual do campo e regrava a tabela.
- **Limpar** — apaga `Dados`, esconde a seção `Resultado`, limpa a tabela e devolve o foco ao campo de dados.
- **Copiar resultado** — copia a coluna em TSV (uma linha por registro, sem o cabeçalho). Se a área de transferência falhar, o toy usa uma cópia alternativa e ainda assim exibe `Copiado`.
- Este toy não tem campos de configuração: o bloco de ajustes fica oculto, porque o tipo `convert-rito` não define nenhuma opção.

## Resultado

- Tabela com a coluna única `Convertido`, na mesma ordem das linhas não vazias da entrada.
- Resumo exibido acima da tabela: `N linhas processadas.` (ou `1 linha processada.`).
- O toy não cria arquivos, pastas nem relatórios em disco.

## Avisos e limitações

- A comparação é feita com a linha em maiúsculas, então `vc` e `jec` também são convertidos, mas apenas as siglas exatas: textos como `VARA CÍVEL` ou `JEC 2` saem exatamente como foram digitados (sem os espaços das pontas).
- Linhas vazias (ou só com espaços) não entram na tabela, então a contagem do resumo pode ser menor que o número de linhas coladas.
- Não há validação de entrada nem mensagem de erro específica: o único erro previsto pelo código é `Ferramenta não configurada.`, exibido se o tipo da ferramenta deixar de ser reconhecido.

## Detalhes técnicos

- A divisão da entrada usa quebras de linha no padrão `\r?\n`, com remoção de espaços nas pontas e descarte de linhas vazias.
- O mapeamento é exato após conversão para maiúsculas: `VC` vira `Comum`, `JEC` vira `Juizados` e qualquer outro valor é devolvido sem alteração.
- A cópia em TSV usa uma coluna por linha, sem cabeçalho, com os valores separados por tabulação e as linhas por quebra de linha.
