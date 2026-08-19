# Workflow Log

## Metadados da execucao

| Campo | Valor |
|---|---|
| Demanda | <objetivo em uma frase> |
| Inicio | <YYYY-MM-DD HH:MM UTC> |
| Fim | <YYYY-MM-DD HH:MM UTC ou EM ANDAMENTO> |
| Status final | CONCLUIDO \| BLOQUEADO \| CANCELADO \| EM ANDAMENTO |
| Modo | DIRETO \| 1-AGENTE \| MULTI-AGENTE \| GOAL-AUTONOMO |
| Plano pre-definido | Sim \| Nao |
| Baseline do plano | `{artefatos_dir}/initial-plan-baseline.md` \| N/A |

---

## Linha do tempo por fase

| Fase | Nome | Status | Inicio | Fim | Artefatos gerados | Falhas |
|---|---|---|---|---|---|---|
| 0 | Preflight | OK \| AVISO \| FALHA | | | preflight.json | <falha ou N/A> |
| 1 | Triagem | OK \| PULADO | | | initial-plan-baseline.md (se houver plano) | N/A |
| 2 | Mapa de execucao | OK \| PULADO | | | execution-brief.md | N/A |
| 3 | Decisao de execucao | OK | | | - | N/A |
| 4 | Delegacao paralela | OK \| PULADO | | | - | <falha ou N/A> |
| 5 | Integracao | OK \| PULADO | | | - | <falha ou N/A> |
| 6 | Verificacao | OK \| FALHOU \| PULADO | | | - | <falha ou N/A> |
| 6.5 | Review plano vs entrega | OK \| FALHOU \| BLOQUEADO \| N/A | | | {artefatos_dir}/plan-vs-output-review.md | <falha ou N/A> |
| 7 | Fechamento interno | OK | | | - | N/A |
| 8 | Monitoramento | ATIVO \| CONCLUIDO \| N/A | | | {artefatos_dir}/monitoring.md | <falha ou N/A> |
| 9 | Relatorio final | OK | | | {artefatos_dir}/workflow-log.md, {artefatos_dir}/subagents-context.md, {artefatos_dir}/implementation-report.md, plan-vs-output-review.md (se houver plano) | N/A |

---

## Tabela de subagentes por onda

| Onda | ID | Tipo/Modelo | Slice/Ownership | Status | Tokens (in/out/cache/total) | Arquivos alterados |
|---|---|---|---|---|---|---|
| 1 | A | codex gpt-5.4 medium | <slice> | DONE \| FALHOU \| QUOTA_EXHAUSTED | N/A | <arquivos> |
| 1 | B | agy gemini-3.5-flash-medium | <slice> | DONE \| FALHOU \| QUOTA_EXHAUSTED \| AUTH_REQUIRED \| TIMEOUT \| AGY_MISSING | N/A | <arquivos> |

_Adicione linhas conforme as ondas e agentes reais da execucao._

---

## Registro de falhas e recuperacao

| # | Fase | Agente/Componente | Tipo de falha | Acao de recuperacao | Resultado |
|---|---|---|---|---|---|
| 1 | <fase> | <agente ou executor> | QUOTA_EXHAUSTED \| AUTH_REQUIRED \| TIMEOUT \| AGY_MISSING \| ERRO_LOGICO \| BUILD_FALHOU | <acao tomada> | RECUPERADO \| PENDENTE \| BLOQUEADO |

_N/A se nenhuma falha ocorreu._

---

## Decisoes do orquestrador

| # | Fase | Decisao | Motivo | Impacto |
|---|---|---|---|---|
| 1 | 3 | Execucao direta (sem agentes) | Mudanca de 1 arquivo, baixo risco | Nenhum agente lancado |
| 2 | 4 | Front-end roteado para AGY | AGY 3.6.0+ validado no preflight | Fluxo UI seguiu com antigravity-coder |

_Registre apenas decisoes nao-triviais que afetam o resultado ou o rastreio._

---

## Pausa / Cancelamento / Bloqueio

| Evento | Fase | Motivo | Estado preservado | Condicao para retomar |
|---|---|---|---|---|
| N/A | - | - | - | - |

---

## Tabela consolidada de tokens

| Agente/Componente | Tokens input | Tokens output | Cache read | Total |
|---|---|---|---|---|
| Executor Principal | <n> | <n> | <n> | <n> |
| Agente A (<modelo>) | N/A | N/A | N/A | N/A |
| Agente B (<modelo>) | N/A | N/A | N/A | N/A |
| **TOTAL** | **<n>** | **<n>** | **<n>** | **<n>** |

Regras de fechamento:
- Dado nao reportado e `N/A` e nunca `0`.
- Agente/componente que nao executou nesta execucao fica `N/A` na linha inteira.
- Com `--parallel`, o total do AGY ja e o agregado da sessao (subagentes nativos incluidos) — nao some o fan-out por fora dele.
- Rodada de review repetida por `REPROVADO`/`DESALINHADO` soma na mesma linha do agente, com a contagem de rodadas indicada (ex.: "Codex review high (2 rodadas)").
- Esta tabela e a de `{artefatos_dir}/subagents-context.md` precisam fechar no mesmo total.
