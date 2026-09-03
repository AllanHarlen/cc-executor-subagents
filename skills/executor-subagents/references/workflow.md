# Workflow Rapido

Este documento expande o fluxo do `SKILL.md`. A regra e simples: use somente o detalhe necessario para entregar rapido. A numeracao de fases e identica a do `SKILL.md` (0, 1, 2, 3, 4, 5, 6, 6.5, 6.6, 7, 8, 9) — `Fase 8` (monitoramento) roda em paralelo das Fases 4-6.5, nao depois delas; `Fase 6.6` (E2E) e condicional, so roda quando ha front-end separado do back-end.

## Fase 0 - Preflight leve

Rode:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs"
```

O preflight deriva quais CLIs sao obrigatorias da Project_Config (`.executor/project-config.md`, papeis `backendExecutor`/`frontendExecutor`/`backendReviewer`/`frontendReviewer`). Sem arquivo, usa o default `codex`/`agy`/`codex`/`agy`.

Se um item **obrigatorio** falhar:

- falha de Codex (quando `backendExecutor` ou `backendReviewer` aponta para `codex`): mostre a remediacao, que inclui a opcao de rodar `node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" write --backend-executor claude-code ...` para o Executor (Claude) assumir essas tasks sem CLI externa;
- falha de AGY (quando `frontendExecutor` ou `frontendReviewer` aponta para `agy`): mesma logica, com `--frontend-executor claude-code`/`--frontend-reviewer claude-code`.

Pergunte ao usuario se ele quer remediar a CLI, trocar o papel para `claude-code`, ou cancelar. Nao ha mais excecao ad-hoc para tasks front-end puras: a obrigatoriedade vem inteira da Project_Config.

`/goal` continua opcional, sem oferta de instalacao (nao e uma dependencia externa).

**MCPs opcionais (Context7, Codebase Memory):** mesmo sendo opcionais — nunca aparecem em `failed`, so em `warnings` — a ausencia de qualquer um aciona o Dependency_Installer (`references/project-config.md`) antes da Fase 1: monte a lista com `buildMissingDependencies(report, { platform })` (`scripts/lib/dependency-plan.mjs`, chaves de `MCP_CHECK_KEYS`) e faca **uma `AskUserQuestion` por dependencia ausente** ("instalar" / "seguir sem instalar"), nomeando beneficio, impacto de seguir sem e o comando exato. So execute o comando apos "instalar"; apos qualquer instalacao confirmada, rode o preflight de novo (mesmo que a lista de ausentes fique vazia) antes de seguir para a Fase 1 — e esse novo preflight que confirma que o servidor MCP recem-instalado ficou visivel (o agente de codigo precisa ser reiniciado para carregar um MCP novo; se a instalacao pedir reinicio, informe e retome dali). "Seguir sem instalar" registra a limitacao e a Fase 1/5 seguem pelo caminho deterministico (Read/Glob/Grep e `inspect-diff.mjs`/`rg`) — nunca bloqueia.

## Fase 1 - Triagem

Extraia em poucos minutos:

- objetivo final;
- arquivos/modulos provaveis;
- se existe plano pre-definido (texto estruturado, arquivo citado, checkpoint, "siga este plano", "plano aprovado" ou equivalente);
- risco (`LOW`, `MEDIUM`, `HIGH`);
- tipo de trabalho (`BUG`, `REFACTOR`, `FEATURE_SLICE`, `TEST_FIX`, `UI_FRONTEND`, `IMAGE_ASSET`, `DOCS`, `REVIEW`);
- verificacoes obvias;
- pergunta bloqueante, se houver.

Use pesquisa local (`rg`, `rg --files`, leitura de arquivos) antes de perguntar. Pergunte somente quando uma suposicao errada geraria retrabalho relevante.

Se houver plano pre-definido, preserve o conteudo original em `{artefatos_dir}/initial-plan-baseline.md`, registre `plano_predefinido: true` no checkpoint e trate esse baseline como fonte de verdade para slices, criterios de aceite e verificacao final.

**Gates por risco:** depois de fixar `risco`, rode `node "${CLAUDE_SKILL_DIR}/scripts/executor-gates.mjs" plan --risk <risco> ...` (ver `SKILL.md` Fase 1). A lista devolvida e o que roda nas Fases 6/6.5/6.6 — em `risco: LOW` sem plano pre-definido nem modo conjunto, vem vazia.

**Modo conjunto (Testador → Executor, preferencial; Orchestrador → Executor, fallback):** procure primeiro `.testador/<slug>/artefatos/handoff.json` (`stage: testador`); so na ausencia dele procure `.orchestration/<slug>/report/handoff.json` antes de tratar a demanda como avulsa (caia para `.orchestration/<slug>/handoff.json` na raiz apenas em runs anteriores ao layout v2 do Orchestrador, que ainda nao agrupava `handoff.json` sob `report/`). Se existir qualquer um dos dois, o executor entra no papel de **corrigir e fazer os ajustes finos** da entrega upstream: adote o handoff como plano pre-definido baseline (quando for do Testador com laudo `REPROVADO`, use `review/test-report.md` como o plano em si), siga `upstream` ate o Pensador para rastreabilidade (`prd`/`api-contract`/`design-system-files`) e mantenha obrigatorio o review Codex high plano-vs-entrega. Ver `references/handoff-contract.md` (secao 7).

## Fase 2 - Plano curto

Para tarefas com 2+ agentes ou com plano pre-definido, crie `{artefatos_dir}/execution-brief.md` usando `assets/plan-template.md`.

Onde `{artefatos_dir}` e o valor de `artefatos_dir` lido do `.executor/checkpoint.json`. Se o checkpoint ainda nao existir, gere um slug curto a partir da demanda do `/executor` e defina `artefatos_dir = .executor/{demanda_slug}/artefatos`; exemplo: `/executor desenvolva uma pagina clientes` vira `.executor/desenvolva-pagina-clientes/artefatos`. Se a pasta ja existir, acrescente o primeiro sufixo livre (`-n2`, `-n3`, ...).

O plano deve responder:

- quais slices existem;
- quem possui quais arquivos/modulos;
- o que nao pode ser tocado;
- qual ordem ou wave;
- como vamos verificar.

Se houver plano pre-definido, o `execution-brief.md` e apenas o mapa operacional derivado do baseline. Nao substitua o plano inicial; registre qualquer adaptacao e mantenha obrigatorio o review Codex high plano-vs-entrega.

Nao transforme isso em documento de arquitetura. Uma tela basta.

## Fase 3 - Paralelizar ou executar direto

Use execucao direta quando:

- a mudanca e pequena;
- nao ha ganho real com background agent;
- o arquivo e unico e a alteracao e clara.

Use 1 agente quando:

- a area e clara, mas o patch exige leitura/edicao consideravel;
- o executor principal pode continuar investigando outra parte em paralelo;
- a task tem criterio de aceite isolado.

Use multiplos agentes quando:

- ha ownership disjunto;
- os agentes nao dependem do output um do outro;
- cada agente tem resultado verificavel;
- o risco de conflito e menor que o ganho de tempo.

## Fase 4 - Delegacao

Antes de delegar, leia `references/subagent-prompts.md`.

Cada agente precisa receber:

- demanda resumida;
- ownership;
- arquivos proibidos;
- criterio de aceite;
- comandos de verificacao;
- instrucao para nao reverter trabalho alheio;
- formato de retorno.

Roteamento padrao (o Executor deriva o agente do papel efetivo na Project_Config, nao de uma regra fixa por tipo de trabalho):

- front-end/UI: `frontendExecutor` (default AGY agentic via `antigravity-coder`);
- imagem/asset explicito: `frontendExecutor` com `--generate-image` quando for AGY (`antigravity-coder`);
- analise pura: AGY `--read-only` via `antigravity-agent` (somente leitura) quando `frontendExecutor` for AGY;
- backend, testes, integracao e review: `backendExecutor`/`backendReviewer` (default Codex).

Antes de delegar para AGY, meca o prompt: `node "${CLAUDE_SKILL_DIR}/scripts/check-agy-prompt.mjs" --file <prompt.txt>`. Acima de 28.000 caracteres, divida a task em subtasks por entregaveis independentes antes de delegar.

## Fase 5 - Integracao

Ao receber retornos:

1. Compare arquivos alterados com ownership.
2. Leia diffs de areas compartilhadas.
3. Rode verificacoes incrementais.
4. Corrija glue pequeno diretamente se for seguro.
5. Redelegue correcoes grandes ou arriscadas.
6. Se um agente front-end devolveu `IMAGE_SUGGESTIONS` preenchido, apresente as opcoes ao usuario via `AskUserQuestion` antes de gerar qualquer imagem (ver `references/subagent-prompts.md` secao 3a).

Se houver falha de AGY em task obrigatoria, pause para alinhamento com o usuario antes de fallback para Codex.

## Fase 6 - Verificacao

Para risco baixo, teste local especifico e suficiente.

Para risco medio, rode testes da area, typecheck/build quando aplicavel e revise os diffs principais.

Para risco alto, peca review Codex high antes de fechar.

Se uma verificacao falhar, tente corrigir no mesmo ciclo. Se nao der, feche como `BLOCKED` com causa e proximo comando.

## Fase 6.5 - Review plano vs entrega

Execute somente quando `plano_predefinido: true`. Peca review Codex high (ou o `backendReviewer` efetivo) read-only antes de fechar, mesmo em UI/front-end puro. O review deve comparar `{artefatos_dir}/initial-plan-baseline.md` com o diff e a entrega gerada, cobrindo requisitos, criterios de aceite, entregaveis, contratos, arquivos planejados/alterados e verificacoes planejadas/executadas. Salve em `{artefatos_dir}/plan-vs-output-review.md`. Se houver `DESALINHADO`, corrija ou bloqueie com evidencia.

Quando houver design system (Open Design), aplique o "Gate de design system" de `references/subagent-prompts.md` como parte deste review.

## Fase 6.6 - Verificacao E2E no navegador real

Condicional: roda somente quando `executor-gates.mjs plan` (Fase 1) devolveu o gate `browser-e2e` — front-end presente **e** front/back sao origens separadas. Review de codigo e build sao cegos a CORS, resolucao de tenant a partir do browser, e casing de resposta que falha silenciosamente com `200`.

Suba a app real, dirija os fluxos criticos (Playwright MCP ou equivalente, incluindo login com credenciais de seed), verifique console/network sem CORS, cada chamada 2xx com a UI refletindo dado real, e o efeito final de cada acao. Evidencia em `{artefatos_dir}/review/e2e-verification.md` + `review/screenshots/`. Achado aqui e bloqueante; sem ferramenta de navegador, feche como `PARTIAL`, nunca `DONE`. Ver `SKILL.md` Fase 6.6 para o detalhamento completo.

## Fase 7 - Fechamento interno

Conclua integracao, verificacao e decisoes. Em tarefas pequenas (execucao direta ou 1 agente de baixo risco), responda no chat com: o que mudou, arquivos principais, verificacoes e proximo passo. Em seguida, prossiga para a Fase 9 (relatorio final) quando aplicavel.

## Fase 8 - Monitoramento

Roda em paralelo das Fases 4 a 6.5. Nao faca polling continuo. Registre status em `{artefatos_dir}/monitoring.md` somente para execucoes com 2+ agentes ou sessoes longas.

Status sugeridos:

- `PENDING`
- `RUNNING`
- `DONE`
- `BLOCKED`
- `FAILED`
- `QUOTA_EXHAUSTED`
- `AUTH_REQUIRED`
- `TIMEOUT`
- `AGY_MISSING`
- `NEEDS_SYNC`

Normalize `QUOTA_EXAUSTED` do bridge para `QUOTA_EXHAUSTED` no contexto do executor.

## Fase 9 - Relatorio final

Em tarefas com varios agentes, risco MEDIUM/HIGH, plano pre-definido, ou rastreabilidade solicitada, crie:

```text
{artefatos_dir}/workflow-log.md
{artefatos_dir}/subagents-context.md
{artefatos_dir}/implementation-report.md
```

Em tarefas com plano pre-definido, crie tambem `{artefatos_dir}/plan-vs-output-review.md` e referencie `{artefatos_dir}/initial-plan-baseline.md` nos tres relatorios finais.

**Modo conjunto:** quando a execucao veio de `.orchestration/<slug>/report/handoff.json` (ou de `.orchestration/<slug>/handoff.json` na raiz, em runs no layout anterior ao v2), grave tambem `{artefatos_dir}/handoff.json` (`stage: executor`, `upstream` apontando o handoff do Orchestrador) conforme `references/handoff-contract.md`, com os roles do estagio Executor (`plan-vs-output-review`, `implementation-report`, `workflow-log`, `subagents-context`, `monitoring`, `screenshots` quando houver). E o estagio terminal: `nextStage` pode ser `null`.

O fechamento deve ser curto:

- resultado;
- arquivos principais;
- testes/verificacoes;
- riscos/pendencias;
- proximo passo.

## Retomada

Se a sessao parar, use `/executor resume`. Sem argumento, o comando resolve a execucao ativa via `execucao_atual` do indice (`.executor/checkpoint.json`) e roda `executor-state.mjs resume --dir <artefatos_dir>`: qualquer task `RUNNING` interrompida vira `UNKNOWN` (nunca `FAILED`/`DONE` presumido), a execucao e reconciliada contra Git/arquivos/validacoes, e o resultado traz `resumeFromPhase` e `pendingExternalProbes` para orientar a continuacao. Ver `references/persistent-state.md` para o protocolo completo e os cinco invariantes.

`historico` (dentro do indice) lista todas as execucoes anteriores com `demanda_slug`, `artefatos_dir`, `status` e timestamps para referencia rapida — cada entrada aponta para a pasta de artefatos correspondente caso seja necessario inspecionar uma execucao passada. Para inspecionar sem retomar: `{artefatos_dir}/subagents-context.md` (fonte de verdade em prosa) e `{artefatos_dir}/workflow-log.md` (auditoria), quando existirem.
