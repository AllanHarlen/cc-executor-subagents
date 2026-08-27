import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPLETION_GATE_DEFINITIONS,
  GATE_STATUSES,
  initRun,
  updateCompletionGate,
  updateRunStatus,
} from "../skills/executor-subagents/scripts/lib/executor-state.mjs";

const EXECUTOR_STATE_SCRIPT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/executor-state.mjs", import.meta.url),
);

const roots = [];
function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".tmp-completion-gates-test-"));
  roots.push(root);
  return root;
}
test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function initFixture(root, slug = "demo") {
  const artifactDir = join(root, ".executor", slug, "artefatos");
  initRun({ slug, artifactDir, projectRoot: root });
  return artifactDir;
}

test("a fresh run starts with all five gates PENDING, required matching waivable", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  const { state } = updateCompletionGate(artifactDir, "verificacao", "PENDING", { projectRoot: root });
  for (const [gateId, definition] of Object.entries(COMPLETION_GATE_DEFINITIONS)) {
    const gate = state.completionGates[gateId];
    assert.equal(gate.status, "PENDING");
    assert.equal(gate.required, !definition.waivable);
    assert.equal(gate.phase, definition.phase);
  }
});

test("run cannot be DONE while a required gate is open, and closes once it is", () => {
  const root = fixture();
  const artifactDir = initFixture(root);

  assert.throws(
    () => updateRunStatus(artifactDir, "DONE", { projectRoot: root }),
    (error) => error.code === "RUN_GATES_NOT_CLOSED" && error.details.gates.some((g) => g.id === "verificacao"),
  );

  updateCompletionGate(artifactDir, "verificacao", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "reports", "DONE", { projectRoot: root });

  const result = updateRunStatus(artifactDir, "DONE", { projectRoot: root });
  assert.equal(result.state.status, "DONE");
});

test("a non-waivable gate (verificacao, reports) cannot be marked N/A", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  assert.throws(
    () => updateCompletionGate(artifactDir, "reports", "N/A", { projectRoot: root }),
    (error) => error.code === "GATE_NOT_WAIVABLE",
  );
});

test("a waivable gate that was never required (review, e2e, handoff) closes N/A with a reason and does not block DONE", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  updateCompletionGate(artifactDir, "verificacao", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "reports", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "review", "N/A", { projectRoot: root, reason: "no predefined plan" });
  updateCompletionGate(artifactDir, "e2e", "N/A", { projectRoot: root, reason: "no separate front-end origin" });
  updateCompletionGate(artifactDir, "handoff", "N/A", { projectRoot: root, reason: "independent mode, no upstream handoff" });

  const result = updateRunStatus(artifactDir, "DONE", { projectRoot: root });
  assert.equal(result.state.status, "DONE");
});

test("marking N/A without a reason is rejected", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  assert.throws(
    () => updateCompletionGate(artifactDir, "review", "N/A", { projectRoot: root }),
    (error) => error.code === "GATE_WAIVER_REQUIRES_REASON",
  );
});

test("waiving a gate that was marked --required true blocks DONE (RUN_GATES_WAIVED), even with a reason", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  updateCompletionGate(artifactDir, "verificacao", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "reports", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "e2e", "N/A", { projectRoot: root, reason: "no separate front-end origin" });
  updateCompletionGate(artifactDir, "handoff", "N/A", { projectRoot: root, reason: "independent mode" });

  // review was determined applicable (predefined plan detected in Fase 1) ...
  updateCompletionGate(artifactDir, "review", "PENDING", { projectRoot: root, required: true });
  // ... but the LLM/operator later dispenses it instead of actually running it.
  const { gate } = updateCompletionGate(artifactDir, "review", "N/A", {
    projectRoot: root,
    reason: "Codex quota exhausted, no fallback available",
  });
  assert.equal(gate.status, "N/A");
  assert.equal(gate.required, false);
  assert.equal(gate.requiredOverride, false);

  assert.throws(
    () => updateRunStatus(artifactDir, "DONE", { projectRoot: root }),
    (error) =>
      error.code === "RUN_GATES_WAIVED" &&
      error.details.gates.some((g) => g.id === "review" && g.reason === "Codex quota exhausted, no fallback available"),
  );
});

test("a gate marked --required true and then genuinely closed DONE is not a waiver and does not block the run", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  updateCompletionGate(artifactDir, "verificacao", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "reports", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "e2e", "N/A", { projectRoot: root, reason: "no separate front-end origin" });
  updateCompletionGate(artifactDir, "handoff", "N/A", { projectRoot: root, reason: "independent mode" });

  updateCompletionGate(artifactDir, "review", "PENDING", { projectRoot: root, required: true });
  updateCompletionGate(artifactDir, "review", "DONE", { projectRoot: root, evidence: "plan-vs-output-review.md" });

  const result = updateRunStatus(artifactDir, "DONE", { projectRoot: root });
  assert.equal(result.state.status, "DONE");
});

test("declaring a gate required and N/A in the same call is a contradiction and is rejected", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  assert.throws(
    () => updateCompletionGate(artifactDir, "review", "N/A", { projectRoot: root, required: true, reason: "contradiction" }),
    (error) => error.code === "REQUIRED_GATE_CANNOT_BE_SKIPPED",
  );
});

test("a non-waivable gate rejects an explicit --required override", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  assert.throws(
    () => updateCompletionGate(artifactDir, "verificacao", "DONE", { projectRoot: root, required: false }),
    (error) => error.code === "GATE_APPLICABILITY_FIXED",
  );
});

test("--required true on a waivable gate makes it block DONE until closed", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  updateCompletionGate(artifactDir, "verificacao", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "reports", "DONE", { projectRoot: root });
  updateCompletionGate(artifactDir, "review", "PENDING", { projectRoot: root, required: true });

  assert.throws(
    () => updateRunStatus(artifactDir, "DONE", { projectRoot: root }),
    (error) => error.code === "RUN_GATES_NOT_CLOSED" && error.details.gates.some((g) => g.id === "review"),
  );
});

test("evidence accumulates across updates instead of being overwritten", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  updateCompletionGate(artifactDir, "verificacao", "PENDING", { projectRoot: root, evidence: "intel-a" });
  const { gate } = updateCompletionGate(artifactDir, "verificacao", "DONE", { projectRoot: root, evidence: "intel-b" });
  assert.deepEqual([...gate.evidence].sort(), ["intel-a", "intel-b"]);
});

test("unknown gate id and invalid status are rejected", () => {
  const root = fixture();
  const artifactDir = initFixture(root);
  assert.throws(
    () => updateCompletionGate(artifactDir, "not-a-gate", "DONE", { projectRoot: root }),
    (error) => error.code === "UNKNOWN_COMPLETION_GATE",
  );
  assert.throws(
    () => updateCompletionGate(artifactDir, "verificacao", "MAYBE", { projectRoot: root }),
    (error) => error.code === "INVALID_GATE_STATUS",
  );
});

test("GATE_STATUSES is exactly the four canonical values", () => {
  assert.deepEqual(GATE_STATUSES, ["PENDING", "DONE", "BLOCKED", "N/A"]);
});

test("CLI: gate subcommand round-trips through the real process", () => {
  const root = fixture();
  const artifactDir = join(root, ".executor", "demo", "artefatos");
  const init = spawnSync(
    process.execPath,
    [EXECUTOR_STATE_SCRIPT, "init", "--slug", "demo", "--dir", artifactDir, "--root", root],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(init.status, 0, init.stderr);

  const gate = spawnSync(
    process.execPath,
    [
      EXECUTOR_STATE_SCRIPT,
      "gate",
      "--dir",
      artifactDir,
      "--gate",
      "e2e",
      "--status",
      "N/A",
      "--reason",
      "no separate front-end origin",
      "--root",
      root,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(gate.status, 0, gate.stderr);
  const parsed = JSON.parse(gate.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.gate.status, "N/A");
  assert.equal(parsed.gate.reason, "no separate front-end origin");
});
