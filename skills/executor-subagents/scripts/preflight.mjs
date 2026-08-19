#!/usr/bin/env node
/**
 * Preflight check for cc-executor-subagents.
 *
 * The Required_CLI_Set is derived from the Project_Config (`.orchestrator/project-config.md`,
 * shared with cc-orchestrador-subagents — same file, same four roles) instead of being
 * a fixed codex+agy pair: `cli.codex`/`plugins.openai-codex`/capabilities tied to Codex
 * are required iff some role uses `codex`; the AGY equivalents iff some role uses `agy`.
 * With all four roles set to `claude-code`, no external CLI is required at all.
 *
 * Always required regardless of Project_Config:
 * - `config.project-config` (must be absent-or-valid, never invalid-and-ignored)
 *
 * Always optional:
 * - /goal hook compatibility
 * - Context7 MCP
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  DEFAULT_PROJECT_CONFIG,
  ProjectConfigError,
  PROJECT_CONFIG_RELATIVE_PATH,
  ROLES,
  deriveRequiredCliSet,
  readProjectConfig,
} from "./lib/project-config.mjs";

const HOME = homedir();
const PLUGINS_CACHE = join(HOME, ".claude", "plugins", "cache");
const PROJECT_ROOT = resolve(process.cwd());
const PROJECT_CLAUDE_DIR = join(PROJECT_ROOT, ".claude");
const MIN_ANTIGRAVITY_PLUGIN_VERSION = "3.6.0";
const REQUIRED_AGY_FLAGS = [
  "--print",
  "--add-dir",
  "--dangerously-skip-permissions",
  "--print-timeout",
  "--prompt-interactive",
];
const REQUIRED_BRIDGE_FLAGS = [
  "--read-only",
  "--model",
  "--generate-imagem",
  "--generate-image",
  "--parallel",
  "--subagent-model",
  "--timeout",
  "--continue",
  "--conversation",
  "--print-command",
];

function checkCli(cli) {
  try {
    const out = execSync(`${cli} --version`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).toString().trim();
    return { ok: true, version: out.split(/\r?\n/)[0] };
  } catch (err) {
    return { ok: false, error: err.message?.split(/\r?\n/)[0] ?? "not found" };
  }
}

function checkPlugin(marketplace, pluginName) {
  const dir = join(PLUGINS_CACHE, marketplace, pluginName);
  if (!existsSync(dir)) return { ok: false, error: `missing ${dir}` };

  let versions = [];
  try {
    versions = readdirSync(dir);
  } catch {
    return { ok: false, error: `cannot read ${dir}` };
  }

  if (versions.length === 0) return { ok: false, error: `no versions installed in ${dir}` };
  versions.sort(compareVersions);
  const version = versions[versions.length - 1];
  return {
    ok: true,
    version,
    path: dir,
    versionPath: join(dir, version),
  };
}

function compareVersions(a, b) {
  const aParts = String(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = String(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const max = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < max; index += 1) {
    const delta = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function checkAgyHelp() {
  try {
    const out = execSync("agy --help 2>&1", {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).toString();
    const missingFlags = REQUIRED_AGY_FLAGS.filter((flag) => !out.includes(flag));
    return {
      ok: missingFlags.length === 0,
      flags: REQUIRED_AGY_FLAGS,
      missingFlags,
      error:
        missingFlags.length > 0
          ? `agy --help is missing required flags: ${missingFlags.join(", ")}`
          : null,
    };
  } catch (err) {
    return {
      ok: false,
      flags: REQUIRED_AGY_FLAGS,
      missingFlags: REQUIRED_AGY_FLAGS,
      error: err.message?.split(/\r?\n/)[0] ?? "failed to inspect agy --help",
    };
  }
}

function checkAntigravityBridge() {
  const plugin = checkPlugin("cc-antigravity-plugin", "cc-antigravity-plugin");
  if (!plugin.ok) {
    return {
      ok: false,
      error: plugin.error,
    };
  }

  if (compareVersions(plugin.version, MIN_ANTIGRAVITY_PLUGIN_VERSION) < 0) {
    return {
      ok: false,
      version: plugin.version,
      minVersion: MIN_ANTIGRAVITY_PLUGIN_VERSION,
      error: `cc-antigravity-plugin ${plugin.version} is below required ${MIN_ANTIGRAVITY_PLUGIN_VERSION}`,
    };
  }

  // antigravity-coder is the only write-capable AGY subagent (implementation);
  // antigravity-agent is read-only (analysis/review). Both files must exist so
  // the split routing in agent-stack.md/subagent-prompts.md actually resolves.
  const requiredAgents = ["agents/antigravity-coder.md", "agents/antigravity-agent.md"];
  const missingAgents = requiredAgents.filter(
    (file) => !existsSync(join(plugin.versionPath, file)),
  );
  if (missingAgents.length > 0) {
    return {
      ok: false,
      version: plugin.version,
      missingAgents,
      error: `cc-antigravity-plugin is missing required agent definitions: ${missingAgents.join(", ")}`,
    };
  }

  const bridgePath = join(plugin.versionPath, "scripts", "antigravity-bridge.js");
  if (!existsSync(bridgePath)) {
    return {
      ok: false,
      version: plugin.version,
      bridgePath,
      error: `missing bridge script at ${bridgePath}`,
    };
  }

  try {
    const out = execSync(`node "${bridgePath}" --help`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).toString();
    const missingFlags = REQUIRED_BRIDGE_FLAGS.filter((flag) => !out.includes(flag));
    return {
      ok: missingFlags.length === 0,
      version: plugin.version,
      minVersion: MIN_ANTIGRAVITY_PLUGIN_VERSION,
      bridgePath,
      flags: REQUIRED_BRIDGE_FLAGS,
      missingFlags,
      error:
        missingFlags.length > 0
          ? `bridge help is missing required flags: ${missingFlags.join(", ")}`
          : null,
    };
  } catch (err) {
    return {
      ok: false,
      version: plugin.version,
      minVersion: MIN_ANTIGRAVITY_PLUGIN_VERSION,
      bridgePath,
      flags: REQUIRED_BRIDGE_FLAGS,
      missingFlags: REQUIRED_BRIDGE_FLAGS,
      error: err.message?.split(/\r?\n/)[0] ?? "failed to inspect antigravity bridge",
    };
  }
}

function checkCodexCompanionBashPermission() {
  const candidates = [
    join(PROJECT_CLAUDE_DIR, "settings.json"),
    join(PROJECT_CLAUDE_DIR, "settings.local.json"),
    join(HOME, ".claude", "settings.json"),
    join(HOME, ".claude", "settings.local.json"),
  ];

  const inspected = [];
  const parseErrors = [];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const settings = JSON.parse(readFileSync(file, "utf8"));
      const allow = Array.isArray(settings?.permissions?.allow)
        ? settings.permissions.allow
        : [];
      const matches = allow.filter(isCodexCompanionBashRule);
      inspected.push({ path: file, allow: allow.filter((rule) => String(rule).startsWith("Bash")) });

      if (matches.length > 0) {
        return { ok: true, path: file, rules: matches };
      }
    } catch (err) {
      parseErrors.push({
        path: file,
        error: err.message?.split(/\r?\n/)[0] ?? "cannot parse settings file",
      });
    }
  }

  return {
    ok: false,
    error:
      "Missing Claude Code permission to run the Codex companion via Bash. Add Bash(node:*) or a compatible rule.",
    expected: 'permissions.allow includes "Bash(node:*)"',
    inspected,
    parseErrors,
  };
}

function isCodexCompanionBashRule(rule) {
  if (typeof rule !== "string") return false;
  const normalized = rule.replace(/\s+/g, " ").trim();
  return (
    normalized === "Bash" ||
    normalized === "Bash(*)" ||
    normalized === "Bash(node:*)" ||
    /^Bash\(node:.*codex-companion\.mjs.*\)$/.test(normalized) ||
    /^Bash\(node .*codex-companion\.mjs.*\)$/.test(normalized)
  );
}

function checkGoalHookSettings() {
  const candidates = [
    join(PROJECT_CLAUDE_DIR, "settings.json"),
    join(PROJECT_CLAUDE_DIR, "settings.local.json"),
    join(HOME, ".claude", "settings.json"),
    join(HOME, ".claude", "settings.local.json"),
    join(HOME, ".claude", "managed-settings.json"),
  ];

  const inspected = [];
  const parseErrors = [];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const settings = JSON.parse(readFileSync(file, "utf8"));
      inspected.push({
        path: file,
        disableAllHooks: settings?.disableAllHooks,
        allowManagedHooksOnly: settings?.allowManagedHooksOnly,
      });

      if (settings?.disableAllHooks === true) {
        return { ok: false, path: file, error: "disableAllHooks is true", inspected };
      }

      if (settings?.allowManagedHooksOnly === true) {
        return { ok: false, path: file, error: "allowManagedHooksOnly is true", inspected };
      }
    } catch (err) {
      parseErrors.push({
        path: file,
        error: err.message?.split(/\r?\n/)[0] ?? "cannot parse settings file",
      });
    }
  }

  return { ok: true, inspected, parseErrors };
}

function checkContext7Mcp() {
  const evidence = [];
  const skillCandidates = [
    join(HOME, ".claude", "skills", "context7", "SKILL.md"),
    join(HOME, ".claude", "skills", "context7-mcp", "SKILL.md"),
  ];

  for (const file of skillCandidates) {
    if (existsSync(file)) evidence.push({ type: "skill", path: file });
  }

  const configCandidates = [
    join(process.cwd(), ".mcp.json"),
    join(HOME, ".claude.json"),
    join(HOME, ".claude", "mcp.json"),
    join(HOME, ".config", "claude", "mcp.json"),
    join(HOME, ".codex", "config.toml"),
  ];

  for (const file of configCandidates) {
    if (!existsSync(file)) continue;
    try {
      const contents = readFileSync(file, "utf8");
      if (/\bcontext7\b|@upstash\/context7-mcp|mcp\.context7\.com|ctx7/i.test(contents)) {
        evidence.push({ type: "mcp-config", path: file });
      }
    } catch (err) {
      evidence.push({
        type: "mcp-config-unreadable",
        path: file,
        error: err.message?.split(/\r?\n/)[0] ?? "cannot read file",
      });
    }
  }

  if (evidence.some((item) => item.type !== "mcp-config-unreadable")) {
    return { ok: true, optional: true, evidence };
  }

  return {
    ok: false,
    optional: true,
    error: "Context7 MCP not detected in known locations.",
    install: ["npx ctx7 setup --claude"],
  };
}

function checkCodebaseMemoryMcp() {
  const evidence = [];

  if (checkCli("codebase-memory-mcp").ok) {
    evidence.push({ type: "cli", path: "codebase-memory-mcp (PATH)" });
  }

  const skillCandidates = [
    join(HOME, ".claude", "skills", "codebase-memory", "SKILL.md"),
    join(HOME, ".claude", "skills", "codebase-memory-mcp", "SKILL.md"),
  ];
  for (const file of skillCandidates) {
    if (existsSync(file)) evidence.push({ type: "skill", path: file });
  }

  const configCandidates = [
    join(process.cwd(), ".mcp.json"),
    join(HOME, ".claude.json"),
    join(HOME, ".claude", "mcp.json"),
    join(HOME, ".config", "claude", "mcp.json"),
  ];
  for (const file of configCandidates) {
    if (!existsSync(file)) continue;
    try {
      const contents = readFileSync(file, "utf8");
      if (/codebase-memory-mcp/i.test(contents)) {
        evidence.push({ type: "mcp-config", path: file });
      }
    } catch (err) {
      evidence.push({
        type: "mcp-config-unreadable",
        path: file,
        error: err.message?.split(/\r?\n/)[0] ?? "cannot read file",
      });
    }
  }

  if (evidence.some((item) => item.type !== "mcp-config-unreadable")) {
    return { ok: true, optional: true, evidence };
  }

  return {
    ok: false,
    optional: true,
    error: "codebase-memory-mcp not detected in known locations.",
    install: ["see references/project-config.md / Dependency_Installer"],
  };
}

/**
 * Resolves the Project_Config of the target project before any other check —
 * it decides which CLIs (and their plugins/capabilities) are required. Same
 * three outcomes as the orchestrator's preflight (they share this module and
 * the same `.orchestrator/project-config.md` file):
 *
 *  - File present and valid: roles come from the file, `source: "file"`.
 *  - File absent: roles come from the default stack, `source: "default"`.
 *  - File present and invalid: the parser error becomes a failing required
 *    check (`checks.config.project-config`), and the Required_CLI_Set falls
 *    back to the default only so the report stays complete. The file is
 *    never rewritten by reading it.
 */
function resolveProjectConfigState(projectRoot) {
  try {
    const resolved = readProjectConfig(projectRoot);
    const requiredCliSet = deriveRequiredCliSet(resolved.config);
    const roles = {};
    for (const role of ROLES) roles[role] = resolved.config[role];

    return {
      requiredCliSet,
      block: {
        source: resolved.source,
        path: PROJECT_CONFIG_RELATIVE_PATH,
        updatedAt: resolved.config.updatedAt ?? null,
        roles,
        requiredCliSet: [...requiredCliSet.clis],
      },
      check: {
        ok: true,
        required: true,
        exists: resolved.exists,
        source: resolved.source,
        path: PROJECT_CONFIG_RELATIVE_PATH,
      },
    };
  } catch (error) {
    if (!(error instanceof ProjectConfigError)) throw error;
    // Fallback keeps the report complete; status is already "failed" so no
    // workflow decision is made from these default roles.
    const requiredCliSet = deriveRequiredCliSet(DEFAULT_PROJECT_CONFIG);
    const path = error.details?.path ?? PROJECT_CONFIG_RELATIVE_PATH;

    return {
      requiredCliSet,
      block: {
        source: "default",
        path: PROJECT_CONFIG_RELATIVE_PATH,
        updatedAt: null,
        roles: { ...DEFAULT_PROJECT_CONFIG },
        requiredCliSet: [...requiredCliSet.clis],
      },
      check: {
        ok: false,
        required: true,
        exists: true,
        source: "invalid",
        path,
        code: error.code,
        error: error.message,
        field: error.details?.field ?? null,
        received: error.details?.received ?? null,
        accepted: error.details?.accepted ?? null,
        expected: "um Project_Config_File valido ou nenhum arquivo",
      },
    };
  }
}

// The Project_Config is resolved before any other check: it decides which
// CLIs/plugins/capabilities are required.
const projectConfigState = resolveProjectConfigState(PROJECT_ROOT);
const requiredCliSet = projectConfigState.requiredCliSet;

const checks = {
  config: {
    "project-config": projectConfigState.check,
  },
  cli: {
    codex: checkCli("codex"),
    agy: checkCli("agy"),
  },
  plugins: {
    "openai-codex": checkPlugin("openai-codex", "codex"),
    "cc-antigravity-plugin": checkPlugin("cc-antigravity-plugin", "cc-antigravity-plugin"),
  },
  permissions: {
    "codex-companion-bash": checkCodexCompanionBashPermission(),
  },
  capabilities: {
    "agy-help": checkAgyHelp(),
    "cc-antigravity-bridge": checkAntigravityBridge(),
  },
  optional: {
    permissions: {
      "goal-hooks-enabled": checkGoalHookSettings(),
    },
    mcp: {
      "codebase-memory": checkCodebaseMemoryMcp(),
      context7: checkContext7Mcp(),
    },
  },
};

/**
 * Requiredness per check. `config.project-config` is always required.
 * `cli.codex`/`plugins.openai-codex`/`permissions.codex-companion-bash` are
 * required iff some Project_Config role uses `codex`; the AGY equivalents
 * (`cli.agy`/`plugins.cc-antigravity-plugin`/`capabilities.*`) iff some role
 * uses `agy`. With all four roles `claude-code`, none of these are required.
 */
const REQUIRED_BY_CHECK = {
  config: { "project-config": true },
  cli: { codex: requiredCliSet.codex, agy: requiredCliSet.agy },
  plugins: {
    "openai-codex": requiredCliSet.codex,
    "cc-antigravity-plugin": requiredCliSet.agy,
  },
  permissions: { "codex-companion-bash": requiredCliSet.codex },
  capabilities: {
    "agy-help": requiredCliSet.agy,
    "cc-antigravity-bridge": requiredCliSet.agy,
  },
};

const CATEGORY_LABEL = {
  config: "config",
  cli: "cli",
  plugins: "plugin",
  permissions: "permission",
  capabilities: "capability",
};

const NOT_REQUIRED_BY_PROJECT_CONFIG = "NOT_REQUIRED_BY_PROJECT_CONFIG";

const failed = [];
const warnings = [];

// MCP and the /goal hook are always optional, never block the run.
for (const [name, result] of Object.entries(checks.optional.mcp)) {
  if (result.ok) continue;
  warnings.push({ category: "mcp", name, required: false, reason: result.error ?? "NOT_DETECTED" });
}
for (const [name, result] of Object.entries(checks.optional.permissions)) {
  if (result.ok) continue;
  warnings.push({ category: "permission", name, required: false, reason: result.error ?? "NOT_ENABLED" });
}

for (const [group, results] of Object.entries(REQUIRED_BY_CHECK)) {
  for (const [name, required] of Object.entries(results)) {
    const result = checks[group][name];
    result.required = required;
    if (result.ok) continue;
    if (required) {
      failed.push({ category: CATEGORY_LABEL[group], name, ...result });
      continue;
    }
    warnings.push({
      category: CATEGORY_LABEL[group],
      name,
      required: false,
      reason: NOT_REQUIRED_BY_PROJECT_CONFIG,
    });
  }
}

const report = {
  status: failed.length === 0 ? "ok" : "failed",
  generatedAt: new Date().toISOString(),
  projectConfig: projectConfigState.block,
  checks,
  failed,
  warnings,
  remediation: failed.length === 0 ? null : failed.map(remediationFor),
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "ok" ? 0 : 1);

function remediationFor(f) {
  const key = `${f.category}:${f.name}`;
  switch (key) {
    case "cli:codex":
      return {
        target: "codex-cli",
        steps: [
          "Install Codex CLI globally:",
          "  npm install -g @openai/codex",
          "Authenticate:",
          "  codex login",
          "Make sure the codex binary is on the global PATH.",
        ],
        docs: "https://github.com/openai/codex",
      };
    case "cli:agy":
      return {
        target: "agy-cli",
        steps: [
          "Install Antigravity CLI:",
          "  macOS/Linux: curl -fsSL https://antigravity.google/cli/install.sh | bash",
          "  Windows: irm https://antigravity.google/cli/install.ps1 | iex",
          "Authenticate once in an interactive terminal:",
          "  agy",
        ],
        docs: "https://antigravity.google/docs/cli-using",
      };
    case "config:project-config":
      return {
        target: "Project_Config_File: .orchestrator/project-config.md",
        steps: [
          "The file exists but is invalid (unparseable, missing field, or value outside codex|agy|claude-code).",
          "Fix the field the error message points to, or delete the file to fall back to the default stack.",
          "Never overwrite it automatically — the run must not guess a configuration the user did not confirm.",
        ],
        docs: null,
      };
    case "plugins:openai-codex":
      return {
        target: "Claude Code plugin: openai-codex",
        steps: [
          "Inside Claude Code:",
          "  /plugin marketplace add openai/codex-plugin-cc",
          "  /plugin install codex@openai-codex",
        ],
        docs: "https://github.com/openai/codex-plugin-cc",
      };
    case "plugins:cc-antigravity-plugin":
      return {
        target: "Claude Code plugin: cc-antigravity-plugin",
        steps: [
          "Inside Claude Code:",
          "  /plugin marketplace add AllanHarlen/cc-antigravity-plugin",
          "  /plugin install cc-antigravity-plugin@cc-antigravity-plugin",
          "  /reload-plugins",
        ],
        docs: "https://github.com/AllanHarlen/cc-antigravity-plugin",
      };
    case "permissions:codex-companion-bash":
      return {
        target: "Claude Code permission: codex-companion via Bash",
        steps: [
          "Create or update .claude/settings.json in the target project:",
          '  { "permissions": { "allow": ["Bash(node:*)"] } }',
          "Reload Claude Code before running /executor again.",
        ],
        docs: "https://docs.anthropic.com/en/docs/claude-code/settings",
      };
    case "capabilities:agy-help":
      return {
        target: "agy CLI capability set",
        steps: [
          "Update Antigravity CLI to a current version:",
          "  agy update",
          "Confirm the required flags are available in `agy --help`.",
        ],
        docs: "https://antigravity.google/docs/cli-using",
      };
    case "capabilities:cc-antigravity-bridge":
      return {
        target: "cc-antigravity-plugin bridge compatibility",
        steps: [
          `Install or update cc-antigravity-plugin to at least ${MIN_ANTIGRAVITY_PLUGIN_VERSION}:`,
          "  /plugin marketplace add AllanHarlen/cc-antigravity-plugin",
          "  /plugin install cc-antigravity-plugin@cc-antigravity-plugin",
          "  /reload-plugins",
          "Confirm the bridge help exposes the required flags.",
        ],
        docs: "https://github.com/AllanHarlen/cc-antigravity-plugin",
      };
    default:
      return {
        target: f.name,
        steps: ["Check the dependency manually."],
        docs: null,
      };
  }
}
