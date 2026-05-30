# Subagents Context

## Resumo geral

| Campo | Valor |
|---|---|
| Demanda | <objetivo em uma frase> |
| Total de ondas | <n> |
| Total de subagentes | <n> |
| Fallbacks acionados | <n ou N/A> |
| Status geral | RUNNING \| DONE \| BLOCKED \| CANCELLED |

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
| Modelo | <codex gpt-5.4 medium \| codex gpt-5.5 high \| agy gemini-3.5-flash-medium \| agy gemini-3.1-pro-high \| agy --generate-imagem> |
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

## Tabela de uso de tokens por agente

| Agente/Componente | Tokens input | Tokens output | Cache read | Total |
|---|---|---|---|---|
| Executor Principal | <n> | <n> | <n> | <n> |
| Agente A (<modelo>) | N/A | N/A | N/A | N/A |
| Agente B (<modelo>) | N/A | N/A | N/A | N/A |
| **TOTAL** | **<n>** | **<n>** | **<n>** | **<n>** |

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
