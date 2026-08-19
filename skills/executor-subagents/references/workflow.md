# Workflow Rapido

Este documento expande o fluxo do `SKILL.md`. A regra e simples: use somente o detalhe necessario para entregar rapido.

## Fase 0 - Preflight leve

Rode:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs"
```

Se `codex`, `agy`, o plugin `openai-codex` ou o `cc-antigravity-plugin` falharem, nao siga no piloto automatico:

- falha de Codex: cancele com remediacao para backend/testes/review; para UI/asset puro sem plano pre-definido, prossiga sem Codex; se houver plano pre-definido, remedeie Codex ou obtenha aceite explicito do usuario para seguir sem review plano-vs-entrega;
- falha somente de AGY: pause e pergunte se o usuario quer remediar, continuar so com Codex, ou cancelar.

Context7 e `/goal` continuam opcionais.

## Fase 1 - Triagem

Extraia em poucos minutos:

- objetivo final;
- arquivos/modulos provaveis;
- se existe plano pre-definido (texto estruturado, arquivo citado, checkpoint, "siga este plano", "plano aprovado" ou equivalente);
- risco (`LOW`, `MEDIUM`, `HIGH`);
- tipo de trabalho;
- verificacoes obvias;
- pergunta bloqueante, se houver.

Use pesquisa local (`rg`, `rg --files`, leitura de arquivos) antes de perguntar. Pergunte somente quando uma suposicao errada geraria retrabalho relevante.

Se houver plano pre-definido, preserve o conteudo original em `{artefatos_dir}/initial-plan-baseline.md`, registre `plano_predefinido: true` no checkpoint e trate esse baseline como fonte de verdade para slices, criterios de aceite e verificacao final.

**Modo conjunto (Orchestrador → Executor):** procure `.orchestration/<slug>/report/handoff.json` (layout 2, Orchestrador >= 4.1.0) antes de tratar a demanda como avulsa; se ausente, tente `.orchestration/<slug>/handoff.json` (layout 1). Se existir em qualquer um dos dois, o executor entra no papel de **corrigir e fazer os ajustes finos** da entrega do Orchestrador: adote o handoff como plano pre-definido baseline, registre qual caminho respondeu, siga `upstream` ate o Pensador para rastreabilidade (`prd`/`api-contract`/`design-system-files`) e mantenha obrigatorio o review Codex high plano-vs-entrega. Ver `references/handoff-contract.md` (secao 7).

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

Roteamento padrao:

- front-end/UI: AGY agentic;
- imagem/asset explicito: AGY `--generate-imagem`;
- analise pura: AGY `--read-only`;
- backend, testes, integracao e review: Codex.

## Fase 5 - Monitoramento leve

Nao faca polling continuo. Registre status em `{artefatos_dir}/monitoring.md` somente para execucoes com 2+ agentes ou sessoes longas.

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

## Fase 6 - Integracao

Ao receber retornos:

1. Compare arquivos alterados com ownership — com 3+ agentes ou ownership complexo, use `node "${CLAUDE_SKILL_DIR}/scripts/validate-task-scope.mjs" --root . --allowed "<padroes>"` em vez de conferir no olho.
2. Leia diffs de areas compartilhadas; `node "${CLAUDE_SKILL_DIR}/scripts/inspect-diff.mjs" --root .` sinaliza migration, lockfile, auth/tenancy, possivel segredo, TODO novo e artefato de debug.
3. Rode verificacoes incrementais.
4. Corrija glue pequeno diretamente se for seguro.
5. Redelegue correcoes grandes ou arriscadas.

Se houver falha de AGY em task obrigatoria, pause para alinhamento com o usuario antes de fallback para Codex.

## Fase 7 - Review e verificacao

Para risco baixo, teste local especifico e suficiente.

Para risco medio, rode testes da area, typecheck/build quando aplicavel e revise os diffs principais.

Para risco alto, peca review Codex high antes de fechar.

Para plano pre-definido, sempre peca review Codex high read-only antes de fechar, mesmo em UI/front-end puro. O review deve comparar `{artefatos_dir}/initial-plan-baseline.md` com o diff e a entrega gerada, cobrindo requisitos, criterios de aceite, entregaveis, contratos, arquivos planejados/alterados e verificacoes planejadas/executadas. Salve em `{artefatos_dir}/plan-vs-output-review.md`. Se houver `DESALINHADO`, corrija ou bloqueie com evidencia.

Se uma verificacao falhar, tente corrigir no mesmo ciclo. Se nao der, feche como `BLOCKED` com causa e proximo comando.

## Fase 8 - Fechamento

Em tarefas pequenas, responda no chat.

Em tarefas com varios agentes, crie:

```text
{artefatos_dir}/workflow-log.md
{artefatos_dir}/subagents-context.md
{artefatos_dir}/implementation-report.md
```

Em tarefas com plano pre-definido, crie tambem `{artefatos_dir}/plan-vs-output-review.md` e referencie `{artefatos_dir}/initial-plan-baseline.md` nos tres relatorios finais.

**Modo conjunto:** quando a execucao veio de `.orchestration/<slug>/report/handoff.json` ou `.orchestration/<slug>/handoff.json`, grave tambem `{artefatos_dir}/handoff.json` (`stage: executor`, `upstream` apontando o caminho do handoff do Orchestrador que de fato respondeu) conforme `references/handoff-contract.md`, com os roles do estagio Executor (`plan-vs-output-review`, `implementation-report`, `workflow-log`, `subagents-context`, `monitoring`, `screenshots` quando houver). E o estagio terminal: `nextStage` pode ser `null`.

O fechamento deve ser curto:

- resultado;
- arquivos principais;
- testes/verificacoes;
- riscos/pendencias;
- proximo passo.

## Retomada

Se a sessao parar, leia `.executor/checkpoint.json`. O campo `execucao_atual` aponta para o `artefatos_dir` da execucao ativa; use-o para localizar `{artefatos_dir}/subagents-context.md` (fonte de verdade) e `{artefatos_dir}/workflow-log.md` (auditoria). O campo `historico` lista todas as execucoes anteriores com `demanda_slug`, `artefatos_dir`, `status` e timestamps para referencia rapida — cada entrada aponta para a pasta de artefatos correspondente caso seja necessario inspecionar uma execucao passada.
