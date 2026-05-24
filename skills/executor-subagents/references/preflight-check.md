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
| `codex` CLI | executa agentes de codigo, teste e review |
| plugin `openai-codex` | expoe `codex:codex-rescue` |
| permissao Bash para Codex companion | evita aprovacoes no meio de agentes em background |

Se qualquer item obrigatorio falhar, cancele e mostre `remediation`.

## Opcional

| Item | Uso |
|---|---|
| `agy` CLI | analise de codebase com Antigravity |
| plugin `cc-antigravity-plugin` | expoe `cc-antigravity-plugin:antigravity-agent` |
| `/goal` hooks | autonomia entre turnos |
| Context7 MCP | docs atuais para libs/frameworks/APIs |

Falha em item opcional nao cancela. Apenas ajuste a estrategia:

- sem AGY: prossiga sem analise cross-file;
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

`status` e `failed` consideram somente itens obrigatorios. `warnings` lista opcionais ausentes.

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

### Antigravity (AGY) opcional

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
```

### Context7 opcional

```bash
npx ctx7 setup --claude
```

## Politica

Nao faca fallback silencioso se Codex obrigatorio falhar. Para AGY e Context7, continue normalmente e diga qual rota sera usada.
