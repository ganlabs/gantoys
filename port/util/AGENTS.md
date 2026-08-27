# Agents

## Regra fundamental

LEIA A DOCUMENTAÇÃO COMPLETA antes de qualquer ação. Não pergunte o que fazer — as skills, scripts e params já estão documentados. Inferir a skill correta a partir do input do usuário e dos metadados das skills.

Sempre use `--tsv` para saída tabulada (padrão em todas as skills). Não deduplicar linhas a menos que explicitamente solicitado.

## Agents globais (aplicados em qualquer projeto)

### shell
Use `zsh` como shell padrão com `oh-my-zsh`.

### utils
Sempre que for criar ou editar scripts utilitários, use `#!/usr/bin/env node` com ES modules, sem dependências externas.

## Skills do repo

Cada skill em `skills/` tem um arquivo `.md` com frontmatter contendo `scripts:` (node), `description`, `params`. Leia o `.md` para saber qual script usar, quais parâmetros aceita e qual o comportamento esperado.

## Subagentes

_Adicione subagentes aqui conforme necessário._
