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
 * removed, historically. Any `.tmp-*` directory is excluded too: other test
 * files create and tear down `mkdtempSync(join(process.cwd(), ".tmp-*-test-"))`
 * fixtures concurrently (node:test runs files in parallel), so scanning them
 * here is both irrelevant and a source of ENOENT races against a sibling
 * test's afterEach cleanup.
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
    if (SKIP_DIRS.has(entry) || entry.startsWith(".tmp-")) continue;
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

// CHANGELOG.md and references/persistent-state.md are expected to name what
// they retired/migrated, historically. executor-spec.mjs is the spec module
// itself: it necessarily declares the identifier as a string literal in
// RETIRED_IDENTIFIERS, so it cannot be a violation of its own rule.
// checkpoint-index.mjs is the migration code that reads a legacy
// `codex_excluido` field on old checkpoints specifically to surface a
// migration note and drop it - referencing the retired name is the point.
const RETIRED_IDENTIFIER_SCAN_EXCLUDES = new Set([
  "CHANGELOG.md",
  "skills/executor-subagents/scripts/executor-spec.mjs",
  "skills/executor-subagents/scripts/lib/checkpoint-index.mjs",
  "skills/executor-subagents/references/persistent-state.md",
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

// `preflight.mjs` is a runnable CLI script (unconditional top-level
// `console.log`/`process.exit`), not a pure module - it cannot be imported
// here without executing a real preflight. Its `MIN_ANTIGRAVITY_PLUGIN_VERSION`
// is instead read as text, the same pattern the rest of this suite uses to
// keep prose in lockstep with code.
const PREFLIGHT_SOURCE = readFileSync(
  FILES.find((f) => rel(f) === "skills/executor-subagents/scripts/preflight.mjs"),
  "utf8",
);
const MIN_ANTIGRAVITY_PLUGIN_VERSION = PREFLIGHT_SOURCE.match(
  /const MIN_ANTIGRAVITY_PLUGIN_VERSION = "([^"]+)"/,
)?.[1];

test("preflight.mjs declares MIN_ANTIGRAVITY_PLUGIN_VERSION (otherwise the version guard below is vacuous)", () => {
  assert.ok(MIN_ANTIGRAVITY_PLUGIN_VERSION, "could not find MIN_ANTIGRAVITY_PLUGIN_VERSION in preflight.mjs");
});

// The bug that motivated this guard: preflight.mjs required cc-antigravity-plugin
// >= 4.0.0 while SKILL.md/README*.md still advertised 3.6.0. Nothing failed
// loudly - the prose was just wrong. This test fails the moment the two
// diverge again, in either direction.
const VERSION_SYNCED_DOCS = [
  "skills/executor-subagents/SKILL.md",
  "skills/executor-subagents/references/preflight-check.md",
  "skills/executor-subagents/assets/implementation-report-template.md",
  "README.md",
  "README.pt-BR.md",
];

test("MIN_ANTIGRAVITY_PLUGIN_VERSION from preflight.mjs appears in every doc that advertises the requirement", () => {
  for (const path of VERSION_SYNCED_DOCS) {
    const file = FILES.find((f) => rel(f) === path);
    assert.ok(file, `expected ${path} to be part of the scanned file set`);
    const content = readFileSync(file, "utf8");
    assert.ok(
      content.includes(MIN_ANTIGRAVITY_PLUGIN_VERSION),
      `${path} does not mention cc-antigravity-plugin ${MIN_ANTIGRAVITY_PLUGIN_VERSION}`,
    );
  }
});

// Routing guard: implementation (front-end/UI, parallel fan-out, image/asset)
// must delegate to `antigravity-coder` (the agent with bridge write access);
// `antigravity-agent` is read-only in the cc-antigravity-plugin 4.0 contract
// and routing implementation to it silently writes nothing. This is exactly
// the critical bug this release fixes - the guard exists so it cannot regress.
const SUBAGENT_PROMPTS = readFileSync(
  FILES.find((f) => rel(f) === "skills/executor-subagents/references/subagent-prompts.md"),
  "utf8",
);

// Split into top-level `## N. <title>` sections (the file's own structure).
function splitSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      current = { title: heading[1], body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections.map((s) => ({ title: s.title, text: s.body.join("\n") }));
}

const AGY_IMPLEMENTATION_SECTIONS = ["AGY front-end/UI", "AGY fan-out paralelo", "AGY imagem/asset"];
const AGY_READONLY_SECTIONS = ["AGY analise cross-file"];

test("AGY implementation sections in subagent-prompts.md route to antigravity-coder, never antigravity-agent", () => {
  const sections = splitSections(SUBAGENT_PROMPTS);
  for (const label of AGY_IMPLEMENTATION_SECTIONS) {
    const section = sections.find((s) => s.title.includes(label));
    assert.ok(section, `expected a "## N. ${label}" section in subagent-prompts.md`);
    assert.match(
      section.text,
      /\*\*Subagent type:\*\* `cc-antigravity-plugin:antigravity-coder`/,
      `"${label}" must declare antigravity-coder as its Subagent type`,
    );
    assert.doesNotMatch(
      section.text,
      /\*\*Subagent type:\*\* `cc-antigravity-plugin:antigravity-agent`/,
      `"${label}" is implementation work and must not route to the read-only antigravity-agent`,
    );
  }
});

test("AGY analysis sections in subagent-prompts.md stay on the read-only antigravity-agent", () => {
  const sections = splitSections(SUBAGENT_PROMPTS);
  for (const label of AGY_READONLY_SECTIONS) {
    const section = sections.find((s) => s.title.includes(label));
    assert.ok(section, `expected a "## N. ${label}" section in subagent-prompts.md`);
    assert.match(
      section.text,
      /\*\*Subagent type:\*\* `cc-antigravity-plugin:antigravity-agent`/,
      `"${label}" must declare antigravity-agent as its Subagent type`,
    );
  }
});
