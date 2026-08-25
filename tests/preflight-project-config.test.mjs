import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Acceptance test da Fase 1.1: com a Project_Config toda em `claude-code`, o
 * preflight passa mesmo com `codex`/`agy` fora do PATH.
 */

const PREFLIGHT_SCRIPT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/preflight.mjs", import.meta.url),
);
const PROJECT_CONFIG_SCRIPT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/project-config.mjs", import.meta.url),
);

const roots = [];

function temporaryProject() {
  const root = mkdtempSync(join(tmpdir(), "preflight-project-config-"));
  roots.push(root);
  return root;
}

test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

/** PATH reduzido a apenas o diretorio do binario node atual (sem codex/agy). */
function nodeOnlyPath() {
  return dirname(process.execPath);
}

/** Fake HOME so the developer machine's real ~/.claude/settings.json never leaks in. */
function fakeHomeEnv(root) {
  const home = join(root, "fake-home");
  mkdirSync(home, { recursive: true });
  return { HOME: home, USERPROFILE: home };
}

function runNode(script, args, root, envOverrides = {}) {
  const run = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...fakeHomeEnv(root), ...envOverrides },
  });
  // preflight.mjs and project-config.mjs always print their JSON report to
  // stdout via executeJsonCli/console.log, regardless of exit status.
  let json;
  try {
    json = JSON.parse(run.stdout);
  } catch {
    json = undefined;
  }
  return { status: run.status, json, stdout: run.stdout, stderr: run.stderr };
}

test("all-claude-code Project_Config passes preflight with no codex/agy on PATH", () => {
  const root = temporaryProject();
  writeFileSync(
    join(root, ".mcp.json"),
    "{}",
    "utf8",
  ); // keeps context7 detection deterministic (absent), does not affect required checks

  const write = runNode(
    PROJECT_CONFIG_SCRIPT,
    [
      "write",
      "--backend-executor",
      "claude-code",
      "--frontend-executor",
      "claude-code",
      "--backend-reviewer",
      "claude-code",
      "--frontend-reviewer",
      "claude-code",
    ],
    root,
  );
  assert.equal(write.status, 0, write.stderr);

  const preflight = runNode(PREFLIGHT_SCRIPT, [], root, { PATH: nodeOnlyPath(), Path: nodeOnlyPath() });
  assert.equal(preflight.status, 0, preflight.stdout || preflight.stderr);
  assert.equal(preflight.json.status, "ok");
  assert.deepEqual(preflight.json.failed, []);

  const requiredCliFailures = preflight.json.warnings.filter(
    (w) => w.category === "cli" && (w.name === "codex" || w.name === "agy"),
  );
  assert.equal(requiredCliFailures.length, 2, "codex and agy should both be downgraded to warnings");
  for (const warning of requiredCliFailures) {
    assert.equal(warning.reason, "NOT_REQUIRED_BY_PROJECT_CONFIG");
  }
});

test("default Project_Config (no file) requires codex and agy", () => {
  const root = temporaryProject();
  const preflight = runNode(PREFLIGHT_SCRIPT, [], root, { PATH: nodeOnlyPath(), Path: nodeOnlyPath() });

  assert.equal(preflight.json.status, "failed");
  const failedNames = preflight.json.failed.map((f) => `${f.category}:${f.name}`);
  assert.ok(failedNames.includes("cli:codex"));
  assert.ok(failedNames.includes("cli:agy"));
  assert.equal(preflight.json.projectConfig.source, "default");
});

test("an invalid project-config.md fails preflight without being rewritten", () => {
  const root = temporaryProject();
  mkdirSync(join(root, ".executor"), { recursive: true });
  writeFileSync(join(root, ".executor", "project-config.md"), "not a config file\n", "utf8");

  const preflight = runNode(PREFLIGHT_SCRIPT, [], root, { PATH: nodeOnlyPath(), Path: nodeOnlyPath() });
  assert.equal(preflight.json.status, "failed");
  const configCheck = preflight.json.failed.find((f) => f.category === "config" && f.name === "project-config");
  assert.ok(configCheck, "config:project-config must be in failed");
  assert.equal(configCheck.code, "PROJECT_CONFIG_UNPARSEABLE");

  assert.equal(
    readFileSync(join(root, ".executor", "project-config.md"), "utf8"),
    "not a config file\n",
    "invalid file must never be rewritten by preflight",
  );
});
