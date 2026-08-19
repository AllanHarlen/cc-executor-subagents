# Changelog

## [1.1.0] — 2026-08-19

### Correção crítica: implementação de front-end apontava para o subagente read-only do AGY

O Orquestrador (`cc-orchestrador-subagents`) corrigiu este mesmo bug na sua versão 3.5.0: todo o roteamento de implementação/imagem/fan-out do Executor apontava para `cc-antigravity-plugin:antigravity-agent`, que é **somente leitura** (análise, planejamento, review) — quem escreve arquivo é `cc-antigravity-plugin:antigravity-coder`. O Executor nunca recebeu essa correção porque ficou 4 releases atrás do Orquestrador.

- **`antigravity-coder` agora é o subagente de implementação** em `references/agent-stack.md`, `references/subagent-prompts.md` (§3 UI/front-end, §7 imagem/asset, §8 fan-out paralelo), `references/parallelization.md`, `SKILL.md` e `commands/executor.md`. `antigravity-agent` permanece exclusivo para análise cross-file/review (§6, `--read-only`).
- **`scripts/preflight.mjs` agora valida a presença dos dois arquivos de agente** (`agents/antigravity-coder.md` e `agents/antigravity-agent.md`) na versão instalada do `cc-antigravity-plugin`, espelhando a validação já existente no Orquestrador — evita que um plugin desatualizado passe silenciosamente no preflight.
- Regra explícita adicionada em "Regras de segurança operacional" do `SKILL.md`: nunca delegar implementação para `antigravity-agent`.

### Correção crítica: modo conjunto Orchestrador → Executor estava rompido pelo layout 2

O Orquestrador 4.1.0 reorganizou o diretório da run por estágio e moveu o manifesto de handoff de `.orchestration/<slug>/handoff.json` para `.orchestration/<slug>/report/handoff.json`. O Executor continuava procurando só o caminho antigo — sem erro, ele simplesmente não encontrava o manifesto e tratava toda entrega orquestrada recente como demanda avulsa, perdendo baseline, contrato e design.

- **Descoberta tolerante ao layout**, em `SKILL.md`, `references/workflow.md` e `commands/executor.md`: tenta `report/handoff.json` (layout 2) primeiro, cai para `handoff.json` (layout 1) quando ausente, e registra qual caminho respondeu em `plano_predefinido_fonte`.
- O fallback sem manifesto também foi atualizado: `report/implementation-report.md` + `plan/tasks-classification.md` + `plan/waves.md` + `contracts/`, com fallback para os mesmos nomes na raiz quando o layout 2 não existe.
- O `handoff.json` que o próprio Executor emite agora aponta `upstream` para o caminho que de fato respondeu na ingestão, não para um caminho fixo.

### `handoff-contract.md` ressincronizado, byte-idêntico nos três plugins

O documento se declara "idêntico nos três plugins" desde sempre, mas a cópia do Executor estava 52 linhas atrás da versão real (faltavam a seção "Modos de operação" do 3.3.0 e "Open Design: contrato visual e materialização" do 3.2.x). Copiado verbatim da versão canônica (`cc-orchestrador-subagents`, agora também espelhada em `cc-pensador`). `test/handoff-contract-sync.test.js` do `cc-pensador` — que verifica essa promessa e ficava com 2 skips em checkout isolado — passa a cobrir de fato num workspace com os três repositórios lado a lado.

### Stack de agentes configurável (Project_Config compartilhada)

O preflight exigia `codex` **e** `agy` sempre, contornado por perguntas ad-hoc de fallback na Fase 0 quando uma CLI faltava. Agora o Executor lê a mesma **Project_Config** do Orquestrador — `.orchestrator/project-config.md`, quatro papéis (`backendExecutor`, `frontendExecutor`, `backendReviewer`, `frontendReviewer`), cada um `codex`, `agy` ou `claude-code` — via os módulos compartilhados `scripts/lib/project-config.mjs` e `scripts/lib/dependency-plan.mjs` (copiados verbatim do Orquestrador). Executor e Orquestrador rodando no mesmo projeto compartilham a mesma configuração; uma run do `/orquestrador` que já resolveu a Project_Config é herdada pelo `/executor` sem repetir as quatro perguntas.

- Novos papéis mapeados ao vocabulário do Executor em `references/project-config.md`: `backendExecutor` decide `BUG`/`REFACTOR`/`TEST_FIX`/`DOCS`/fatia back-end; `frontendExecutor` decide `UI_FRONTEND`/`IMAGE_ASSET`/fatia front-end; `backendReviewer` decide o review Codex high da Fase 6.5/risco `HIGH`; `frontendReviewer` decide o review de fatia UI.
- Nova CLI `scripts/project-config.mjs` (`show`, `write`, `validate`, `required-clis`), cópia fina do CLI do Orquestrador.
- `scripts/preflight.mjs` reescrito: `checks` agora expõe `config["project-config"]`, `cli`, `plugins`, `permissions`, `capabilities` e `optional.mcp`/`optional.permissions`; `failed`/`warnings` são derivados do Required_CLI_Set da Project_Config (`codex` obrigatória sse algum papel usa `codex`; `agy` idem) em vez de uma lista fixa. Com os quatro papéis em `claude-code`, `/executor` roda com `status: "ok"` e `failed: []` sem nenhuma CLI externa instalada.
- Fase 0 do `SKILL.md` reestruturada em 0.1 (preflight) / 0.2 (resolução da Project_Config, quatro perguntas só quando o arquivo está ausente) / 0.3 (Dependency_Installer: uma pergunta `AskUserQuestion` por dependência ausente, com opção de trocar o papel afetado para `claude-code` quando o usuário recusa uma CLI obrigatória).

### Protocolo de MCP: Context7 e Codebase Memory

- **Context7:** `references/agent-stack.md` ganha a ordem obrigatória — resolver o identificador da biblioteca antes de pedir documentação, mesmo quando "já conhecido" de uma consulta anterior na mesma execução — e a regra de que a chave de API nunca entra em prompt, artefato ou checkpoint.
- **Codebase Memory (novo, opcional):** `scripts/preflight.mjs` ganha `checks.optional.mcp.codebase-memory` (mesma heurística de detecção do Context7: CLI no PATH, skill instalada, ou menção em `.mcp.json` conhecido); `scripts/lib/dependency-plan.mjs` já sabe oferecer a instalação quando ausente. Uso documentado na Fase 1 (triagem): `search_graph`/`trace_path` para localizar owner e raio de impacto mais barato que `Grep`/`Glob` isolados — resultado de grafo é pista, confirmado por leitura do arquivo antes de fixar ownership.

### Endurecimento do review Codex plano-vs-entrega (Fase 6.5)

Regras que o Orquestrador já aplicava desde o 3.5.0, agora também no prompt `2.1 Codex review plano vs entrega high` e no review geral (`2. Codex review high`) de `references/subagent-prompts.md`:

- `// TODO`, `NotImplementedException`, placeholder ou stub no caminho de um requisito do plano/demanda é achado **BLOQUEANTE**, nunca "lacuna conhecida".
- Em fatia de UI: elemento interativo sem `:hover`/`:focus` reais via CSS é achado bloqueante quando o plano exige esses estados — `style={{}}` inline não expressa pseudo-classe. Refletido também no prompt de implementação AGY (§3), nos "Estados obrigatórios".

### Verificação em navegador real, proporcional à fatia (Fase 6)

`build`/`tsc`/`curl` não detectam CORS ausente, resolução de tenant/host feita a partir do browser, mismatch de casing na resposta, nem "200 mas silenciosamente quebrado" — a mesma classe de defeito que motivou a Fase 9.5 do Orquestrador (3.4.0). Regra proporcional adicionada à Fase 6 do `SKILL.md`: quando a fatia toca front-end que chama back-end em origem separada, dirigir o fluxo alterado (não a app inteira) num navegador real antes de reportar concluído; sem ferramenta de navegador, reportar `PARTIAL` com a limitação registrada.

### Intelligence determinística: `validate-task-scope.mjs` e `inspect-diff.mjs`

Dois scripts novos e independentes do state engine do Orquestrador (o Executor não tem `state.json`; escopo é passado via `--allowed`, não lido de um modelo de tasks persistido):

- `scripts/validate-task-scope.mjs` — compara arquivos alterados (`git diff`/`ls-files --others`) contra os padrões de ownership de uma fatia, mecanizando o passo 2 da Fase 5 ("verifique se houve toque fora do ownership").
- `scripts/inspect-diff.mjs` — estatísticas de diff + sinalização mecânica de risco (migration, lockfile, auth/tenancy, arquivo sensível, possível segredo, TODO novo, artefato de debug).

Wired na Fase 5 do `SKILL.md` e do `references/workflow.md`, para uso quando houver 3+ agentes ou ownership complexo.

### Regras de fechamento da contagem de tokens

`assets/workflow-log-template.md`, `assets/subagents-context-template.md` e `assets/implementation-report-template.md` ganham as regras explícitas do Orquestrador 4.1.0: dado não reportado é `N/A` e nunca `0`; agente que não executou fica `N/A` na linha inteira; com `--parallel` o total do AGY já é o agregado da sessão; rodada de review repetida soma na mesma linha com a contagem de rodadas; as tabelas de todos os relatórios precisam fechar no mesmo total.

## [1.0.0] — 2026-07-13

Primeira versão publicada: skill `executor-subagents`, comando `/executor`, contrato de handoff com Pensador/Orquestrador, e workflow rápido de 9 fases sem cerimônia OpenSpec.
