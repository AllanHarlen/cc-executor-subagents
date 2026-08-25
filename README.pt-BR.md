# cc-executor-subagents

Plugin de Claude Code para resoluções rápidas com subagentes. Ele adiciona a skill **`executor-subagents`** e o comando **`/executor`**.

O foco mudou de "orquestrador arquitetural com OpenSpec" para **executor prático multiagente**:

- sem OpenSpec obrigatório;
- sem contratos longos por padrão;
- sem duplas fixas back-end/front-end;
- com slices independentes por ownership;
- com suporte a plano pré-definido, preservando baseline e comparando entrega final com Codex high;
- com Codex como executor principal de backend, testes e review;
- com Antigravity (AGY) obrigatório para front-end/UI, imagem e contexto largo;
- com verificação e reporte enxutos.

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
- imagem/asset explícito: AGY com `--generate-imagem`;
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
| Antigravity CLI (`agy`) | `agy --version` |
| plugin `openai-codex` | instalado no Claude Code |
| plugin `cc-antigravity-plugin` `>= 3.6.0` | instalado no Claude Code |
| permissão `Bash(node:*)` | `.claude/settings.json` |

Opcionais:

| Item | Uso |
|---|---|
| Context7 MCP | docs atuais de libs/frameworks/APIs |
| `/goal` hooks | autonomia entre turnos |

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
/executor [--model <id>] [--effort <nível>] [--parallel] [--subagent-model <id>] <demanda>
```

Subcomandos: `help`, `preflight`, `config`, `status`, `resume [slug]`. O `config` lê e grava o mesmo `.orchestrator/project-config.md` do `/orquestrador` — configurar por um dos dois basta.

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
/executor crie um mockup de hero e salve o asset em assets/onboarding usando AGY --generate-imagem
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
- front-end/UI do dia a dia: AGY `gemini-3.5-flash-medium`
- front-end/UI complexa: AGY `gemini-3.1-pro-high`
- análise de arquitetura ou impacto: AGY `--read-only`
- asset visual explícito: AGY `--generate-imagem`

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
- **Sem OpenSpec.** Este plugin não depende de OpenSpec.
