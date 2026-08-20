import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PREFLIGHT_SCRIPT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/preflight.mjs", import.meta.url),
);

const roots = [];

function temporaryProject() {
  const root = mkdtempSync(join(tmpdir(), "preflight-autoremediation-"));
  roots.push(root);
  return root;
}

test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

/** Fake HOME so the developer machine's real ~/.claude/settings.json never leaks in. */
function fakeHomeEnv(root) {
  const home = join(root, "fake-home");
  mkdirSync(home, { recursive: true });
  return { HOME: home, USERPROFILE: home };
}

function runPreflight(root, extraEnv = {}) {
  const run = spawnSync(process.execPath, [PREFLIGHT_SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...fakeHomeEnv(root), ...extraEnv },
  });
  // preflight.mjs always prints its JSON report to stdout, regardless of status.
  return { status: run.status, json: JSON.parse(run.stdout) };
}

test("auto-remediation creates .claude/settings.json when it does not exist", () => {
  const root = temporaryProject();
  const { json } = runPreflight(root);

  assert.equal(json.autoRemediation.attempted, true);
  assert.equal(json.autoRemediation.changed, true);
  assert.equal(json.autoRemediation.action, "created-settings-json");
  assert.equal(json.autoRemediation.ok, true);
  assert.equal(json.checks.permissions["codex-companion-bash"].ok, true);

  const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
  assert.ok(settings.permissions.allow.includes("Bash(node:*)"));
});

test("auto-remediation preserves an existing settings.json and appends the rule", () => {
  const root = temporaryProject();
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash(git status)"], deny: ["Bash(rm -rf /)"] } }, null, 2),
    "utf8",
  );

  const { json } = runPreflight(root);
  assert.equal(json.autoRemediation.action, "updated-settings-json");
  assert.equal(json.autoRemediation.ok, true);

  const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
  assert.deepEqual(settings.permissions.allow, ["Bash(git status)", "Bash(node:*)"]);
  assert.deepEqual(settings.permissions.deny, ["Bash(rm -rf /)"]);
});

test("auto-remediation refuses to touch invalid JSON and leaves the file untouched", () => {
  const root = temporaryProject();
  mkdirSync(join(root, ".claude"), { recursive: true });
  const broken = "{ not valid json";
  writeFileSync(join(root, ".claude", "settings.json"), broken, "utf8");

  const { json } = runPreflight(root);
  assert.equal(json.autoRemediation.attempted, true);
  assert.equal(json.autoRemediation.changed, false);
  assert.equal(json.autoRemediation.action, "blocked-invalid-json");
  assert.equal(json.autoRemediation.ok, false);

  assert.equal(readFileSync(join(root, ".claude", "settings.json"), "utf8"), broken);
});

test("auto-remediation is a no-op when the permission already exists", () => {
  const root = temporaryProject();
  mkdirSync(join(root, ".claude"), { recursive: true });
  const original = JSON.stringify({ permissions: { allow: ["Bash(node:*)"] } }, null, 2);
  writeFileSync(join(root, ".claude", "settings.json"), original, "utf8");

  const { json } = runPreflight(root);
  assert.equal(json.autoRemediation.attempted, false);
  assert.equal(json.autoRemediation.changed, false);
  assert.equal(json.autoRemediation.action, "none");
  assert.equal(readFileSync(join(root, ".claude", "settings.json"), "utf8"), original);
});
