# Changelog

Todas as mudancas notaveis deste plugin sao documentadas aqui.

## [1.1.0] - Fundacao, testes e Project_Config

Primeira fase de um port de capacidades do `cc-orchestrador-subagents` para o `cc-executor-subagents`, mantendo a filosofia de execucao rapida do Executor. Ver `references/project-config.md`, `references/preflight-check.md` e `references/workflow.md` para o detalhamento.

### Adicionado

- **Project_Config** (`.executor/project-config.md`): quatro papeis configuraveis por projeto — `backendExecutor`, `frontendExecutor`, `backendReviewer`, `frontendReviewer` — cada um `codex`, `agy` ou `claude-code`. Com os quatro em `claude-code`, o plugin roda sem nenhuma CLI externa instalada.
- `/executor project-config`: modo dedicado para consultar e regravar a Project_Config, com Dependency_Installer assistido.
- `scripts/lib/project-config.mjs`, `scripts/project-config.mjs` (+ wrapper): leitura/escrita atomica do arquivo, catalogo de perguntas, derivacao do Required_CLI_Set e roteamento por tipo de trabalho.
- `scripts/lib/cli-utils.mjs`: infraestrutura de CLI compartilhada (`parseArgs`, `executeJsonCli`, etc.).
- `scripts/executor-spec.mjs`: modulo de especificacao pura (ordem de fases, tipos de trabalho, niveis de risco, identificadores retirados) usado pelos testes de doc-sync.
- Auto-remediacao da permissao `codex-companion-bash` no preflight: cria/atualiza `.claude/settings.json` automaticamente quando possivel, sem nunca sobrescrever um arquivo invalido.
- Suite de testes (`node --test`, `fast-check`) e `package.json` — o plugin nao tinha nenhum teste antes desta versao.

### Alterado (mudanca de contrato)

- **`preflight.mjs` schemaVersion 1 → 2**: o relatorio deixou de aninhar `checks.required.*`/`checks.optional.*` (obrigatoriedade fixa por posicao) e passou a ser plano — `checks.{config,cli,plugins,permissions,capabilities,optional}` — com obrigatoriedade derivada da Project_Config e carimbada em cada check (`required: true|false`). Rotulos de categoria em `failed`/`warnings` agora sao singulares (`plugin`, `permission`) em vez de plurais. Nao ha compatibilidade retroativa no formato do JSON.
- `references/workflow.md`: renumeracao das fases para bater exatamente com `SKILL.md` (0, 1, 2, 3, 4, 5, 6, 6.5, 7, 8, 9). Antes desta versao os dois documentos usavam numeracoes diferentes para as mesmas fases.

### Retirado

- **`codex_excluido`**: a excecao ad-hoc "front-end puro pode seguir sem Codex" saiu da prosa (`SKILL.md`, `references/preflight-check.md`, `commands/executor.md`) e do template de checkpoint. A forma declarativa equivalente e `backendExecutor: claude-code` na Project_Config.

## [1.0.0] e anteriores

Ver historico do Git para o fluxo original (executor sem Project_Config, sem testes, sem `scripts/lib/`).
