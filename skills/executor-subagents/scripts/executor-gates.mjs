#!/usr/bin/env node

/**
 * CLI de `lib/gates.mjs`.
 *
 * Subcomando unico: `plan`. Devolve a lista exata de gates a rodar nas Fases
 * 6/6.5/6.6, para o SKILL.md nao precisar expressar a decisao de risco como
 * uma arvore de prosa — uma unica chamada substitui todo o "se risco X e
 * plano pre-definido e modo conjunto entao...".
 */

import { readFileSync } from "node:fs";

import { boolArg, executeJsonCli, numberArg, parseArgs, required } from "./lib/cli-utils.mjs";
import { runDesignGate } from "./lib/design-tokens.mjs";
import { planGates } from "./lib/gates.mjs";

function help() {
  return {
    name: "executor-gates",
    commands: {
      plan:
        "plan --risk <LOW|MEDIUM|HIGH> [--agent-count N] [--predefined-plan bool] "
        + "[--joint-mode bool] [--interface-contract bool] [--frontend-separate-origin bool] "
        + "[--upstream-stage pensador|orchestrador|testador] [--upstream-status DONE|PARTIAL|BLOCKED] "
        + "[--design-contract bool]",
      "design-lint":
        "design-lint --contract <resolved/design-contract.json> --files <a.css,b.tsx,...> "
        + "[--expected-sha <contractSha256 do handoff>] [--allow-token-definitions bool] "
        + "[--allow-size prop,prop:24px,*:24px]. "
        + "Reprova hex literal, px de espaco/raio/largura/altura/fonte, cores em atributos SVG/JSX, style inline, literais via ternario ou constante do arquivo e token inventado; token novo vira DESIGN_CHANGE_REQUEST.",
    },
  };
}

function plan(args) {
  return planGates({
    // `required` rejeita `--risk` ausente ou vazio; `planGates` rejeita valor
    // fora de LOW/MEDIUM/HIGH. Nenhum dos dois cai para um default
    // permissivo.
    risk: String(required(args, "risk")).toUpperCase(),
    agentCount: numberArg(args["agent-count"], 1),
    predefinedPlan: boolArg(args["predefined-plan"], false),
    jointMode: boolArg(args["joint-mode"], false),
    interfaceContract: boolArg(args["interface-contract"], false),
    frontendSeparateOrigin: boolArg(args["frontend-separate-origin"], false),
    upstreamStage: args["upstream-stage"] ? String(args["upstream-stage"]) : null,
    upstreamStatus: args["upstream-status"] ? String(args["upstream-status"]) : null,
    designContract: boolArg(args["design-contract"], false),
  });
}

function designLint(args) {
  const contract = JSON.parse(readFileSync(String(required(args, "contract")), "utf8"));
  const files = String(required(args, "files")).split(",").map((item) => item.trim()).filter(Boolean);
  const sources = files.map((file) => ({ file, content: readFileSync(file, "utf8") }));
  const result = runDesignGate({
    contract,
    expectedSha: args["expected-sha"] ? String(args["expected-sha"]) : null,
    sources,
    allowTokenDefinitions: boolArg(args["allow-token-definitions"], false),
    allowSize: args["allow-size"] ? String(args["allow-size"]).split(",").map((item) => item.trim()).filter(Boolean) : [],
  });
  if (result.status === "FAIL") process.exitCode = 1;
  return result;
}

function main(argv) {
  const [command = "help", ...rest] = argv;
  const args = parseArgs(rest);
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      return help();
    case "plan":
      return plan(args);
    case "design-lint":
      return designLint(args);
    default: {
      const error = new Error(`Unknown command: ${command}`);
      error.code = "UNKNOWN_COMMAND";
      throw error;
    }
  }
}

executeJsonCli(main);
