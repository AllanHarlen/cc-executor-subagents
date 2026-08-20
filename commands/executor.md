---
description: Executar uma resolucao rapida multiagente sem OpenSpec, dividindo a demanda em fatias independentes, roteando front-end e imagem para AGY e backend/testes/review para Codex, integrando e verificando.
argument-hint: "<demanda de resolucao rapida>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Agent, TaskCreate, TaskUpdate, TaskList, Skill
---

# /executor

Inicia o **Executor Subagents** para resolver a demanda descrita em `$ARGUMENTS`.

Este comando substitui o antigo fluxo de orquestrador pesado. Ele nao cria OpenSpec e nao trabalha por duplas fixas. Quando a demanda ja trouxer um plano pre-definido, preserve esse plano como baseline e rode review Codex high comparando o plano inicial com a entrega gerada. Fora desse caso, o foco e resolver rapido com um mix pragmatico de execucao direta e subagentes independentes.

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

## Modo project-config

Se o primeiro argumento for `project-config`, este ramo substitui a execucao da demanda. Nao inicialize `artefatos_dir`, nao crie checkpoint nem delegue agentes.

1. Mostre a configuracao vigente e a origem (`file` = `.executor/project-config.md`; `default` = `codex`/`agy`/`codex`/`agy`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/project-config.mjs" show --root "."
   ```

2. Se `show` retornar `ok: false` com erro do parser, apresente o erro nomeando campo, valor recebido, conjunto aceito e caminho, e ofereca por `AskUserQuestion` a regravacao do arquivo a partir de novas respostas. Nao sobrescreva o arquivo sem confirmacao explicita.

3. Apresente as quatro perguntas de `AskUserQuestion` (`backendExecutor`, `frontendExecutor`, `frontendReviewer`, `backendReviewer`) com o texto, as descricoes de papel e a CLI exigida por opcao de `references/project-config.md`, marcando o **valor vigente** de cada papel como default.

4. Grave as respostas. Papel sem resposta entra em `--default-applied`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/project-config.mjs" write --root "." \
     --backend-executor "<codex|agy|claude-code>" \
     --frontend-executor "<codex|agy|claude-code>" \
     --backend-reviewer "<codex|agy|claude-code>" \
     --frontend-reviewer "<codex|agy|claude-code>" \
     --default-applied "<papel,papel>"
   ```

5. Rode o preflight uma vez, sempre, inclusive quando `changed` vier vazio:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs"
   ```

6. Se o preflight ainda reprovar uma CLI obrigatoria ou o plugin que a conecta, mostre a `remediation` e pergunte se o usuario quer corrigir a dependencia ou trocar o papel de novo. Depois disso encerre o comando; nenhuma execucao e iniciada.

## Modo resume

Se o primeiro argumento for `resume`, este ramo substitui o inicio de uma execucao nova. Trate o segundo argumento, quando presente, como o `artefatos_dir` explicito a retomar; sem ele, o comando resolve a execucao ativa sozinho.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/executor-state.mjs" resume [--dir <artefatos_dir>]
```

Sem `--dir`, `resume` le `execucao_atual` do indice (`.executor/checkpoint.json`) para achar a execucao ativa. Se nao houver nenhuma (`RUN_NOT_FOUND`), informe o erro e encerre sem iniciar uma execucao nova implicitamente.

O comando faz: reparo de tail de evento incompleto -> replay -> qualquer task `RUNNING` interrompida vira `UNKNOWN` (nunca `FAILED`/`DONE` presumido) -> reconciliacao contra Git/arquivos/validacoes -> devolve `resumeFromPhase`, `unknownTasks`, `pendingExternalProbes`, `recommendations` e `projectConfigDrift`.

Para cada task em `pendingExternalProbes`, correlacione pelo `sessionId` (Codex) ou `conversationId` (AGY) com a capacidade de status/retomada do subagente instalado. Se a integracao nao expuser status autoritativo, mantenha `UNKNOWN` e trate Git/arquivos/validacoes como corroboracao, nunca como prova isolada de sucesso — grave um probe file (formato em `references/persistent-state.md`) e rode `executor-state.mjs reconcile --dir <artefatos_dir> --probe-file <path>` antes de decidir reexecutar.

Nao redelegue uma task `UNKNOWN` sem antes confirmar que a sessao/conversa anterior nao segue ativa. Se `projectConfigDrift.changed` for `true`, informe a diferenca papel a papel ao usuario antes de continuar — a Fase 1.2 do port so reporta o drift, nao o aplica automaticamente.

Depois de reconciliar, carregue a skill e continue exatamente de `resumeFromPhase`, pulando as fases ja concluidas. Nao trate `resume` como uma demanda nova: nao rode a Fase 1 (triagem) nem redefina `artefatos_dir`.

## Execucao normal

1. Rode o preflight:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs"
   ```

   O preflight deriva a obrigatoriedade de `codex`/`agy` e seus plugins da Project_Config (`.executor/project-config.md`). Sem arquivo, usa o default `codex`/`agy`/`codex`/`agy`. Nao ha mais excecao ad-hoc por tipo de demanda: a obrigatoriedade vem inteira da configuracao.

2. Se `status: "failed"`, mostre `remediation` e pergunte ao usuario se quer:

   - corrigir a CLI/plugin ausente e tentar de novo;
   - trocar o papel afetado para `claude-code` (`node "${CLAUDE_PLUGIN_ROOT}/scripts/project-config.mjs" write --backend-executor claude-code ...` ou o papel equivalente), rodar o preflight de novo e deixar o Executor (Claude) assumir essas tasks diretamente;
   - cancelar.

3. Carregue a skill:

   ```text
   Skill(skill="cc-executor-subagents:executor-subagents")
   ```

   Se a tool de Skill recusar por `disable-model-invocation: true`, leia `${CLAUDE_PLUGIN_ROOT}/skills/executor-subagents/SKILL.md` e siga diretamente.

4. Faca triagem curta da demanda. Se `$ARGUMENTS` trouxer um plano pre-definido (texto estruturado, arquivo citado, checkpoint, "siga este plano", "plano aprovado" ou equivalente), registre `plano_predefinido: true`; depois que `artefatos_dir` for definido, preserve o conteudo original em `{artefatos_dir}/initial-plan-baseline.md` e use esse baseline como fonte de verdade. Se a demanda for um review de implementacao do Orchestrador, aplique a ingestao de handoff upstream (`references/handoff-contract.md`): descubra `.orchestration/<slug>/handoff.json`, siga `upstream` ate `.pensador/<slug>-vN/handoff.json` e consolide essas fontes no baseline.

5. Decida:

   - executar direto;
   - usar 1 agente;
   - usar multiplos agentes independentes.

6. Roteie pelo papel efetivo na Project_Config (`frontendExecutor`/`backendExecutor`, default `agy`/`codex`), nao por uma regra fixa:

   - front-end/UI: `frontendExecutor` (default `cc-antigravity-plugin:antigravity-agent`; `claude-code` delega a um subagente Task do proprio Claude);
   - varios entregaveis AGY independentes (relatorios, componentes, arquivos sem Codex), quando `frontendExecutor` for AGY: `cc-antigravity-plugin:antigravity-agent --parallel` (fan-out nativo); adicione `--subagent-model gemini-3.5-flash-medium` para subagentes mais baratos;
   - imagem explicita, quando `frontendExecutor` for AGY: `cc-antigravity-plugin:antigravity-agent --generate-imagem`;
   - analise pura, quando `frontendExecutor` for AGY: `cc-antigravity-plugin:antigravity-agent --read-only`;
   - backend/testes/review: `backendExecutor`/`backendReviewer` (default Codex; `claude-code` delega a um subagente Task do proprio Claude).

7. Se usar 2+ agentes ou houver plano pre-definido, determine `artefatos_dir` a partir da demanda passada em `$ARGUMENTS`: gere um slug curto em kebab-case, use `.executor/{demanda_slug}/artefatos`, e salve no checkpoint. Exemplo: `/executor desenvolva uma pagina clientes` fica `.executor/desenvolva-pagina-clientes/artefatos`. Se a pasta ja existir, acrescente o primeiro sufixo livre (`-n2`, `-n3`, ...). Artefatos obrigatorios desta fase:

   ```text
   {artefatos_dir}/initial-plan-baseline.md (somente se houver plano pre-definido)
   {artefatos_dir}/execution-brief.md     (plano de slices/waves — use assets/plan-template.md)
   {artefatos_dir}/interface-contract.md  (somente para full-stack com shape de API novo — use references/contracts.md)
   {artefatos_dir}/monitoring.md          (fonte viva de eventos — use assets/monitoring-template.md)
   ```

   Mantenha `{artefatos_dir}/monitoring.md` atualizado durante as Fases 4-8: status por task, log com timestamp, SLOW_CHECKIN quando agente demorar, e politica de cota conforme tipo de agente e fase. **Nunca crie artefatos .md na raiz do projeto.**

8. Delegue em paralelo por ownership, nao por dupla fixa.

9. Integre e rode verificacoes.

10. Se `plano_predefinido: true`, execute a **Fase 6.5 - Review plano vs entrega**: use Codex high read-only para comparar `{artefatos_dir}/initial-plan-baseline.md` com o diff e os arquivos gerados. Salve o parecer em `{artefatos_dir}/plan-vs-output-review.md`; se houver desalinhamento, corrija ou registre o bloqueio antes de fechar.

11. **Fase 9 - Relatorio final:** para execucoes com 2+ agentes, risco MEDIUM/HIGH, plano pre-definido ou rastreabilidade solicitada, gere em `{artefatos_dir}/`:

   ```text
   {artefatos_dir}/workflow-log.md
   {artefatos_dir}/subagents-context.md
   {artefatos_dir}/implementation-report.md
   {artefatos_dir}/handoff.json
   {artefatos_dir}/plan-vs-output-review.md (somente se houver plano pre-definido)
   ```

   Use os templates em `${CLAUDE_PLUGIN_ROOT}/skills/executor-subagents/assets/`. O `implementation-report.md` deve incluir o resultado do review plano-vs-entrega quando houver plano pre-definido e a secao 14 com instrucoes de negocio quando houver contexto de negocio real (o que mudou, como homologar, regras, impactos operacionais e proximo passo recomendado).

## /goal autonomo

Quando o usuario pedir autonomia, use:

```text
/goal Execute a skill cc-executor-subagents:executor-subagents para: <demanda>. Condicao de conclusao: preflight OK; escopo rapido definido; agentes independentes lancados ou decisao documentada de execucao direta; patches integrados; testes/verificacoes executados ou impedimento registrado; resumo final com arquivos alterados, riscos e proximos passos publicado na conversa; ou pare apos 12 turnos preservando o estado.
```

## Quando nao usar

Se a demanda for uma edicao trivial que voce consegue fazer em menos tempo do que rodar preflight e delegar, avise que o executor e overkill e execute direto se o usuario quiser.

## Comunicacao

Use updates curtos:

- "preflight OK; AGY 3.6.0+ validado para front-end, fan-out nativo e analise";
- "vou dividir em 3 slices independentes";
- "lancei 3 agentes em paralelo; ownership: testes, service, front-end";
- "verificacao passou/falhou; estou integrando o ajuste final".

No fim, entregue resumo conciso com arquivos, verificacoes e riscos.
