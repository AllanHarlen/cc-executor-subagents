# cc-executor-subagents

Claude Code plugin for rapid execution with subagents. It adds the skill **`executor-subagents`** and the command **`/executor`**.

📖 **[Documentação em Português](./README.pt-BR.md)** | **Portuguese Documentation**

## Overview

Focus has shifted from "architectural orchestrator with OpenSpec" to **practical multi-agent executor**:

- no mandatory OpenSpec;
- no long-form contracts by default;
- no fixed back-end/front-end pairs;
- independent slices by ownership;
- support for pre-defined plans, preserving baseline and comparing final delivery with Codex high;
- Codex as the default backend/test/review executor, Antigravity (AGY) as the default front-end/image/wide-context executor — both configurable per project (see below);
- lean verification and reporting.

## Agent stack (Project_Config)

The executor stack is not hardcoded. Four roles decide who implements and who reviews, each set to `codex`, `agy`, or `claude-code`:

| Role | Decides | Default |
|---|---|---|
| `backendExecutor` | backend/test/refactor tasks | `codex` |
| `frontendExecutor` | front-end/UI/image tasks | `agy` |
| `backendReviewer` | backend review + plan-vs-delivery review | `codex` |
| `frontendReviewer` | front-end review | `agy` |

Setting a role to `claude-code` means that work is delegated to a Claude Code subagent directly, with no external CLI required. Configure with:

```bash
/executor project-config
```

or directly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-config.mjs" write \
  --backend-executor claude-code --frontend-executor claude-code \
  --backend-reviewer claude-code --frontend-reviewer claude-code
```

Preflight (`/executor preflight`) derives which CLIs/plugins are required from this configuration — with all four roles set to `claude-code`, no external CLI is required at all. See `skills/executor-subagents/references/project-config.md`.

When a role is `agy`, implementation always routes to `cc-antigravity-plugin:antigravity-coder` (the agent with write access via the bridge); `cc-antigravity-plugin:antigravity-agent` is read-only and is only used for architecture analysis or review — it never implements. A front-end task can return an `IMAGE_SUGGESTIONS` block with proposed imagery (hero, banners, empty-state illustrations); the executor presents those options to the user via `AskUserQuestion` before generating any image.

## Persistent state and resume

Each run gets its own crash-safe `{artefatos_dir}/state.json` + `events.jsonl` (event fsynced before the snapshot swaps atomically — a crash mid-write is repaired by replay, not lost). `.executor/checkpoint.json` is a lightweight index (`execucao_atual`, `historico[]`) pointing at the active run. Resume with:

```bash
/executor resume
```

An interrupted `RUNNING` task always comes back as `UNKNOWN` — never a presumed `FAILED`/`DONE` — and is reconciled against Git/files/validations before anything is redelegated. See `skills/executor-subagents/references/persistent-state.md`.

## Gates proportional to risk

`risco: LOW` runs stay exactly as fast as before — no extra gate. `MEDIUM` and up add deterministic validators (`inspect-diff`, `validate-scope`) and, when escalated (`HIGH`, a pre-defined plan, or joint mode with the Orchestrator), test-result evidence, wire-format validation, a Codex high plan-vs-delivery review, and — when front-end and back-end are separate origins — a real-browser E2E check (Playwright MCP). One command decides the list:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/executor-gates.mjs" plan --risk MEDIUM --agent-count 2
```

Five completion gates (`verificacao`, `review`, `e2e`, `reports`, `handoff`) must close before a run can be marked `DONE`. See `skills/executor-subagents/references/persistent-state.md` and `references/programmatic-intelligence.md`.

## When to Use

Use `/executor` for:

- fixing bugs;
- refactoring a localized area;
- repairing tests;
- implementing or adjusting front-end/UI;
- generating mockups, banners, logos, or other visual assets;
- implementing a small feature slice;
- adjusting endpoints/services/screens with narrow scope;
- investigating root cause while another agent prepares a patch;
- running a quick risk review.

Do not use for trivial 1–2 line edits. In those cases, Claude directly is faster. For large architectural changes, formal specification, or complex rollout, use another heavier workflow.

## How It Works

Simplified flow:

1. light preflight;
2. quick demand triage;
3. decision between direct execution, 1 agent, or multiple agents;
4. routing by work type;
5. split by file/module ownership;
6. independent agents in parallel;
7. integration by main executor;
8. checks proportional to risk;
9. Codex high plan-vs-delivery review when a pre-defined plan exists;
10. final summary.

Default routing:

- front-end/UI: AGY in agentic mode;
- multiple independent AGY deliverables (reports, components): AGY with `--parallel` (native fan-out of Gemini subagents; `--subagent-model` optional for cheaper subagents);
- explicit image/asset: AGY with `--generate-image`;
- cross-file analysis: AGY with `--read-only`;
- backend, tests, and review: Codex.

Parallelism can happen at two layers: waves at the Claude Code layer (slices from different domains, e.g., AGY + Codex) or native fan-out within a single AGY agent (`--parallel`).

Optional artifacts live in `.executor/{demand-slug}/artifacts/`:

```text
.executor/
`-- develop-clients-page/
    `-- artifacts/
        |-- execution-brief.md
        |-- initial-plan-baseline.md
        |-- plan-vs-output-review.md
        |-- monitoring.md
        |-- workflow-log.md
        |-- subagents-context.md
        `-- implementation-report.md
```

They are only created when they help, typically in executions with 2+ agents, medium/high risk, or when the demand comes with a pre-defined plan.

When the user passes a ready-made plan (by text, file, checkpoint, or "follow this plan"), the executor preserves that content in `initial-plan-baseline.md`, executes against it, and before closing, reviews and compares the final delivery against the original plan in `plan-vs-output-review.md`.

## Prerequisites

Mandatory:

| Item | Check |
|---|---|
| Node.js | `node --version` |
| Codex CLI | `codex --version` |
| Antigravity CLI (`agy`) `>= 1.1.8` (`1.1.16` recommended) | `agy --version` |
| `openai-codex` plugin | installed in Claude Code |
| `cc-antigravity-plugin` `>= 4.0.0` plugin | installed in Claude Code |
| `Bash(node:*)` permission | `.claude/settings.json` |

Optional:

| Item | Use |
|---|---|
| Context7 MCP | current docs for libs/frameworks/APIs |
| `/goal` hooks | autonomy between turns |

Install Codex:

```bash
npm install -g @openai/codex
codex login
```

Install Codex plugin in Claude Code:

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
```

Minimum permission in target project:

```json
{
  "permissions": {
    "allow": [
      "Bash(node:*)"
    ]
  }
}
```

Install Antigravity (AGY):

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Windows:

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

Authentication: open `agy` interactively and log in.

```text
/plugin marketplace add AllanHarlen/cc-antigravity-plugin
/plugin install cc-antigravity-plugin@cc-antigravity-plugin
/reload-plugins
```

Preflight also validates:

- `agy --help` with `--print`, `--add-dir`, `--dangerously-skip-permissions`, `--print-timeout`, and `--prompt-interactive`;
- the bridge of `cc-antigravity-plugin` with `--read-only`, `--model`, `--generate-imagem`, `--generate-image`, `--timeout`, `--continue`, `--conversation`, and `--print-command`.

If Codex fails preflight, `/executor` cancels for backend/tests/review. For UI or pure asset without a pre-defined plan, it can proceed without Codex. If a pre-defined plan exists, Codex high comes back for the review phase.

## Installation

Local:

```text
/plugin marketplace add "C:\Users\allan\Desktop\Personal Projects\cc-executor-subagents"
/plugin install cc-executor-subagents@cc-executor-subagents
```

GitHub:

```text
/plugin marketplace add AllanHarlen/cc-executor-subagents
/plugin install cc-executor-subagents@cc-executor-subagents
```

Validate:

```text
/executor preflight
```

## Usage

```text
/executor fix the bug that breaks login when user has no avatar
```

```text
/executor refactor the payment service to remove duplication and fix broken tests
```

```text
/executor make the onboarding screen responsive and fix loading/empty/error states
```

```text
/executor create a hero mockup and save the asset to assets/onboarding using AGY --generate-image
```

```text
/executor analyze the impact of refactoring the auth module before touching the backend
```

```text
/executor follow the plan in .executor/my-demand/artifacts/initial-plan-baseline.md and implement; at the end compare plan vs delivery with Codex high
```

## How the Executor Decides

Common cases:

- localized backend bug or patch: Codex
- broken tests and glue code: Codex
- risk review: Codex high
- pre-defined plan: execute against baseline + Codex high read-only in `plan-vs-output-review.md`
- daily front-end/UI: AGY `--model flash --effort medium` (`antigravity-coder`)
- complex front-end/UI: AGY `--model pro --effort high` (`antigravity-coder`)
- architecture analysis or impact: AGY `--read-only` (`antigravity-agent`, read-only)
- explicit visual asset: AGY `--generate-image` (`antigravity-coder`)

## Autonomous Mode

To let Claude continue between turns:

```text
/goal Execute the cc-executor-subagents:executor-subagents skill for: <demand>. Conclusion condition: preflight OK; quick scope defined; independent agents launched or decision documented [...]
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

## Principles

- **Solve before ritualizing.** Short planning, real execution.
- **Clear ownership.** Each agent knows what it can and cannot edit.
- **Selective parallelism.** Use multiple agents when there are independent slices.
- **Executor integrates.** Small glue adjustments can be done directly.
- **Ready plan becomes baseline.** If a plan already exists, the executor works on it and reviews the final delivery against that baseline.
- **Front-end with AGY.** UI and visual assets go through `cc-antigravity-plugin`.
- **Explicit fallback.** AGY failure is not a silent fallback; the executor asks the user for a decision.
- **Proportional verification.** Test enough for the risk of the change.
- **No OpenSpec.** This plugin does not depend on OpenSpec.
