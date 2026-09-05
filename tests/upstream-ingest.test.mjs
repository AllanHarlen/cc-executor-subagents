/**
 * Ingestao de upstream do Executor (WF-011): Testador (preferencial) ou
 * Orchestrador (fallback), deteccao de ambiguidade, degradacao explicita.
 *
 * Antes desta implementacao, essa ordem de preferencia existia so como
 * prosa em SKILL.md:131 — nenhum codigo a executava, e commands/executor.md
 * chegou a descrever uma ordem diferente e desatualizada (N-13).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { ingestUpstream } from "../skills/executor-subagents/scripts/lib/upstream-ingest.mjs";

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "executor-upstream-ingest-test-"));
  roots.push(root);
  return root;
}
test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function writeHandoff(root, relativePath, handoff) {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof handoff === "string" ? handoff : JSON.stringify(handoff, null, 2), "utf8");
}

function baseHandoff(stage, slug, status = "DONE") {
  return {
    handoffVersion: 1,
    stage,
    slug,
    producer: { plugin: `cc-${stage}`, version: "1.0.0" },
    artifactRoot: stage === "orchestrador" ? `.orchestration/${slug}` : `.testador/${slug}/artefatos`,
    status,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    summary: `${stage} done`,
    upstream: null,
    artifacts: [],
    nextStage: null,
  };
}

test("returns standalone mode when neither .testador/ nor .orchestration/ exist", () => {
  const root = fixture();
  const result = ingestUpstream({ projectRoot: root });
  assert.equal(result.mode, "standalone");
  assert.ok(result.warning);
});

test("prefers the Testador handoff over the Orchestrador handoff for the same slug", () => {
  const root = fixture();
  writeHandoff(root, ".testador/login-social/artefatos/handoff.json", baseHandoff("testador", "login-social", "BLOCKED"));
  writeHandoff(root, ".orchestration/login-social/report/handoff.json", baseHandoff("orchestrador", "login-social"));

  const result = ingestUpstream({ projectRoot: root });
  assert.equal(result.mode, "joint");
  assert.equal(result.upstreamStage, "testador");
  assert.equal(result.upstreamHandoff.status, "BLOCKED");
});

test("falls back to the Orchestrador v2 handoff when the Testador did not run", () => {
  const root = fixture();
  writeHandoff(root, ".orchestration/login-social/report/handoff.json", baseHandoff("orchestrador", "login-social"));

  const result = ingestUpstream({ projectRoot: root, slug: "login-social" });
  assert.equal(result.mode, "joint");
  assert.equal(result.upstreamStage, "orchestrador");
  assert.equal(result.upstreamHandoffPath, join(root, ".orchestration/login-social/report/handoff.json"));
});

test("falls back to the legacy pre-v2 Orchestrador root handoff", () => {
  const root = fixture();
  writeHandoff(root, ".orchestration/login-social/handoff.json", baseHandoff("orchestrador", "login-social"));

  const result = ingestUpstream({ projectRoot: root, slug: "login-social" });
  assert.equal(result.mode, "joint");
  assert.equal(result.upstreamStage, "orchestrador");
});

test("a corrupt Testador handoff does not mask a valid Orchestrador handoff", () => {
  const root = fixture();
  writeHandoff(root, ".testador/login-social/artefatos/handoff.json", "{ not valid json");
  writeHandoff(root, ".orchestration/login-social/report/handoff.json", baseHandoff("orchestrador", "login-social"));

  const result = ingestUpstream({ projectRoot: root, slug: "login-social" });
  assert.equal(result.mode, "joint");
  assert.equal(result.upstreamStage, "orchestrador");
});

test("returns ambiguous mode when multiple slugs exist without an explicit slug", () => {
  const root = fixture();
  writeHandoff(root, ".testador/login-social/artefatos/handoff.json", baseHandoff("testador", "login-social"));
  writeHandoff(root, ".orchestration/checkout/report/handoff.json", baseHandoff("orchestrador", "checkout"));

  const result = ingestUpstream({ projectRoot: root });
  assert.equal(result.mode, "ambiguous");
  assert.deepEqual([...result.slugCandidates].sort(), ["checkout", "login-social"]);
});

test("does not count an orphan directory without any handoff.json as a slug candidate", () => {
  const root = fixture();
  writeHandoff(root, ".orchestration/login-social/report/handoff.json", baseHandoff("orchestrador", "login-social"));
  mkdirSync(join(root, ".testador/abandoned-run/artefatos"), { recursive: true });
  writeFileSync(join(root, ".testador/abandoned-run/artefatos/some-other-file.txt"), "leftover", "utf8");

  const result = ingestUpstream({ projectRoot: root });
  assert.equal(result.mode, "joint");
  assert.equal(result.slug, "login-social");
});

test("degrades to standalone when the only handoff is invalid", () => {
  const root = fixture();
  writeHandoff(root, ".orchestration/login-social/report/handoff.json", "{ not valid json");

  const result = ingestUpstream({ projectRoot: root, slug: "login-social" });
  assert.equal(result.mode, "standalone");
  assert.ok(result.invalidHandoff);
});

test("an explicit slug with no matching directory degrades to standalone", () => {
  const root = fixture();
  writeHandoff(root, ".orchestration/login-social/report/handoff.json", baseHandoff("orchestrador", "login-social"));

  const result = ingestUpstream({ projectRoot: root, slug: "does-not-exist" });
  assert.equal(result.mode, "standalone");
});
