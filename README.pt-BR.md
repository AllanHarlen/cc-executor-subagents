# cc-executor-subagents

Plugin de Claude Code para resoluções rápidas com subagentes. Ele adiciona a skill **`executor-subagents`** e o comando **`/executor`**.

O foco mudou de "orquestrador arquitetural com OpenSpec" para **executor prático multiagente**:

- sem OpenSpec obrigatório;
- sem contratos longos por padrão;
- sem duplas fixas back-end/front-end;
- com slices independentes por ownership;
- com suporte a plano pré-definido, preservando baseline e comparando entrega final com Codex high;
- com Codex como executor padrão de backend/testes/review e Antigravity (AGY) como executor padrão de front-end/imagem/contexto largo — ambos configuráveis por projeto (ver abaixo);
- com verificação e reporte enxutos.

## Stack de agentes (Project_Config)

A stack do executor não é fixa. Quatro papéis decidem quem implementa e quem revisa, cada um configurado como `codex`, `agy` ou `claude-code`:

| Papel | Decide | Default |
|---|---|---|
| `backendExecutor` | tasks de backend/teste/refactor | `codex` |
| `frontendExecutor` | tasks de front-end/UI/imagem | `agy` |
| `backendReviewer` | review de backend + review plano-vs-entrega | `codex` |
| `frontendReviewer` | review de front-end | `agy` |

Configurar um papel como `claude-code` significa que aquele trabalho vai para um subagente do próprio Claude Code, sem exigir CLI externa. Configure com:

```bash
/executor project-config
```

ou diretamente:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-config.mjs" write \
  --backend-executor claude-code --frontend-executor claude-code \
  --backend-reviewer claude-code --frontend-reviewer claude-code
```

O preflight (`/executor preflight`) deriva quais CLIs/plugins são obrigatórios dessa configuração — com os quatro papéis em `claude-code`, nenhuma CLI externa é exigida. Ver `skills/executor-subagents/references/project-config.md`.

Quando um papel é `agy`, a implementação sempre é roteada para `cc-antigravity-plugin:antigravity-coder` (o agente com poder de escrita via bridge); `cc-antigravity-plugin:antigravity-agent` é somente leitura e serve apenas para análise de arquitetura ou review — nunca implementa. Uma task front-end pode devolver um bloco `IMAGE_SUGGESTIONS` com sugestões de imagem (hero, banners, ilustrações de empty-state); o executor apresenta essas opções ao usuário via `AskUserQuestion` antes de gerar qualquer imagem.

## Estado persistente e retomada

Cada execução ganha seu próprio `{artefatos_dir}/state.json` + `events.jsonl`, seguro contra crash (o evento é gravado com fsync antes do snapshot trocar atomicamente — um crash no meio da escrita é reparado por replay, não perdido). `.executor/checkpoint.json` é um índice leve (`execucao_atual`, `historico[]`) apontando para a execução ativa. Retome com:

```bash
/executor resume
```

Uma task `RUNNING` interrompida sempre volta como `UNKNOWN` — nunca um `FAILED`/`DONE` presumido — e é reconciliada contra Git/arquivos/validações antes de qualquer redelegação. Ver `skills/executor-subagents/references/persistent-state.md`.

## Gates proporcionais ao risco

Execuções `risco: LOW` continuam exatamente tão rápidas quanto antes — nenhum gate extra. `MEDIUM` em diante acrescenta validadores determinísticos (`inspect-diff`, `validate-scope`) e, quando escalado (`HIGH`, plano pré-definido ou modo conjunto com o Orchestrador), evidência de resultado de teste, validação de wire format, review Codex high plano-vs-entrega e — quando front-end e back-end são origens separadas — verificação E2E no navegador real (Playwright MCP). Um comando decide a lista:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/executor-gates.mjs" plan --risk MEDIUM --agent-count 2
```

Cinco gates de conclusão (`verificacao`, `review`, `e2e`, `reports`, `handoff`) precisam fechar antes de uma execução ser marcada `DONE`. Ver `skills/executor-subagents/references/persistent-state.md` e `references/programmatic-intelligence.md`.

## Quando usar

Use `/executor` para:

- corrigir bugs;
- refatorar uma área localizada;
- reparar testes;
- implementar ou ajustar front-end/UI;
- gerar mockups, banners, logos ou outros assets visuais;
- implementar uma feature slice pequena;
- ajustar endpoints/serviços/telas com escopo curto;
- investigar causa raiz enquanto outro agente prepara patch;
- rodar review rápido de risco.

Não use para edições triviais de 1-2 linhas. Nesses casos, Claude direto é mais rápido. Para mudanças arquiteturais grandes, especificação formal ou rollout complexo, use outro fluxo mais pesado.

## Como funciona

Fluxo resumido:

1. preflight leve;
2. triagem rápida da demanda;
3. decisão entre execução direta, 1 agente ou vários agentes;
4. roteamento por tipo de trabalho;
5. split por ownership de arquivos/módulos;
6. agentes independentes em paralelo;
7. integração pelo executor principal;
8. verificações proporcionais ao risco;
9. review Codex high plano-vs-entrega quando houver plano pré-definido;
10. resumo final.

Roteamento padrão:

- front-end/UI: AGY em modo agentic;
- vários entregáveis AGY independentes (relatórios, componentes): AGY com `--parallel` (fan-out nativo de subagentes Gemini; `--subagent-model` opcional para subagentes mais baratos);
- imagem/asset explícito: AGY com `--generate-image`;
- análise cross-file: AGY com `--read-only`;
- backend, testes e review: Codex.

O paralelismo pode acontecer em duas camadas: waves na camada do Claude Code (slices de domínios diferentes, ex.: AGY + Codex) ou fan-out nativo dentro de um único agente AGY (`--parallel`).

Artefatos opcionais ficam em `.executor/{slug-da-demanda}/artefatos/`:

```text
.executor/
`-- desenvolva-pagina-clientes/
    `-- artefatos/
        |-- execution-brief.md
        |-- initial-plan-baseline.md
        |-- plan-vs-output-review.md
        |-- monitoring.md
        |-- workflow-log.md
        |-- subagents-context.md
        `-- implementation-report.md
```

Eles só são criados quando ajudam, normalmente em execuções com 2+ agentes, risco médio/alto ou quando a demanda vem com plano pré-definido.

Quando o usuário passa um plano pronto (por texto, arquivo, checkpoint ou "siga este plano"), o executor preserva esse conteúdo em `initial-plan-baseline.md`, executa sobre ele e, antes de fechar, revisa e compara a entrega final contra o plano original em `plan-vs-output-review.md`.

## Pré-requisitos

Obrigatórios:

| Item | Verificar |
|---|---|
| Node.js | `node --version` |
| Codex CLI | `codex --version` |
| Antigravity CLI (`agy`) `>= 1.1.8` (`1.1.16` recomendada) | `agy --version` |
| plugin `openai-codex` | instalado no Claude Code |
| plugin `cc-antigravity-plugin` `>= 4.0.0` | instalado no Claude Code |
| permissão `Bash(node:*)` | `.claude/settings.json` |

Opcionais:

| Item | Uso |
|---|---|
| Context7 MCP | docs atuais de libs/frameworks/APIs |
| Codebase Memory MCP | grafo de codigo para localizar simbolo/chamador antes de varrer arquivos |
| `/goal` hooks | autonomia entre turnos |

O agregado `checks.optional.mcp.<servidor>.ok` acima so prova que o servidor esta registrado *em algum lugar* da maquina — nao que o Codex ou o AGY especificamente o tem. Rode `node scripts/preflight.mjs --check-agent-mcp` para tambem consultar `codex mcp list --json`/`agy mcp list` ao vivo e obter `checks.optional.mcpPerAgent.<agent>.<servidor>`, com um campo `install` trazendo o comando exato de `mcp add`. Nada instala sozinho — o executor so roda isso depois que o usuario aprova via `AskUserQuestion`, o mesmo padrao do instalador do Open Design. Ver `skills/executor-subagents/references/mcp-context.md`.

Instalar Codex:

```bash
npm install -g @openai/codex
codex login
```

Instalar plugin Codex no Claude Code:

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
```

Permissão mínima no projeto alvo:

```json
{
  "permissions": {
    "allow": [
      "Bash(node:*)"
    ]
  }
}
```

Instalar Antigravity (AGY):

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Windows:

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

Autenticação: abra `agy` interativamente e faça login.

```text
/plugin marketplace add AllanHarlen/cc-antigravity-plugin
/plugin install cc-antigravity-plugin@cc-antigravity-plugin
/reload-plugins
```

O preflight também valida:

- `agy --help` com `--print`, `--add-dir`, `--dangerously-skip-permissions`, `--print-timeout` e `--prompt-interactive`;
- o bridge do `cc-antigravity-plugin` com `--read-only`, `--model`, `--generate-imagem`, `--generate-image`, `--timeout`, `--continue`, `--conversation` e `--print-command`.

Se Codex falhar no preflight, o `/executor` cancela para backend/testes/review. Para UI ou asset puro sem plano pré-definido, pode seguir sem Codex. Se houver plano pré-definido, Codex high volta na fase de review.

## Instalação

Local:

```text
/plugin marketplace add "C:\Users\allan\Desktop\Projetos Pessoais\cc-executor-subagents"
/plugin install cc-executor-subagents@cc-executor-subagents
```

GitHub:

```text
/plugin marketplace add AllanHarlen/cc-executor-subagents
/plugin install cc-executor-subagents@cc-executor-subagents
```

Validar:

```text
/executor preflight
```

## Uso

```text
/executor corrija o bug que quebra o login quando o usuário não tem avatar
```

```text
/executor refatore o service de pagamentos para remover duplicação e ajuste os testes quebrados
```

```text
/executor deixe a tela de onboarding responsiva e corrija os estados de loading/empty/error
```

```text
/executor crie um mockup de hero e salve o asset em assets/onboarding usando AGY --generate-image
```

```text
/executor analise o impacto de refatorar o módulo auth antes de mexer no backend
```

```text
/executor siga o plano em .executor/minha-demanda/artefatos/initial-plan-baseline.md e implemente; ao final compare plano vs entrega com Codex high
```

## Como o executor decide

Casos comuns:

- bug ou patch backend localizado: Codex
- testes quebrados e glue code: Codex
- review de risco: Codex high
- plano pré-definido: executar sobre o baseline + Codex high read-only em `plan-vs-output-review.md`
- front-end/UI do dia a dia: AGY `--model flash --effort medium` (`antigravity-coder`)
- front-end/UI complexa: AGY `--model pro --effort high` (`antigravity-coder`)
- análise de arquitetura ou impacto: AGY `--read-only` (`antigravity-agent`, somente leitura)
- asset visual explícito: AGY `--generate-image` (`antigravity-coder`)

## Modo autônomo

Para deixar o Claude continuar entre turnos:

```text
/goal Execute a skill cc-executor-subagents:executor-subagents para: <demanda>. Condição de conclusão: preflight OK; escopo rápido definido; agentes independentes lançados ou decisão documentada [...]
```

## Layout

```text
cc-executor-subagents/
|-- .claude-plugin/
|   |-- plugin.json
|   `-- marketplace.json
|-- commands/
|   `-- executor.md
|-- scripts/
|   `-- preflight.mjs
`-- skills/
    `-- executor-subagents/
        |-- SKILL.md
        |-- scripts/
        |   `-- preflight.mjs
        |-- references/
        |   |-- agent-stack.md
        |   |-- contracts.md
        |   |-- parallelization.md
        |   |-- preflight-check.md
        |   |-- subagent-prompts.md
        |   `-- workflow.md
        `-- assets/
            |-- contract-template.md
            |-- implementation-report-template.md
            |-- monitoring-template.md
            |-- plan-template.md
            `-- subagents-context-template.md
```

## Princípios

- **Resolver antes de ritualizar.** Planejamento curto, execução real.
- **Ownership claro.** Cada agente sabe o que pode e o que não pode editar.
- **Paralelismo seletivo.** Use vários agentes quando houver fatias independentes.
- **Executor integra.** Pequenos ajustes de glue podem ser feitos diretamente.
- **Plano pronto vira baseline.** Se já existe plano, o executor trabalha sobre ele e revisa a entrega final contra esse baseline.
- **Front-end com AGY.** UI e assets visuais seguem pelo `cc-antigravity-plugin`.
- **Fallback explícito.** Falha de AGY não vira fallback silencioso; o executor pede decisão ao usuário.
- **Verificação proporcional.** Teste o suficiente para o risco da mudança.
- **Sem OpenSpec.** Este plugin não depende de OpenSpec e nunca chama `/opsx:*`/`openspec-*`. Ainda assim pode consumir um artefato de handoff `openspec-change` do Orchestrador como baseline somente-leitura (ver `references/handoff-contract.md`).
