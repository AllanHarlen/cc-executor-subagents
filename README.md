# cc-executor-subagents

Plugin de Claude Code para resolucoes rapidas com subagentes. Ele adiciona a skill **`executor-subagents`** e o comando **`/executor`**.

O foco mudou de "orquestrador arquitetural com OpenSpec" para **executor pratico multiagente**:

- sem OpenSpec obrigatorio;
- sem contratos longos por padrao;
- sem duplas fixas back-end/front-end;
- com slices independentes por ownership;
- com Codex como executor principal de codigo;
- com Gemini opcional para UI visual;
- com verificacao e reporte enxutos.

## Quando usar

Use `/executor` para:

- corrigir bugs;
- refatorar uma area localizada;
- reparar testes;
- fazer UI polish;
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
4. split por ownership de arquivos/modulos;
5. agentes independentes em paralelo;
6. integracao pelo executor principal;
7. verificacoes proporcionais ao risco;
8. resumo final.

Artefatos opcionais ficam em `.executor/`:

```text
.executor/
|-- execution-brief.md
|-- monitoring.md
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
| plugin `openai-codex` | instalado no Claude Code |
| permissao `Bash(node:*)` | `.claude/settings.json` |

Opcionais:

| Item | Uso |
|---|---|
| Gemini CLI + `cc-gemini-plugin` | UI visual especializada |
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

Gemini opcional:

```bash
npm install -g @google/gemini-cli
gemini auth
```

```text
/plugin marketplace add thepushkarp/cc-gemini-plugin
/plugin install cc-gemini-plugin@cc-gemini-plugin
```

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
- **Verificacao proporcional.** Teste o suficiente para o risco da mudanca.
- **Sem OpenSpec.** Este plugin nao depende de OpenSpec.
