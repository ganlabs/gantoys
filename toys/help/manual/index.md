# Visão geral do GAN Toys

O GAN Toys reúne utilitários jurídicos que rodam inteiramente no navegador. Cada ferramenta (chamada de toy) abre dentro da mesma janela, à direita do menu lateral, e trabalha somente com os arquivos que você escolher do seu computador.

## Requisitos

- Google Chrome ou Microsoft Edge atualizados. Os toys que leem e escrevem pastas usam a File System Access API, que não existe no Firefox e no Safari.
- Nenhuma instalação: o app é um arquivo HTML único. Nada é enviado para a internet e nenhuma conta é necessária.
- Um caminho local com espaço suficiente para os arquivos de saída. Os toys escrevem na pasta que você indicar.

## Passo a passo

1. Abra o app. Use o `dist/index.html` (entregável de arquivo único) ou o `index.html` da raiz do projeto durante o desenvolvimento. Duplo clique basta: tudo funciona aberto direto do disco, sem servidor.
2. Escolha um toy no menu lateral esquerdo. Cada item traz um ícone e o nome da ferramenta; o conteúdo abre na área principal, dentro de um quadro próprio.
3. Trabalhe dentro do toy. Em geral o fluxo é o mesmo em todos: escolher pasta de origem, escolher pasta de destino, preencher os campos, clicar no botão principal e acompanhar a barra de progresso.
4. Leia o resultado no fim da execução. Todo toy termina com um resumo (totais, sucessos e falhas) e um relatório por arquivo; as listas de erro podem ser copiadas para a área de transferência.
5. Volte ao início quando quiser (item `Início` no menu) ou troque de toy. O app guarda o último toy aberto e os campos preenchidos, então reabrir a página devolve o estado anterior.

## Navegação e interface

- O botão de seta no topo do menu compacta ou expande a barra lateral.
- O rodapé da barra lateral concentra o controle de tema: o botão de sol ou lua alterna entre claro e escuro.
- Dentro de um toy, os controles seguem sempre o mesmo vocabulário: campos com rótulo em caixa alta, contadores de linhas, botões primários para a ação principal, avisos em destaque e pílulas de estado.
- Toy em execução não é interrompido ao trocar de ferramenta: voltar ao toy mostra o estado salvo dos campos, mas a execução anterior precisa ser reiniciada.

## Temas e visuais

- São seis visuais: glassmorphism, neumorphism, neobrutalism, material, claymorphism e japandi. Cada um tem versão clara e escura.
- O conjunto de botões de visual no rodapé do menu muda conforme o tema: no escuro aparecem os visuais escuros, no claro aparecem os claros.
- A escolha do tema e do visual fica gravada no navegador e é aplicada a todos os toys, inclusive nos popups.

## Privacidade e arquivos

- A leitura e a escrita acontecem no seu disco, pelo navegador. Não há upload, servidor nem telemetria.
- A única exceção é o toy `Divisor Automático Santander`, que baixa a biblioteca de OCR `tesseract.js` de um CDN na primeira execução; por isso ele precisa de internet, enquanto os demais trabalham offline.
- O navegador pede a confirmação de leitura ou escrita na primeira vez que um toy abre uma pasta; a permissão vale para a sessão.

## Esta central de ajuda

- A grade acima lista os manuais, um por toy, na mesma ordem do menu lateral.
- Um clique abre o popup com o manual renderizado a partir do Markdown embutido na própria página.
- Dentro do popup, o índice da esquerda troca de manual sem fechar a janela. `Esc` ou o botão de fechar saem.
- O texto de cada manual fica em `toys/help/manual/<toy>.md`. Depois de editar, rode `node build/manual.mjs` para reembutir os arquivos na página.

## Detalhes técnicos

- Cada toy é uma página isolada em `toys/<nome>/index.html`, exibida em um `iframe` pelo app. Por isso um toy não interfere no outro nem enxerga o estado do vizinho.
- O estado dos formulários é salvo em `localStorage` sob a chave `toy_state_<toy>`, por `name` de campo, e restaurado quando o toy abre.
- O entregável `dist/index.html` embute o app, todos os toys e os recursos compartilhados em um único arquivo; os assets comuns existem uma só vez e chegam aos toys por Blob URLs criadas pelo documento principal.
