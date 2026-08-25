/**
 * Handoff contract sync guard.
 *
 * `references/handoff-contract.md` is the joint-operation contract shared
 * verbatim by the three workflow plugins (Pensador -> Orchestrador ->
 * Executor). Section 8 of the contract requires it to stay BYTE-IDENTICAL
 * across the three repos.
 *
 * This suite compares the executor's copy against the canonical cc-pensador
 * copy. Because the three plugins are independent git repos, the sibling may
 * not be checked out side by side - when it is absent the assertion is
 * SKIPPED (not failed), so a standalone cc-executor-subagents checkout stays
 * green while a combined workspace enforces the sync.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SIBLINGS_ROOT = join(REPO_ROOT, "..");

const OUR_COPY = join(REPO_ROOT, "skills/executor-subagents/references/handoff-contract.md");
const CANONICAL = join(SIBLINGS_ROOT, "cc-pensador/skills/pensador/references/handoff-contract.md");

/** Normalize line endings so git autocrlf differences do not cause false diffs. */
const normalize = (s) => s.replace(/\r\n/g, "\n");

test("the executor's own copy of handoff-contract.md exists", () => {
  assert.ok(existsSync(OUR_COPY), `${OUR_COPY} not found`);
});

const canonicalPresent = existsSync(CANONICAL);

test(
  "cc-pensador copy matches the executor's handoff-contract.md",
  { skip: !canonicalPresent },
  () => {
    const ours = normalize(readFileSync(OUR_COPY, "utf8"));
    const canonical = normalize(readFileSync(CANONICAL, "utf8"));
    assert.equal(ours, canonical);
  },
);

test(
  "cc-pensador copy is absent (sibling repo not checked out) - skipping sync check",
  { skip: canonicalPresent },
  () => {
    assert.equal(canonicalPresent, false);
  },
);
