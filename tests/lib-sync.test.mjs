/**
 * Duplicated-module sync guard.
 *
 * `lib/mcp-agent-install.mjs` is duplicated verbatim between
 * cc-orchestrador-subagents and cc-executor-subagents (both install MCP
 * servers into the same set of agent CLIs). Of the ~12 modules shared
 * across the three workflow-chain plugins (see workspace CLAUDE.md), this
 * is the one that happens to be byte-identical today — the others
 * (project-config.mjs, dependency-plan.mjs, intelligence.mjs, ...) already
 * carry legitimate per-plugin differences and have no byte-identity
 * invariant to protect. This guard exists so mcp-agent-install.mjs doesn't
 * silently drift the way those others did before anyone declared an
 * intentional divergence.
 *
 * Because the two plugins are independent git repos, the sibling may not be
 * checked out side by side — when it is absent the assertion is SKIPPED
 * (not failed), mirroring handoff-contract-sync.test.mjs.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SIBLINGS_ROOT = join(REPO_ROOT, "..");

const OUR_COPY = join(REPO_ROOT, "skills/executor-subagents/scripts/lib/mcp-agent-install.mjs");
const SIBLING = join(
  SIBLINGS_ROOT,
  "cc-orchestrador-subagents/skills/orchestrator-multi-agent-development/scripts/lib/mcp-agent-install.mjs",
);

const normalize = (s) => s.replace(/\r\n/g, "\n");

test("the executor's own copy of mcp-agent-install.mjs exists", () => {
  assert.ok(existsSync(OUR_COPY), `${OUR_COPY} not found`);
});

const siblingPresent = existsSync(SIBLING);

test(
  "cc-orchestrador-subagents copy of mcp-agent-install.mjs matches the executor's",
  { skip: !siblingPresent },
  () => {
    const ours = normalize(readFileSync(OUR_COPY, "utf8"));
    const sibling = normalize(readFileSync(SIBLING, "utf8"));
    assert.equal(
      ours,
      sibling,
      "mcp-agent-install.mjs has drifted between cc-executor-subagents and cc-orchestrador-subagents — " +
        "either resync them or, if the divergence is now intentional, replace this guard with one that " +
        "documents and checks only the invariant that must still hold.",
    );
  },
);

test(
  "cc-orchestrador-subagents copy is absent (sibling repo not checked out) - skipping sync check",
  { skip: siblingPresent },
  () => {
    assert.equal(siblingPresent, false);
  },
);
