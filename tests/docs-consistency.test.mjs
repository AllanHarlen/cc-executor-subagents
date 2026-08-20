/**
 * Docs <-> Spec consistency guard.
 *
 * `executor-spec.mjs` is the single source of truth for the phase order, the
 * work-type vocabulary and the identifiers retired from the plugin's prose.
 * Nothing imports it at runtime - it exists so this suite can assert that
 * `SKILL.md`, `references/workflow.md` and the rest of the prose stay in
 * lockstep with it. Changing a phase or retiring an identifier means changing
 * `executor-spec.mjs` AND the prose in the same commit, or this test fails.
 *
 * `tests/` is excluded from the scan because it necessarily contains the
 * forbidden tokens as string/regex literals. `CHANGELOG.md` is excluded only
 * from the retired-identifier guard: a changelog is expected to name what was
 * removed, historically.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PHASE_ORDER, RETIRED_IDENTIFIERS, WORK_TYPES } from "../skills/executor-subagents/scripts/executor-spec.mjs";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".claude",
  ".claude-plugin",
  ".antigravitycli",
  ".executor",
  "tests",
]);
const SCAN_EXT = new Set([".md", ".mjs", ".js", ".json"]);

function collectFiles(dir = REPO_ROOT) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
    } else if ([...SCAN_EXT].some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const FILES = collectFiles();
const rel = (f) => relative(REPO_ROOT, f).split(sep).join("/");

test("scan finds the core executor docs (otherwise the guard is vacuous)", () => {
  const names = FILES.map(rel);
  assert.ok(names.includes("skills/executor-subagents/SKILL.md"));
  assert.ok(names.includes("skills/executor-subagents/references/workflow.md"));
  assert.ok(names.includes("commands/executor.md"));
});

test("every PHASE_ORDER entry is a '### Fase N' heading in SKILL.md", () => {
  const file = FILES.find((f) => rel(f) === "skills/executor-subagents/SKILL.md");
  const content = readFileSync(file, "utf8");
  for (const phase of PHASE_ORDER) {
    const heading = `### Fase ${phase} -`;
    assert.ok(content.includes(heading), `SKILL.md is missing heading "${heading}"`);
  }
});

test("every PHASE_ORDER entry is a '## Fase N' heading in references/workflow.md", () => {
  const file = FILES.find((f) => rel(f) === "skills/executor-subagents/references/workflow.md");
  const content = readFileSync(file, "utf8");
  for (const phase of PHASE_ORDER) {
    const heading = `## Fase ${phase} -`;
    assert.ok(content.includes(heading), `workflow.md is missing heading "${heading}"`);
  }
});

test("SKILL.md phase headings do not exceed PHASE_ORDER (no undeclared phase)", () => {
  const file = FILES.find((f) => rel(f) === "skills/executor-subagents/SKILL.md");
  const content = readFileSync(file, "utf8");
  const found = [...content.matchAll(/^### Fase ([0-9]+(?:\.[0-9]+)?) -/gm)].map((m) => Number(m[1]));
  const declared = new Set(PHASE_ORDER.map(Number));
  const undeclared = found.filter((phase) => !declared.has(phase));
  assert.deepEqual(undeclared, [], `SKILL.md declares phases not in PHASE_ORDER: ${undeclared.join(", ")}`);
});

test("every WORK_TYPES entry appears backtick-quoted in SKILL.md and workflow.md", () => {
  const skill = readFileSync(FILES.find((f) => rel(f) === "skills/executor-subagents/SKILL.md"), "utf8");
  const workflow = readFileSync(
    FILES.find((f) => rel(f) === "skills/executor-subagents/references/workflow.md"),
    "utf8",
  );
  for (const type of WORK_TYPES) {
    const token = `\`${type}\``;
    assert.ok(skill.includes(token), `SKILL.md is missing work type ${token}`);
    assert.ok(workflow.includes(token), `workflow.md is missing work type ${token}`);
  }
});

// CHANGELOG.md is expected to name what it retired. executor-spec.mjs is the
// spec module itself: it necessarily declares the identifier as a string
// literal in RETIRED_IDENTIFIERS, so it cannot be a violation of its own rule.
const RETIRED_IDENTIFIER_SCAN_EXCLUDES = new Set([
  "CHANGELOG.md",
  "skills/executor-subagents/scripts/executor-spec.mjs",
]);

test("no file reintroduces a retired identifier (CHANGELOG.md and executor-spec.mjs excluded)", () => {
  for (const identifier of RETIRED_IDENTIFIERS) {
    const offenders = FILES.filter(
      (f) => !RETIRED_IDENTIFIER_SCAN_EXCLUDES.has(rel(f)) && readFileSync(f, "utf8").includes(identifier),
    ).map(rel);
    assert.deepEqual(offenders, [], `retired identifier "${identifier}" found in: ${offenders.join(", ")}`);
  }
});

test("checkpoint template does not declare a retired identifier as a field", () => {
  const file = FILES.find(
    (f) => rel(f) === "skills/executor-subagents/assets/checkpoint-template.json",
  );
  const content = readFileSync(file, "utf8");
  for (const identifier of RETIRED_IDENTIFIERS) {
    assert.ok(!content.includes(identifier), `checkpoint-template.json still declares "${identifier}"`);
  }
});
