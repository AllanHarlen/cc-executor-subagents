# Subagents Context

## Resumo geral

| Campo | Valor |
|---|---|
| Demanda | <objetivo em uma frase> |
| Total de ondas | <n> |
| Total de subagentes | <n> |
| Fallbacks acionados | <n ou N/A> |
| Status geral | RUNNING \| DONE \| BLOCKED \| CANCELLED |
| Plano pre-definido | Sim \| Nao |
| Baseline do plano | `{artefatos_dir}/initial-plan-baseline.md` \| N/A |
| Review plano vs entrega | PENDENTE \| REVIEWED \| N/A |

---

## Linha do tempo de eventos por subagente

| Timestamp | Agente | Evento | Detalhe |
|---|---|---|---|
| <HH:MM> | A | LANCADO | slice: <slice>, modelo: <modelo> |
| <HH:MM> | A | CONCLUIDO | arquivos: <lista> |
| <HH:MM> | B | QUOTA_EXHAUSTED | sinal bruto `QUOTA_EXAUSTED`; fatia pausada para decisao do usuario |

---

## Detalhes por subagente

### Agente A — <tipo/modelo>

| Campo | Valor |
|---|---|
| Task | <descricao da slice> |
| Modelo | <codex gpt-5.4 medium \| codex gpt-5.5 high \| agy --model flash --effort medium \| agy --model pro --effort high \| agy --generate-image> |
| Status | DONE \| FALHOU \| QUOTA_EXHAUSTED \| AUTH_REQUIRED \| TIMEOUT \| AGY_MISSING \| PENDENTE |
| Tokens (in/out/cache/total) | N/A |
| Arquivos alterados | <lista> |
| Arquivos fora de ownership | Nenhum \| <lista com flag de violacao> |
| Decisoes tomadas | <lista> |
| Testes executados | <comando>: <resultado> |
| Riscos identificados | <lista ou Nenhum> |
| Skills utilizadas | <lista ou N/A> |

### Agente B — <tipo/modelo>

| Campo | Valor |
|---|---|
| Task | <descricao da slice> |
| Modelo | <modelo> |
| Status | DONE \| FALHOU \| QUOTA_EXHAUSTED \| AUTH_REQUIRED \| TIMEOUT \| AGY_MISSING \| PENDENTE |
| Tokens (in/out/cache/total) | N/A |
| Arquivos alterados | <lista> |
| Arquivos fora de ownership | Nenhum |
| Decisoes tomadas | <lista> |
| Testes executados | <comando>: <resultado> |
| Riscos identificados | Nenhum |
| Skills utilizadas | N/A |

_Adicione uma secao por agente real da execucao._

---

## Divergencias cruzadas entre subagentes

| # | Agentes envolvidos | Divergencia detectada | Resolucao aplicada | Status |
|---|---|---|---|---|
| 1 | <agentes> | <divergencia detectada, ex: campo renomeado, tipo incompativel, contrato desatualizado> | <resolucao aplicada> | RESOLVIDO \| PENDENTE |

_N/A se nenhuma divergencia de wire format ou logica foi detectada entre agentes._

---

## Review plano vs entrega

_Preencha somente quando a execucao partiu de um plano pre-definido._

| Campo | Valor |
|---|---|
| Agente/modelo | Codex gpt-5.5-codex high \| fallback interno por quota \| N/A |
| Artefato | `{artefatos_dir}/plan-vs-output-review.md` \| N/A |
| Decisao | ALINHADO \| ALINHADO COM DESVIOS ACEITOS \| DESALINHADO \| N/A |
| Pendencias geradas | Nenhuma \| <lista> |

---

## Tabela de uso de tokens por agente

| Agente/Componente | Tokens input | Tokens output | Cache read | Total |
|---|---|---|---|---|
| Executor Principal | <n> | <n> | <n> | <n> |
| Agente A (<modelo>) | N/A | N/A | N/A | N/A |
| Agente B (<modelo>) | N/A | N/A | N/A | N/A |
| **TOTAL** | **<n>** | **<n>** | **<n>** | **<n>** |

Dado nao reportado e `N/A`, nunca `0`. Agente que nao executou fica `N/A` na linha inteira. Com `--parallel`, o total do AGY ja e o agregado da sessao — nao some o fan-out por fora. Rodada de review repetida soma na mesma linha, com a contagem de rodadas indicada. Esta tabela e a de `{artefatos_dir}/workflow-log.md` precisam fechar no mesmo total.

---

## Contexto para retomada

| Campo | Valor |
|---|---|
| Proxima acao recomendada | <acao concreta> |
| Agentes pendentes | <lista ou Nenhum> |
| Agentes concluidos | <lista> |
| Arquivos com mudancas nao integradas | <lista ou Nenhum> |
| Comandos uteis para retomada | `<comando>` |
| Condicao para considerar concluido | <criterio> |
