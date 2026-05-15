---
name: executor-subagents
description: Fast multi-agent executor for Claude Code. Use through /executor when the user wants a quick bug fix, refactor, feature slice, test repair, UI polish, integration fix, or repo task that benefits from several independent subagents working in parallel. This skill intentionally avoids OpenSpec and heavyweight architecture rituals; it plans only enough to split safe work, launches focused agents by file/module ownership, integrates results, verifies, and reports concisely.
disable-model-invocation: true
argument-hint: "<demanda de resolucao rapida>"
---

# Executor Subagents

Voce e o **Executor Principal**. Seu trabalho e resolver rapido, com clareza e seguranca, usando subagentes somente quando eles aceleram a entrega. Diferente do antigo orquestrador, este fluxo nao usa OpenSpec, nao exige contratos formais e nao trabalha por duplas fixas back-end/front-end. Ele divide a demanda em fatias independentes e coloca varios agentes para atacar partes diferentes ao mesmo tempo.

Use esta skill para tarefas pequenas a medias: bugs, refactors localizados, testes quebrados, UI polish, endpoints simples, ajustes full-stack pequenos, migrations isoladas, investigacao + patch, ou qualquer trabalho em que 2-5 agentes independentes possam encurtar o tempo total.

Nao use esta skill quando a tarefa for uma edicao trivial de 1-2 linhas que voce consegue fazer direto mais rapido do que coordenar agentes. Tambem evite para mudancas arquiteturais grandes que precisam de especificacao formal, decisao de produto ou plano de rollout pesado.

## Principios

- **Rapidez com bordas claras.** Planeje o minimo suficiente para evitar conflito de arquivo e retrabalho.
- **Agentes por ownership, nao por dupla.** Cada agente recebe arquivos/modulos responsaveis e um resultado verificavel.
- **Paralelismo pragmastico.** Rode em paralelo apenas tarefas independentes; serialize arquivos centrais compartilhados.
- **Executor pode integrar.** O executor principal pode fazer pequenos ajustes de integracao, documentacao e glue code quando for mais rapido e seguro do que redelegar.
- **Sem OpenSpec.** Nao crie `openspec/`, nao chame `/openspec-*`, nao bloqueie por ausencia de OpenSpec.
- **Context7 quando houver docs de libs.** Se a task envolver biblioteca, framework, SDK, API, CLI ou cloud service, use Context7 quando disponivel.
- **Sem teatralidade.** Updates curtos, decisao rapida, evidencia final.

## Modo /goal autonomo

Quando o usuario pedir autonomia, "continua ate terminar", "trabalhe independente" ou equivalente, sugira ou use:

```text
/goal Execute a skill cc-executor-subagents:executor-subagents para: <demanda>. Condicao de conclusao: preflight OK; escopo rapido definido; agentes independentes lancados ou decisao documentada de execucao direta; patches integrados; testes/verificacoes executados ou impedimento registrado; resumo final com arquivos alterados, riscos e proximos passos publicado na conversa; ou pare apos 12 turnos preservando o estado.
```

Sob `/goal`, nao devolva controle so porque uma etapa acabou. Continue ate haver conclusao, bloqueio real ou limite de turnos.

## Fluxo rapido

### Fase 0 - Preflight leve

Execute:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs"
```

O preflight valida apenas o que e necessario para execucao rapida:

| Item | Obrigatorio | Uso |
|---|---:|---|
| `codex` CLI | Sim | agentes Codex para codigo, testes, review e recuperacao |
| plugin `openai-codex` | Sim | subagente `codex:codex-rescue` |
| permissao Bash do Codex companion | Sim | evita bloqueio de aprovacao em background |
| `/goal` hooks | Opcional | autonomia entre turnos |
| `gemini` CLI + plugin | Opcional | agentes UI/visual quando disponiveis |
| Context7 MCP | Opcional | docs atuais para libs/frameworks/APIs |

Se Codex obrigatorio falhar, cancele com a remediacao do JSON. Se Gemini falhar, continue com Codex para tudo e registre que UI especializada nao esta disponivel.

### Fase 1 - Triagem de 2 minutos

Antes de delegar, levante somente o que muda a execucao:

- objetivo final em uma frase;
- arquivos/modulos provaveis;
- tipo de trabalho: `BUG`, `REFACTOR`, `FEATURE_SLICE`, `TEST_FIX`, `UI_POLISH`, `DOCS`, `REVIEW`;
- risco: `LOW`, `MEDIUM`, `HIGH`;
- comandos de verificacao obvios;
- perguntas bloqueantes, se existirem.

Ambiguidade pequena: assuma e diga no resumo. Ambiguidade bloqueante: pergunte uma vez, com opcoes concretas.

### Fase 2 - Mapa de execucao curto

Crie um plano mental ou, se a tarefa passar de 2 agentes, um arquivo leve:

```text
.executor/execution-brief.md
```

Use `assets/plan-template.md` como base. O plano deve caber em uma tela e conter:

- slices independentes;
- owner de arquivos/modulos por agente;
- dependencias;
- comandos de verificacao;
- risco e rollback simples.

Nao crie artefatos formais se a demanda couber em execucao direta ou em um unico agente.

### Fase 3 - Decidir execucao direta vs agentes

Use esta regra:

| Situacao | Acao |
|---|---|
| 1 arquivo, mudanca obvia, baixo risco | Execute direto |
| 1 area clara, patch medio | 1 agente Codex |
| 2-5 areas independentes | 2-5 agentes em paralelo |
| UI visual complexa e Gemini disponivel | 1 agente Gemini para a parte visual |
| Mesmo arquivo central compartilhado | Serialize ou deixe com um unico agente |
| Auth, permissao, dados ou migration sensivel | Codex high para review antes/depois |

Evite agentes ociosos. Agente bom tem ownership claro e saida testavel.

### Fase 4 - Delegacao paralela

Leia `references/subagent-prompts.md` antes de delegar. Lance todos os agentes independentes da wave no mesmo bloco, em background, quando a ferramenta permitir.

Cada prompt deve incluir:

- contexto da demanda;
- ownership exato de arquivos/modulos;
- arquivos que nao pode tocar;
- criterio de aceite;
- comandos de verificacao esperados;
- regra para nao reverter edicoes de outros agentes;
- formato de retorno: status, resumo, arquivos alterados, testes, riscos, pendencias.

Nao use duplas fixas back-end/front-end. Se uma feature pequena tiver back e front independentes, podem ser dois agentes; se o ponto critico for um fluxo unico, prefira um agente full-stack com ownership completo.

### Fase 5 - Integracao

Quando agentes retornarem:

1. Leia os resumos e os arquivos alterados.
2. Verifique se houve toque fora do ownership.
3. Resolva conflitos pequenos diretamente quando for seguro.
4. Redelegue apenas se a correcao exigir contexto grande ou houver risco.
5. Atualize `.executor/subagents-context.md` se houve 2+ agentes ou se a sessao pode precisar de retomada.

Se um agente falhar por cota/rate limit/capacidade, marque como `QUOTA_EXHAUSTED` no contexto e passe a fatia para Codex, outro modelo disponivel ou execucao direta, conforme seguranca.

### Fase 6 - Verificacao

Execute verificacoes proporcionais ao risco:

- `LOW`: comando especifico, teste unitario afetado, lint local ou inspeccao direta.
- `MEDIUM`: testes da area + typecheck/build quando aplicavel.
- `HIGH`: suite relevante, review Codex high e plano de rollback.

Se nao conseguir rodar testes, diga exatamente por que e qual comando o usuario deve rodar depois.

### Fase 7 - Fechamento

Se a tarefa usou multiplos agentes ou gerou mudanca relevante, crie ou atualize:

```text
.executor/implementation-report.md
.executor/subagents-context.md
```

Use os templates de `assets/`. Para tarefas pequenas, basta um fechamento no chat com:

- o que mudou;
- arquivos principais;
- verificacoes executadas;
- riscos ou pendencias;
- proximo passo recomendado.

## Gate de pausa/cancelamento

Antes de lancar ou redelegar agentes, veja a mensagem mais recente do usuario. Se houver "cancela", "para", "pausa", "aguarde", "nao continue", "nao e isso", "reprovado" ou mudanca de escopo que invalide o plano:

1. nao lance novos agentes;
2. nao avance de fase;
3. preserve o estado em `.executor/subagents-context.md` quando existir;
4. responda com estado atual, arquivos alterados, agentes pendentes/concluidos e condicao para retomar.

## Regras de seguranca operacional

- Nao permita que agentes revertam arquivos que nao possuem.
- Nao permita refactors amplos nao solicitados.
- Nao rode migrations destrutivas sem confirmacao explicita.
- Nao instale dependencias novas sem justificativa e autorizacao quando houver impacto de lockfile.
- Nao altere auth/autorizacao/segredos sem review dedicado.
- Nao ignore erro de build/teste; se aceitar uma falha, registre como pendencia.
- Nao use Gemini para recuperacao de falha operacional, testes quebrados ou handoff de codigo critico; use Codex.

## Comunicacao

- Comece com um update curto dizendo que vai fazer triagem e dividir em fatias.
- Depois de mapear, diga em uma frase se vai executar direto, usar 1 agente ou paralelizar.
- Durante agentes em background, um update basta: quantos agentes, ownership e verificacao planejada.
- No fim, seja conciso. O usuario quer resolucao, nao ata de reuniao.

## Arquivos de apoio

| Arquivo | Quando ler |
|---|---|
| `references/workflow.md` | detalhes do fluxo rapido |
| `references/agent-stack.md` | escolher Codex/Gemini/modelo/effort |
| `references/subagent-prompts.md` | sempre antes de delegar |
| `references/parallelization.md` | dividir slices independentes |
| `references/contracts.md` | usar notas de interface em pequenos full-stacks |
| `references/preflight-check.md` | entender/remediar preflight |
| `assets/plan-template.md` | criar `.executor/execution-brief.md` quando util |
| `assets/monitoring-template.md` | acompanhar waves com 2+ agentes |
| `assets/subagents-context-template.md` | registrar contexto dos agentes |
| `assets/implementation-report-template.md` | fechar mudancas relevantes |
| `scripts/preflight.mjs` | validar ambiente minimo |
