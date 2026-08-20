#!/usr/bin/env node
/**
 * Preflight check for cc-executor-subagents.
 *
 * Validates that every dependency the executor needs is present, with the
 * Required_CLI_Set derived from the Project_Config of the target project:
 *  - The Project_Config itself (`.executor/project-config.md`), when present
 *  - CLIs on PATH: codex, agy (required only when some role uses them)
 *  - Claude Code plugins: openai-codex, cc-antigravity-plugin (same condition)
 *  - AGY capability set (`agy --help` flags, bridge flags) - required only when
 *    `frontendExecutor`/`frontendReviewer` route to `agy`
 *  - A compatible Bash permission for the Codex companion runtime (auto-remediated)
 *  - Claude Code hook settings compatible with /goal (optional)
 *  - Context7 MCP (optional, reported, never blocking)
 *
 * Report contract (schemaVersion 2):
 *  - `projectConfig` carries the four effective roles, the file path, `updatedAt`,
 *    the derived `requiredCliSet` and `source` ("file" or "default").
 *  - `checks` is FLAT: `checks.{config,cli,plugins,permissions,capabilities,optional}`.
 *    Every check under `config`, `cli`, `plugins`, `permissions` and
 *    `capabilities` carries `required: true|false`.
 *  - `failed` holds only failing **required** checks; failing optional checks and
 *    missing MCPs go to `warnings` with a `reason`
 *    (`NOT_DETECTED` or `NOT_REQUIRED_BY_PROJECT_CONFIG`).
 *  - `category` labels are singular: `config`, `cli`, `plugin`, `permission`,
 *    `capability`, `mcp`.
 *  - Exit code is 0 if and only if `status === "ok"`. A warning never changes it.
 *
 * This is a deliberate breaking change from schemaVersion 1 (the old nested
 * `checks.required.*` / `checks.optional.*` tree): required-ness now derives
 * from the Project_Config instead of being hardcoded by position. See
 * references/preflight-check.md and CHANGELOG.md.
 *
 * Outputs a JSON report to stdout.
 *
 * Usage:
 *   node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs"
 *   node scripts/preflight.mjs # compatibility wrapper
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_PROJECT_CONFIG,
  PROJECT_CONFIG_RELATIVE_PATH,
  ProjectConfigError,
  ROLES,
  deriveRequiredCliSet,
  readProjectConfig,
} from "./lib/project-config.mjs";

const HOME = homedir();
const PROJECT_ROOT = process.cwd();
const PLUGINS_CACHE = join(HOME, ".claude", "plugins", "cache");
const PROJECT_CLAUDE_DIR = join(PROJECT_ROOT, ".claude");
const PROJECT_SETTINGS_FILE = join(PROJECT_CLAUDE_DIR, "settings.json");
const MIN_ANTIGRAVITY_PLUGIN_VERSION = "3.6.0";
const PREFLIGHT_SCHEMA_VERSION = 2;

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
    PROJECT_SETTINGS_FILE,
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

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Auto-remediates a missing `codex-companion-bash` permission by appending
 * `Bash(node:*)` to the project's `.claude/settings.json`. Refuses to touch
 * the file when it exists but is invalid JSON, has a non-object root, a
 * non-object `permissions`, or a non-array `permissions.allow` - in every
 * refusal case the prior file is left byte-for-byte intact.
 */
function autoRemediateCodexCompanionBashPermission(initialCheck) {
  const fileExistedBefore = existsSync(PROJECT_SETTINGS_FILE);
  const result = {
    attempted: false,
    changed: false,
    target: PROJECT_SETTINGS_FILE,
    action: "none",
    revalidated: false,
    ok: initialCheck.ok,
  };

  if (initialCheck.ok) {
    return result;
  }

  const projectParseError = initialCheck.parseErrors?.find(
    (entry) => entry.path === PROJECT_SETTINGS_FILE,
  );

  if (projectParseError) {
    return {
      ...result,
      attempted: true,
      action: "blocked-invalid-json",
      error:
        "Auto-remediation skipped because .claude/settings.json exists but contains invalid JSON. Fix the file manually and rerun preflight.",
      ok: false,
    };
  }

  let settings = {};
  if (fileExistedBefore) {
    try {
      settings = JSON.parse(readFileSync(PROJECT_SETTINGS_FILE, "utf8"));
    } catch (err) {
      return {
        ...result,
        attempted: true,
        action: "blocked-invalid-json",
        error:
          err.message?.split(/\r?\n/)[0] ??
          "Auto-remediation skipped because .claude/settings.json could not be parsed.",
        ok: false,
      };
    }
  }

  if (!isPlainObject(settings)) {
    return {
      ...result,
      attempted: true,
      action: "blocked-non-object-root",
      error:
        "Auto-remediation skipped because .claude/settings.json must contain a JSON object at the root.",
      ok: false,
    };
  }

  const permissions = settings.permissions;
  if (permissions != null && !isPlainObject(permissions)) {
    return {
      ...result,
      attempted: true,
      action: "blocked-invalid-permissions-shape",
      error:
        "Auto-remediation skipped because .claude/settings.json has a non-object permissions field.",
      ok: false,
    };
  }

  const allow = permissions?.allow;
  if (allow != null && !Array.isArray(allow)) {
    return {
      ...result,
      attempted: true,
      action: "blocked-invalid-allow-shape",
      error:
        "Auto-remediation skipped because .claude/settings.json has permissions.allow in a non-array format.",
      ok: false,
    };
  }

  const nextSettings = {
    ...settings,
    permissions: {
      ...(permissions ?? {}),
      allow: [...(allow ?? []), "Bash(node:*)"],
    },
  };

  mkdirSync(PROJECT_CLAUDE_DIR, { recursive: true });
  writeFileSync(PROJECT_SETTINGS_FILE, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");

  const revalidated = checkCodexCompanionBashPermission();
  return {
    attempted: true,
    changed: true,
    target: PROJECT_SETTINGS_FILE,
    action: fileExistedBefore ? "updated-settings-json" : "created-settings-json",
    revalidated: revalidated.ok,
    ok: revalidated.ok,
    rules: revalidated.rules ?? [],
    path: revalidated.path ?? PROJECT_SETTINGS_FILE,
    error: revalidated.ok ? null : revalidated.error,
  };
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
    join(PROJECT_ROOT, ".mcp.json"),
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
    return { ok: true, evidence };
  }

  return {
    ok: false,
    error: "Context7 MCP not detected in known locations.",
    install: ["npx ctx7 setup --claude"],
  };
}

/**
 * Resolves the Project_Config that decides which CLIs (and their plugins and
 * capabilities) are required. Three outcomes:
 *
 *  - File present and valid: roles come from the file, `source: "file"`.
 *  - File absent: roles come from the default stack `codex`/`agy`/`codex`/`agy`,
 *    `source: "default"`.
 *  - File present and invalid: the parser error becomes a failing **required**
 *    check (`checks.config.project-config`), which makes `status` be `failed`,
 *    and the Required_CLI_Set falls back to the default only so the report
 *    stays complete. The file is never rewritten: reading it does not touch
 *    the filesystem.
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

    // Fallback apenas para manter o relatorio completo: o status ja e
    // "failed", entao nenhuma decisao de workflow e tomada a partir destes
    // papeis.
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

// A Project_Config e resolvida antes de qualquer outro check: e ela que
// decide quais CLIs, plugins e capabilities sao obrigatorios.
const projectConfigState = resolveProjectConfigState(PROJECT_ROOT);
const requiredCliSet = projectConfigState.requiredCliSet;

const initialCodexCompanionBash = checkCodexCompanionBashPermission();
const autoRemediation = autoRemediateCodexCompanionBashPermission(initialCodexCompanionBash);
const finalCodexCompanionBash = checkCodexCompanionBashPermission();

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
    "codex-companion-bash": finalCodexCompanionBash,
    "goal-hooks-enabled": checkGoalHookSettings(),
  },
  capabilities: {
    "agy-help": checkAgyHelp(),
    "cc-antigravity-bridge": checkAntigravityBridge(),
  },
  optional: {
    mcp: {
      context7: checkContext7Mcp(),
    },
  },
};

/**
 * Obrigatoriedade por check.
 *
 * `cli.codex`/`plugins.openai-codex` sao obrigatorios se e somente se algum
 * papel da Project_Config usa `codex`; `cli.agy`/`plugins.cc-antigravity-plugin`
 * seguem a mesma regra para `agy`. A decisao vem inteira de
 * `deriveRequiredCliSet`: este script nao reimplementa a condicao.
 *
 * `capabilities.*` (flags de `agy --help` e do bridge) so importam quando o
 * `agy` e de fato obrigatorio - sem `agy` no Required_CLI_Set nao ha bridge a
 * validar.
 *
 * `config.project-config` e os itens de `permissions` sao obrigatorios em
 * qualquer configuracao.
 */
const REQUIRED_BY_CHECK = {
  config: { "project-config": true },
  cli: { codex: requiredCliSet.codex, agy: requiredCliSet.agy },
  plugins: {
    "openai-codex": requiredCliSet.codex,
    "cc-antigravity-plugin": requiredCliSet.agy,
  },
  permissions: { "codex-companion-bash": true, "goal-hooks-enabled": true },
  capabilities: {
    "agy-help": requiredCliSet.agy,
    "cc-antigravity-bridge": requiredCliSet.agy,
  },
};

/** Categoria usada em `failed` e em `warnings` por grupo de checks (singular). */
const CATEGORY_LABEL = {
  config: "config",
  cli: "cli",
  plugins: "plugin",
  permissions: "permission",
  capabilities: "capability",
};

/** Motivo de aviso para check reprovado que a Project_Config nao exige. */
const NOT_REQUIRED_BY_PROJECT_CONFIG = "NOT_REQUIRED_BY_PROJECT_CONFIG";

const failed = [];
const warnings = [];

// MCP ausente e sempre aviso, nunca bloqueio: entra primeiro porque contexto
// de codigo e documentacao valem para qualquer executor.
for (const [name, result] of Object.entries(checks.optional.mcp)) {
  if (result.ok) continue;
  warnings.push({
    category: "mcp",
    name,
    required: false,
    reason: result.reason ?? "NOT_DETECTED",
  });
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

const status = failed.length === 0 ? "ok" : "failed";

const report = {
  schemaVersion: PREFLIGHT_SCHEMA_VERSION,
  status,
  generatedAt: new Date().toISOString(),
  projectConfig: projectConfigState.block,
  checks,
  autoRemediation,
  warnings,
  failed,
  remediation: failed.length === 0 ? null : failed.map(remediationFor),
};

console.log(JSON.stringify(report, null, 2));
process.exit(status === "ok" ? 0 : 1);

function remediationFor(f) {
  const key = `${f.category}:${f.name}`;
  switch (key) {
    case "config:project-config":
      return {
        target: ".executor/project-config.md",
        steps: [
          "The Project_Config file exists but is invalid. Fix it manually or regenerate it:",
          "  node \"${CLAUDE_SKILL_DIR}/scripts/project-config.mjs\" write --backend-executor <codex|agy|claude-code> " +
            "--frontend-executor <v> --backend-reviewer <v> --frontend-reviewer <v>",
          "The file is never overwritten automatically - fix or regenerate it explicitly.",
        ],
        docs: null,
      };
    case "cli:codex":
      return {
        target: "codex-cli",
        steps: [
          "Install Codex CLI globally:",
          "  npm install -g @openai/codex",
          "Authenticate:",
          "  codex login",
          "Make sure the codex binary is on the global PATH.",
          "Or set backendExecutor/backendReviewer to claude-code in .executor/project-config.md " +
            "to drop this requirement:",
          "  node \"${CLAUDE_SKILL_DIR}/scripts/project-config.mjs\" write --backend-executor claude-code ...",
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
          "Or set frontendExecutor/frontendReviewer to claude-code in .executor/project-config.md " +
            "to drop this requirement:",
          "  node \"${CLAUDE_SKILL_DIR}/scripts/project-config.mjs\" write --frontend-executor claude-code ...",
        ],
        docs: "https://antigravity.google/docs/cli-using",
      };
    case "plugin:openai-codex":
      return {
        target: "Claude Code plugin: openai-codex",
        steps: [
          "Inside Claude Code:",
          "  /plugin marketplace add openai/codex-plugin-cc",
          "  /plugin install codex@openai-codex",
        ],
        docs: "https://github.com/openai/codex-plugin-cc",
      };
    case "plugin:cc-antigravity-plugin":
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
    case "permission:codex-companion-bash":
      return {
        target: "Claude Code permission: codex-companion via Bash",
        steps: [
          "Auto-remediation attempted and failed - see autoRemediation.error in this report.",
          "Create or update .claude/settings.json in the target project:",
          '  { "permissions": { "allow": ["Bash(node:*)"] } }',
          "Reload Claude Code before running /executor again.",
        ],
        docs: "https://docs.anthropic.com/en/docs/claude-code/settings",
      };
    case "permission:goal-hooks-enabled":
      return {
        target: "Claude Code /goal hook settings",
        steps: [
          "Ensure disableAllHooks and allowManagedHooksOnly are not set to true in the inspected settings files.",
        ],
        docs: null,
      };
    case "capability:agy-help":
      return {
        target: "agy CLI capability set",
        steps: [
          "Update Antigravity CLI to a current version:",
          "  agy update",
          "Confirm the required flags are available in `agy --help`.",
        ],
        docs: "https://antigravity.google/docs/cli-using",
      };
    case "capability:cc-antigravity-bridge":
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
