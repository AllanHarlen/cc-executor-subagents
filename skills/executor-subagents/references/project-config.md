# Configuracao de stack do projeto

A stack de agentes nao e constante. Os quatro papeis abaixo formam a **Project_Config** do projeto e decidem quem implementa, quem revisa e quais CLIs sao obrigatorias no preflight:

| Papel | Decide | Default |
|---|---|---|
| `backendExecutor` | tasks `BUG`, `REFACTOR`, `TEST_FIX`, `DOCS` e a fatia back-end de `FEATURE_SLICE` | `codex` |
| `frontendExecutor` | tasks `UI_FRONTEND`, `IMAGE_ASSET` e a fatia front-end de `FEATURE_SLICE` | `agy` |
| `backendReviewer` | review back-end (`review/review-final.md`), review plano-vs-entrega (Fase 6.5) e tasks `REVIEW` | `codex` |
| `frontendReviewer` | review front-end (`review/review-frontend.md`) | `agy` |

Valores permitidos por papel: `codex`, `agy`, `claude-code`. A configuracao e persistida em `.executor/project-config.md` (arquivo Markdown versionavel) e lida por `scripts/lib/project-config.mjs`, que e a fonte da verdade de perguntas, defaults, CLIs exigidas e roteamento derivado.

## Quando a coleta acontece

Diferente do fluxo de projeto complexo do Orchestrador, o Executor **nao** faz as quatro perguntas no inicio de toda execucao — isso custaria caro no caminho rapido. A Fase 0 apenas le a Project_Config se ela existir e aplica os defaults em silencio se nao existir. As perguntas so aparecem em dois casos:

1. o usuario roda `/executor project-config` explicitamente;
2. o preflight reprova uma CLI/plugin que a configuracao vigente exige.

Se `.executor/project-config.md` ja existe e e valido, carregue a configuracao e **nao repita as quatro perguntas**. Se o arquivo existe e e invalido, o preflight falha: apresente o erro do parser e a remediacao de corrigir ou remover o arquivo, sem sobrescreve-lo.

```bash
node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" show --root .
node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" write --root . \
  --backend-executor codex --frontend-executor agy \
  --backend-reviewer codex --frontend-reviewer agy
```

## As quatro perguntas

Apresente nesta ordem, uma pergunta por papel, cada opcao anunciando o papel do agente e a CLI que aquela escolha exige. Marque a opcao default como recomendada, e o **valor vigente** (quando `/executor project-config` reconfigura uma stack ja gravada) como opcao inicial.

### 1. `backendExecutor` — "Qual agente implementa as tasks de back-end?"

Executor das tasks de backend, testes, refactor localizado e da fatia back-end das tasks `FEATURE_SLICE` full-stack.

| Opcao | Default | CLI exigida | Descricao |
|---|---|---|---|
| `codex` | sim | `codex` | Codex implementa as tasks de back-end, testes e integracao. Exige a CLI `codex` instalada e autenticada. |
| `claude-code` | - | nenhuma | Claude Code implementa as tasks de back-end, testes e integracao. Nao exige CLI externa: a execucao vai para um subagente do proprio Claude Code. |

### 2. `frontendExecutor` — "Qual agente implementa as tasks de front-end?"

Executor das tasks `UI_FRONTEND`, `IMAGE_ASSET` e da fatia front-end das tasks `FEATURE_SLICE`.

| Opcao | Default | CLI exigida | Descricao |
|---|---|---|---|
| `agy` | sim | `agy` | Antigravity (AGY) implementa as tasks de front-end e assets visuais. Exige a CLI `agy` instalada e autenticada. |
| `claude-code` | - | nenhuma | Claude Code implementa as tasks de front-end e assets visuais. Nao exige CLI externa: a execucao vai para um subagente do proprio Claude Code. |

### 3. `frontendReviewer` — "Qual agente faz o review de front-end?"

Revisor do resultado front-end, registrado em `review/review-frontend.md`.

| Opcao | Default | CLI exigida | Descricao |
|---|---|---|---|
| `agy` | sim | `agy` | Antigravity (AGY) revisa o resultado front-end. Exige a CLI `agy` instalada e autenticada. |
| `codex` | - | `codex` | Codex revisa o resultado front-end. Exige a CLI `codex` instalada e autenticada. Sobrepoe a politica padrao de review front-end pelo AGY. |
| `claude-code` | - | nenhuma | Claude Code revisa o resultado front-end. Nao exige CLI externa: o review vai para um subagente do proprio Claude Code, em modo read-only. |

### 4. `backendReviewer` — "Qual agente faz o review de back-end e o review plano-vs-entrega?"

Revisor do resultado back-end e do review plano-vs-entrega (Fase 6.5), registrado em `review/review-final.md` e `review/plan-vs-output-review.md`.

| Opcao | Default | CLI exigida | Descricao |
|---|---|---|---|
| `codex` | sim | `codex` | Codex revisa o resultado back-end e compara plano-vs-entrega. Exige a CLI `codex` instalada e autenticada. |
| `agy` | - | `agy` | Antigravity (AGY) revisa o resultado back-end e compara plano-vs-entrega. Exige a CLI `agy` instalada e autenticada. |
| `claude-code` | - | nenhuma | Claude Code revisa o resultado back-end e compara plano-vs-entrega. Nao exige CLI externa: o review vai para um subagente do proprio Claude Code, em modo read-only. |

## Defaults e marca `default-aplicado`

Papel sem resposta — usuario encerrou a coleta, pulou a pergunta ou respondeu vazio — recebe o default da tabela de papeis e e registrado na secao `## Notas` do arquivo:

```markdown
## Notas

- frontendReviewer: default-aplicado
```

A marca e informativa e nao altera roteamento: o papel vale como se tivesse sido escolhido. Nunca invente valor fora de `codex`/`agy`/`claude-code` e nunca deixe papel em branco no arquivo.

## Roteamento derivado

Tipo de trabalho + Project_Config = Executor. Nao use "parece front-end" ou "o outro agente consegue" como criterio.

| Tipo de trabalho | Papel que decide | Executor |
|---|---|---|
| `BUG` | `backendExecutor` | valor configurado |
| `REFACTOR` | `backendExecutor` | valor configurado |
| `TEST_FIX` | `backendExecutor` | valor configurado |
| `DOCS` | `backendExecutor` | valor configurado |
| `UI_FRONTEND` | `frontendExecutor` | valor configurado |
| `IMAGE_ASSET` | `frontendExecutor` | valor configurado |
| `REVIEW` | `backendReviewer` | valor configurado |
| `FEATURE_SLICE` | `backendExecutor` + `frontendExecutor` | fatia back-end e fatia front-end |

Required_CLI_Set: `codex` e obrigatoria se e somente se ao menos um dos quatro papeis e `codex`; `agy` e obrigatoria se e somente se ao menos um papel e `agy`. Com os quatro papeis em `claude-code`, nenhuma CLI externa e obrigatoria e o fluxo roda inteiro sobre subagentes do Claude Code.

## Protocolo do Dependency_Installer

Depois que a Project_Config esta resolvida e o preflight rodou com ela, monte a lista de dependencias ausentes: os MCPs opcionais ausentes (Context7_MCP, depois Codebase_Memory_MCP — `MCP_CHECK_KEYS` do catalogo) e, para cada CLI do Required_CLI_Set, a CLI (quando `checks.cli.*` reprova) seguida do plugin do Claude Code que a conecta (quando `checks.plugins.*` reprova). MCPs primeiro, depois CLI+plugin por CLI, na ordem `codex` antes de `agy`.

Este passo roda sempre, na Fase 0, mesmo quando o preflight nao reprova nenhum item **obrigatorio** — MCP ausente nunca aparece em `failed`, so em `warnings`, e sem esta etapa o Executor nunca ofereceria a instalacao. Ver `references/workflow.md` Fase 0.

**A CLI sozinha nao basta.** `codex` e `agy` sao processos externos; e o plugin do Claude Code — `openai-codex` para `codex`, `cc-antigravity-plugin` para `agy` — que registra os agentes e comandos pelos quais o Executor invoca aquele processo. As duas reprovacoes sao **independentes**: um ambiente pode ter a CLI instalada e autenticada com o plugin ainda ausente (ou vice-versa), e o plano so oferece o que de fato esta faltando — nunca assume que aprovar uma implica a outra.

**Uma pergunta `AskUserQuestion` por dependencia**, com as opcoes `instalar` e `seguir sem instalar`. Nunca agrupe dependencias numa pergunta so e nunca execute comando antes de o usuario responder `instalar` para aquela dependencia.

Cada pergunta informa quatro coisas: nome da dependencia, beneficio, impacto de seguir sem ela e o comando que sera executado.

| Dependencia | Beneficio | Impacto de seguir sem | Comando |
|---|---|---|---|
| `context7` (opcional) | documentacao atual e versionada da biblioteca injetada no contexto antes de escrever codigo que a usa | o subagente segue apenas os padroes do projeto e a memoria do modelo, com risco de API obsoleta | `npx ctx7 setup --claude` (alternativa: registrar manualmente a URL `https://mcp.context7.com/mcp`) |
| `codebase-memory` (opcional) | grafo de codigo para localizar simbolos (Fase 1) e mapear o raio de impacto do diff (Fase 5) mais barato em tokens que varrer arquivos | Fase 1 usa Read/Glob/Grep e Fase 5 usa `inspect-diff.mjs`/`rg` — mais lento em bases de codigo grandes | instalador oficial do Codebase Memory para o SO detectado |
| CLI `codex` (obrigatoria quando algum papel e `codex`) | executor/revisor dos papeis configurados como `codex` | as tasks desses papeis ficam sem executor | `npm install -g @openai/codex` |
| plugin `openai-codex` (obrigatoria junto com a CLI `codex`) | da ao Claude Code os agentes/comandos para invocar o Codex | a CLI `codex` instalada nao basta: o Claude Code nao consegue delegar as tasks desses papeis | `/plugin marketplace add openai/codex-plugin-cc` seguido de `/plugin install codex@openai-codex` |
| CLI `agy` (obrigatoria quando algum papel e `agy`) | executor/revisor dos papeis configurados como `agy` | as tasks desses papeis ficam sem executor | instalador oficial do Antigravity para o SO detectado |
| plugin `cc-antigravity-plugin` (obrigatoria junto com a CLI `agy`) | da ao Claude Code os agentes/comandos para invocar o Antigravity | a CLI `agy` instalada nao basta: o Claude Code nao consegue delegar as tasks desses papeis | `claude plugin install AllanHarlen/cc-antigravity-plugin` |

O catalogo canonico dos comandos por SO esta em `scripts/lib/dependency-plan.mjs`; use `buildMissingDependencies(report, { platform })` em vez de reescrever comandos no prompt. `CLI_PLUGIN_KEY` do mesmo modulo e o mapeamento canonico `codex → openai-codex`, `agy → cc-antigravity-plugin` — as mesmas chaves que `checks.plugins` do preflight usa, para nao haver traducao paralela.

Passos interativos ficam com o usuario, nunca na sequencia automatica:

- `codex login` exige execucao interativa do usuario depois da instalacao da CLI `codex`.
- A autenticacao do AGY exige abrir `agy` uma vez, tambem em execucao interativa.
- Comandos de plugin (`/plugin ...`, `claude plugin install ...`) rodam dentro de uma sessao do Claude Code, nunca em um shell externo — nao tente executa-los via processo.
- Depois de instalar um MCP, o agente de codigo precisa ser reiniciado para carregar o servidor.

### Exit code diferente de zero

Se um comando de instalacao termina com codigo diferente de zero:

1. registre o codigo de saida e a ultima linha de erro;
2. apresente a remediacao manual (comando alternativo, instalacao pelo pacote da release, docs oficiais);
3. pergunte ao usuario, por `AskUserQuestion`, se ele quer tentar novamente, seguir sem a dependencia ou encerrar.

Nao repita a instalacao em loop, nao tente comando nao documentado e nao prossiga para a proxima dependencia sem a decisao do usuario.

### Recusa de CLI obrigatoria

`seguir sem instalar` em dependencia **opcional** (MCP): registre a limitacao no relatorio final e prossiga com o workflow.

`seguir sem instalar` em CLI do **Required_CLI_Set**: o workflow nao pode seguir como esta. Ofereca por `AskUserQuestion`:

- **trocar o papel para `claude-code`** — nomeie os papeis afetados (`rolesByCli` do plano de dependencias), regrave o Project_Config_File com os novos valores, rode o preflight novamente e siga; ou
- **encerrar o comando** — nenhuma execucao e iniciada.

Nunca troque o papel por conta propria, e nunca prossiga com papel apontando para CLI ausente.

### Novo preflight apos as instalacoes

Concluidos todos os comandos confirmados, rode o preflight uma vez e apresente ao usuario o novo `status`, o Required_CLI_Set efetivo, os itens reprovados e os avisos. Esse preflight e obrigatorio mesmo que todas as instalacoes tenham retornado zero — e ele que confirma que a dependencia ficou visivel para o ambiente.

O mesmo protocolo vale quando `/executor project-config` troca a configuracao: se o preflight disparado por ele reprova uma CLI do Required_CLI_Set, acione o Dependency_Installer para essa CLI, com as mesmas perguntas e o mesmo tratamento de exit code.

## Registro no relatorio final

Quando a execucao gerar `{artefatos_dir}/implementation-report.md` (Fase 9), registre na secao de preflight:

- a Project_Config efetiva, a origem (`file` ou `default`) e os papeis com `default-aplicado`;
- por dependencia instalada, exatamente `name`, `decision`, `command`, `exitCode` e `durationMs`;
- cada limitacao aceita: MCP recusado, MCP ausente por timeout, papel trocado para `claude-code` por recusa de CLI;
- o `status` do preflight.

Nunca registre stdout/stderr bruto do instalador, conteudo de arquivo de configuracao MCP, chave de API, token ou cabecalho de autenticacao. O Project_Config_File tambem nao tem campo para credencial.

`frontendReviewer: codex` merece registro explicito: a escolha sobrepoe a politica padrao de review front-end pelo AGY. Informe o usuario uma unica vez por execucao — nao repita o aviso a cada fase.
