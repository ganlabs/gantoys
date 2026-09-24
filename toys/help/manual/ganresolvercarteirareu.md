# Resolver Carteira/Réu

Encontra o réu correspondente a uma carteira, cliente ou apelido informado. A entrada é uma lista de consultas, uma por linha; a saída é uma tabela com a consulta, a carteira encontrada e o réu correspondente.

## Requisitos
- Navegador com JavaScript habilitado. A tabela de carteiras e réus vem embutida no próprio toy; nada é enviado para a internet e nenhum arquivo é lido.
- A cópia usa a área de transferência do navegador, com alternativa interna quando o acesso direto é bloqueado.

## Passo a passo
1. Cole as consultas no campo `Dados`, uma por linha. Cada linha pode ser o nome da carteira, o nome do réu, um apelido curto ou um trecho do nome.
2. Clique em `Processar`.
3. Confira a tabela: a coluna `Consulta` repete o que você digitou, e as colunas `Carteira` e `Réu` mostram o que foi encontrado.
4. Clique em `Copiar resultado` para levar a saída para a área de transferência, ou `Limpar` para esvaziar o campo e esconder o resultado.

## Campos e controles
- **Dados** — área de texto livre, uma consulta por linha. O exemplo do campo é `Cole os dados aqui...`. Cada linha é aparada e as linhas vazias são descartadas. Esta ferramenta não tem campos de configuração: só o campo de dados e os botões.
- **Processar** — resolve todas as linhas do campo. Rodar de novo substitui o resultado anterior.
- **Limpar** — esvazia `Dados`, limpa a tabela e a mensagem de erro e devolve o foco ao campo.
- **Copiar resultado** — copia a saída em TSV, sem cabeçalho e sem a coluna `Consulta`, ou seja, apenas os pares de carteira e réu, na ordem das linhas. Não faz nada enquanto não houver resultado.

## Resultado
- Resumo `N linhas processadas.` — no singular, `1 linha processada.`
- Tabela com as colunas `Consulta`, `Carteira` e `Réu`, uma linha por consulta, na mesma ordem da entrada.
- Consulta que não encontra nada aparece com `Carteira` e `Réu` vazios, sem mensagem de erro e sem destaque de falha.
- A cópia gera uma linha por consulta com dois campos separados por tabulação, pronta para colar em planilha.
- O toy não grava arquivos nem pastas e não guarda nada no navegador: além da tabela na tela, a única saída é o texto copiado para a área de transferência.

## Avisos e limitações
- A ferramenta não emite mensagens de erro próprias: entrada não reconhecida simplesmente devolve células vazias.
- A correspondência é heurística, por apelido exato, nome do réu contido na consulta e semelhança de palavras. Consultas parecidas podem cair na carteira errada.
- Várias empresas compartilham a mesma carteira: `Saneamento - BRK` e `Mercado Livre` aparecem repetidas na tabela interna, e um apelido genérico devolve a primeira entrada listada para aquele nome.
- Acentos, pontuação e sinais são descartados na comparação, com exceção do `+`, que é preservado.
- A comparação não diferencia maiúsculas de minúsculas.
- Empates de pontuação são resolvidos pela ordem da tabela interna, não por proximidade do texto digitado.

## Detalhes técnicos
- Normalização das consultas: decomposição de acentos (NFKD), troca de todo caractere que não seja letra, dígito ou `+` por espaço, espaços repetidos colapsados, texto em maiúsculas e sem espaços nas pontas.
- Passo 1: apelido exato. A consulta normalizada é procurada numa tabela fixa de apelidos, como `ml`, `ml vc` e `vc` para `Mercado Livre - Mercado Livre - JC`/`REU A DEFINIR`, `mljec`, `jec` e `cejusc` para `Mercado Livre - Mercado Livre - JEC`/`REU A DEFINIR`, `prolagos`, `prolagos consumidor`, `prolagos cobranca`, `brk` e variantes como `brk recife`, `brk goias`, `brk sumare`, `saneatins`, `mercado pago`, `mercado envios`, `mercado credito`, `ebazar`, `ibazar`, `kangu`, `k21`, `naturgy`, `ceg`, `gas natural` e `bradesco`.
- Passo 2: nome do réu contido na consulta. Se a consulta normalizada contiver o nome normalizado de algum réu da tabela, vale a primeira entrada nessa ordem.
- Passo 3: pontuação por semelhança. São testadas três variantes da consulta: a normalizada, a normalizada sem espaços e a normalizada com um espaço inserido entre letra e dígito. Cada entrada da tabela recebe a maior pontuação entre as variantes: igualdade exata com o nome da carteira ou do réu vale 10000; carteira e réu concatenados contendo a variante vale 5000 mais o comprimento da variante; caso contrário, 100 para cada palavra com mais de um caractere em comum.
- A maior pontuação vence, e a comparação é estrita, então a primeira entrada da tabela com a pontuação máxima fica com o resultado. Consulta que não soma nenhum ponto volta sem carteira e sem réu.
- Linha vazia depois da normalização é devolvida em branco sem passar pelos passos de busca.
