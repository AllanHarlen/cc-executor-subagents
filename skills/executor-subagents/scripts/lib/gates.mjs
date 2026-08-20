/**
 * Tabela de gates proporcionais ao risco.
 *
 * Modulo puro (sem I/O): dado um contexto de execucao, `planGates` devolve a
 * lista exata de gates a rodar nas Fases 6/6.5/6.6, sem o LLM ter que
 * interpretar uma arvore de decisao a cada run. Em `risco: LOW` a lista vem
 * sempre vazia — o caminho rapido de hoje fica intocado.
 *
 * Cada gate e `{ id, phase, blocking, kind, command, reason }`:
 * - `kind: "script"` tem `command` (array de argv, primeiro token sempre
 *   `node`) pronto para rodar via `${CLAUDE_SKILL_DIR}`.
 * - `kind: "action"` nao tem script determinístico (ex.: review Codex high,
 *   verificacao E2E no navegador) — `command: null`, e o campo `reason`
 *   descreve a acao que o executor precisa tomar.
 */

export const RISK_LEVELS = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

const SCRIPT = (name) => `\${CLAUDE_SKILL_DIR}/scripts/${name}`;

function scriptGate(id, phase, name, args, reason) {
  return Object.freeze({
    id,
    phase,
    blocking: true,
    kind: "script",
    command: Object.freeze(["node", SCRIPT(name), ...args]),
    reason,
  });
}

function actionGate(id, phase, reason) {
  return Object.freeze({ id, phase, blocking: true, kind: "action", command: null, reason });
}

/**
 * Decide os gates para um contexto de execucao.
 *
 * @param {{
 *   risk: "LOW"|"MEDIUM"|"HIGH",
 *   agentCount?: number,
 *   predefinedPlan?: boolean,
 *   jointMode?: boolean,
 *   interfaceContract?: boolean,
 *   frontendSeparateOrigin?: boolean,
 * }} context
 * @returns {{ gates: Array<object>, skipped: Array<{ id: string, reason: string }> }}
 */
export function planGates(context = {}) {
  const risk = RISK_LEVELS.includes(context.risk) ? context.risk : "LOW";
  const agentCount = Number.isFinite(context.agentCount) ? context.agentCount : 1;
  const predefinedPlan = context.predefinedPlan === true;
  const jointMode = context.jointMode === true;
  const interfaceContract = context.interfaceContract === true;
  const frontendSeparateOrigin = context.frontendSeparateOrigin === true;

  const escalated = risk === "HIGH" || predefinedPlan || jointMode;
  const gates = [];
  const skipped = [];

  if (risk === "LOW" && !escalated) {
    skipped.push({ id: "all", reason: "LOW risk: no gate beyond today's baseline verification" });
    return { gates, skipped };
  }

  // MEDIUM and up: cheap deterministic diff inspection.
  gates.push(
    scriptGate(
      "inspect-diff",
      6,
      "inspect-diff.mjs",
      ["--dir", "{artefatos_dir}"],
      "MEDIUM+: tag risky changed files (migrations, secrets, public API) before closing",
    ),
  );

  if (agentCount >= 2) {
    gates.push(
      scriptGate(
        "validate-scope",
        6,
        "validate-scope.mjs",
        ["--dir", "{artefatos_dir}", "--task", "{task_id}"],
        "2+ agents: prove each agent stayed inside its declared ownership",
      ),
    );
  } else {
    skipped.push({ id: "validate-scope", reason: "single agent: ownership overlap is not possible" });
  }

  if (!escalated) {
    return { gates, skipped };
  }

  gates.push(
    scriptGate(
      "collect-test-results",
      6,
      "collect-test-results.mjs",
      ["--dir", "{artefatos_dir}", "--input", "{test_result_file}"],
      "HIGH/predefined-plan/joint-mode: structured test evidence, not a read-through",
    ),
  );

  if (interfaceContract) {
    gates.push(
      scriptGate(
        "validate-wire-format",
        6,
        "validate-wire-format.mjs",
        ["--payload", "{payload_json}", "--contract", "{artefatos_dir}/interface-contract.md"],
        "interface_contract: true — prove the real payload matches the documented wire format",
      ),
    );
  } else {
    skipped.push({ id: "validate-wire-format", reason: "no interface_contract for this run" });
  }

  gates.push(
    actionGate(
      "plan-vs-output-review",
      6.5,
      predefinedPlan || jointMode
        ? "predefined plan or joint mode: Codex high read-only review comparing initial-plan-baseline.md against the delivery"
        : "HIGH risk: Codex high review before closing",
    ),
  );

  if (frontendSeparateOrigin) {
    gates.push(
      actionGate(
        "browser-e2e",
        6.6,
        "front-end and back-end are separate origins: drive critical flows in a real browser (Playwright MCP) — "
          + "no CORS errors, 2xx AND UI reflects real data, final effect confirmed. No browser tool available => "
          + "close as PARTIAL, never DONE.",
      ),
    );
  } else {
    skipped.push({ id: "browser-e2e", reason: "no separate front-end origin for this run" });
  }

  return { gates, skipped };
}
