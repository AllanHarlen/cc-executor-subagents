import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPTS_ROOT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/", import.meta.url),
);

const roots = [];
function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".tmp-intelligence-test-"));
  roots.push(root);
  return root;
}
test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

/**
 * Gives the fixture its own `.git`, so `git diff` run inside it never falls
 * through to this repo's real `.git` (fixtures live under `process.cwd()`, a
 * subdirectory of the actual cc-executor-subagents checkout).
 */
function initGitRepo(root) {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "executor-tests@example.invalid"], { cwd: root });
  spawnSync("git", ["config", "user.name", "Executor Tests"], { cwd: root });
}

function runScript(name, args, cwd, input) {
  const result = spawnSync(process.execPath, [join(SCRIPTS_ROOT, name), ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    input,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || `${name} failed`);
  assert.ok(Buffer.byteLength(result.stdout) < 256_000, `${name} output was not compact`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  return parsed;
}

test("inspect-diff.mjs on a clean repo with no changes returns an empty file list", () => {
  const root = fixture();
  initGitRepo(root);
  const parsed = runScript("inspect-diff.mjs", ["--root", root], root);
  assert.equal(parsed.result.kind, "inspect-diff");
  assert.equal(parsed.result.summary.filesChanged, 0);
  assert.match(parsed.result.evidenceId, /^intel-inspect-diff-[a-f0-9]{20}$/);
});

test("collect-test-results.mjs parses a JUnit XML file and reports PASS/FAIL correctly", () => {
  const root = fixture();
  const junit = join(root, "results.xml");
  writeFileSync(
    junit,
    '<testsuite tests="3" failures="1" errors="0" skipped="0" time="1.2"></testsuite>',
    "utf8",
  );
  const parsed = runScript("collect-test-results.mjs", ["--root", root, "--input", junit], root);
  assert.equal(parsed.result.summary.total, 3);
  assert.equal(parsed.result.summary.failed, 1);
  assert.equal(parsed.result.summary.status, "FAIL");
  assert.equal(parsed.validation.status, "FAIL");
});

test("collect-test-results.mjs on an unparseable file reports UNKNOWN, not a crash", () => {
  const root = fixture();
  const junk = join(root, "not-a-result.txt");
  writeFileSync(junk, "hello world, nothing to see here", "utf8");
  const parsed = runScript("collect-test-results.mjs", ["--root", root, "--input", junk], root);
  assert.equal(parsed.result.summary.status, "UNKNOWN");
});

test("validate-wire-format.mjs catches a JSON Schema violation", () => {
  const root = fixture();
  const schemaPath = join(root, "schema.json");
  const payloadPath = join(root, "payload.json");
  writeFileSync(
    schemaPath,
    JSON.stringify({
      type: "object",
      required: ["id", "name"],
      additionalProperties: false,
      properties: { id: { type: "integer" }, name: { type: "string" } },
    }),
    "utf8",
  );
  writeFileSync(payloadPath, JSON.stringify({ id: "not-a-number", name: "ok" }), "utf8");
  const parsed = runScript(
    "validate-wire-format.mjs",
    ["--root", root, "--payload", payloadPath, "--schema", schemaPath],
    root,
  );
  assert.equal(parsed.result.summary.valid, false);
  assert.ok(parsed.result.summary.issueCount > 0);
  assert.ok(parsed.result.details.issues.some((issue) => issue.code === "TYPE_MISMATCH"));
});

test("check-agy-prompt.mjs approves a prompt under the limit and rejects one over it", () => {
  const root = fixture();
  const ok = runScript("check-agy-prompt.mjs", ["--stdin"], root, "a".repeat(100));
  assert.equal(ok.ok, true);
  assert.equal(ok.chars, 100);

  const over = spawnSync(process.execPath, [join(SCRIPTS_ROOT, "check-agy-prompt.mjs"), "--stdin"], {
    cwd: root,
    encoding: "utf8",
    input: "a".repeat(28_001),
  });
  assert.equal(over.status, 1);
  const parsed = JSON.parse(over.stdout || over.stderr);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "AGY_PROMPT_OVER_LIMIT");
  assert.equal(parsed.error.details.overBy, 1);
});
