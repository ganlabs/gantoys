# Padronizador CNJ

Converte uma lista de números de processo entre o formato pontuado e o formato despontuado. A entrada é uma lista de processos, um por linha; a saída é a mesma lista no formato escolhido, com cada linha marcada como convertida ou inválida.

## Requisitos
- Navegador com JavaScript habilitado. Todo o processamento acontece na página.
- Nenhum arquivo é lido ou gravado, e nada é enviado para a internet.
- O botão de cópia usa a área de transferência do navegador.

## Passo a passo
1. Cole os processos no campo `Lista de processos`, um por linha.
2. Escolha o `Modo`: `Pontuar` (opção marcada por padrão) ou `Despontuar`.
3. Clique em `Processar Lista`.
4. Confira a lista de resultados: cada item mostra o valor final, o selo `OK` ou `Inválido`, a linha `Original: ...` e a mensagem da conversão.
5. Clique em `Copiar para a Memória` para levar todas as linhas de saída para a área de transferência, na ordem da entrada.

## Campos e controles
- **Lista de processos** — área de texto livre, um processo por linha. O campo mostra como exemplo `00000018920238260100` e `0000002-90.2024.8.26.0100`. Linhas vazias ou só com espaços são descartadas; espaços no início e no fim de cada linha são removidos antes da conversão.
- **Modo** — grupo de opções com `Pontuar` e `Despontuar`. Só a opção marcada é usada; `Pontuar` já vem selecionada.
- **Processar Lista** — reprocessa todo o conteúdo atual do campo. Rodar de novo substitui o resultado anterior.
- **Copiar para a Memória** — copia uma linha de texto por item. Fica desabilitado quando não há nenhum item com conteúdo. Depois de copiar, o rótulo vira `Copiado` e volta a `Copiar para a Memória` após 1,6 segundo; se a cópia falhar, mostra `Falha ao copiar` pelo mesmo intervalo.

## Resultado
- Resumo no topo da seção: `N de M linhas convertidas.`, contando apenas as linhas aceitas.
- Quando nenhuma linha tem conteúdo, a seção mostra `Nenhuma linha para processar.` e a mensagem `Nenhuma linha válida informada.`, e o botão de cópia fica desabilitado.
- Cada item da lista exibe o valor convertido, o selo `OK` ou `Inválido`, a linha iniciada por `Original: ` seguida do texto digitado, e a mensagem `Convertido para formato pontuado.` ou `Convertido para formato despontuado.`; nas linhas recusadas a mensagem de erro aparece destacada.
- A cópia gera as linhas de saída na ordem da entrada. As linhas recusadas entram sem alteração, exatamente como foram digitadas (já sem os espaços das pontas).
- O toy não cria arquivos nem pastas; a saída é apenas a lista na tela e o texto copiado.

## Avisos e limitações
- Linha cuja quantidade de dígitos não é exatamente 20 é recusada com `Linha inválida: o CNJ precisa ter 20 dígitos.` e recebe o selo `Inválido`; ela continua aparecendo na saída, sem conversão.
- Não há validação de dígito verificador: a única checagem é a contagem de dígitos. Um número com 20 dígitos e dígito verificador errado é aceito normalmente.
- Letras e qualquer outro caractere que não seja dígito são descartados antes da contagem, então uma linha com texto extra pode ser aceita se sobrarem 20 dígitos.

## Detalhes técnicos
- O texto é dividido por quebras de linha (`\r?\n`); cada linha é aparada e as vazias são ignoradas.
- Todos os caracteres que não são dígitos são removidos da linha antes da checagem e da conversão.
- No modo `Pontuar`, os 20 dígitos são recortados por posição e remontados no formato `NNNNNNN-DD.AAAA.J.TR.OOOO`: posições 1 a 7 número sequencial, 8 a 9 dígito verificador, 10 a 13 ano, 14 segmento da justiça, 15 a 16 tribunal e 17 a 20 origem. Não há recálculo de dígito verificador.
- No modo `Despontuar`, a saída é a sequência dos 20 dígitos, sem separadores.
