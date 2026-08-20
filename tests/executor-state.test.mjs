import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  ExecutorStateError,
  findRunDirectory,
  heartbeatTask,
  initRun,
  loadRun,
  registerTask,
  reconcileRunAtDirectory,
  resumeRunAtDirectory,
  sweepStalledTasks,
  updateRunStatus,
  updateTaskStatus,
  verifyRun,
} from "../skills/executor-subagents/scripts/lib/executor-state.mjs";

const roots = [];

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(" ")} failed`);
  return String(result.stdout).trim();
}

/** root/.executor/<slug>/artefatos, matching the real layout `resolveProjectRoot` expects. */
function fixture(slug = "demo-run") {
  const root = mkdtempSync(join(process.cwd(), ".tmp-executor-state-test-"));
  roots.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "executor-tests@example.invalid");
  git(root, "config", "user.name", "Executor Tests");
  writeFileSync(join(root, "README.md"), "fixture\n", "utf8");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "init");
  const artifactDir = join(root, ".executor", slug, "artefatos");
  return { root, artifactDir, slug };
}

test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

test("initRun creates a run and is idempotent on repeat calls", () => {
  const { artifactDir, slug } = fixture();
  const first = initRun({ slug, artifactDir });
  assert.equal(first.created, true);
  assert.equal(first.state.status, "RUNNING");
  assert.equal(first.state.projectConfig.roles.backendExecutor, "codex");

  const second = initRun({ slug, artifactDir });
  assert.equal(second.created, false);
  assert.equal(second.state.runId, first.state.runId);
});

test("event replay repairs a missing snapshot after a simulated crash", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", {});
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex" });

  rmSync(join(artifactDir, "state.json"));
  const loaded = loadRun(artifactDir, { repairSnapshot: true });
  assert.equal(loaded.snapshotRecovered, true);
  assert.equal(loaded.state.tasks["codex-1"].status, "RUNNING");
  assert.ok(existsSync(join(artifactDir, "state.json")), "repairSnapshot must rewrite state.json");
});

test("an incomplete final event line is discarded, not treated as corruption", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", {});
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex" });

  const eventsPath = join(artifactDir, "events.jsonl");
  const before = readFileSync(eventsPath, "utf8");
  // Simulate a crash mid-append: a partial, never-durable JSON fragment with no trailing newline.
  writeFileSync(eventsPath, `${before}{"eventSchemaVersion":1,"eventId":"x","revision":4,"typ`, "utf8");

  assert.throws(() => verifyRun(artifactDir), (error) => error instanceof ExecutorStateError && error.code === "TRUNCATED_EVENT_TAIL");

  const result = resumeRunAtDirectory(artifactDir);
  assert.equal(result.state.revision, 5); // 3 prior events + RUN_RESUMED + RUN_RECONCILED
  assert.equal(verifyRun(artifactDir).valid, true);
});

test("snapshot ahead of the event log is a hard error, never silently repaired", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  const statePath = join(artifactDir, "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.revision = 99;
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

  assert.throws(() => loadRun(artifactDir), (error) => error instanceof ExecutorStateError && error.code === "SNAPSHOT_AHEAD_OF_LOG");
});

test("a duplicated event revision is a hard error", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  const eventsPath = join(artifactDir, "events.jsonl");
  const lines = readFileSync(eventsPath, "utf8").trim().split("\n");
  writeFileSync(eventsPath, `${lines.join("\n")}\n${lines[0]}\n`, "utf8");

  assert.throws(() => loadRun(artifactDir), (error) => error instanceof ExecutorStateError && error.code === "DUPLICATE_EVENT_REVISION");
});

test("resume converts an interrupted RUNNING task to UNKNOWN, never FAILED or DONE", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", {});
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex" });

  const result = resumeRunAtDirectory(artifactDir);
  assert.deepEqual(result.unknownTasks, ["codex-1"]);
  assert.equal(result.state.tasks["codex-1"].status, "UNKNOWN");
  assert.equal(result.state.tasks["codex-1"].reasonCode, "OWNER_SESSION_INTERRUPTED");
});

test("reconcile without an authoritative probe keeps an UNKNOWN task UNKNOWN, using Git/file evidence only as corroboration", () => {
  const { root, artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", { expectedFiles: ["src/output.txt"] });
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex" });
  resumeRunAtDirectory(artifactDir); // RUNNING -> UNKNOWN

  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "output.txt"), "produced\n", "utf8");
  git(root, "add", "src/output.txt");
  git(root, "commit", "-m", "partial work");

  const reconciled = reconcileRunAtDirectory(artifactDir);
  assert.equal(reconciled.state.tasks["codex-1"].status, "UNKNOWN");
  assert.equal(reconciled.state.tasks["codex-1"].reconciliation.recommendation, "VERIFY_BEFORE_REEXECUTE");
});

test("a terminal DONE task cannot be silently reopened", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", {});
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex" });
  updateTaskStatus(artifactDir, "codex-1", "DONE", { evidence: "manual confirmation" });

  assert.throws(
    () => updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex" }),
    (error) => error instanceof ExecutorStateError && error.code === "INVALID_TASK_TRANSITION",
  );
});

test("DONE requires local evidence: no expected/produced files, no passing validation, no commit delta -> rejected", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", {});
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex" });

  assert.throws(
    () => updateTaskStatus(artifactDir, "codex-1", "DONE", {}),
    (error) => error instanceof ExecutorStateError && error.code === "TASK_DONE_REQUIRES_EVIDENCE",
  );
});

test("stall sweep only flags a RUNNING task after the idle threshold elapses, and grace period gates the escalated recommendation", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", {});
  const started = new Date("2026-01-01T00:00:00Z");
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex", now: started });

  // Well within the idle threshold: no stall.
  const early = sweepStalledTasks(artifactDir, {
    now: new Date(started.getTime() + 60_000),
    staleIdleSeconds: 450,
    stallGraceSeconds: 120,
  });
  assert.equal(early.changed, false);

  // Past the idle threshold: STALLED, with INTERRUPT_THEN_RECONCILE and not yet grace-expired.
  const stalled = sweepStalledTasks(artifactDir, {
    now: new Date(started.getTime() + 500_000),
    staleIdleSeconds: 450,
    stallGraceSeconds: 120,
  });
  assert.equal(stalled.changed, true);
  assert.deepEqual(stalled.stalled, ["codex-1"]);
  assert.equal(stalled.state.tasks["codex-1"].stall.recommendation, "INTERRUPT_THEN_RECONCILE");
  assert.equal(stalled.state.tasks["codex-1"].stall.graceExpiredAt, undefined);

  // A heartbeat recovers the task, clearing the stalled state.
  const recovered = heartbeatTask(artifactDir, "codex-1", { now: new Date(started.getTime() + 510_000), apiCalls: 1 });
  assert.equal(recovered.changed, true);
  assert.equal(recovered.task.status, "RUNNING");
  assert.ok(recovered.task.stall.recoveredAt);
});

test("stall grace expiry escalates the recommendation only after stallGraceSeconds elapses (not on raw duration alone)", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", {});
  const started = new Date("2026-01-01T00:00:00Z");
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex", now: started });
  sweepStalledTasks(artifactDir, { now: new Date(started.getTime() + 500_000), staleIdleSeconds: 450, stallGraceSeconds: 120 });

  // Still inside the grace window: recommendation unchanged.
  const stillGraced = sweepStalledTasks(artifactDir, {
    now: new Date(started.getTime() + 550_000),
    staleIdleSeconds: 450,
    stallGraceSeconds: 120,
  });
  assert.equal(stillGraced.changed, false);

  // Past the grace window: recommendation escalates.
  const graceExpired = sweepStalledTasks(artifactDir, {
    now: new Date(started.getTime() + 650_000),
    staleIdleSeconds: 450,
    stallGraceSeconds: 120,
  });
  assert.equal(graceExpired.changed, true);
  assert.deepEqual(graceExpired.graceExpired, ["codex-1"]);
  assert.equal(graceExpired.state.tasks["codex-1"].stall.recommendation, "CANCEL_OR_RETRY_AFTER_RECONCILIATION");
});

test("run cannot be DONE while a task remains non-terminal", () => {
  const { artifactDir, slug } = fixture();
  initRun({ slug, artifactDir });
  registerTask(artifactDir, "codex-1", {});
  updateTaskStatus(artifactDir, "codex-1", "RUNNING", { executor: "codex" });

  assert.throws(
    () => updateRunStatus(artifactDir, "DONE"),
    (error) => error instanceof ExecutorStateError && error.code === "RUN_TASKS_NOT_TERMINAL",
  );

  updateTaskStatus(artifactDir, "codex-1", "DONE", { evidence: "done" });
  const done = updateRunStatus(artifactDir, "DONE");
  assert.equal(done.state.status, "DONE");
});

test("findRunDirectory prefers an explicit artifactDir over the checkpoint index", () => {
  const { artifactDir } = fixture();
  assert.equal(findRunDirectory({ artifactDir }), artifactDir);
});
