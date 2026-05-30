# cc-executor-subagents

Plugin de Claude Code para resolucoes rapidas com subagentes. Ele adiciona a skill **`executor-subagents`** e o comando **`/executor`**.

O foco mudou de "orquestrador arquitetural com OpenSpec" para **executor pratico multiagente**:

- sem OpenSpec obrigatorio;
- sem contratos longos por padrao;
- sem duplas fixas back-end/front-end;
- com slices independentes por ownership;
- com Codex como executor principal de backend, testes e review;
- com Antigravity (AGY) obrigatorio para front-end/UI, imagem e contexto largo;
- com verificacao e reporte enxutos.

## Quando usar

Use `/executor` para:

- corrigir bugs;
- refatorar uma area localizada;
- reparar testes;
- implementar ou ajustar front-end/UI;
- gerar mockups, banners, logos ou outros assets visuais;
- implementar uma feature slice pequena;
- ajustar endpoints/servicos/telas com escopo curto;
- investigar causa raiz enquanto outro agente prepara patch;
- rodar review rapido de risco.

Nao use para edicoes triviais de 1-2 linhas. Nesses casos, Claude direto e mais rapido. Para mudancas arquiteturais grandes, especificacao formal ou rollout complexo, use outro fluxo mais pesado.

## Como funciona

Fluxo resumido:

1. preflight leve;
2. triagem rapida da demanda;
3. decisao entre execucao direta, 1 agente ou varios agentes;
4. roteamento por tipo de trabalho;
5. split por ownership de arquivos/modulos;
6. agentes independentes em paralelo;
7. integracao pelo executor principal;
8. verificacoes proporcionais ao risco;
9. resumo final.

Roteamento padrao:

- front-end/UI: AGY em modo agentic;
- varios entregaveis AGY independentes (relatorios, componentes): AGY com `--parallel` (fan-out nativo de subagentes Gemini; `--subagent-model` opcional para subagentes mais baratos);
- imagem/asset explicito: AGY com `--generate-imagem`;
- analise cross-file: AGY com `--read-only`;
- backend, testes e review: Codex.

O paralelismo pode acontecer em duas camadas: waves na camada do Claude Code (slices de domínios diferentes, ex.: AGY + Codex) ou fan-out nativo dentro de um único agente AGY (`--parallel`) quando todos os entregáveis sao de domínio AGY.

Artefatos opcionais ficam em `.executor/`:

```text
.executor/
|-- execution-brief.md
|-- monitoring.md
|-- workflow-log.md
|-- subagents-context.md
`-- implementation-report.md
```

Eles so sao criados quando ajudam, normalmente em execucoes com 2+ agentes ou risco medio/alto.

## Pre-requisitos

Obrigatorios:

| Item | Verificar |
|---|---|
| Node.js | `node --version` |
| Codex CLI | `codex --version` |
| Antigravity CLI (`agy`) | `agy --version` |
| plugin `openai-codex` | instalado no Claude Code |
| plugin `cc-antigravity-plugin` `>= 3.6.0` | instalado no Claude Code |
| permissao `Bash(node:*)` | `.claude/settings.json` |

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

Permissao minima no projeto alvo:

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

Autenticacao: abra `agy` interativamente e faca login.

```text
/plugin marketplace add AllanHarlen/cc-antigravity-plugin
/plugin install cc-antigravity-plugin@cc-antigravity-plugin
/reload-plugins
```

O preflight tambem valida:

- `agy --help` com `--print`, `--add-dir`, `--dangerously-skip-permissions`, `--print-timeout` e `--prompt-interactive`;
- o bridge do `cc-antigravity-plugin` com `--read-only`, `--model`, `--generate-imagem`, `--generate-image`, `--timeout`, `--continue`, `--conversation` e `--print-command`.

Se Codex falhar no preflight, o `/executor` cancela. Se somente AGY falhar, o executor mostra a remediacao e pede decisao: corrigir AGY, continuar so com Codex, ou cancelar.

## Instalacao

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
/executor corrija o bug que quebra o login quando o usuario nao tem avatar
```

```text
/executor refatore o service de pagamentos para remover duplicacao e ajuste os testes quebrados
```

```text
/executor deixe a tela de onboarding responsiva e corrija os estados de loading/empty/error
```

```text
/executor crie um mockup de hero e salve o asset em assets/onboarding usando AGY --generate-imagem
```

```text
/executor analise o impacto de refatorar o modulo auth antes de mexer no backend
```

## Como o executor decide

Casos comuns:

- bug ou patch backend localizado: Codex
- testes quebrados e glue code: Codex
- review de risco: Codex high
- front-end/UI do dia a dia: AGY `gemini-3.5-flash-medium`
- front-end/UI complexa: AGY `gemini-3.1-pro-high`
- analise de arquitetura ou impacto: AGY `--read-only`
- asset visual explicito: AGY `--generate-imagem`

## Modo autonomo

Para deixar o Claude continuar entre turnos:

```text
/goal Execute a skill cc-executor-subagents:executor-subagents para: <demanda>. Condicao de conclusao: preflight OK; escopo rapido definido; agentes independentes lancados ou decisao documentada de execucao direta; patches integrados; testes/verificacoes executados ou impedimento registrado; resumo final com arquivos alterados, riscos e proximos passos publicado na conversa; ou pare apos 12 turnos preservando o estado.
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

## Principios

- **Resolver antes de ritualizar.** Planejamento curto, execucao real.
- **Ownership claro.** Cada agente sabe o que pode e o que nao pode editar.
- **Paralelismo seletivo.** Use varios agentes quando houver fatias independentes.
- **Executor integra.** Pequenos ajustes de glue podem ser feitos diretamente.
- **Front-end com AGY.** UI e assets visuais seguem pelo `cc-antigravity-plugin`.
- **Fallback explicito.** Falha de AGY nao vira fallback silencioso; o executor pede decisao ao usuario.
- **Verificacao proporcional.** Teste o suficiente para o risco da mudanca.
- **Sem OpenSpec.** Este plugin nao depende de OpenSpec.
