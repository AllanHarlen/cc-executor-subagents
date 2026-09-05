/**
 * Guarda de integridade de referencias entre docs e codigo:
 *
 *  1. Toda referencia a arquivos de references/, assets/ ou scripts/ (canonico,
 *     via ${CLAUDE_SKILL_DIR}) citada em SKILL.md, nos dois READMEs, no
 *     commands/executor.md e nas proprias references/ aponta para um
 *     arquivo que existe de fato.
 *  2. Bijecao entre `scripts/` (wrappers de compatibilidade) e
 *     `skills/executor-subagents/scripts/` (CLIs canonicos) -- exceto
 *     `executor-spec.mjs`, que e fonte de verdade doc<->codigo e nao e CLI.
 *  3. Todo `command` de tipo "script" em `lib/gates.mjs::planGates()` aponta
 *     para um CLI canonico que existe de fato.
 *
 * Espelha cc-testador-subagents/tests/docs-links.test.mjs. Esta suite
 * existe porque nenhuma das outras (`docs-consistency.test.mjs` so compara
 * constantes JS entre si, nunca le Markdown) teria pego a prosa obsoleta em
 * commands/executor.md (N-13, revisao 2026-09-04): a ordem de descoberta de
 * handoff upstream la descrita contradizia SKILL.md ha uma versao inteira.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKILL_ROOT = join(REPO_ROOT, "skills", "executor-subagents");
const CANONICAL_SCRIPTS_DIR = join(SKILL_ROOT, "scripts");
const WRAPPER_SCRIPTS_DIR = join(REPO_ROOT, "scripts");
const REFERENCES_DIR = join(SKILL_ROOT, "references");
const ASSETS_DIR = join(SKILL_ROOT, "assets");

const DOC_FILES = [
  join(SKILL_ROOT, "SKILL.md"),
  join(REPO_ROOT, "README.md"),
  join(REPO_ROOT, "README.pt-BR.md"),
  join(REPO_ROOT, "commands", "executor.md"),
  ...readdirSync(REFERENCES_DIR).filter((f) => f.endsWith(".md")).map((f) => join(REFERENCES_DIR, f)),
];

function readText(path) {
  return readFileSync(path, "utf8");
}

// --- 1. Todo caminho citado em prosa resolve para um arquivo real ---

test("every references/*.md citation in the docs points to a file that exists", () => {
  const pattern = /references\/([a-z0-9-]+\.md)/g;
  for (const docPath of DOC_FILES) {
    const text = readText(docPath);
    for (const match of text.matchAll(pattern)) {
      // A citation explicitly qualified as belonging to a sibling plugin
      // (e.g. "references/open-design.md do cc-pensador") points outside
      // this plugin's own references/ by design — skip it.
      const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 40);
      if (/^[`'"\s]*do\s+cc-/.test(tail)) continue;
      const target = join(REFERENCES_DIR, match[1]);
      assert.ok(existsSync(target), `${docPath} cites references/${match[1]}, which does not exist at ${target}`);
    }
  }
});

test("every assets/* citation in the docs points to a file that exists", () => {
  const pattern = /assets\/([a-z0-9.-]+\.(?:json|md))/g;
  for (const docPath of DOC_FILES) {
    const text = readText(docPath);
    for (const match of text.matchAll(pattern)) {
      const target = join(ASSETS_DIR, match[1]);
      assert.ok(existsSync(target), `${docPath} cites assets/${match[1]}, which does not exist at ${target}`);
    }
  }
});

test("every ${CLAUDE_SKILL_DIR}/scripts/*.mjs citation points to a canonical CLI that exists", () => {
  const pattern = /\$\{CLAUDE_SKILL_DIR\}\/scripts\/([a-z0-9-]+\.mjs)/g;
  for (const docPath of DOC_FILES) {
    const text = readText(docPath);
    for (const match of text.matchAll(pattern)) {
      const target = join(CANONICAL_SCRIPTS_DIR, match[1]);
      assert.ok(existsSync(target), `${docPath} cites \${CLAUDE_SKILL_DIR}/scripts/${match[1]}, which does not exist at ${target}`);
    }
  }
});

// --- 2. Bijecao wrapper <-> canonico ---

test("every root scripts/ wrapper has a canonical counterpart in skills/executor-subagents/scripts/", () => {
  const wrappers = readdirSync(WRAPPER_SCRIPTS_DIR).filter((f) => f.endsWith(".mjs"));
  assert.ok(wrappers.length > 0, "expected at least one wrapper");
  for (const name of wrappers) {
    const canonical = join(CANONICAL_SCRIPTS_DIR, name);
    assert.ok(existsSync(canonical), `wrapper scripts/${name} has no canonical counterpart at skills/executor-subagents/scripts/${name}`);
  }
});

test("every canonical CLI (except executor-spec.mjs) has a compatibility wrapper in scripts/", () => {
  const canonicalFiles = readdirSync(CANONICAL_SCRIPTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
    .map((entry) => entry.name)
    .filter((name) => name !== "executor-spec.mjs");
  assert.ok(canonicalFiles.length > 0, "expected at least one canonical CLI");
  for (const name of canonicalFiles) {
    const wrapper = join(WRAPPER_SCRIPTS_DIR, name);
    assert.ok(existsSync(wrapper), `canonical CLI skills/executor-subagents/scripts/${name} has no compatibility wrapper at scripts/${name}`);
  }
});

test("a wrapper's single import statement points at its own-named canonical file", () => {
  const wrappers = readdirSync(WRAPPER_SCRIPTS_DIR).filter((f) => f.endsWith(".mjs"));
  for (const name of wrappers) {
    const content = readText(join(WRAPPER_SCRIPTS_DIR, name));
    const match = content.match(/import\s+["']\.\.\/skills\/executor-subagents\/scripts\/([a-z0-9-]+\.mjs)["']/);
    assert.ok(match, `wrapper scripts/${name} must import its canonical counterpart by relative path`);
    assert.equal(match[1], name, `wrapper scripts/${name} imports ${match[1]}, expected ${name}`);
  }
});

// --- 3. Todo comando de gate "script" aponta para um CLI que existe ---

test("every script-kind gate command in lib/gates.mjs resolves to a canonical CLI that exists", async () => {
  const { planGates } = await import("../skills/executor-subagents/scripts/lib/gates.mjs");
  const contexts = [
    { risk: "MEDIUM", agentCount: 1 },
    { risk: "MEDIUM", agentCount: 2 },
    { risk: "HIGH", agentCount: 2, interfaceContract: true, frontendSeparateOrigin: true },
    { risk: "LOW", upstreamStage: "testador", upstreamStatus: "BLOCKED" },
  ];
  let scriptGateCount = 0;
  for (const context of contexts) {
    const { gates } = planGates(context);
    for (const gate of gates) {
      if (gate.kind !== "script") continue;
      scriptGateCount += 1;
      const [, scriptPath] = gate.command;
      const match = scriptPath.match(/\$\{CLAUDE_SKILL_DIR\}\/scripts\/([a-z0-9-]+\.mjs)/);
      assert.ok(match, `gate ${gate.id} command path ${scriptPath} does not match the expected \${CLAUDE_SKILL_DIR}/scripts/*.mjs shape`);
      const target = join(CANONICAL_SCRIPTS_DIR, match[1]);
      assert.ok(existsSync(target), `gate ${gate.id} points at ${scriptPath}, which does not exist at ${target}`);
    }
  }
  assert.ok(scriptGateCount > 0, "expected at least one script-kind gate across the sampled contexts");
});
