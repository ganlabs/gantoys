# Renomeador em Massa

Renomeia arquivos de uma pasta local aplicando um padrão wildcard com substituição. A entrada é uma pasta escolhida pelo usuário; a saída é a lista de nomes novos e um relatório por arquivo, depois que a renomeação é confirmada.

## Requisitos
- Navegador compatível com a File System Access API (Chromium e derivados). O seletor de pasta é aberto pelo aplicativo que hospeda o toy.
- A pasta é aberta com permissão de leitura e escrita; a permissão é pedida no momento da seleção.
- Nenhum conteúdo de arquivo é lido: o toy trabalha apenas com os nomes dentro da pasta escolhida. Nada é enviado para a internet.

## Passo a passo
1. Clique em `Selecionar pasta` e escolha a pasta dos arquivos. O texto `Nenhuma pasta selecionada` é substituído pelo nome da pasta.
2. Escolha um `Preset` ou preencha à mão o `Padrão a encontrar (aceita * e ?)`.
3. Preencha `Substituir por` com o texto de destino, usando `$1`, `$2` e assim por diante para reinserir os curingas.
4. Marque `Normalizar extensão (letras maiúsculas para minúsculas)` e `Incluir subpastas` conforme a necessidade.
5. Clique em `Visualizar`. A seção `Prévia da renomeação` lista cada arquivo afetado no formato `nome atual → novo nome`.
6. Confira a prévia e clique em `Renomear`. O relatório final mostra uma linha por arquivo, começando por `RENOMEADO` ou `ERRO`.

## Campos e controles
- **Pasta dos arquivos** / **Selecionar pasta** — abre o seletor de pasta em modo leitura e escrita. Cancelar o seletor não altera nada e não mostra erro.
- **Preset** — `Personalizado` (sem preset) mais três combinações prontas: `Integral → Integral_`, que usa o padrão `Integral - *.pdf` com substituição `Integral_$1.pdf`; `Inicial → Inicial_`, com `Inicial - *.pdf` e `Inicial_$1.pdf`; e `Docs Inicial → Docs_`, com `Docs Inicial - *.pdf` e `Docs_$1.pdf`.
- **Padrão a encontrar (aceita * e ?)** — `*` casa com qualquer sequência e `?` com um caractere. Exemplo do campo: `Ex.: Integral - *.pdf`. Cada `*` conta como um curinga e cada sequência de `?` conta como um único curinga, na ordem em que aparecem.
- **Substituir por** — texto que entra no lugar do que casou. Exemplo do campo: `Ex.: Integra_$1.pdf`. Deixar vazio apaga o trecho casado. Para usar a substituição é preciso ter um padrão preenchido.
- **Normalizar extensão (letras maiúsculas para minúsculas)** — depois da substituição, reescreve a extensão do nome final em minúsculas. Não afeta arquivos cujo nome não casa com o padrão.
- **Incluir subpastas** — marcado, varre a pasta escolhida e todas as subpastas recursivamente; desmarcado, olha só os arquivos do nível raiz.
- **Visualizar** — fica desabilitado enquanto não houver pasta selecionada e padrão não vazio. Gera o plano de renomeação e o guarda para a etapa seguinte.
- **Renomear** — fica desabilitado enquanto não existir uma prévia com pelo menos um arquivo a renomear, e é desabilitado junto com `Visualizar` durante a execução.
- Alterar o padrão, a substituição, qualquer uma das duas caixas de seleção, o preset ou a pasta descarta a prévia anterior e volta a exigir `Visualizar`.

## Resultado
- Título da prévia: `Prévia da renomeação — N arquivo(s) de TOTAL`, em que `N` é a quantidade de arquivos que mudam de nome e `TOTAL` é a quantidade de arquivos varridos.
- Cada linha da prévia mostra o caminho relativo do arquivo (com as subpastas, quando houver) e o novo nome.
- Sumário com os contadores `Arquivos`, `A renomear` e `Erros`, atualizado depois da renomeação.
- `Relatório da operação` com uma linha por arquivo processado: `RENOMEADO` seguido de `caminho → novo nome`, ou `ERRO` seguido de `caminho: motivo`.
- O toy não cria nem apaga arquivos e não gera arquivos de relatório: ele apenas troca os nomes dentro da pasta escolhida, e o relatório existe só na tela.

## Avisos e limitações
- Falha ao montar a prévia abre um alerta começando por `Não foi possível gerar a prévia: ` seguido do motivo; falha ao renomear abre um alerta começando por `Não foi possível renomear os arquivos: `.
- Se a pasta guardada não estiver mais acessível, a prévia falha com `A pasta selecionada não está mais disponível. Selecione-a novamente.`
- Se o plano tiver sido descartado, a renomeação falha com `A prévia expirou. Gere uma nova prévia antes de renomear.`
- Arquivo cujo nome de destino já existe na mesma pasta falha com `já existe um arquivo com esse nome`; os demais arquivos do plano continuam sendo processados.
- Conflitos não são avisados na prévia: se dois arquivos apontarem para o mesmo nome novo, o primeiro é renomeado e o segundo falha na execução.
- Sem resposta do aplicativo hospedeiro, a operação é encerrada com `A operação de renomeação não respondeu.` após 120 segundos, e a seleção de pasta com `A seleção de pasta não respondeu.` após 60 segundos.
- Não existe desfazer: depois de renomear, o plano é descartado e não há como voltar aos nomes anteriores.
- Arquivos cujo nome não casa com o padrão não entram na prévia e nunca são renomeados, mesmo com `Normalizar extensão` marcado.
- A busca percorre todos os arquivos da pasta, inclusive os ocultos, sem filtro de extensão.

## Detalhes técnicos
- Conversão do padrão: `*` vira um grupo `(.*)` e cada sequência de `?` vira um grupo `(.{n})`, em que `n` é a quantidade de `?` seguidos; os demais caracteres são escapados. A expressão é compilada sem distinção entre maiúsculas e minúsculas.
- A expressão não é global, então apenas a primeira ocorrência do padrão no nome é substituída.
- `$1`, `$2` e assim por diante correspondem, na ordem, aos curingas do padrão.
- A substituição é aplicada ao nome do arquivo, nunca ao caminho; o caminho só é usado para exibir a linha da prévia.
- Arquivos cujo nome final ficaria igual ao atual são omitidos da prévia.
- Normalização de extensão: o trecho após o último ponto é reescrito em minúsculas; nomes sem ponto ou terminados em ponto ficam intactos, e extensões que já estão em minúsculas não são tocadas.
