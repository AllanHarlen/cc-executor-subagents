# Configuracao de stack do projeto

A stack de agentes nao e constante. Os quatro papeis abaixo formam a **Project_Config** do projeto e decidem quem implementa e quem revisa cada tipo de trabalho no `/executor`:

| Papel | Decide no Executor | Default |
|---|---|---|
| `backendExecutor` | tasks `BUG`, `REFACTOR`, `TEST_FIX`, `DOCS` e a fatia back-end de `FEATURE_SLICE` | `codex` |
| `frontendExecutor` | tasks `UI_FRONTEND`, `IMAGE_ASSET` e a fatia front-end de `FEATURE_SLICE` | `agy` |
| `backendReviewer` | review Codex high da Fase 6.5 (plano vs entrega) e review de risco `HIGH` | `codex` |
| `frontendReviewer` | review de fatia UI/front-end | `agy` |

Valores permitidos por papel: `codex`, `agy`, `claude-code`. **Este e o mesmo arquivo e o mesmo modulo do `cc-orchestrador-subagents`** — `.orchestrator/project-config.md` (Markdown versionavel), lido por `scripts/lib/project-config.mjs`. Executor e Orchestrador rodam no mesmo projeto; ler o mesmo arquivo evita duas configuracoes concorrentes e faz o modo conjunto (Orchestrador → Executor) herdar a configuracao em vez de perguntar de novo.

## Ordem da Fase 0

A coleta vem **antes** de qualquer oferta de instalacao:

```text
0.1  preflight            -> projectConfig.source = default
0.2  configuracao         -> AskUserQuestion x4 -> grava .orchestrator/project-config.md
0.2b preflight            -> projectConfig.source = file, Required_CLI_Set efetivo
0.3  instalacao assistida -> uma pergunta por dependencia ausente
0.3b preflight            -> novo status apresentado ao usuario
```

Se `.orchestrator/project-config.md` ja existe e e valido (por exemplo, gravado por uma run anterior do `/orquestrador` no mesmo projeto), carregue a configuracao e **nao repita as quatro perguntas**; siga direto para a lista de dependencias ausentes. Se o arquivo existe e e invalido, o preflight falha: apresente o erro do parser e a remediacao de corrigir ou remover o arquivo, sem sobrescreve-lo.

```bash
node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" show --root .
node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" write --root . \
  --backend-executor codex --frontend-executor agy \
  --backend-reviewer codex --frontend-reviewer agy
```

## As quatro perguntas

Apresente nesta ordem, uma pergunta por papel, cada opcao anunciando o papel do agente e a CLI que aquela escolha exige. Marque a opcao default como recomendada. As descricoes de papel usam o vocabulario do Executor (tasks rapidas), nao o do Orquestrador (ondas/contratos) — mas os valores e o arquivo sao os mesmos.

### 1. `backendExecutor` — "Qual agente implementa as tasks de back-end?"

Executor de `BUG`, `REFACTOR`, `TEST_FIX`, `DOCS` e da fatia back-end de `FEATURE_SLICE`.

| Opcao | Default | CLI exigida | Descricao |
|---|---|---|---|
| `codex` | sim | `codex` | Codex implementa as tasks de back-end. Exige a CLI `codex` instalada e autenticada. |
| `claude-code` | - | nenhuma | O proprio Executor (Claude) implementa as tasks de back-end, sem CLI externa. |

### 2. `frontendExecutor` — "Qual agente implementa as tasks de front-end?"

Executor de `UI_FRONTEND`, `IMAGE_ASSET` e da fatia front-end de `FEATURE_SLICE`.

| Opcao | Default | CLI exigida | Descricao |
|---|---|---|---|
| `agy` | sim | `agy` | Antigravity (AGY, via `antigravity-coder`) implementa as tasks de front-end. Exige a CLI `agy` instalada e autenticada. |
| `claude-code` | - | nenhuma | O proprio Executor (Claude) implementa as tasks de front-end, sem CLI externa. |

### 3. `frontendReviewer` — "Qual agente revisa a fatia de front-end?"

| Opcao | Default | CLI exigida | Descricao |
|---|---|---|---|
| `agy` | sim | `agy` | Antigravity (AGY, via `antigravity-agent`, somente leitura) revisa a fatia front-end. |
| `codex` | - | `codex` | Codex revisa a fatia front-end. Sobrepoe a politica padrao de review front-end pelo AGY. |
| `claude-code` | - | nenhuma | O proprio Executor revisa a fatia front-end, em modo leitura. |

### 4. `backendReviewer` — "Qual agente faz o review Codex high (plano vs entrega / risco alto)?"

| Opcao | Default | CLI exigida | Descricao |
|---|---|---|---|
| `codex` | sim | `codex` | Codex `--effort high` revisa a Fase 6.5 e tasks de risco `HIGH`. Exige a CLI `codex` instalada e autenticada. |
| `agy` | - | `agy` | Antigravity (AGY) assume o review de back-end/risco alto. |
| `claude-code` | - | nenhuma | O proprio Executor revisa, em modo leitura. |

## Defaults e marca `default-aplicado`

Papel sem resposta recebe o default da tabela de papeis e e registrado na secao `## Notas` do arquivo, exatamente como no Orquestrador:

```markdown
## Notas

- frontendReviewer: default-aplicado
```

A marca e informativa e nao altera roteamento: o papel vale como se tivesse sido escolhido.

## Roteamento derivado

| Tipo de trabalho | Papel que decide | Executor |
|---|---|---|
| `BUG`, `REFACTOR`, `TEST_FIX`, `DOCS` | `backendExecutor` | valor configurado |
| `UI_FRONTEND`, `IMAGE_ASSET` | `frontendExecutor` | valor configurado |
| `FEATURE_SLICE` | `backendExecutor` + `frontendExecutor` | fatia back-end e fatia front-end |
| Review Fase 6.5 / risco `HIGH` | `backendReviewer` | valor configurado |
| Review de fatia UI | `frontendReviewer` | valor configurado |

Required_CLI_Set: `codex` e obrigatoria se e somente se ao menos um dos quatro papeis e `codex`; `agy` e obrigatoria se e somente se ao menos um papel e `agy`. Com os quatro papeis em `claude-code`, `/executor` roda sem nenhuma CLI externa exigida no preflight (`status: "ok"`, `failed: []`).

## Protocolo do Dependency_Installer

Depois que a Project_Config esta resolvida e o preflight rodou com ela, monte a lista de dependencias ausentes seguindo `buildMissingDependencies(report, { platform })` de `scripts/lib/dependency-plan.mjs`: Context7 (opcional) primeiro, depois cada CLI do Required_CLI_Set reprovada, seguida imediatamente do plugin do Claude Code que a conecta quando ele tambem estiver reprovado.

**Uma pergunta `AskUserQuestion` por dependencia**, com as opcoes `instalar` e `seguir sem instalar`. Nunca agrupe dependencias numa pergunta so e nunca execute comando antes de o usuario responder `instalar` para aquela dependencia.

Cada pergunta informa quatro coisas: nome da dependencia, beneficio, impacto de seguir sem ela e o comando que sera executado — os mesmos textos do catalogo de `dependency-plan.mjs` (compartilhado com o Orquestrador).

### Recusa de CLI obrigatoria

`seguir sem instalar` em CLI do Required_CLI_Set: ofereca por `AskUserQuestion`:

- **trocar o papel para `claude-code`** — regrave o Project_Config_File com o novo valor, rode o preflight novamente e siga; ou
- **cancelar a execucao**.

Nunca troque o papel por conta propria.

### Exit code diferente de zero

Se um comando de instalacao termina com codigo diferente de zero: registre o codigo e a ultima linha de erro, apresente a remediacao manual, e pergunte por `AskUserQuestion` se o usuario quer tentar de novo, seguir sem a dependencia, ou cancelar. Nao repita a instalacao em loop.

### Novo preflight apos as instalacoes

Concluidos todos os comandos confirmados, rode o preflight uma vez mais e apresente o novo `status`, o Required_CLI_Set efetivo e os itens reprovados/avisos.

## Registro no checkpoint

Registre em `.executor/checkpoint.json` (campo livre, ex.: `project_config`) a origem da Project_Config (`file`/`default`) e os papeis com `default-aplicado`, para retomada. Nunca registre stdout/stderr bruto do instalador nem credencial.

## Estabilidade durante a execucao

A configuracao lida na Fase 0 vale para toda a execucao corrente; nao releia o arquivo no meio de uma delegacao ja em andamento. Uma execucao nova (nova invocacao do `/executor`) resolve a Project_Config de novo, pegando qualquer mudanca feita entre execucoes — inclusive por uma run do `/orquestrador` no mesmo projeto.
