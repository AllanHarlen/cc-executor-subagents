#!/usr/bin/env node
/**
 * Preflight check for cc-executor-subagents.
 *
 * Required:
 * - codex CLI
 * - openai-codex Claude Code plugin
 * - Bash permission for the Codex companion
 *
 * Optional:
 * - agy CLI and cc-antigravity-plugin
 * - /goal hook compatibility
 * - Context7 MCP
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const PLUGINS_CACHE = join(HOME, ".claude", "plugins", "cache");
const PROJECT_CLAUDE_DIR = join(process.cwd(), ".claude");

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
  versions.sort();
  return { ok: true, version: versions[versions.length - 1], path: dir };
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

const checks = {
  required: {
    cli: {
      codex: checkCli("codex"),
    },
    plugins: {
      "openai-codex": checkPlugin("openai-codex", "codex"),
    },
    permissions: {
      "codex-companion-bash": checkCodexCompanionBashPermission(),
    },
  },
  optional: {
    cli: {
      agy: checkCli("agy"),
    },
    plugins: {
      "cc-antigravity-plugin": checkPlugin("cc-antigravity-plugin", "cc-antigravity-plugin"),
    },
    permissions: {
      "goal-hooks-enabled": checkGoalHookSettings(),
    },
    mcp: {
      context7: checkContext7Mcp(),
    },
  },
};

const failed = [];
const warnings = [];

collectFailures(checks.required, failed);
collectFailures(checks.optional, warnings);

const report = {
  status: failed.length === 0 ? "ok" : "failed",
  generatedAt: new Date().toISOString(),
  checks,
  failed,
  warnings,
  remediation: failed.length === 0 ? null : failed.map(remediationFor),
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "ok" ? 0 : 1);

function collectFailures(group, target) {
  for (const [category, values] of Object.entries(group)) {
    for (const [name, result] of Object.entries(values)) {
      if (!result.ok) target.push({ category, name, ...result });
    }
  }
}

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
    default:
      return {
        target: f.name,
        steps: ["Check the dependency manually."],
        docs: null,
      };
  }
}
