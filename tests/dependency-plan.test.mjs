import assert from "node:assert/strict";
import test from "node:test";

import {
  CLI_PLUGIN_KEY,
  DEPENDENCY_KINDS,
  DependencyPlanError,
  INSTALLABLE_CLIS,
  MCP_CHECK_KEYS,
  buildDependencyPlanItem,
  buildMissingDependencies,
  summarizeInstallOutcome,
} from "../skills/executor-subagents/scripts/lib/dependency-plan.mjs";

const SEEDED_SECRET = "sk-token-que-nunca-deve-ser-registrado";

test("the executor's catalog drops codebase-memory (not used in this port phase)", () => {
  assert.deepEqual([...MCP_CHECK_KEYS], ["context7"]);
  assert.throws(
    () => buildDependencyPlanItem("codebase-memory"),
    (error) => error instanceof DependencyPlanError && error.code === "DEPENDENCY_PLAN_UNKNOWN_DEPENDENCY",
  );
});

test("codex installs via npm and delegates `codex login` to the user on any OS", () => {
  for (const platform of ["win32", "darwin", "linux"]) {
    const item = buildDependencyPlanItem("codex", { platform });
    assert.deepEqual([...item.command], ["npm install -g @openai/codex"]);
    assert.equal(item.interactiveFollowUp, "codex login");
    assert.equal(item.kind, "cli");
    assert.equal(item.optional, false);
  }
});

test("agy's install command differs by platform, auth is the user's first interactive run", () => {
  const win = buildDependencyPlanItem("agy", { platform: "win32" });
  assert.match(win.command[0], /install\.ps1/);
  const posix = buildDependencyPlanItem("agy", { platform: "linux" });
  assert.match(posix.command[0], /install\.sh/);
  assert.equal(win.interactiveFollowUp, "agy");
});

test("CLI_PLUGIN_KEY matches the preflight's checks.plugins keys (no parallel translation table)", () => {
  assert.deepEqual(CLI_PLUGIN_KEY, { codex: "openai-codex", agy: "cc-antigravity-plugin" });
  assert.deepEqual([...INSTALLABLE_CLIS].sort(), ["agy", "codex"]);
});

test("buildMissingDependencies derives from a preflight-shaped report: CLI and its plugin are independent", () => {
  const report = {
    projectConfig: {
      roles: { backendExecutor: "codex", frontendExecutor: "agy", backendReviewer: "codex", frontendReviewer: "agy" },
    },
    checks: {
      cli: { codex: { ok: false }, agy: { ok: true } },
      plugins: { "openai-codex": { ok: true }, "cc-antigravity-plugin": { ok: false } },
      optional: { mcp: { context7: { ok: true } } },
    },
  };
  const plan = buildMissingDependencies(report, { platform: "linux" });
  const keys = plan.map((item) => item.checkKey);
  // codex CLI failed (its plugin passed) and cc-antigravity-plugin failed (its
  // CLI passed) -- both surface, proving the two checks are independent.
  assert.deepEqual(keys, ["codex", "cc-antigravity-plugin"]);
});

test("buildMissingDependencies lists context7 first when it fails, before any CLI/plugin", () => {
  const report = {
    projectConfig: { roles: { backendExecutor: "claude-code", frontendExecutor: "claude-code", backendReviewer: "claude-code", frontendReviewer: "claude-code" } },
    checks: { cli: {}, plugins: {}, optional: { mcp: { context7: { ok: false } } } },
  };
  const plan = buildMissingDependencies(report, { platform: "linux" });
  assert.deepEqual(plan.map((item) => item.checkKey), ["context7"]);
});

test("all-claude-code Project_Config produces an empty plan even with no CLI on PATH", () => {
  const report = {
    projectConfig: { roles: { backendExecutor: "claude-code", frontendExecutor: "claude-code", backendReviewer: "claude-code", frontendReviewer: "claude-code" } },
    checks: { cli: { codex: { ok: false }, agy: { ok: false } }, plugins: {}, optional: { mcp: { context7: { ok: true } } } },
  };
  const plan = buildMissingDependencies(report, { platform: "linux" });
  assert.deepEqual(plan, []);
});

test("summarizeInstallOutcome returns exactly the five allowlisted fields, ignoring stdout/stderr/output", () => {
  const item = buildDependencyPlanItem("codex", { platform: "linux" });
  const outcome = summarizeInstallOutcome(item, {
    decision: "instalar",
    exitCode: 0,
    durationMs: 1234,
    stdout: SEEDED_SECRET,
    stderr: SEEDED_SECRET,
    output: SEEDED_SECRET,
  });
  assert.deepEqual(Object.keys(outcome).sort(), ["command", "decision", "durationMs", "exitCode", "name"]);
  assert.deepEqual(outcome.command, item.command);
  assert.equal(JSON.stringify(outcome).includes(SEEDED_SECRET), false);
});

test("summarizeInstallOutcome rejects a decision outside the allowlist", () => {
  const item = buildDependencyPlanItem("agy", { platform: "linux" });
  assert.throws(
    () => summarizeInstallOutcome(item, { decision: "yolo" }),
    (error) => error instanceof DependencyPlanError && error.code === "DEPENDENCY_PLAN_INVALID_DECISION",
  );
});
