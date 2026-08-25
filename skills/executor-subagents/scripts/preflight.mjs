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
 *  - Codebase Memory MCP (optional, reported, never blocking)
 *  - `checks.optional.mcp` above is a file-based aggregate (any config
 *    location, any agent); pass `--check-agent-mcp` to also probe
 *    `codex mcp list --json` and `agy mcp list` directly and get
 *    `checks.optional.mcpPerAgent`, live per-agent ground truth (see
 *    `lib/mcp-agent-cli.mjs`).
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
 *   node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs" [--check-agent-mcp]
 *   node scripts/preflight.mjs [--check-agent-mcp] # compatibility wrapper
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
import {
  CODEBASE_MEMORY_BINARY_NAMES,
  CODEBASE_MEMORY_CONFIG_CANDIDATES,
  CODEBASE_MEMORY_DEFINITION_MARKERS,
  CODEBASE_MEMORY_SERVER_NAMES,
  CODEBASE_MEMORY_SKILL_CANDIDATES,
  CONTEXT7_BINARY_NAMES,
  CONTEXT7_CONFIG_CANDIDATES,
  CONTEXT7_DEFINITION_MARKERS,
  CONTEXT7_MCP_DIRECTORY_CANDIDATES,
  CONTEXT7_SERVER_NAMES,
  CONTEXT7_SKILL_CANDIDATES,
  resolveCandidate,
} from "./lib/mcp-candidates.mjs";
import { detectAgentMcpServers } from "./lib/mcp-agent-cli.mjs";
import { agentMcpInstallCommand } from "./lib/mcp-agent-install.mjs";

const HOME = homedir();
const PROJECT_ROOT = process.cwd();
const PLUGINS_CACHE = join(HOME, ".claude", "plugins", "cache");
const PROJECT_CLAUDE_DIR = join(PROJECT_ROOT, ".claude");
const PROJECT_SETTINGS_FILE = join(PROJECT_CLAUDE_DIR, "settings.json");
const MIN_ANTIGRAVITY_PLUGIN_VERSION = "4.0.0";
const MIN_AGY_VERSION = "1.1.8";
const RECOMMENDED_AGY_VERSION = "1.1.16";
const PREFLIGHT_SCHEMA_VERSION = 2;

/**
 * Opt-in: probes each installed agent's own `mcp list` subcommand for live,
 * per-agent ground truth (see `lib/mcp-agent-cli.mjs`), instead of just the
 * file-based `checks.optional.mcp` aggregate. Off by default because it
 * shells out (real wall-clock cost, up to `AGENT_CLI_TIMEOUT_MS` per agent per
 * server) and depends on `codex`/`agy` being reachable on PATH — neither of
 * which the rest of this script requires. Pass `--check-agent-mcp` to include
 * `checks.optional.mcpPerAgent` in the report.
 */
const CHECK_AGENT_MCP = process.argv.includes("--check-agent-mcp");

const REQUIRED_AGY_FLAGS = [
  "--print",
  "--add-dir",
  "--dangerously-skip-permissions",
  "--print-timeout",
  "--prompt-interactive",
  "--output-format",
  "--mode",
  "--model",
  "--effort",
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
  "--format",
  "--effort",
  "--mode",
  "--json-schema",
  "--allow-slash-commands",
  "--interactive",
  "--agent",
];
const REQUIRED_ANTIGRAVITY_PLUGIN_FILES = [
  "agents/antigravity-coder.md",
  "agents/antigravity-agent.md",
  "commands/antigravity.md",
  "scripts/antigravity-bridge.js",
];

// Parses a strict `major.minor.patch` (with optional prerelease) version string.
function parseSemver(version) {
  const match = String(version ?? "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    core: match.slice(1, 4).map((part) => Number(part)),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    const delta = a.core[index] - b.core[index];
    if (delta !== 0) return delta;
  }
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  return a.prerelease.join(".").localeCompare(b.prerelease.join("."));
}

function checkCli(cli, options = {}) {
  try {
    const out = execSync(`${cli} --version`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).toString().trim();
    const versionLine = out.split(/\r?\n/)[0];
    const version = versionLine.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;
    if (options.minVersion && (!version || compareSemver(version, options.minVersion) < 0)) {
      return {
        ok: false,
        version: version ?? versionLine,
        minVersion: options.minVersion,
        error: `${cli} ${options.minVersion}+ is required (found ${version ?? versionLine})`,
      };
    }
    return {
      ok: true,
      version: version ?? versionLine,
      minVersion: options.minVersion ?? null,
      recommendedVersion: options.recommendedVersion ?? null,
      recommended: options.recommendedVersion && version
        ? compareSemver(version, options.recommendedVersion) >= 0
        : null,
    };
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

  const missingFiles = REQUIRED_ANTIGRAVITY_PLUGIN_FILES.filter(
    (relativePath) => !existsSync(join(plugin.versionPath, relativePath)),
  );
  if (missingFiles.length > 0) {
    return {
      ok: false,
      version: plugin.version,
      minVersion: MIN_ANTIGRAVITY_PLUGIN_VERSION,
      bridgePath,
      requiredFiles: REQUIRED_ANTIGRAVITY_PLUGIN_FILES,
      missingFiles,
      error: `cc-antigravity-plugin is missing required files: ${missingFiles.join(", ")}`,
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
      requiredFiles: REQUIRED_ANTIGRAVITY_PLUGIN_FILES,
      missingFiles: [],
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

/**
 * Reads one JSON MCP config file into its `{ servers, disabled }` maps: the
 * top-level `mcpServers` (if any) and, for `~/.claude.json` specifically, the
 * `projects.<cwd>.mcpServers` block for the CURRENT project (matched with
 * `normalizePathKey`, so backslash/forward-slash and trailing separators
 * don't cause a false negative), together with that project's
 * `disabledMcpjsonServers`. Returns `[]` for a missing/unparseable file — an
 * unreadable config is not evidence either way.
 */
function readMcpServerMaps(file, cwd) {
  let json;
  try {
    if (!existsSync(file)) return [];
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  if (!json || typeof json !== "object") return [];

  const maps = [];
  if (json.mcpServers && typeof json.mcpServers === "object") {
    maps.push({ servers: json.mcpServers, disabled: [] });
  }
  if (json.projects && typeof json.projects === "object") {
    const wanted = normalizePathKey(cwd);
    for (const [key, project] of Object.entries(json.projects)) {
      if (normalizePathKey(key) !== wanted) continue;
      if (project?.mcpServers && typeof project.mcpServers === "object") {
        maps.push({
          servers: project.mcpServers,
          disabled: Array.isArray(project.disabledMcpjsonServers)
            ? project.disabledMcpjsonServers
            : [],
        });
      }
    }
  }
  return maps;
}

/** `<path>` normalized for the `projects` key match in `~/.claude.json`. */
function normalizePathKey(p) {
  return String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Finds an MCP server registration across `files`, matching either the
 * server's NAME (against `names`) or a marker inside its definition
 * (`markers` — package spec or endpoint, for a server registered under a
 * custom name). Servers listed in `disabledMcpjsonServers` do not count.
 *
 * Parses the JSON rather than substring-scanning the raw text — this matters
 * most for `~/.claude.json`, Claude Code's entire user config (100+ KB of
 * per-project `allowedTools`, example paths and history), where a bare
 * substring hit is not evidence of anything.
 */
function findMcpServer(files, cwd, names, markers = []) {
  const wanted = names.map((n) => n.toLowerCase());
  const wantedMarkers = markers.map((m) => m.toLowerCase());
  for (const file of files) {
    for (const { servers, disabled } of readMcpServerMaps(file, cwd)) {
      const off = new Set(disabled.map((n) => String(n).toLowerCase()));
      for (const [name, definition] of Object.entries(servers)) {
        const key = name.toLowerCase();
        if (off.has(key)) continue;
        if (wanted.includes(key)) return { path: file, server: name };
        if (wantedMarkers.length === 0) continue;
        let blob = "";
        try {
          blob = JSON.stringify(definition ?? "").toLowerCase();
        } catch {
          blob = "";
        }
        if (wantedMarkers.some((m) => blob.includes(m))) return { path: file, server: name };
      }
    }
  }
  return null;
}

/**
 * Same search as `findMcpServer()`, but over the `{ base, segments, format }`
 * candidates of `scripts/lib/mcp-candidates.mjs` instead of plain paths.
 * `"json"` candidates go through `findMcpServer()`. The one `"toml"`
 * candidate (`~/.codex/config.toml`) has no structured parser here — matched
 * by raw substring, since writing a TOML parser for a single candidate is not
 * worth the maintenance cost (see the header comment in `mcp-candidates.mjs`).
 */
function findMcpServerAcrossCandidates(candidates, ctx, names, markers = []) {
  const jsonPaths = candidates
    .filter((c) => c.format !== "toml")
    .map((c) => resolveCandidate(c, ctx));
  const hit = findMcpServer(jsonPaths, ctx.cwd, names, markers);
  if (hit) return hit;

  const needles = [...names, ...markers].map((s) => s.toLowerCase());
  for (const candidate of candidates.filter((c) => c.format === "toml")) {
    const path = resolveCandidate(candidate, ctx);
    let text = "";
    try {
      text = existsSync(path) ? readFileSync(path, "utf8").toLowerCase() : "";
    } catch {
      text = "";
    }
    if (text && needles.some((n) => text.includes(n))) return { path, server: null };
  }
  return null;
}

/**
 * OPTIONAL: Context7 MCP — current, versioned library/framework/SDK/API/cloud
 * documentation, consulted before implementing or debugging against one.
 * Candidate locations, server names and definition markers live in
 * `scripts/lib/mcp-candidates.mjs` (canonical union kept in sync with
 * Pensador/Orchestrator by `cc-pensador/test/mcp-detection-parity.test.js`).
 */
/** Agents whose own CLI exposes a real `mcp list` subcommand (see `mcp-agent-cli.mjs`). */
const MCP_INTROSPECTABLE_AGENTS = ["codex", "agy"];

/**
 * Live per-agent ground truth for the two MCP servers, via each agent's own
 * `mcp list` subcommand. See `lib/mcp-agent-cli.mjs` for why this exists and
 * what it does and does not extract, and `CHECK_AGENT_MCP` above for why it
 * is opt-in rather than part of the default report.
 *
 * Callers deciding whether to promise the tool in a Codex- or AGY-targeted
 * subagent prompt should prefer this result for that agent, and fall back to
 * the aggregate `checks.optional.mcp.<server>.ok` only when `checked` is
 * `false` here (binary unreachable, timeout, unparseable output — not proof
 * of absence).
 *
 * `install` carries the exact `mcp add` command to offer via `AskUserQuestion`
 * (see `mcp-agent-install.mjs`) whenever `checked: true, ok: false` — i.e. the
 * agent's own CLI was reachable and genuinely does not have the server
 * registered. It stays `null` when `ok: true` (nothing to install) or
 * `checked: false` (absence not established — offering an install here would
 * act on a guess).
 */
function withInstall(agent, server, detection) {
  return { ...detection, install: detection.checked && !detection.ok ? agentMcpInstallCommand(agent, server) : null };
}

function checkAgentMcp() {
  const result = {};
  for (const agent of MCP_INTROSPECTABLE_AGENTS) {
    result[agent] = {
      "codebase-memory": withInstall(agent, "codebase-memory", detectAgentMcpServers(agent, CODEBASE_MEMORY_SERVER_NAMES)),
      context7: withInstall(agent, "context7", detectAgentMcpServers(agent, CONTEXT7_SERVER_NAMES)),
    };
  }
  return result;
}

function checkContext7Mcp() {
  const ctx = { home: HOME, cwd: PROJECT_ROOT };
  const evidence = [];

  for (const candidate of CONTEXT7_SKILL_CANDIDATES) {
    const path = resolveCandidate(candidate, ctx);
    if (existsSync(path)) evidence.push({ type: "skill", path });
  }
  for (const candidate of CONTEXT7_MCP_DIRECTORY_CANDIDATES) {
    const path = resolveCandidate(candidate, ctx);
    if (existsSync(path)) evidence.push({ type: "mcp-directory", path });
  }
  const cli = checkCli(CONTEXT7_BINARY_NAMES[0]);
  if (cli.ok) evidence.push({ type: "binary", path: CONTEXT7_BINARY_NAMES[0] });

  const hit = findMcpServerAcrossCandidates(
    CONTEXT7_CONFIG_CANDIDATES,
    ctx,
    CONTEXT7_SERVER_NAMES,
    CONTEXT7_DEFINITION_MARKERS,
  );
  if (hit) evidence.push({ type: "mcp-config", path: hit.path, server: hit.server });

  if (evidence.length > 0) return { ok: true, evidence };

  return {
    ok: false,
    error: "Context7 MCP not detected in known locations.",
    install: ["npx ctx7 setup --claude"],
  };
}

/**
 * OPTIONAL: Codebase Memory MCP — the code graph (architecture, call chains,
 * diff impact) the Orchestrator uses across its whole run. The Executor uses
 * the same server but only in the phases a short, single-task run pays for:
 * Fase 1 (Triagem — `search_graph`/`trace_path`/`get_code_snippet`) and Fase 5
 * (Integração — `detect_changes` on the diff). See
 * `references/mcp-context.md`, Parte 1. Candidate locations and server names
 * live in `scripts/lib/mcp-candidates.mjs` (canonical union kept in sync with
 * Pensador/Orchestrator by `cc-pensador/test/mcp-detection-parity.test.js`).
 */
function checkCodebaseMemoryMcp() {
  const ctx = { home: HOME, cwd: PROJECT_ROOT };
  const evidence = [];

  for (const candidate of CODEBASE_MEMORY_SKILL_CANDIDATES) {
    const path = resolveCandidate(candidate, ctx);
    if (existsSync(path)) evidence.push({ type: "skill", path });
  }
  const cli = checkCli(CODEBASE_MEMORY_BINARY_NAMES[0]);
  if (cli.ok) evidence.push({ type: "binary", path: CODEBASE_MEMORY_BINARY_NAMES[0] });

  const hit = findMcpServerAcrossCandidates(
    CODEBASE_MEMORY_CONFIG_CANDIDATES,
    ctx,
    CODEBASE_MEMORY_SERVER_NAMES,
    CODEBASE_MEMORY_DEFINITION_MARKERS,
  );
  if (hit) evidence.push({ type: "mcp-config", path: hit.path, server: hit.server });

  if (evidence.length > 0) return { ok: true, evidence };

  return {
    ok: false,
    error: "Codebase Memory MCP not detected in known locations.",
    install: [
      "curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash",
      "Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1; .\\install.ps1",
    ],
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
    agy: checkCli("agy", {
      minVersion: MIN_AGY_VERSION,
      recommendedVersion: RECOMMENDED_AGY_VERSION,
    }),
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
      "codebase-memory": checkCodebaseMemoryMcp(),
    },
    ...(CHECK_AGENT_MCP ? { mcpPerAgent: checkAgentMcp() } : {}),
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
          `Install or update Antigravity CLI to at least ${MIN_AGY_VERSION} (${RECOMMENDED_AGY_VERSION} recommended):`,
          "  macOS/Linux: curl -fsSL https://antigravity.google/cli/install.sh | bash",
          "  Windows: irm https://antigravity.google/cli/install.ps1 | iex",
          "  Or update in place: agy update",
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
          `Update Antigravity CLI to at least ${MIN_AGY_VERSION} (${RECOMMENDED_AGY_VERSION} recommended):`,
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
          "Confirm the bridge help exposes the required flags and the plugin ships " +
            "agents/antigravity-coder.md, agents/antigravity-agent.md, commands/antigravity.md " +
            "and scripts/antigravity-bridge.js.",
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
