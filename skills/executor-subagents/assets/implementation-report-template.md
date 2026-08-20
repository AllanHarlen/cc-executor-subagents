# Implementation Report

## 1. Resumo executivo

<o que foi entregue, em 2-3 frases orientadas ao resultado de negocio>

---

## 2. Objetivo e escopo

| Campo | Valor |
|---|---|
| Demanda | <objetivo em uma frase> |
| Tipo de trabalho | BUG \| REFACTOR \| FEATURE_SLICE \| TEST_FIX \| UI_FRONTEND \| IMAGE_ASSET \| DOCS \| REVIEW |
| Risco | LOW \| MEDIUM \| HIGH |
| Modo de execucao | DIRETO \| 1-AGENTE \| MULTI-AGENTE |
| Plano pre-definido | Sim \| Nao |
| Baseline do plano | `{artefatos_dir}/initial-plan-baseline.md` \| N/A |

---

## 3. Preflight

| Item | Status | Detalhe |
|---|---|---|
| codex CLI | OK \| FALHOU | <versao ou erro> |
| openai-codex plugin | OK \| FALHOU | - |
| Bash(node:*) | OK \| FALHOU | - |
| agy CLI | OK \| FALHOU | <versao ou erro> |
| cc-antigravity-plugin >= 4.0.0 | OK \| FALHOU | <versao ou erro> |
| Context7 MCP | OK \| AVISO \| N/A | - |
| Auto-remediacao aplicada | Sim \| Nao | <descricao ou N/A> |

---

## 4. Tasks executadas

| # | Task / Slice | Agente | Status | Criterio de aceite | Aceite verificado |
|---|---|---|---|---|---|
| 1 | <descricao> | Executor Principal \| Agente A | DONE \| FALHOU | <criterio> | Sim \| Nao |
| 2 | <descricao> | Agente B | DONE | <criterio> | Sim |

---

## 5. Contratos implementados

| Contrato | Tipo | Arquivo | Wire format validado | Divergencias |
|---|---|---|---|---|
| <endpoint ou interface> | REST \| GraphQL \| Event \| Props | <path> | Sim \| Nao \| N/A | Nenhuma \| <lista> |

_N/A se nenhum contrato de interface foi criado ou necessario._

---

## 6. Arquivos alterados

- `<path>` — <descricao curta da mudanca>

---

## 6.1 Review de plano pre-definido

_Preencha somente quando a execucao partiu de um plano pre-definido. Caso contrario, use `N/A`._

| Campo | Valor |
|---|---|
| Review obrigatorio | Sim \| Nao |
| Agente/modelo | Codex gpt-5.5-codex high \| fallback interno por quota \| N/A |
| Arquivo do parecer | `{artefatos_dir}/plan-vs-output-review.md` \| N/A |
| Decisao | ALINHADO \| ALINHADO COM DESVIOS ACEITOS \| DESALINHADO \| N/A |
| Desvios encontrados | Nenhum \| <lista curta> |
| Acao aplicada apos review | Nenhuma \| <ajuste feito> \| <pendencia registrada> |

---

## 7. Decisoes tecnicas e ajustes pos-review

| # | Decisao | Motivo | Impacto |
|---|---|---|---|
| 1 | <decisao> | <motivo> | <impacto> |

---

## 8. Validacoes

| Verificacao | Comando | Resultado |
|---|---|---|
| Build | `<comando>` | PASSOU \| FALHOU \| NAO EXECUTADO |
| Testes | `<comando>` | PASSOU \| FALHOU \| NAO EXECUTADO |
| Typecheck | `<comando>` | PASSOU \| FALHOU \| N/A |
| Lint | `<comando>` | PASSOU \| FALHOU \| N/A |

_Se nao executado, indique o comando que o usuario deve rodar e o motivo._

---

## 9. Riscos e pendencias

- <risco ou pendencia, ou Nenhum>

---

## 10. Fallbacks e recuperacoes

| Agente | Tipo de falha | Acao aplicada | Resultado |
|---|---|---|---|
| <agente> | QUOTA_EXHAUSTED \| AUTH_REQUIRED \| TIMEOUT \| AGY_MISSING \| ERRO | <acao> | RECUPERADO \| PENDENTE |

_N/A se nenhum fallback foi necessario. Inclui fallback de review interno por QUOTA_EXHAUSTED quando aplicavel._

---

## 11. Status final

**PRONTO PARA MERGE** | **PRONTO PARA HOMOLOGACAO** | **BLOQUEADO**

<motivo se bloqueado>

---

## 12. Tabela de tokens por agente

| Agente/Componente | Tokens input | Tokens output | Cache read | Total |
|---|---|---|---|---|
| Executor Principal | <n> | <n> | <n> | <n> |
| Agente A (<modelo>) | N/A | N/A | N/A | N/A |
| Agente B (<modelo>) | N/A | N/A | N/A | N/A |
| **TOTAL** | **<n>** | **<n>** | **<n>** | **<n>** |

Dado nao reportado e `N/A`, nunca `0`. Agente que nao executou fica `N/A` na linha inteira. Com `--parallel`, o total do AGY ja e o agregado da sessao — nao some o fan-out por fora. Rodada de review repetida soma na mesma linha, com a contagem de rodadas indicada. Esta tabela e a de `{artefatos_dir}/subagents-context.md`/`{artefatos_dir}/workflow-log.md` precisam fechar no mesmo total.

---

## 13. Proximo passo tecnico

- <merge / deploy / teste manual / review adicional / homologacao>

---

## 14. Instrucoes de negocio

_Preencha esta secao apenas quando houver contexto de negocio real; caso contrario, use `N/A`._

### O que mudou para o negocio

<descricao em linguagem nao tecnica do que a mudanca significa para o usuario final ou operacao>

### Como homologar (passo a passo)

1. <passo 1>
2. <passo 2>
3. <passo 3>

### Regras e limites da nova funcionalidade

- <regra ou limite relevante para o negocio>

### Impactos operacionais

- <impacto em processos, integradores, suporte, dados ou SLA — ou "Nenhum impacto operacional identificado">

### Proximo passo recomendado

<acao clara para o time de negocio ou produto — ex: "Validar em homologacao com cenario X antes de promover para producao">
