/**
 * Minimal CLI helpers shared by the executor's intelligence scripts
 * (`inspect-diff.mjs`, `validate-task-scope.mjs`).
 *
 * Deliberately small and dependency-free: the executor does not carry a
 * state engine, so these scripts take everything they need as CLI args
 * instead of reading a persisted run/task model.
 */

export function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const key = token.slice(2, equals === -1 ? undefined : equals);
    let value = equals === -1 ? undefined : token.slice(equals + 1);
    if (value === undefined && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      value = argv[index + 1];
      index += 1;
    }
    if (value === undefined) value = true;
    if (result[key] === undefined) result[key] = value;
    else if (Array.isArray(result[key])) result[key].push(value);
    else result[key] = [result[key], value];
  }
  return result;
}

export function required(args, key, fallback = undefined) {
  const value = args[key] ?? fallback;
  if (value === undefined || value === "") {
    const error = new Error(`Missing required argument --${key}`);
    error.code = "MISSING_ARGUMENT";
    throw error;
  }
  return value;
}

export function listArg(value) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => String(entry).split(",")).map((entry) => entry.trim()).filter(Boolean);
}

export function executeJsonCli(main) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        ok: false,
        error: {
          code: error?.code ?? "UNEXPECTED_ERROR",
          message: error?.message ?? String(error),
          details: error?.details,
        },
      }, null, 2));
      process.exitCode = error?.code === "MISSING_ARGUMENT" ? 2 : 1;
    });
}
