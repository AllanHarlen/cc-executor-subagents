import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  ARTIFACT_LAYOUT_VERSION,
  LAYOUT_ROOT_FILES,
  artifactRelativePath,
  artifactWritePath,
  detectArtifactLayout,
  ensureArtifactLayout,
  resolveArtifact,
} from "../skills/executor-subagents/scripts/lib/artifact-layout.mjs";

const roots = [];

function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".tmp-artifact-layout-test-"));
  roots.push(root);
  return root;
}

test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

// handoff.json and initial-plan-baseline.md stay at the run root because
// references/handoff-contract.md is byte-identical across the three plugins
// (cc-pensador, cc-orchestrador-subagents, cc-executor-subagents) and names
// these two paths literally as relative to the artifact root. Moving either
// one under a subdirectory (e.g. report/handoff.json, as layout v2 would
// naively do) is the exact drift that already broke the orchestrador copy of
// the shared contract - this test is the guard against repeating it here.
test("handoff.json and initial-plan-baseline.md are pinned to LAYOUT_ROOT_FILES", () => {
  assert.ok(LAYOUT_ROOT_FILES.includes("handoff.json"));
  assert.ok(LAYOUT_ROOT_FILES.includes("initial-plan-baseline.md"));
});

test("artifactRelativePath resolves handoff.json and initial-plan-baseline.md to the bare filename at root, in every layout version", () => {
  for (const layoutVersion of [1, 2]) {
    assert.equal(artifactRelativePath("handoff.json", layoutVersion), "handoff.json");
    assert.equal(artifactRelativePath("initial-plan-baseline.md", layoutVersion), "initial-plan-baseline.md");
  }
});

test("state.json, events.jsonl and .state.lock also never move, in every layout version", () => {
  for (const layoutVersion of [1, 2]) {
    for (const file of ["state.json", "events.jsonl", ".state.lock"]) {
      assert.equal(artifactRelativePath(file, layoutVersion), file);
    }
  }
});

test("ARTIFACT_LAYOUT_VERSION defaults to 1 (flat) for this phase of the port", () => {
  assert.equal(ARTIFACT_LAYOUT_VERSION, 1);
});

test("a layout-2 file (e.g. implementation-report.md) moves under report/ only in layout 2", () => {
  assert.equal(artifactRelativePath("implementation-report.md", 1), "implementation-report.md");
  assert.equal(artifactRelativePath("implementation-report.md", 2), "report/implementation-report.md");
});

test("reading falls back from layout 2 to layout 1: a file placed at the flat root is still found", () => {
  const root = fixture();
  writeFileSync(join(root, "implementation-report.md"), "legacy flat report\n", "utf8");
  const resolved = resolveArtifact(root, "implementation-report.md");
  assert.ok(resolved);
  assert.equal(resolved.relativePath, "implementation-report.md");
});

test("writing reuses an existing file's real path instead of creating a duplicate in the other layout", () => {
  const root = fixture();
  writeFileSync(join(root, "implementation-report.md"), "legacy flat report\n", "utf8");
  const writePath = artifactWritePath(root, "implementation-report.md", 2);
  assert.equal(writePath.relativePath, "implementation-report.md");
  assert.equal(existsSync(join(root, "report", "implementation-report.md")), false);
});

test("detectArtifactLayout infers 1 for a run with no snapshot but an existing events.jsonl (never reorganize mid-flight)", () => {
  const root = fixture();
  writeFileSync(join(root, "events.jsonl"), "", "utf8");
  assert.equal(detectArtifactLayout(root), 1);
});

test("detectArtifactLayout reads layoutVersion off an existing snapshot", () => {
  const root = fixture();
  writeFileSync(join(root, "state.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
  assert.equal(detectArtifactLayout(root), 2);
});

test("ensureArtifactLayout on layout 1 does not create any subdirectory", () => {
  const root = fixture();
  ensureArtifactLayout(root, 1);
  assert.equal(existsSync(join(root, "plan")), false);
  assert.equal(existsSync(join(root, "report")), false);
});
