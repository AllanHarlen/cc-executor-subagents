import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Detection tests for `checkContext7Mcp()` and `checkCodebaseMemoryMcp()` in
 * `preflight.mjs`. Before this suite, the Executor had no Codebase Memory MCP
 * check at all, and Context7 detection was a raw substring scan with no
 * `disabledMcpjsonServers` awareness — the same false-positive class
 * `cc-pensador`'s equivalent suite guards against. Both checks now go through
 * `findMcpServerAcrossCandidates()` (structured JSON parse, disabled-aware).
 */

const PREFLIGHT_SCRIPT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/preflight.mjs", import.meta.url),
);

const roots = [];

function temporaryProject() {
  const root = mkdtempSync(join(tmpdir(), "mcp-detection-"));
  roots.push(root);
  return root;
}

test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

/** PATH reduced to just the current node binary's directory (no real MCP binaries leak in). */
function nodeOnlyPath() {
  return dirname(process.execPath);
}

function fakeHomeEnv(root) {
  const home = join(root, "fake-home");
  mkdirSync(home, { recursive: true });
  return { home, env: { HOME: home, USERPROFILE: home } };
}

function runPreflight(root, envOverrides = {}, pathOverride = nodeOnlyPath()) {
  const run = spawnSync(process.execPath, [PREFLIGHT_SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...envOverrides, PATH: pathOverride, Path: pathOverride },
  });
  return JSON.parse(run.stdout);
}

test("Context7: absent with no config, skill or binary", () => {
  const root = temporaryProject();
  const { env } = fakeHomeEnv(root);
  const report = runPreflight(root, env);
  assert.equal(report.checks.optional.mcp.context7.ok, false);
});

test("Context7: does not count a server disabled for the current project in ~/.claude.json", () => {
  const root = temporaryProject();
  const { home, env } = fakeHomeEnv(root);
  const projectKey = root.split("\\").join("/");
  writeFileSync(
    join(home, ".claude.json"),
    JSON.stringify({
      projects: {
        [projectKey]: {
          mcpServers: { context7: { command: "npx" } },
          disabledMcpjsonServers: ["context7"],
        },
      },
    }),
  );
  const report = runPreflight(root, env);
  assert.equal(report.checks.optional.mcp.context7.ok, false);
});

test("Context7: ignores an unrelated 'context7' substring outside mcpServers", () => {
  const root = temporaryProject();
  const { home, env } = fakeHomeEnv(root);
  writeFileSync(
    join(home, ".claude.json"),
    JSON.stringify({ history: [{ display: "how do I use context7 here?" }] }),
  );
  const report = runPreflight(root, env);
  assert.equal(report.checks.optional.mcp.context7.ok, false);
});

test("Context7: detects a server registered at the project .mcp.json root", () => {
  const root = temporaryProject();
  const { env } = fakeHomeEnv(root);
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { context7: { command: "npx" } } }),
  );
  const report = runPreflight(root, env);
  assert.equal(report.checks.optional.mcp.context7.ok, true);
});

test("Codebase Memory: absent with no config, skill or binary", () => {
  const root = temporaryProject();
  const { env } = fakeHomeEnv(root);
  const report = runPreflight(root, env);
  assert.equal(report.checks.optional.mcp["codebase-memory"].ok, false);
});

test("Codebase Memory: does not count a server disabled for the current project", () => {
  const root = temporaryProject();
  const { home, env } = fakeHomeEnv(root);
  const projectKey = root.split("\\").join("/");
  writeFileSync(
    join(home, ".claude.json"),
    JSON.stringify({
      projects: {
        [projectKey]: {
          mcpServers: { "codebase-memory-mcp": { command: "node" } },
          disabledMcpjsonServers: ["codebase-memory-mcp"],
        },
      },
    }),
  );
  const report = runPreflight(root, env);
  assert.equal(report.checks.optional.mcp["codebase-memory"].ok, false);
});

test("Codebase Memory: detects a server registered only under .kiro/settings/mcp.json", () => {
  const root = temporaryProject();
  const { env } = fakeHomeEnv(root);
  mkdirSync(join(root, ".kiro", "settings"), { recursive: true });
  writeFileSync(
    join(root, ".kiro", "settings", "mcp.json"),
    JSON.stringify({ mcpServers: { "codebase-memory-mcp": { command: "node" } } }),
  );
  const report = runPreflight(root, env);
  assert.equal(report.checks.optional.mcp["codebase-memory"].ok, true);
});

test("Codebase Memory: an installed skill counts as evidence with no config entry", () => {
  const root = temporaryProject();
  const { home, env } = fakeHomeEnv(root);
  const skillDir = join(home, ".claude", "skills", "codebase-memory-mcp");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# codebase-memory-mcp\n");
  const report = runPreflight(root, env);
  const cbm = report.checks.optional.mcp["codebase-memory"];
  assert.equal(cbm.ok, true);
  assert.ok(cbm.evidence.some((e) => e.type === "skill"));
});

test("a missing optional MCP is a warning, never a failed check", () => {
  const root = temporaryProject();
  const { env } = fakeHomeEnv(root);
  const report = runPreflight(root, env);
  const mcpWarnings = report.warnings.filter((w) => w.category === "mcp");
  assert.deepEqual(
    mcpWarnings.map((w) => w.name).sort(),
    ["codebase-memory", "context7"],
  );
  assert.ok(report.failed.every((f) => f.category !== "mcp"));
});
