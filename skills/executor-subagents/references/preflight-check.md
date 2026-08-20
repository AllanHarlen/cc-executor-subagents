# Preflight Check

O preflight do `cc-executor-subagents` valida o minimo para execucao rapida com subagentes. A obrigatoriedade de cada CLI/plugin deriva da **Project_Config** do projeto (`.executor/project-config.md`), nao de uma regra fixa.

## Como rodar

```bash
node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs"
```

Em desenvolvimento local:

```bash
node skills/executor-subagents/scripts/preflight.mjs
```

## Project_Config

Quatro papeis decidem quem implementa e quem revisa: `backendExecutor`, `frontendExecutor`, `backendReviewer`, `frontendReviewer`. Cada um vale `codex`, `agy` ou `claude-code`. Defaults: `codex`/`agy`/`codex`/`agy`.

```bash
node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" show
node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" write \
  --backend-executor codex --frontend-executor agy \
  --backend-reviewer codex --frontend-reviewer agy
```

Ver `references/project-config.md` para o catalogo completo de perguntas e o protocolo de instalacao assistida.

## Obrigatorio (condicional a Project_Config)

| Item | Obrigatorio quando | Por que importa |
|---|---|---|
| Project_Config valida | sempre, se o arquivo existir | arquivo invalido bloqueia sem nunca ser sobrescrito automaticamente |
| `codex` CLI + plugin `openai-codex` | `backendExecutor` ou `backendReviewer` = `codex` | executa agentes de backend, testes e review |
| `agy` CLI (`>= 1.1.8`, `1.1.16` recomendado) + plugin `cc-antigravity-plugin` `>= 4.0.0` | `frontendExecutor` ou `frontendReviewer` = `agy` | executa agentes de front-end, imagem e analise em contexto largo |
| `agy --help` com flags essenciais | igual ao `agy` CLI | garante `--print`, `--add-dir`, `--dangerously-skip-permissions`, `--print-timeout`, `--prompt-interactive`, `--output-format`, `--mode`, `--model`, `--effort` |
| bridge do AGY com flags atuais | igual ao `agy` CLI | garante `--read-only`, `--model`, `--generate-imagem`, `--generate-image`, `--parallel`, `--subagent-model`, `--timeout`, `--continue`, `--conversation`, `--print-command`, `--format`, `--effort`, `--mode`, `--json-schema`, `--allow-slash-commands`, `--interactive`, `--agent` |
| arquivos do plugin `cc-antigravity-plugin` instalado | igual ao `agy` CLI | `agents/antigravity-coder.md` (implementacao), `agents/antigravity-agent.md` (review read-only), `commands/antigravity.md`, `scripts/antigravity-bridge.js` |
| permissao Bash para Codex companion | sempre | evita aprovacoes no meio de agentes em background — **auto-remediado** quando possivel |

Quando os quatro papeis apontam para `claude-code`, nenhuma CLI externa e exigida e o preflight passa mesmo sem `codex`/`agy` no PATH.

Se um item obrigatorio falhar, mostre a `remediation` do relatorio e pergunte ao usuario se quer: (a) corrigir a dependencia, (b) trocar o papel afetado para `claude-code` (`node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" write --backend-executor claude-code ...` ou o papel equivalente) para o Executor (Claude) assumir a task diretamente, ou (c) cancelar. Depois de qualquer mudanca, rode o preflight de novo.

## Opcional

| Item | Uso |
|---|---|
| `/goal` hooks | autonomia entre turnos |
| Context7 MCP | docs atuais para libs/frameworks/APIs |

Falha em item opcional nao cancela. Apenas ajuste a estrategia:

- sem `/goal`: trabalhe no turno atual e entregue comando de retomada;
- sem Context7: siga padroes locais e registre limitacao quando docs atuais importarem.

## Saida (schemaVersion 2)

```json
{
  "schemaVersion": 2,
  "status": "ok",
  "projectConfig": {
    "source": "file",
    "path": ".executor/project-config.md",
    "updatedAt": "2026-02-14T18:05:31Z",
    "roles": { "...": "..." },
    "requiredCliSet": ["codex", "agy"]
  },
  "checks": {
    "config": { "project-config": {} },
    "cli": { "codex": {}, "agy": {} },
    "plugins": { "openai-codex": {}, "cc-antigravity-plugin": {} },
    "permissions": { "codex-companion-bash": {}, "goal-hooks-enabled": {} },
    "capabilities": { "agy-help": {}, "cc-antigravity-bridge": {} },
    "optional": { "mcp": { "context7": {} } }
  },
  "autoRemediation": { "attempted": false, "changed": false, "action": "none", "ok": true },
  "failed": [],
  "warnings": [],
  "remediation": null
}
```

`checks` e **plano**: `config`, `cli`, `plugins`, `permissions` e `capabilities` sao os cinco grupos de checks obrigatorios-por-condicao; `optional.mcp` nunca bloqueia. Cada check individual carrega `required: true|false`, resolvido a partir da Project_Config. `category` em `failed`/`warnings` usa o rotulo singular (`config`, `cli`, `plugin`, `permission`, `capability`, `mcp`).

`status` e `failed` consideram apenas os itens que a Project_Config torna obrigatorios. `warnings` lista itens opcionais ausentes e itens que falharam mas nao sao exigidos pela configuracao atual (`reason: "NOT_REQUIRED_BY_PROJECT_CONFIG"`).

> **Mudanca de contrato (schemaVersion 1 -> 2):** a versao anterior aninhava tudo em `checks.required.*`/`checks.optional.*`, com obrigatoriedade fixa por posicao. A versao atual e plana e deriva obrigatoriedade da Project_Config. Nao ha compatibilidade retroativa no formato do relatorio — leia sempre o `schemaVersion` antes de assumir a forma do JSON.

## Auto-remediacao

O preflight tenta corrigir sozinho a permissao `codex-companion-bash` quando ela falha: cria ou atualiza `.claude/settings.json` do projeto acrescentando `Bash(node:*)` a `permissions.allow`, preservando o restante do arquivo. Recusa a mudanca (e reporta o motivo em `autoRemediation.action`) quando o arquivo existente e JSON invalido, tem raiz que nao e objeto, `permissions` que nao e objeto, ou `permissions.allow` que nao e array — nesses casos o arquivo anterior permanece intacto e a remediacao precisa ser manual.

## Remediacao comum

### Codex CLI

```bash
npm install -g @openai/codex
codex login
```

Ou, se Codex nao for necessario neste projeto:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" write --backend-executor claude-code \
  --frontend-executor agy --backend-reviewer claude-code --frontend-reviewer agy
```

### Plugin OpenAI Codex

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
```

### Permissao Bash

Normalmente auto-remediado. Se a auto-remediacao recusar (JSON invalido, por exemplo), corrija manualmente no projeto alvo:

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

Ou, se AGY nao for necessario neste projeto:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/project-config.mjs" write --backend-executor codex \
  --frontend-executor claude-code --backend-reviewer codex --frontend-reviewer claude-code
```

### Context7 opcional

```bash
npx ctx7 setup --claude
```

## Politica

Toda obrigatoriedade de CLI/plugin vem da Project_Config — nao ha mais excecao ad-hoc para tasks front-end puras. Se uma dependencia obrigatoria falhar, exponha a falha, mostre a remediacao (incluindo a opcao de trocar o papel para `claude-code`) e peca uma decisao explicita ao usuario antes de seguir.
