/**
 * Contrato de linha de comando dos scripts.
 *
 * Regressao de um bug de classe encontrado em review: `parseArgs` transforma
 * uma flag sem valor (`--payload`) em `true`, e `required` so rejeitava
 * `undefined`/`""`. O `true` vazava para o corpo do script e virava um erro
 * cru do Node (`ERR_INVALID_ARG_TYPE`, "Cannot read properties of undefined")
 * com codigo generico, em vez do `MISSING_ARGUMENT` + exit 2 que o contrato
 * da CLI promete. Afetava `check-agy-prompt --file`,
 * `validate-wire-format --payload` e `collect-test-results --input`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { numberArg, required } from "../skills/executor-subagents/scripts/lib/cli-utils.mjs";

const SCRIPTS_ROOT = fileURLToPath(new URL("../skills/executor-subagents/scripts/", import.meta.url));

const roots = [];
function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".tmp-cli-contract-test-"));
  roots.push(root);
  return root;
}
test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [join(SCRIPTS_ROOT, script), ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  let json;
  try {
    json = JSON.parse(result.stdout || result.stderr);
  } catch {
    json = undefined;
  }
  return { status: result.status, json };
}

test("required() rejects a flag passed with no value, not just an absent one", () => {
  assert.throws(() => required({ file: true }, "file"), (error) => error.code === "MISSING_ARGUMENT");
  assert.throws(() => required({}, "file"), (error) => error.code === "MISSING_ARGUMENT");
  assert.throws(() => required({ file: "" }, "file"), (error) => error.code === "MISSING_ARGUMENT");
  assert.equal(required({ file: "x.txt" }, "file"), "x.txt");
});

test("numberArg() rejects a flag with no value instead of coercing true to 1", () => {
  assert.throws(() => numberArg(true), (error) => error.code === "INVALID_NUMBER");
  assert.equal(numberArg(undefined, 42), 42);
  assert.equal(numberArg("7"), 7);
});

for (const [script, flag] of [
  ["check-agy-prompt.mjs", "--file"],
  ["validate-wire-format.mjs", "--payload"],
  ["collect-test-results.mjs", "--input"],
]) {
  test(`${script} ${flag} with no value fails as MISSING_ARGUMENT with exit 2`, () => {
    const root = fixture();
    const { status, json } = run(script, [flag], root);
    assert.equal(json?.ok, false, `${script} should emit a structured error`);
    assert.equal(json.error.code, "MISSING_ARGUMENT");
    assert.equal(status, 2, "MISSING_ARGUMENT must exit 2 per the CLI contract");
  });
}

test("executor-gates plan rejects an absent --risk instead of silently planning zero gates", () => {
  const root = fixture();
  const { status, json } = run("executor-gates.mjs", ["plan"], root);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "MISSING_ARGUMENT");
  assert.equal(status, 2);
});

test("executor-gates plan rejects --risk with no value as MISSING_ARGUMENT", () => {
  const root = fixture();
  const { status, json } = run("executor-gates.mjs", ["plan", "--risk"], root);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "MISSING_ARGUMENT");
  assert.equal(status, 2);
});

test("executor-gates plan rejects a typo'd --risk instead of falling back to LOW", () => {
  const root = fixture();
  const { status, json } = run("executor-gates.mjs", ["plan", "--risk", "MEDUIM"], root);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "INVALID_RISK_LEVEL");
  assert.equal(status, 1);
});
