#!/usr/bin/env node

/**
 * Verifica se um prompt destinado ao AGY fica dentro do limite de 28.000
 * caracteres antes da delegacao.
 *
 * O limite existe porque um prompt real infla ~14% quando o Node monta a
 * linha de comando no Windows, e passar disso vira `ENAMETOOLONG` em tempo de
 * execucao — uma falha dura, nao um problema de qualidade. Antes deste
 * script, a regra so existia como prosa (`references/agent-stack.md`); nada
 * media de fato.
 *
 * Uso:
 *   node check-agy-prompt.mjs --file <path>
 *   node check-agy-prompt.mjs --stdin < prompt.txt
 *   echo "$PROMPT" | node check-agy-prompt.mjs --stdin
 *
 * Saida: `{ chars, limit, overBy, ok, suggestedSplits }`. Exit 1 quando
 * `ok: false` (chamador propaga a falha em vez de precisar checar o JSON).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { executeJsonCli, numberArg, parseArgs, required } from "./lib/cli-utils.mjs";

export const AGY_PROMPT_CHAR_LIMIT = 28_000;

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function suggestSplits(chars, limit) {
  if (chars <= limit) return 1;
  return Math.ceil(chars / limit);
}

function main(argv) {
  const args = parseArgs(argv);
  const limit = numberArg(args.limit, AGY_PROMPT_CHAR_LIMIT);

  // `required` rejeita tanto `--file` ausente quanto `--file` sem valor, e o
  // resultado e sempre atribuido: nao ha caminho em que `text` fique
  // `undefined` e estoure um TypeError cru mais abaixo.
  const text = args.stdin ? readStdin() : readFileSync(resolve(String(required(args, "file"))), "utf8");

  const chars = text.length;
  const ok = chars <= limit;
  const overBy = ok ? 0 : chars - limit;

  if (!ok) {
    const error = new Error(
      `Prompt has ${chars} chars, ${overBy} over the ${limit}-char AGY limit. `
      + "Split the task into independent-deliverable subtasks (see references/workflow.md "
      + "\"Regra de limite de prompt AGY\") before delegating.",
    );
    error.code = "AGY_PROMPT_OVER_LIMIT";
    error.details = { chars, limit, overBy, suggestedSplits: suggestSplits(chars, limit) };
    throw error;
  }

  return { chars, limit, overBy, ok, suggestedSplits: 1 };
}

executeJsonCli(main);
