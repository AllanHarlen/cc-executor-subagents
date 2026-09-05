import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import { planGates } from "../skills/executor-subagents/scripts/lib/gates.mjs";

const NUM_RUNS = 200;

// Property: risk LOW must cost exactly zero validator gates, unless
// predefinedPlan/jointMode escalate it. This is the property that proves the
// fast path stays fast.
test("Property: plain LOW risk (no predefined plan, no joint mode) yields zero gates", () => {
  fc.assert(
    fc.property(
      fc.record({
        agentCount: fc.integer({ min: 1, max: 10 }),
        interfaceContract: fc.boolean(),
        frontendSeparateOrigin: fc.boolean(),
      }),
      (partial) => {
        const { gates } = planGates({ risk: "LOW", predefinedPlan: false, jointMode: false, ...partial });
        assert.deepEqual(gates, []);
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

test("MEDIUM risk with a single agent skips validate-scope (no overlap possible)", () => {
  const { gates, skipped } = planGates({ risk: "MEDIUM", agentCount: 1 });
  const ids = gates.map((g) => g.id);
  assert.ok(ids.includes("inspect-diff"));
  assert.ok(!ids.includes("validate-scope"));
  assert.ok(skipped.some((s) => s.id === "validate-scope"));
});

test("MEDIUM risk with 2+ agents adds validate-scope", () => {
  const { gates } = planGates({ risk: "MEDIUM", agentCount: 2 });
  assert.ok(gates.some((g) => g.id === "validate-scope"));
});

test("HIGH risk adds collect-test-results and the plan-vs-output review action", () => {
  const { gates } = planGates({ risk: "HIGH", agentCount: 1 });
  const ids = gates.map((g) => g.id);
  assert.ok(ids.includes("collect-test-results"));
  assert.ok(ids.includes("plan-vs-output-review"));
});

test("predefinedPlan escalates a LOW-risk run to the full gate set", () => {
  const { gates } = planGates({ risk: "LOW", predefinedPlan: true });
  const ids = gates.map((g) => g.id);
  assert.ok(ids.includes("inspect-diff"));
  assert.ok(ids.includes("collect-test-results"));
  assert.ok(ids.includes("plan-vs-output-review"));
});

test("jointMode escalates a LOW-risk run to the full gate set", () => {
  const { gates } = planGates({ risk: "LOW", jointMode: true });
  assert.ok(gates.some((g) => g.id === "plan-vs-output-review"));
});

test("interfaceContract adds validate-wire-format only when escalated", () => {
  const notEscalated = planGates({ risk: "MEDIUM", interfaceContract: true });
  assert.ok(!notEscalated.gates.some((g) => g.id === "validate-wire-format"));

  const escalated = planGates({ risk: "HIGH", interfaceContract: true });
  assert.ok(escalated.gates.some((g) => g.id === "validate-wire-format"));
});

test("frontendSeparateOrigin adds the browser-e2e action gate only when escalated", () => {
  const { gates } = planGates({ risk: "HIGH", frontendSeparateOrigin: true });
  const e2e = gates.find((g) => g.id === "browser-e2e");
  assert.ok(e2e);
  assert.equal(e2e.phase, 6.6);
  assert.equal(e2e.kind, "action");
  assert.equal(e2e.command, null);
});

test("every script gate's command starts with node and references ${CLAUDE_SKILL_DIR}/scripts/", () => {
  const { gates } = planGates({ risk: "HIGH", agentCount: 2, interfaceContract: true });
  for (const gate of gates.filter((g) => g.kind === "script")) {
    assert.equal(gate.command[0], "node");
    assert.match(gate.command[1], /^\$\{CLAUDE_SKILL_DIR\}\/scripts\//);
  }
});

// Este teste antes afirmava o oposto ("cai para LOW em vez de lancar"), o que
// cristalizava um fail-open: LOW e a resposta mais permissiva (zero gates),
// entao um `--risk` com typo desligava silenciosamente toda a verificacao. Um
// planejador de gates precisa falhar fechado.
test("an unknown or missing risk value is rejected, never silently treated as LOW", () => {
  for (const risk of ["NONSENSE", "", undefined, null, true, 3]) {
    assert.throws(
      () => planGates({ risk }),
      (error) => error.code === "INVALID_RISK_LEVEL",
      `risk=${JSON.stringify(risk)} should be rejected`,
    );
  }
});

test("risk level is accepted case-insensitively", () => {
  assert.deepEqual(planGates({ risk: "low" }).gates, []);
  assert.ok(planGates({ risk: "medium" }).gates.some((gate) => gate.id === "inspect-diff"));
});

// Backlog P0 / WORKFLOW.md sec. 8.6: revalidation gate is planned whenever
// the upstream Testador handoff is not DONE, unconditionally of risk tier —
// including LOW risk, which otherwise yields zero gates.
test("testador-revalidation is planned when the upstream Testador handoff is not DONE, even at LOW risk", () => {
  for (const upstreamStatus of ["PARTIAL", "BLOCKED"]) {
    const { gates } = planGates({ risk: "LOW", upstreamStage: "testador", upstreamStatus });
    assert.ok(
      gates.some((g) => g.id === "testador-revalidation"),
      `expected testador-revalidation gate for upstreamStatus=${upstreamStatus}`,
    );
  }
});

test("testador-revalidation is skipped when the upstream Testador handoff is already DONE", () => {
  const { gates, skipped } = planGates({ risk: "LOW", upstreamStage: "testador", upstreamStatus: "DONE" });
  assert.ok(!gates.some((g) => g.id === "testador-revalidation"));
  assert.ok(skipped.some((s) => s.id === "testador-revalidation" && /already DONE/.test(s.reason)));
});

test("testador-revalidation is skipped when there is no Testador handoff in the upstream chain", () => {
  for (const upstreamStage of [null, undefined, "orchestrador", "pensador"]) {
    const { gates, skipped } = planGates({ risk: "LOW", upstreamStage, upstreamStatus: "BLOCKED" });
    assert.ok(!gates.some((g) => g.id === "testador-revalidation"));
    assert.ok(skipped.some((s) => s.id === "testador-revalidation" && /no Testador handoff/.test(s.reason)));
  }
});
