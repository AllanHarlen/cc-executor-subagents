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

## Execucao normal

1. Rode o preflight:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs"
   ```

2. Se `status: "failed"` e a falha envolver Codex, verifique o `$ARGUMENTS` antes de cancelar: se a demanda for claramente front-end puro (UI, componente, layout, imagem, asset visual) **e nao houver plano pre-definido**, prossiga sem Codex — Codex nao e necessario para implementar tasks `UI_FRONTEND` ou `IMAGE_ASSET`. Se houver plano pre-definido, Codex high e necessario para o review read-only plano-vs-entrega; mostre `remediation` e pergunte se o usuario quer corrigir Codex, continuar assumindo o risco sem esse review, ou cancelar. Para qualquer outra natureza de task, cancele e mostre `remediation`.

3. Se `status: "failed"` e somente AGY ou o `cc-antigravity-plugin` falharem, mostre `remediation` e pergunte ao usuario se quer:

   - corrigir AGY e tentar de novo;
   - continuar so com Codex;
   - cancelar.

4. Carregue a skill:

   ```text
   Skill(skill="cc-executor-subagents:executor-subagents")
   ```

   Se a tool de Skill recusar por `disable-model-invocation: true`, leia `${CLAUDE_PLUGIN_ROOT}/skills/executor-subagents/SKILL.md` e siga diretamente.

5. Faca triagem curta da demanda. Se `$ARGUMENTS` trouxer um plano pre-definido (texto estruturado, arquivo citado, checkpoint, "siga este plano", "plano aprovado" ou equivalente), registre `plano_predefinido: true`; depois que `artefatos_dir` for definido, preserve o conteudo original em `{artefatos_dir}/initial-plan-baseline.md` e use esse baseline como fonte de verdade. Se a demanda for um review de implementacao do Orchestrador, aplique a ingestao de handoff upstream (`references/handoff-contract.md`): descubra `.orchestration/<slug>/handoff.json`, siga `upstream` ate `.pensador/<slug>-vN/handoff.json` e consolide essas fontes no baseline.

6. Decida:

   - executar direto;
   - usar 1 agente;
   - usar multiplos agentes independentes.

7. Roteie por padrao:

   - front-end/UI: `cc-antigravity-plugin:antigravity-agent`;
   - varios entregaveis AGY independentes (relatorios, componentes, arquivos sem Codex): `cc-antigravity-plugin:antigravity-agent --parallel` (fan-out nativo); adicione `--subagent-model gemini-3.5-flash-medium` para subagentes mais baratos;
   - imagem explicita: `cc-antigravity-plugin:antigravity-agent --generate-imagem`;
   - analise pura: `cc-antigravity-plugin:antigravity-agent --read-only`;
   - backend/testes/review: Codex.

8. Se usar 2+ agentes ou houver plano pre-definido, determine `artefatos_dir` a partir da demanda passada em `$ARGUMENTS`: gere um slug curto em kebab-case, use `.executor/{demanda_slug}/artefatos`, e salve no checkpoint. Exemplo: `/executor desenvolva uma pagina clientes` fica `.executor/desenvolva-pagina-clientes/artefatos`. Se a pasta ja existir, acrescente o primeiro sufixo livre (`-n2`, `-n3`, ...). Artefatos obrigatorios desta fase:

   ```text
   {artefatos_dir}/initial-plan-baseline.md (somente se houver plano pre-definido)
   {artefatos_dir}/execution-brief.md     (plano de slices/waves — use assets/plan-template.md)
   {artefatos_dir}/interface-contract.md  (somente para full-stack com shape de API novo — use references/contracts.md)
   {artefatos_dir}/monitoring.md          (fonte viva de eventos — use assets/monitoring-template.md)
   ```

   Mantenha `{artefatos_dir}/monitoring.md` atualizado durante as Fases 4-8: status por task, log com timestamp, SLOW_CHECKIN quando agente demorar, e politica de cota conforme tipo de agente e fase. **Nunca crie artefatos .md na raiz do projeto.**

9. Delegue em paralelo por ownership, nao por dupla fixa.

10. Integre e rode verificacoes.

11. Se `plano_predefinido: true`, execute a **Fase 6.5 - Review plano vs entrega**: use Codex high read-only para comparar `{artefatos_dir}/initial-plan-baseline.md` com o diff e os arquivos gerados. Salve o parecer em `{artefatos_dir}/plan-vs-output-review.md`; se houver desalinhamento, corrija ou registre o bloqueio antes de fechar.

12. **Fase 9 - Relatorio final:** para execucoes com 2+ agentes, risco MEDIUM/HIGH, plano pre-definido ou rastreabilidade solicitada, gere em `{artefatos_dir}/`:

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
