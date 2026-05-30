# Workflow Rapido

Este documento expande o fluxo do `SKILL.md`. A regra e simples: use somente o detalhe necessario para entregar rapido.

## Fase 0 - Preflight leve

Rode:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs"
```

Se `codex`, `agy`, o plugin `openai-codex` ou o `cc-antigravity-plugin` falharem, nao siga no piloto automatico:

- falha de Codex: cancele com remediacao;
- falha somente de AGY: pause e pergunte se o usuario quer remediar, continuar so com Codex, ou cancelar.

Context7 e `/goal` continuam opcionais.

## Fase 1 - Triagem

Extraia em poucos minutos:

- objetivo final;
- arquivos/modulos provaveis;
- risco (`LOW`, `MEDIUM`, `HIGH`);
- tipo de trabalho;
- verificacoes obvias;
- pergunta bloqueante, se houver.

Use pesquisa local (`rg`, `rg --files`, leitura de arquivos) antes de perguntar. Pergunte somente quando uma suposicao errada geraria retrabalho relevante.

## Fase 2 - Plano curto

Para tarefas com 2+ agentes, crie `.executor/execution-brief.md` usando `assets/plan-template.md`.

O plano deve responder:

- quais slices existem;
- quem possui quais arquivos/modulos;
- o que nao pode ser tocado;
- qual ordem ou wave;
- como vamos verificar.

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

Nao faca polling continuo. Registre status em `.executor/monitoring.md` somente para execucoes com 2+ agentes ou sessoes longas.

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

1. Compare arquivos alterados com ownership.
2. Leia diffs de areas compartilhadas.
3. Rode verificacoes incrementais.
4. Corrija glue pequeno diretamente se for seguro.
5. Redelegue correcoes grandes ou arriscadas.

Se houver falha de AGY em task obrigatoria, pause para alinhamento com o usuario antes de fallback para Codex.

## Fase 7 - Review e verificacao

Para risco baixo, teste local especifico e suficiente.

Para risco medio, rode testes da area, typecheck/build quando aplicavel e revise os diffs principais.

Para risco alto, peca review Codex high antes de fechar.

Se uma verificacao falhar, tente corrigir no mesmo ciclo. Se nao der, feche como `BLOCKED` com causa e proximo comando.

## Fase 8 - Fechamento

Em tarefas pequenas, responda no chat.

Em tarefas com varios agentes, crie:

```text
.executor/workflow-log.md
.executor/subagents-context.md
.executor/implementation-report.md
```

O fechamento deve ser curto:

- resultado;
- arquivos principais;
- testes/verificacoes;
- riscos/pendencias;
- proximo passo.

## Retomada

Se a sessao parar, use `.executor/subagents-context.md` como fonte de verdade e `.executor/workflow-log.md` como auditoria. O contexto deve conter agentes lancados, status, arquivos tocados, pendencias e recomendacao de proxima acao.
