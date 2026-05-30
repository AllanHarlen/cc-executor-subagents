---
description: Executar uma resolucao rapida multiagente sem OpenSpec, dividindo a demanda em fatias independentes, roteando front-end e imagem para AGY e backend/testes/review para Codex, integrando e verificando.
argument-hint: "<demanda de resolucao rapida>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Agent, TaskCreate, TaskUpdate, TaskList, Skill
---

# /executor

Inicia o **Executor Subagents** para resolver a demanda descrita em `$ARGUMENTS`.

Este comando substitui o antigo fluxo de orquestrador pesado. Ele nao cria OpenSpec, nao exige review formal de plano e nao trabalha por duplas fixas. O foco e resolver rapido com um mix pragmatico de execucao direta e subagentes independentes.

Nota de permissao: este comando declara `Bash` amplo porque o executor precisa rodar verificacoes proporcionais ao risco do projeto (testes, lint, typecheck, build e preflight). Mesmo assim, use comandos destrutivos somente com autorizacao explicita do usuario.

## Modo preflight

Se `$ARGUMENTS` for exatamente `preflight`, rode apenas:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs"
```

Mostre:

- `status`;
- falhas obrigatorias;
- avisos opcionais;
- remediacao se houver.

Depois encerre.

## Execucao normal

1. Rode o preflight:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs"
   ```

2. Se `status: "failed"` e a falha envolver Codex obrigatorio, cancele e mostre `remediation`.

3. Se `status: "failed"` e somente AGY ou o `cc-antigravity-plugin` falharem, mostre `remediation` e pergunte ao usuario se quer:

   - corrigir AGY e tentar de novo;
   - continuar so com Codex;
   - cancelar.

4. Carregue a skill:

   ```text
   Skill(skill="cc-executor-subagents:executor-subagents")
   ```

   Se a tool de Skill recusar por `disable-model-invocation: true`, leia `${CLAUDE_PLUGIN_ROOT}/skills/executor-subagents/SKILL.md` e siga diretamente.

5. Faca triagem curta da demanda.

6. Decida:

   - executar direto;
   - usar 1 agente;
   - usar multiplos agentes independentes.

7. Roteie por padrao:

   - front-end/UI: `cc-antigravity-plugin:antigravity-agent`;
   - imagem explicita: `cc-antigravity-plugin:antigravity-agent --generate-imagem`;
   - analise pura: `cc-antigravity-plugin:antigravity-agent --read-only`;
   - backend/testes/review: Codex.

8. Se usar 2+ agentes, crie `.executor/execution-brief.md` e mantenha `.executor/monitoring.md` como fonte viva de eventos (Fase 8): status por task, log com timestamp, SLOW_CHECKIN quando agente demorar, e politica de cota conforme tipo de agente e fase.

9. Delegue em paralelo por ownership, nao por dupla fixa.

10. Integre, rode verificacoes e feche.

11. **Fase 9 - Relatorio final:** para execucoes com 2+ agentes, risco MEDIUM/HIGH ou rastreabilidade solicitada, gere em `.executor/`:

   ```text
   .executor/workflow-log.md
   .executor/subagents-context.md
   .executor/implementation-report.md
   ```

   Use os templates em `${CLAUDE_PLUGIN_ROOT}/skills/executor-subagents/assets/`. O `implementation-report.md` deve incluir a secao 14 com instrucoes de negocio quando houver contexto de negocio real (o que mudou, como homologar, regras, impactos operacionais e proximo passo recomendado).

## /goal autonomo

Quando o usuario pedir autonomia, use:

```text
/goal Execute a skill cc-executor-subagents:executor-subagents para: <demanda>. Condicao de conclusao: preflight OK; escopo rapido definido; agentes independentes lancados ou decisao documentada de execucao direta; patches integrados; testes/verificacoes executados ou impedimento registrado; resumo final com arquivos alterados, riscos e proximos passos publicado na conversa; ou pare apos 12 turnos preservando o estado.
```

## Quando nao usar

Se a demanda for uma edicao trivial que voce consegue fazer em menos tempo do que rodar preflight e delegar, avise que o executor e overkill e execute direto se o usuario quiser.

## Comunicacao

Use updates curtos:

- "preflight OK; AGY 3.5.4+ validado para front-end e analise";
- "vou dividir em 3 slices independentes";
- "lancei 3 agentes em paralelo; ownership: testes, service, front-end";
- "verificacao passou/falhou; estou integrando o ajuste final".

No fim, entregue resumo conciso com arquivos, verificacoes e riscos.
