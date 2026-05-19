# Workflow Log

## Metadados da execucao

| Campo | Valor |
|---|---|
| Demanda | <objetivo em uma frase> |
| Inicio | <YYYY-MM-DD HH:MM UTC> |
| Fim | <YYYY-MM-DD HH:MM UTC ou EM ANDAMENTO> |
| Status final | CONCLUIDO \| BLOQUEADO \| CANCELADO \| EM ANDAMENTO |
| Modo | DIRETO \| 1-AGENTE \| MULTI-AGENTE \| GOAL-AUTONOMO |

---

## Linha do tempo por fase

| Fase | Nome | Status | Inicio | Fim | Artefatos gerados | Falhas |
|---|---|---|---|---|---|---|
| 0 | Preflight | OK \| AVISO \| FALHA | | | preflight.json | <falha ou N/A> |
| 1 | Triagem | OK \| PULADO | | | execution-brief.md | N/A |
| 2 | Mapa de execucao | OK \| PULADO | | | plan.md | N/A |
| 3 | Decisao de execucao | OK | | | - | N/A |
| 4 | Delegacao paralela | OK \| PULADO | | | - | <falha ou N/A> |
| 5 | Integracao | OK \| PULADO | | | - | <falha ou N/A> |
| 6 | Verificacao | OK \| FALHOU \| PULADO | | | - | <falha ou N/A> |
| 7 | Fechamento interno | OK | | | - | N/A |
| 8-14 | (reservado) | N/A | - | - | - | - |
| 15 | Relatorio final | OK | | | workflow-log.md, subagents-context.md, implementation-report.md | N/A |

---

## Tabela de subagentes por onda

| Onda | ID | Tipo/Modelo | Slice/Ownership | Status | Tokens (in/out/cache/total) | Arquivos alterados |
|---|---|---|---|---|---|---|
| 1 | A | codex gpt-5.4 medium | <slice> | DONE \| FALHOU \| QUOTA_EXHAUSTED | N/A | <arquivos> |
| 1 | B | codex gpt-5.4 medium | <slice> | DONE | N/A | <arquivos> |

_Adicione linhas conforme as ondas e agentes reais da execucao._

---

## Registro de falhas e recuperacao

| # | Fase | Agente/Componente | Tipo de falha | Acao de recuperacao | Resultado |
|---|---|---|---|---|---|
| 1 | <fase> | <agente ou executor> | QUOTA_EXHAUSTED \| TIMEOUT \| ERRO_LOGICO \| BUILD_FALHOU | <acao tomada> | RECUPERADO \| PENDENTE \| BLOQUEADO |

_N/A se nenhuma falha ocorreu._

---

## Decisoes do orquestrador

| # | Fase | Decisao | Motivo | Impacto |
|---|---|---|---|---|
| 1 | 3 | Execucao direta (sem agentes) | Mudanca de 1 arquivo, baixo risco | Nenhum agente lancado |
| 2 | 4 | Fallback Codex para UI (Gemini indisponivel) | Gemini CLI ausente no preflight | UI tratada por Codex gpt-5.4 |

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

_Use N/A para agentes que nao reportaram tokens. O orquestrador calcula o total consolidado._
