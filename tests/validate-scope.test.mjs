import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/validate-scope.mjs", import.meta.url),
);
const EXECUTOR_STATE_SCRIPT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/executor-state.mjs", import.meta.url),
);

const roots = [];
function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".tmp-validate-scope-test-"));
  roots.push(root);
  return root;
}
test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(" ")} failed`);
  return String(result.stdout).trim();
}

function initGitRepo(root) {
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "executor-tests@example.invalid");
  git(root, "config", "user.name", "Executor Tests");
  writeFileSync(join(root, "README.md"), "seed\n", "utf8");
  git(root, "add", ".");
  git(root, "commit", "-m", "seed");
}

function runNode(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  let json;
  try {
    json = JSON.parse(result.stdout || result.stderr);
  } catch {
    json = undefined;
  }
  return { status: result.status, json };
}

test("stateless mode: --own restricts scope, files outside it are flagged", () => {
  const root = fixture();
  initGitRepo(root);
  mkdirSync(join(root, "src", "pages"), { recursive: true });
  mkdirSync(join(root, "src", "api"), { recursive: true });
  writeFileSync(join(root, "src", "pages", "index.tsx"), "// ok\n", "utf8");
  writeFileSync(join(root, "src", "api", "client.ts"), "// out of scope\n", "utf8");

  const { json } = runNode(SCRIPT, ["--root", root, "--own", "src/pages/**"], root);
  assert.equal(json.ok, true);
  assert.equal(json.result.summary.valid, false);
  assert.deepEqual(json.result.details.outOfScope, ["src/api/client.ts"]);
});

test("--deny wins over --own: a denied file is a violation even when --own also matches it", () => {
  const root = fixture();
  initGitRepo(root);
  mkdirSync(join(root, "src", "api"), { recursive: true });
  writeFileSync(join(root, "src", "api", "secrets.ts"), "// touched\n", "utf8");

  const { json } = runNode(
    SCRIPT,
    ["--root", root, "--own", "src/api/**", "--deny", "src/api/secrets.ts"],
    root,
  );
  assert.equal(json.result.summary.valid, false);
  assert.deepEqual(json.result.details.deniedFiles, ["src/api/secrets.ts"]);
});

test(".executor/ artifacts are ignored, never counted as scope violations", () => {
  const root = fixture();
  initGitRepo(root);
  mkdirSync(join(root, ".executor", "demo", "artefatos"), { recursive: true });
  writeFileSync(join(root, ".executor", "demo", "artefatos", "monitoring.md"), "log\n", "utf8");
  writeFileSync(join(root, "src.ts"), "// out of declared scope\n", "utf8");
  mkdirSync(join(root, "src"), { recursive: true });

  const { json } = runNode(SCRIPT, ["--root", root, "--own", "nothing-matches/**"], root);
  assert.ok(!json.result.details.changedFiles.some((f) => f.startsWith(".executor/")));
});

test("no --own and no state: every changed file counts as out of scope", () => {
  const root = fixture();
  initGitRepo(root);
  writeFileSync(join(root, "anything.ts"), "// untracked, unscoped\n", "utf8");

  const { json } = runNode(SCRIPT, ["--root", root], root);
  assert.equal(json.result.summary.ownPatterns, 0);
  assert.deepEqual(json.result.details.outOfScope, ["anything.ts"]);
});

test("state-backed mode: reads allowedPaths from a registered task in state.json", () => {
  const root = fixture();
  initGitRepo(root);
  const artifactDir = join(root, ".executor", "demo", "artefatos");

  const init = runNode(
    EXECUTOR_STATE_SCRIPT,
    ["init", "--slug", "demo", "--dir", artifactDir, "--root", root],
    root,
  );
  assert.equal(init.status, 0, JSON.stringify(init.json));

  const register = runNode(
    EXECUTOR_STATE_SCRIPT,
    [
      "task",
      "register",
      "--dir",
      artifactDir,
      "--task",
      "codex-1",
      "--allowed-path",
      "src/pages/**",
    ],
    root,
  );
  assert.equal(register.status, 0, JSON.stringify(register.json));

  mkdirSync(join(root, "src", "pages"), { recursive: true });
  mkdirSync(join(root, "src", "api"), { recursive: true });
  writeFileSync(join(root, "src", "pages", "index.tsx"), "// ok\n", "utf8");
  writeFileSync(join(root, "src", "api", "client.ts"), "// out of scope\n", "utf8");

  const { json } = runNode(
    SCRIPT,
    ["--root", root, "--dir", artifactDir, "--task", "codex-1"],
    root,
  );
  assert.equal(json.ok, true);
  assert.equal(json.result.summary.valid, false);
  assert.deepEqual(json.result.details.outOfScope, ["src/api/client.ts"]);
  assert.equal(json.result.summary.taskOwnershipNotRegistered, false);
});

test("state-backed mode: unknown task id fails with TASK_NOT_FOUND", () => {
  const root = fixture();
  initGitRepo(root);
  const artifactDir = join(root, ".executor", "demo", "artefatos");
  runNode(EXECUTOR_STATE_SCRIPT, ["init", "--slug", "demo", "--dir", artifactDir, "--root", root], root);

  const { status, json } = runNode(
    SCRIPT,
    ["--root", root, "--dir", artifactDir, "--task", "does-not-exist"],
    root,
  );
  assert.equal(status, 1);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "TASK_NOT_FOUND");
});
