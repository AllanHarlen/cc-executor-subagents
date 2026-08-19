# Preflight Check

O preflight do `cc-executor-subagents` valida o minimo para execucao rapida com subagentes.

## Como rodar

```bash
node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs"
```

Em desenvolvimento local:

```bash
node skills/executor-subagents/scripts/preflight.mjs
```

## Obrigatorio

| Item | Por que importa |
|---|---|
| `codex` CLI | executa agentes de backend, testes e review |
| `agy` CLI | executa agentes de front-end, imagem e analise em contexto largo |
| plugin `openai-codex` | expoe `codex:codex-rescue` |
| plugin `cc-antigravity-plugin` `>= 3.6.0` | expoe `cc-antigravity-plugin:antigravity-coder` (implementacao, escrita), `cc-antigravity-plugin:antigravity-agent` (analise/review, somente leitura) e o bridge com flags atuais (incluindo `--parallel` e `--subagent-model`) |
| permissao Bash para Codex companion | evita aprovacoes no meio de agentes em background |
| `agy --help` com flags essenciais | garante `--print`, `--add-dir`, `--dangerously-skip-permissions`, `--print-timeout`, `--prompt-interactive` |
| bridge do AGY com flags atuais | garante `--read-only`, `--model`, `--generate-imagem`, `--generate-image`, `--parallel`, `--subagent-model`, `--timeout`, `--continue`, `--conversation`, `--print-command` |
| `agents/antigravity-coder.md` e `agents/antigravity-agent.md` presentes | confirma que o plugin instalado expoe os dois subagentes distintos — implementacao (escrita) e analise/review (somente leitura) |

Falha de Codex bloqueia apenas para tasks que nao sejam puramente front-end, exceto quando houver plano pre-definido. Se a demanda for `UI_FRONTEND` ou `IMAGE_ASSET` sem plano pre-definido, falha de Codex nao cancela — prossiga sem ele. Se houver plano pre-definido, Codex high e necessario para o review read-only plano-vs-entrega; remedeie Codex ou registre aceite explicito do usuario para seguir sem esse review. Para qualquer outra natureza de task, falha de Codex cancela com remediacao.

Falha somente de AGY deve pausar o fluxo e pedir decisao do usuario: remediar, continuar so com Codex, ou cancelar.

## Opcional

| Item | Uso |
|---|---|
| `/goal` hooks | autonomia entre turnos |
| Context7 MCP | docs atuais para libs/frameworks/APIs |

Falha em item opcional nao cancela. Apenas ajuste a estrategia:

- sem `/goal`: trabalhe no turno atual e entregue comando de retomada;
- sem Context7: siga padroes locais e registre limitacao quando docs atuais importarem.

## Saida

```json
{
  "status": "ok",
  "checks": {
    "required": { "...": {} },
    "optional": { "...": {} }
  },
  "failed": [],
  "warnings": [],
  "remediation": null
}
```

`status` e `failed` consideram os itens obrigatorios. `warnings` lista apenas opcionais ausentes.

## Remediacao comum

### Codex CLI

```bash
npm install -g @openai/codex
codex login
```

### Plugin OpenAI Codex

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
```

### Permissao Bash

No projeto alvo:

```json
{
  "permissions": {
    "allow": [
      "Bash(node:*)"
    ]
  }
}
```

### Antigravity (AGY)

**macOS/Linux:**

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

**Windows:**

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

**Autenticacao:** abra `agy` uma vez interativamente e faca login.

```text
/plugin marketplace add AllanHarlen/cc-antigravity-plugin
/plugin install cc-antigravity-plugin@cc-antigravity-plugin
/reload-plugins
```

### Context7 opcional

```bash
npx ctx7 setup --claude
```

## Politica

Nao faca fallback silencioso se Codex falhar em tasks que nao sejam front-end puro. Para tasks `UI_FRONTEND` ou `IMAGE_ASSET` sem plano pre-definido, falha de Codex e ignorada silenciosamente (registre no checkpoint como `codex_excluido: true`). Se houver plano pre-definido, Codex high deve ficar disponivel para a Fase 6.5 ou a ausencia dele precisa ser aceita explicitamente pelo usuario. Para AGY, exponha a falha, mostre a remediacao e peca uma decisao explicita antes de seguir so com Codex.
