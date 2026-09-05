#!/usr/bin/env node

/**
 * CLI de `lib/gates.mjs`.
 *
 * Subcomando unico: `plan`. Devolve a lista exata de gates a rodar nas Fases
 * 6/6.5/6.6, para o SKILL.md nao precisar expressar a decisao de risco como
 * uma arvore de prosa — uma unica chamada substitui todo o "se risco X e
 * plano pre-definido e modo conjunto entao...".
 */

import { boolArg, executeJsonCli, numberArg, parseArgs, required } from "./lib/cli-utils.mjs";
import { planGates } from "./lib/gates.mjs";

function help() {
  return {
    name: "executor-gates",
    commands: {
      plan:
        "plan --risk <LOW|MEDIUM|HIGH> [--agent-count N] [--predefined-plan bool] "
        + "[--joint-mode bool] [--interface-contract bool] [--frontend-separate-origin bool] "
        + "[--upstream-stage pensador|orchestrador|testador] [--upstream-status DONE|PARTIAL|BLOCKED]",
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
  });
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
    default: {
      const error = new Error(`Unknown command: ${command}`);
      error.code = "UNKNOWN_COMMAND";
      throw error;
    }
  }
}

executeJsonCli(main);
