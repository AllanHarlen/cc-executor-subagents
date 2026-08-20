# Changelog

Todas as mudancas notaveis deste plugin sao documentadas aqui.

## [1.3.0] - Validadores deterministicos e gates proporcionais ao risco

Fase 1.3 do port de capacidades do `cc-orchestrador-subagents`: as promessas de prosa do `SKILL.md` ("verifique ownership", "valide wire format") ganham ferramenta. Tudo entra proporcional ao risco — `risco: LOW` sem plano pre-definido nem modo conjunto continua sem nenhum gate extra.

### Adicionado

- `scripts/lib/gates.mjs` + `scripts/executor-gates.mjs plan`: tabela pura risco → lista de gates. Uma unica chamada substitui a arvore de decisao "se risco X e plano pre-definido entao..." no `SKILL.md`.
- `scripts/check-agy-prompt.mjs`: mede um prompt AGY contra o limite de 28.000 caracteres antes de delegar — essa regra so existia como prosa em todos os tres plugins do workflow; nada media de fato antes deste script.
- `scripts/lib/intelligence.mjs`, `scripts/inspect-diff.mjs`, `scripts/validate-wire-format.mjs`, `scripts/collect-test-results.mjs`: portados do Orchestrador, adaptados para o `executor-state.mjs` local e para funcionar tambem em modo stateless (sem `--dir`, sem execucao ativa).
- `scripts/validate-scope.mjs`: reescrito para o Executor — `--own`/`--deny` explicitos (uso avulso) ou `state.tasks[<task>].allowedPaths` de uma task registrada via `executor-state.mjs task register --allowed-path ...` (uso com execucao ativa). `--deny` sempre vence, mesmo quando `--own` tambem bate.
- `scripts/lib/dependency-plan.mjs`: catalogo puro de dependencias ausentes (Context7, `codex`, `agy` e os plugins que os conectam), usado pelo Dependency_Installer do modo `/executor project-config`.
- `references/subagent-prompts.md`: gate de design system (tokens via `var(--*)`, componentes batendo com `components.html`, `:hover`/`:focus` real — nunca `style={{}}` inline, accent ≤ 2x/pagina) — antes disso o Executor ingeria `design-system-files` do handoff do Orchestrador e ignorava.
- `SKILL.md` Fase 6.6 (nova, condicional): verificacao E2E no navegador real quando front-end e back-end sao origens separadas — CORS, casing de resposta e resolucao de tenant so aparecem com um browser de verdade dirigindo a app.
- `references/contracts.md`: regra de wire format, casing C#↔TypeScript (DTO `PascalCase` vs payload `camelCase`) e checklist de 11 itens de validacao cruzada — nenhum dos tres existia antes.
- `references/programmatic-intelligence.md`, `assets/intelligence-result.schema.json`.

### Alterado

- `references/subagent-prompts.md` (prompt AGY front-end) referencia o gate de design quando houver Open Design.

## [1.2.0] - Estado persistente e `/executor resume`

Fase 1.2 do port de capacidades do `cc-orchestrador-subagents`: o Executor ganha um motor de estado seguro contra crash, portado do state engine do Orchestrador e reduzido ao que o fluxo rapido precisa. Ver `references/persistent-state.md` para o detalhamento.

### Adicionado

- **`{artefatos_dir}/state.json` + `events.jsonl` + `.state.lock`**: fonte da verdade por execucao, gerenciada por `scripts/lib/executor-state.mjs` e pela CLI `scripts/executor-state.mjs` (`init`, `task`, `heartbeat`, `sweep`, `phase`, `reconcile`, `resume`, `run`, `status`, `verify`). Evento gravado com `fsync` **antes** do snapshot atomico (arquivo temporario + `fsync` + `rename`); um crash entre os dois passos e reparado por replay.
- **`/executor resume [--dir <artefatos_dir>]`**: reparo de tail de evento incompleto → replay → toda task `RUNNING` interrompida vira `UNKNOWN` (nunca `FAILED`/`DONE` presumido) → reconciliacao contra Git/arquivos/validacoes → continuacao a partir de `resumeFromPhase`. Ver o novo modo `resume` em `commands/executor.md`.
- `scripts/lib/checkpoint-index.mjs`: `.executor/checkpoint.json` **schemaVersion 5** — o checkpoint deixa de guardar o estado detalhado da execucao (isso agora vive em `state.json`) e volta a ser so um indice (`execucao_atual`, `historico[]`), mais `plano_predefinido`/`plano_predefinido_fonte` (que continuam ali por exigencia literal de `references/handoff-contract.md` secao 7). Migracao de checkpoints v4 e automatica, em memoria, na leitura — nunca reescreve o arquivo v4 sozinha.
- `scripts/lib/artifact-layout.mjs`, `scripts/lib/executor-adapters.mjs` (aceita `codex`, `agy` e `claude-code`), `scripts/executor-probe.mjs`: infraestrutura de layout de artefatos e normalizacao de retorno de subagente para `reconcile`/`resume`.
- `skills/executor-subagents/assets/executor-state.schema.json`, `executor-event.schema.json`.

### Alterado (mudanca de contrato)

- `assets/checkpoint-template.json`: template v5, so com `version`, `execucao_atual`, `historico`, `plano_predefinido`, `plano_predefinido_fonte`. Os campos por-run antigos (`fase_atual`, `slices`, `agentes`, `arquivos_alterados`, ...) nao aparecem mais aqui — eles vivem em `state.json`.

### Fora de escopo nesta fase

Waves, completion gates, leases, worktrees, aplicacao automatica de drift de Project_Config numa execucao ja iniciada, e protocolo formal de cancelamento — ver `references/persistent-state.md` "Fora de escopo nesta fase". Ficam para a Fase 2.0 do port.

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
