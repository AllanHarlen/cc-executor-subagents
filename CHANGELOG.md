# Changelog

Todas as mudancas notaveis deste plugin sao documentadas aqui.

## [2.6.1] - 2026-09-03 - Descoberta de handoff passa a preferir o Testador

Uma sincronizacao anterior trouxe `testador` para `HANDOFF_STAGES`/`HANDOFF_ROLES_BY_STAGE` e
estendeu `tests/handoff-validator.test.mjs` corretamente (unico dos tres plugins consumidores
que fez isso na mesma leva — `cc-pensador` e `cc-orchestrador-subagents` ficaram com a suite
quebrada ate esta data, ver changelogs deles). O que faltava aqui era o lado da instrucao
executiva: `SKILL.md` e `references/workflow.md` ainda descreviam "Modo conjunto" como
Orchestrador -> Executor direto, contradizendo `references/handoff-contract.md` secao 7, que ja
documentava o Testador como fonte preferencial.

- `skills/executor-subagents/SKILL.md` (alterado, Fase 1 e Fase 9): descoberta de modo conjunto
  agora procura primeiro `.testador/<slug>/artefatos/handoff.json` (`stage: testador`); cai para
  `.orchestration/<slug>/report/handoff.json` apenas quando o Testador nao rodou. Quando o
  handoff do Testador vem com laudo `REPROVADO`, `review/test-report.md` passa a ser usado como
  o plano pre-definido em si. A gravacao de `handoff.json` na Fase 9 registra `upstream` com o
  mesmo criterio de preferencia.
- `skills/executor-subagents/references/workflow.md` (alterado): mesma correcao na Fase 1.
- `skills/executor-subagents/references/handoff-contract.md` (alterado, replicado nos quatro
  plugins): secao 9 corrigida — nao afirma mais byte-identidade de schema/validador entre
  plugins (ver changelog de `cc-pensador`).

## [2.6.0] - 2026-08-27 - Reconciliacao da superficie unificada com os gates do Executor

Esta versao integra a linha remota 2.4.0 de comandos com as entregas locais 2.4.0–2.5.0,
eliminando a colisao de versoes e preservando ambos os conjuntos de mudancas:

- `argument-hint` passa a declarar a superficie completa.
- Novos subcomandos `help` e `status [dir]`; `config` tambem funciona como alias de
  `project-config`.
- Flags publicas `--model`, `--effort`, `--parallel` e `--subagent-model`, com `--agy-*` mantidas
  como aliases legados.
- O handoff passa a apontar para `/orquestrador`.
- Mantidos a simetria de waived-gates e o schema/validador de `handoff.json` da linha local.

## [2.5.0] - 2026-08-24 - Schema + validador do envelope `handoff.json` (`validate-handoff.mjs`)

Achado de auditoria: `handoff.json` e a "ancora unica de descoberta" entre os tres plugins do
workflow (handoff-contract.md secao 4) — o unico sinal que distingue modo conjunto de modo
independente — mas nenhum codigo em nenhum dos tres repositorios escrevia, lia ou validava esse
arquivo. Um produtor podia divergir do contrato em silencio (como ja havia acontecido:
`feature-isolation.md` do Pensador sem os roles `api-contract`/`openspec-change`) sem nenhum teste
pegar ate um consumidor falhar a achar um artefato esperado — e o Executor e quem mais depende de
seguir `upstream` corretamente ate o Pensador para rastreabilidade.

- `skills/executor-subagents/scripts/lib/handoff-validator.mjs` (novo, canonico, byte-identico nos
  tres plugins): `validateHandoff(handoff)` colige todas as violacoes do envelope numa passada —
  campos obrigatorios, enums de `stage`/`status`, e o vocabulario de `role` **por stage**, incluindo
  o caso de um role valido para outro estagio ser reivindicado pelo estagio errado.
- `skills/executor-subagents/scripts/validate-handoff.mjs` (novo, CLI) + `scripts/validate-handoff.mjs`
  (wrapper de compatibilidade): `node validate-handoff.mjs --file <path>`, JSON
  `{ ok, file, errors[] }`, exit 0 somente com `ok: true`.
- `skills/executor-subagents/assets/handoff.schema.json` (novo): schema formal documentando o
  envelope, sem dependencia de biblioteca de JSON Schema — so o validador escrito a mao.
- `references/handoff-contract.md` (canonico, replicado byte-identico nos tres plugins): nova secao
  9 documentando o validador.
- `tests/handoff-validator.test.mjs` (novo, 38 testes): caminho positivo (handoff bem formado por
  estagio) e negativo (cada violacao especifica, incluindo role cruzado entre estagios) + round-trip
  do CLI + guarda que fixa `HANDOFF_ROLES_BY_STAGE` contra as tabelas de `handoff-contract.md`.

## [2.4.0] - 2026-08-24 - Simetria de waived-gate (`requiredOverride`) com o Orchestrador

Achado de auditoria: dispensar um gate `waivable` (`review`, `e2e`, `handoff`) via `N/A` fechava
`run --status DONE` normalmente no Executor, enquanto o mesmo waiver no Orchestrador ja forcava
`complete: false`/`PARTIAL`. A prosa do `SKILL.md` (Fase 6.6) sempre disse "sem essa verificacao, a
entrega NAO pode ser marcada DONE" — o codigo nao aplicava isso. Isso mordia exatamente o modo mais
comum do Executor: execucao avulsa, front-end de origem separada, sem Playwright disponivel.

- `scripts/lib/executor-state.mjs`: `updateCompletionGate` agora rastreia `requiredOverride` e
  detecta automaticamente quando um gate que **ja foi** `required: true` fecha `N/A` — isso e um
  *waiver*, distinto de um gate que nunca foi aplicavel. `updateRunStatus` rejeita `DONE` com o novo
  codigo `RUN_GATES_WAIVED` enquanto existir qualquer gate waived, mirror exato de
  `completionAudit`/`waivedGates` do `cc-orchestrador-subagents`. Todo `N/A` agora exige `--reason`
  (`GATE_WAIVER_REQUIRES_REASON`); um `--required` explicito num gate nao-waivable falha com
  `GATE_APPLICABILITY_FIXED`.
- `references/persistent-state.md`: documenta a distincao waiver-vs-nao-aplicavel e o novo fluxo.
- `tests/completion-gates.test.mjs`: cobertura de caminho positivo (gate nunca obrigatorio fecha
  N/A sem bloquear; gate obrigatorio genuinamente fechado DONE nao e waiver) e negativo (waiver de
  gate obrigatorio bloqueia DONE; N/A sem motivo e rejeitado; override em gate fixo e rejeitado).

## [2.3.0] - 2026-08-24 - Deteccao de MCP por agente (`--check-agent-mcp`) e oferta de instalacao

O check agregado `checks.optional.mcp.<servidor>.ok` prova apenas que o Codebase Memory MCP ou o
Context7 estao registrados *em algum lugar* da maquina — nao que o Codex ou o AGY especificamente
os tem. Isso fazia o placeholder de grafo/Context7 ir para o prompt de uma task Codex/AGY mesmo
quando aquela CLI especifica nao tinha a ferramenta.

- `scripts/lib/mcp-agent-cli.mjs` (novo): introspeccao real via `codex mcp list --json`/`agy mcp
  list`, em vez de adivinhar por convencao de arquivo. Redacao estrita — nunca extrai
  `transport.http_headers`/`transport.env`/URL/comando (podem carregar uma chave de API real), so
  `name`/`enabled`/`type`. Corrige um bug de plataforma: `execFileSync` sem shell falhava
  silenciosamente contra o `codex.cmd`/`.ps1` do npm no Windows; trocado por `execSync`.
- `scripts/lib/mcp-agent-install.mjs` (novo): registra (`installAgentMcp`) e remove
  (`removeAgentMcp`) um servidor no CLI do agente, com os comandos reais confirmados ao vivo.
  Nunca roda sozinho — so depois de aprovacao explicita via `AskUserQuestion`, mesmo padrao do
  instalador do Open Design (`cc-pensador`).
- `scripts/preflight.mjs`: nova flag opt-in `--check-agent-mcp` publica
  `checks.optional.mcpPerAgent.<agent>.<servidor>`, com `install` preenchido so quando
  `checked: true, ok: false`.
- `references/mcp-context.md`, `references/subagent-prompts.md`, `references/preflight-check.md`:
  documentam a ordem de preferencia (`mcpPerAgent` por agente > `mcp` agregado como fallback) e a
  secao "Oferta de instalacao por agente". Placeholder `Codebase Memory:` adicionado ao lado de
  cada `Context7:` no template real de prompts (antes so existia documentado, nao no template).
- `tests/mcp-agent-cli.test.mjs`, `tests/mcp-agent-install.test.mjs`, `tests/mcp-prompt-wiring.test.mjs`
  (novos): 26 testes, incluindo fixtures reais capturados ao vivo e um caso que garante que nenhum
  comando de instalacao carrega uma chave de API.

## [2.2.0] - Correcao da postura sobre OpenSpec

O SKILL mandava os subagentes ignorarem toda skill `openspec`/`opsx`, ao mesmo tempo em que o
proprio plugin publicava a tabela de ingestao do artefato de handoff `openspec-change` — uma
contradicao. Reformulado para: o Executor **nao aciona** OpenSpec (nao cria `openspec/`, nao chama
`/opsx:*`/`openspec-*`, nao bloqueia por ausencia do CLI), mas **pode consumir** um handoff do
Orchestrador com role `openspec-change` como baseline somente-leitura.

- `skills/executor-subagents/SKILL.md`, `README.md`, `README.pt-BR.md`: texto ajustado (ver acima).
- `references/handoff-contract.md`: papel `openspec-change` atualizado (specs opcionais/aninhadas,
  mudanca gerida por `/opsx:propose`). Sincronizado byte-a-byte com a copia canonica em
  `cc-pensador`.
- `.claude/settings.json`: removida a entrada `Bash(openspec publish:*)` (comando inexistente; este
  plugin nao chama o CLI OpenSpec).

### Teste de reconciliacao deixou de depender da arvore de trabalho do proprio repo

`tests/executor-state.test.mjs` — "reconcile without an authoritative probe keeps an UNKNOWN task
UNKNOWN" chamava `initRun({ slug, artifactDir })` sem `projectRoot`. Com isso
`resolveProjectRoot` caia no fallback `process.cwd()`, que e o **repositorio do plugin**, nao o
fixture: `pathEvidence` procurava `src/output.txt` na raiz errada (`exists: false`) e `inspectGit`
inspecionava o repo errado.

O teste so passava quando a arvore de trabalho do plugin estava suja — ai `changedFiles` vinha
nao-vazio e satisfazia o mesmo ramo `VERIFY_BEFORE_REEXECUTE` **pelo motivo errado**. Com o repo
limpo, falhava. Agora passa `projectRoot: root`, alinhado com a convencao que
`tests/completion-gates.test.mjs` ja usava, e a assercao passa a se sustentar na evidencia do
proprio fixture. O teste vizinho que faz `process.chdir(root)` de proposito (para exercitar a
recuperacao por `artifactRoot` com `artifactDir` de 2 niveis) foi preservado como esta.

## [2.1.0] - Alinhamento com o cc-antigravity-plugin 4.0

Atualiza o Executor para o contrato do `cc-antigravity-plugin` 4.0.0 (AGY 1.1.8+, `1.1.16`
recomendado). O `cc-orchestrador-subagents` ja tinha passado por essa migracao — incluindo um hotfix
critico de roteamento — e este release porta o mesmo conserto para o Executor.

**Requisito de ambiente novo (efeito de breaking na pratica):** o preflight agora exige
`cc-antigravity-plugin >= 4.0.0`. Instalacoes com uma versao anterior do plugin (por exemplo `3.8.0`)
passam a reprovar o preflight ate rodar `/plugin install cc-antigravity-plugin@cc-antigravity-plugin`
— a remediacao sai impressa no proprio relatorio.

### Corrigido

- **CRITICO — todo o roteamento de implementacao front-end/imagem/fan-out apontava para
  `cc-antigravity-plugin:antigravity-agent`**, que no plugin 4.0 e **somente leitura**
  (`tools: Bash(node *antigravity-bridge.js* --read-only*)`). A task de UI, imagem ou fan-out AGY nao
  escrevia arquivo nenhum. Corrigido em `agent-stack.md`, `subagent-prompts.md`, `parallelization.md`,
  `SKILL.md`, `commands/executor.md` e `workflow.md`: implementacao vai para `antigravity-coder`;
  `antigravity-agent` fica reservado para analise/review read-only.

### Alterado

- Flags AGY atualizadas para a superficie 4.0: `--mode accept-edits`/`--mode plan`, `--format
  json|stream-json`, `--effort low|medium|high`, `--json-schema`. `--agent <nome>` agora exige valor
  e seleciona um agente customizado do AGY; sessao humana usa `--interactive` (o Executor, sendo
  headless, nunca usa essa flag).
- Modelos AGY passam a ser referenciados por alias de familia (`--model flash`, `--model pro`) em vez
  de slugs pinados (`gemini-3.5-flash-medium`, `gemini-3.1-pro-high`) — o bridge resolve o alias
  contra o catalogo dinamico de `agy models`, entao a prosa nao envelhece a cada release do AGY.
- Escada de fallback AGY: `--model pro --effort high` → `--model flash --effort medium` →
  Executor (Claude) direto.
- Retomada apos `QUOTA_EXHAUSTED`: preferir `--conversation <id>` quando o envelope de erro trouxer
  um `conversation_id` exato; usar `--continue` somente quando nao houver ID disponivel.
- `preflight.mjs`: `MIN_ANTIGRAVITY_PLUGIN_VERSION` `3.6.0` → `4.0.0`; novos `MIN_AGY_VERSION`
  (`1.1.8`) e `RECOMMENDED_AGY_VERSION` (`1.1.16`) checados via `agy --version`; `checkCli` ganhou
  suporte a `minVersion`/`recommendedVersion`; `REQUIRED_AGY_FLAGS`/`REQUIRED_BRIDGE_FLAGS` ampliados
  para as flags 4.0; `checkAntigravityBridge` passa a exigir tambem os arquivos do plugin instalado
  (`agents/antigravity-coder.md`, `agents/antigravity-agent.md`, `commands/antigravity.md`,
  `scripts/antigravity-bridge.js`).
- Papel Imagem/asset (`agent-stack.md`) passa a usar `antigravity-coder` com a tool nativa
  `generate_imagem` — o modelo removido `nano-banana` nao existe mais no bridge 4.0.

### Adicionado

- Pipeline `IMAGE_SUGGESTIONS` (`references/subagent-prompts.md` secao 3a, espelhando o
  `cc-orchestrador-subagents`): quando a task front-end devolve sugestoes de imagem, o Executor
  apresenta as opcoes ao usuario via `AskUserQuestion` (`multiSelect`) antes de qualquer
  `--generate-image`. Ganchado na Fase 5 (Integracao) de `SKILL.md` e `references/workflow.md`.
- Dois guards de doc-sync em `tests/docs-consistency.test.mjs`: um routing guard (secoes de
  implementacao AGY nunca declaram `antigravity-agent`) e um version guard (`MIN_ANTIGRAVITY_PLUGIN_VERSION`
  precisa aparecer consistente entre `preflight.mjs` e a prosa) — a divergencia `3.6.0` (prosa) vs
  `4.0.0` (codigo) que motivou este release nao teria passado despercebida com esses guards.
- `executor-spec.mjs`: `RETIRED_IDENTIFIERS` ganhou `nano-banana`, `gemini-3.5-flash-medium` e
  `gemini-3.1-pro-high`.

## [2.0.1] - Correcoes de review

Quatro defeitos encontrados em review do proprio port, todos com teste de regressao. Nenhum estava coberto pela suite anterior — os testes exercitavam o caminho feliz de cada script, e o caso dos gates chegava a cristalizar o comportamento errado.

### Corrigido

- **`validate-scope.mjs` dava falso negativo quando o agente commitava o trabalho** (o mais grave: e o gate que existe para pegar escrita fora do ownership). Um agente que commita deixa a working tree limpa, e o gate olhava so `git.changedFiles` — reportava `valid: true` com zero arquivos exatamente no caso que deveria acusar. Agora o baseline cai para o `commitBefore` da task quando `--since` nao e passado; o `commitBefore` ja e capturado sozinho no `task --status RUNNING`, entao nao ha flag nova a lembrar. O `summary.sinceCommit` passa a reportar qual baseline foi usado.
- **`initRun` e `resolveProjectRoot` discordavam sobre a raiz do projeto**: o primeiro usava `process.cwd()`, o segundo adivinhava `join(artifactDir, "..", "..", "..")`. Com um `artifactDir` fora da convencao de 3 niveis, um arquivo existente era reportado como ausente e uma task legitimamente pronta era rejeitada com `TASK_EXPECTED_FILES_MISSING`. A raiz agora e recuperada do `state.artifactRoot` gravado no `init`, com `process.cwd()` como ultimo recurso — sem adivinhacao por profundidade.
- **`executor-gates.mjs plan` falhava aberto**: `--risk` com typo ou sem valor caia para `LOW`, que e a resposta mais permissiva (zero gates), desligando silenciosamente toda a verificacao. Agora rejeita (`INVALID_RISK_LEVEL`), e `--risk` ausente vira `MISSING_ARGUMENT`.
- **Flag sem valor vazava erro cru do Node em vez do contrato JSON da CLI**: `parseArgs` transforma `--payload` em `true`, e `required()` so rejeitava `undefined`/`""`. Afetava `check-agy-prompt --file`, `validate-wire-format --payload` e `collect-test-results --input`, que devolviam `ERR_INVALID_ARG_TYPE`/`Cannot read properties of undefined` com exit 1 em vez de `MISSING_ARGUMENT` com exit 2. Corrigido na raiz (`required()` e `numberArg()` de `lib/cli-utils.mjs`, mais a copia em `scripts/executor-state.mjs`), o que cobre a classe inteira.

## [2.0.0] - Layout por estagio, gates de conclusao e documentacao

Fase 2.0 (final) do port Tier 1/Tier 2 de capacidades do `cc-orchestrador-subagents`. Fecha o ciclo: os artefatos passam a viver agrupados por estagio, e uma run so pode fechar `DONE` com os gates de conclusao fechados — nao so com as tasks terminais.

### Alterado (mudanca de contrato)

- **`ARTIFACT_LAYOUT_VERSION` 1 → 2**: runs novas agrupam artefatos por estagio (`plan/`, `run/`, `review/`, `report/`, `evidence/`) em vez de tudo na raiz. `handoff.json`, `initial-plan-baseline.md`, `state.json`, `events.jsonl` e `.state.lock` continuam **sempre** na raiz — a infraestrutura de layout 2 (`scripts/lib/artifact-layout.mjs`) ja existia desde a Fase 1.2, essa versao so muda o default. Runs criadas nas Fases 1.1/1.2 (layout 1) continuam legiveis, sem migracao automatica: leitura sempre tenta layout 2 e cai para a raiz.
- `SKILL.md` ganha uma tabela "Layout de artefatos" traduzindo `{artefatos_dir}/<nome>` para o subcaminho real — testada contra `LAYOUT_V2_FILE_DIRECTORIES` por um guard de doc-sync (`tests/artifact-layout.test.mjs`), para prosa e codigo nao divergirem.

### Adicionado

- **Gates de conclusao**: cinco gates (`verificacao`, `review`, `e2e`, `reports`, `handoff`) no `state.json`, geridos por `executor-state.mjs gate`. `run --status DONE` falha com `RUN_GATES_NOT_CLOSED` enquanto um gate `required` nao estiver `DONE` nem `N/A`. `verificacao`/`reports` sao sempre obrigatorios e nunca aceitam `N/A`; `review`/`e2e`/`handoff` sao condicionais — `N/A` por padrao, viram obrigatorios com `--required true` quando a condicao que os aciona se aplica a run (plano pre-definido, front-end separado, modo conjunto). Campo `completionGates` e opcional no snapshot: runs de fases anteriores nao tem e nao sao migradas.
- `references/mcp-context.md`: protocolo do Context7 MCP (o Executor nao usa Codebase Memory MCP nesta fase — o custo de indexar um grafo nao se paga numa execucao curta).
- README/README.pt-BR: secoes "Persistent state and resume" e "Gates proportional to risk".

### Fora de escopo (decisao explicita, nao entra em versao futura deste port)

SQLite/FTS5 e historico pesquisavel; Learning Recipes e Curator; telemetria OTLP; worktrees fisicas; routing adaptativo por historico; OpenSpec. Todos contrariam a premissa de velocidade do Executor ou exigem volume de historico que ele nao acumula — ver o plano original (Tier 1/Tier 2) para o raciocinio completo. `.executor/project-facts.md` (fatos de projeto validados, cortando redescoberta entre runs) tambem ficou fora desta entrega: o valor so aparece com o lado de leitura integrado, e construir so a escrita seria um recurso pela metade.

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
