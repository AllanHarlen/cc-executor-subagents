import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PREFLIGHT_SCRIPT = fileURLToPath(
  new URL("../skills/executor-subagents/scripts/preflight.mjs", import.meta.url),
);

const roots = [];

function temporaryProject() {
  const root = mkdtempSync(join(tmpdir(), "preflight-shape-"));
  roots.push(root);
  return root;
}

test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function runPreflight(root) {
  const run = spawnSync(process.execPath, [PREFLIGHT_SCRIPT], { cwd: root, encoding: "utf8" });
  return JSON.parse(run.stdout);
}

test("report shape is schemaVersion 2, flat, with singular category labels", () => {
  const root = temporaryProject();
  const report = runPreflight(root);

  assert.equal(report.schemaVersion, 2);
  assert.ok(report.projectConfig, "projectConfig block must be present");
  assert.ok(report.checks.config, "checks.config must exist (flat, not nested under required/optional)");
  assert.ok(report.checks.cli);
  assert.ok(report.checks.plugins);
  assert.ok(report.checks.permissions);
  assert.ok(report.checks.capabilities);
  assert.ok(report.checks.optional?.mcp);

  // schemaVersion 1's nested shape must be gone.
  assert.equal(report.checks.required, undefined);

  for (const [group, results] of Object.entries(report.checks)) {
    if (group === "optional") continue;
    for (const [name, result] of Object.entries(results)) {
      assert.equal(typeof result.required, "boolean", `${group}.${name} must carry required: boolean`);
    }
  }

  const allCategories = [...report.failed, ...report.warnings].map((entry) => entry.category);
  for (const category of allCategories) {
    assert.ok(
      ["config", "cli", "plugin", "permission", "capability", "mcp"].includes(category),
      `category "${category}" must be singular`,
    );
  }
});

test("autoRemediation block is always present in the report", () => {
  const root = temporaryProject();
  const report = runPreflight(root);
  assert.ok("autoRemediation" in report);
  assert.equal(typeof report.autoRemediation.ok, "boolean");
});
