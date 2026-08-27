# Estado persistente e retomada

## Duas camadas

- **`.executor/checkpoint.json`** — INDICE global, pequeno e barato de ler.
  Guarda `execucao_atual` (ponteiro para o `artefatos_dir` da execucao ativa)
  e `historico[]` (resumo de execucoes passadas). Tambem guarda
  `plano_predefinido` e `plano_predefinido_fonte` quando aplicavel — esses
  dois campos ficam duplicados aqui porque `references/handoff-contract.md`
  (documento compartilhado byte-identico entre `cc-pensador`,
  `cc-orchestrador-subagents` e `cc-executor-subagents`) nomeia literalmente
  o `.executor/checkpoint.json` como o lugar onde eles vivem.
- **`{artefatos_dir}/state.json` + `events.jsonl` + `.state.lock`** — o
  estado detalhado de UMA execucao: fase, tasks, status de run, historico de
  fases. Fonte da verdade da execucao ativa, gerenciada exclusivamente por
  `executor-state.mjs`. Nunca edite `state.json` ou `events.jsonl` a mao.

`handoff.json` e `initial-plan-baseline.md` tambem ficam na raiz de
`{artefatos_dir}` — nao movem para nenhuma subpasta — porque
`references/handoff-contract.md` os nomeia literalmente como relativos a raiz
da pasta de artefatos (secoes 4 e 7). Ver o comentario em
`scripts/lib/artifact-layout.mjs` para o detalhe.

## Cinco invariantes

1. **Evento antes do snapshot.** Todo evento e gravado em `events.jsonl` com
   `fsync` antes do snapshot `state.json` ser atualizado atomicamente
   (arquivo temporario + `fsync` + `rename`). Um crash entre os dois passos e
   reparado por replay: o snapshot antigo mais os eventos pendentes produzem
   o mesmo estado.
2. **Resultado do executor antes da transicao.** `updateTaskStatus` e
   `heartbeatTask` so mudam o estado apos o subagente ja ter retornado (ou
   apos um probe explicito) — nunca por intencao antecipada.
3. **Perda de posse vira `UNKNOWN`, nunca `FAILED`/`DONE` presumido.** Uma
   task `RUNNING` cuja sessao foi interrompida (`resume`) ou cujo probe nao
   tem status autoritativo (`reconcile`) vira `UNKNOWN`, com uma recomendacao
   explicita (`VERIFY_BEFORE_REEXECUTE`, `COLLECT_LOCAL_EVIDENCE`, etc.) —
   nunca um status terminal inventado.
4. **`DONE` exige evidencia local.** Um `arquivo esperado presente`, um
   `arquivo produzido presente`, uma `validacao passando`, ou um `delta de
   commit` (commitBefore != commitAfter). Sem nenhum dos quatro, a transicao
   para `DONE` falha com `TASK_DONE_REQUIRES_EVIDENCE`.
5. **Stall mede ausencia de progresso com grace period, nao duracao total.**
   `sweep` so marca `STALLED` quando uma task `RUNNING` ficou sem atividade
   (`lastActivityAt`) por mais que `staleIdleSeconds` (ou
   `staleInToolSeconds`, se `inTool`). Uma vez `STALLED`, a recomendacao so
   muda para `CANCEL_OR_RETRY_AFTER_RECONCILIATION` depois do
   `stallGraceSeconds` expirar — nao no instante da deteccao.

## Estados canonicos

Task e run usam o mesmo conjunto de 8 valores:
`PENDING, RUNNING, DONE, FAILED, BLOCKED, STALLED, CANCELLED, UNKNOWN`.

Task nao tem grade de ID fixa (nada como `BE-01`): o Executor nao classifica
tasks a partir de um arquivo de planejamento — cada task nasce quando o
executor principal delega ("`codex-1`", "`agy-frontend`", qualquer string
nao-vazia serve).

## Gates de conclusao (Fase 2.0)

Cinco gates fecham uma run: `verificacao` (Fase 6, sempre obrigatorio),
`review` (Fase 6.5, condicional a `plano_predefinido`), `e2e` (Fase 6.6,
condicional a front-end separado do back), `reports` (Fase 9, sempre
obrigatorio) e `handoff` (Fase 9, condicional a modo conjunto).

`run --status DONE` falha com `RUN_GATES_NOT_CLOSED` se algum gate `required`
nao estiver `DONE` nem `N/A`. Um gate so aceita `N/A` quando e "waivable"
(`review`, `e2e`, `handoff`) — `verificacao` e `reports` nunca podem ser
`N/A`. Use `--required true` para declarar que a condicao de um gate
condicional se aplica a esta run (ex.: `review` quando `plano_predefinido:
true` for detectado na Fase 1) — sem isso, o gate nao bloqueia o fechamento.
Todo `N/A` exige `--reason`.

**Waiver vs. nao-aplicavel.** Um gate `waivable` que nunca foi marcado
`--required true` e fecha `N/A` e simplesmente **nao-aplicavel** — nao
bloqueia `run --status DONE`. Mas um gate que **ja foi** marcado `required:
true` (a condicao que o aciona se aplica a esta run) e depois e fechado
`N/A` e um **waiver**: a verificacao correspondente nunca rodou, so que com
um motivo documentado em vez de silenciosamente. `updateCompletionGate`
detecta isso automaticamente — nao e preciso passar `--required false` — e
grava `requiredOverride: false` no gate. `run --status DONE` falha com
`RUN_GATES_WAIVED` enquanto existir qualquer gate nesse estado; o handoff
correspondente deve fechar `PARTIAL`, nunca `DONE` (ver `WORKFLOW.md` §14,
cenario E). Mirror exato do `completionAudit`/`waivedGates` do Orchestrador
em `orchestration-state.mjs`.

```bash
node "$STATE" gate --dir <dir> --gate verificacao --status DONE --evidence <evidenceId>
node "$STATE" gate --dir <dir> --gate e2e --status N/A --reason "sem front-end separado"
node "$STATE" gate --dir <dir> --gate review --status PENDING --required true
# waiver: review era obrigatorio (linha acima) e fecha sem rodar de fato —
# run --status DONE falhara com RUN_GATES_WAIVED ate isso ser revertido.
node "$STATE" gate --dir <dir> --gate review --status N/A --reason "Codex sem quota, sem fallback"
```

Runs criadas antes da Fase 2.0 nao tem `completionGates` no snapshot — o
campo e opcional, `run --status DONE` nao aplica o check de gates quando ele
esta ausente (sem migracao automatica de run existente).

## Fora de escopo nesta fase

Waves, leases, worktrees, aplicacao de Project_Config em execucao ja
iniciada (o `resume` reporta o drift, mas nao aplica sozinho), e protocolo
formal de cancelamento (`run --status CANCELLED` exige apenas que nenhuma
task fique nao-terminal).

## Protocolo de resume

1. Localizar `{artefatos_dir}` — explicito (`--dir`) ou via
   `execucao_atual` do checkpoint index.
2. Adquirir o lock (`.state.lock`).
3. Reparar um tail de evento incompleto (nunca foi durable, e descartado).
4. Fazer replay dos eventos sobre o ultimo snapshot valido.
5. Toda task `RUNNING` interrompida vira `UNKNOWN`
   (`reasonCode: OWNER_SESSION_INTERRUPTED`).
6. Reconciliar contra Git/arquivos/validacoes (`reconcile`), com um probe
   file opcional para status autoritativo dos executores.
7. Continuar a partir de `resume.resumeFromPhase`.

Nunca reexecute uma task `UNKNOWN` sem antes confirmar que a sessao anterior
nao pode mais estar ativa.

## Sequencia de comandos

```bash
STATE="${CLAUDE_SKILL_DIR}/scripts/executor-state.mjs"

node "$STATE" init --slug <slug> --dir .executor/<slug>/artefatos --phase 0
node "$STATE" task register --dir .executor/<slug>/artefatos --task codex-1 \
  --expected-file src/pages/clientes/index.tsx
node "$STATE" task --dir .executor/<slug>/artefatos --task codex-1 \
  --status RUNNING --executor codex --executor-source project-config
node "$STATE" heartbeat --dir .executor/<slug>/artefatos --task codex-1 \
  --api-calls 7 --tool-calls 13 --current-tool Edit
node "$STATE" task --dir .executor/<slug>/artefatos --task codex-1 \
  --status DONE --produced-file src/pages/clientes/index.tsx
node "$STATE" phase --dir .executor/<slug>/artefatos --phase 9 --status DONE
node "$STATE" verify --dir .executor/<slug>/artefatos
node "$STATE" run --dir .executor/<slug>/artefatos --status DONE
```

Retomada, quando a sessao parar no meio:

```bash
node "$STATE" resume --dir .executor/<slug>/artefatos
```

## Compatibilidade com checkpoints v4

Um `.executor/checkpoint.json` gravado antes desta fase (versao 4, sem
`state.json`) continua legivel: `scripts/lib/checkpoint-index.mjs` migra em
memoria para o indice v5 na leitura, sem tocar o arquivo automaticamente.
Uma execucao ativa detectada num checkpoint v4 gera uma nota de migracao
(`migrationNotes`) recomendando `executor-state.mjs init --dir <artefatos_dir>`
para lhe dar um `state.json`. `codex_excluido: true`, quando presente, vira
uma nota de migracao — o campo nao e carregado adiante; a forma declarativa
equivalente e `backendExecutor`/`frontendExecutor: claude-code` na
Project_Config.
