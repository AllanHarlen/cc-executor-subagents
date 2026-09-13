#!/usr/bin/env node

/**
 * Mede um prompt destinado ao AGY contra um orcamento indicativo de 28.000
 * caracteres antes da delegacao.
 *
 * O limite era duro porque um prompt real inflava ~14% quando o Node montava
 * a linha de comando no Windows, e passar disso virava `ENAMETOOLONG` em
 * tempo de execucao. Desde o bridge cc-antigravity-plugin 4.4.0, isso deixou
 * de ser um limite real: o bridge faz stream do prompt final via stdin
 * sempre que ele excede o argv seguro da plataforma (8.191 chars no Windows,
 * 100.000 nas demais), preservando o contexto inline inteiro em vez de
 * descarta-lo. A checagem continua indicativa (`ok: false` nunca falha) como
 * sinal de qualidade: um prompt muito grande costuma indicar escopo mal
 * recortado.
 *
 * Uso:
 *   node check-agy-prompt.mjs --file <path>
 *   node check-agy-prompt.mjs --stdin < prompt.txt
 *   echo "$PROMPT" | node check-agy-prompt.mjs --stdin
 *
 * Saida: `{ chars, limit, overBy, ok, suggestedSplits }`. Exit 0 sempre;
 * `ok: false` e um sinal a revisar, nao um bloqueio.
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

  return { chars, limit, overBy, ok, suggestedSplits: ok ? 1 : suggestSplits(chars, limit) };
}

executeJsonCli(main);
