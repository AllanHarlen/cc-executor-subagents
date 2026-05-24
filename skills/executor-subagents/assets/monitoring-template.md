# Monitoring — Fase 8

> Fonte viva de todos os eventos durante a execucao dos subagentes. O orquestrador atualiza este arquivo continuamente. Nao implementa — apenas supervisiona.

## Status geral

RUNNING | PAUSED | BLOCKED | CANCELLED | DONE

## Legenda de status

| Status | Significado |
|---|---|
| `PENDING` | Task identificada, ainda nao delegada |
| `RUNNING` | Agente rodando |
| `PAUSED` | Usuario pediu pausa |
| `CANCELLED` | Usuario cancelou |
| `BLOCKED` | Precisa de decisao do orquestrador ou do usuario |
| `NEEDS_SYNC` | Contrato divergiu entre back e front |
| `DONE` | Agente concluiu com sucesso |
| `FAILED` | Agente falhou |
| `QUOTA_EXHAUSTED` | Agente parou por cota/rate limit/capacidade |
| `REVIEWED` | Passou pelo review final |

---

## Tabela de agentes

| ID | Slice | Agente/Modelo | Status | Ownership | Ultima atualizacao |
|---|---|---|---|---|---|
| A | <slice> | codex gpt-5.4 medium | PENDING | <arquivos> | <HH:MM> |
| B | <slice> | agy gemini-3.5-flash-medium | RUNNING | <arquivos> | <HH:MM> |

---

## Detalhes por task ativa

### Task A — <nome da slice>

| Campo | Valor |
|---|---|
| Categoria | BUG \| FEATURE_SLICE \| REFACTOR \| TEST_FIX \| UI_POLISH \| REVIEW |
| Contrato exigido (`contractRequired`) | sim \| nao |
| Agentes responsaveis | A |
| Wire format validado | sim \| nao \| pendente |

**Supervisao operacional:**

| Campo | Valor |
|---|---|
| Motivo atual | <o que o agente esta fazendo agora> |
| Evidencia | <arquivo parcial, log ou saida observada> |
| Arquivos parciais detectados | <lista ou Nenhum> |
| Fallback escolhido | <modelo alternativo ou execucao direta — ou N/A> |
| Proxima acao do orquestrador | <acao concreta> |

**Log de eventos:**

| Timestamp | Evento | Detalhe |
|---|---|---|
| <HH:MM> | DELEGADO | agente A lancado com ownership: <arquivos> |
| <HH:MM> | SLOW_CHECKIN | sem resposta apos <n> min; checkin enviado |
| <HH:MM> | CHECKIN_RECEBIDO | progresso: <resumo>; ETA: <n> min |
| <HH:MM> | QUOTA_EXHAUSTED | evidencia: <mensagem do agente>; acao: <fallback> |
| <HH:MM> | DONE | arquivos alterados: <lista> |

### Task B — <nome da slice>

| Campo | Valor |
|---|---|
| Categoria | <categoria> |
| Contrato exigido (`contractRequired`) | sim \| nao |
| Agentes responsaveis | B |
| Wire format validado | pendente |

**Supervisao operacional:**

| Campo | Valor |
|---|---|
| Motivo atual | implementando <descricao> |
| Evidencia | <arquivo ou log> |
| Arquivos parciais detectados | Nenhum |
| Fallback escolhido | N/A |
| Proxima acao do orquestrador | aguardar conclusao; checar em <n> min |

**Log de eventos:**

| Timestamp | Evento | Detalhe |
|---|---|---|
| <HH:MM> | DELEGADO | agente B lancado |

---

## Protocolo SLOW_CHECKIN

Quando um subagente demora mais do que o esperado, o orquestrador envia um SLOW_CHECKIN — mensagem curta pedindo atualizacao operacional **sem solicitar trabalho novo**. O agente deve responder com:

1. Progresso concreto concluido ate agora
2. Arquivos criados ou alterados
3. Bloqueios ou riscos ativos
4. ETA honesto
5. Se ha falha de cota
6. Se ha falha de tool, terminal ou escrita de arquivo

---

## Bloqueios ativos

| Task | Motivo do bloqueio | Decisao necessaria | Quem decide |
|---|---|---|---|
| <task> | <motivo> | <opcoes> | Orquestrador \| Usuario |

_Nenhum. — preencher quando existir bloqueio._

---

## Proxima acao do orquestrador

- <acao concreta com condicao de disparo>
