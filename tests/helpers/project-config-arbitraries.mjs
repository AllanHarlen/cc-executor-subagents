import fc from "fast-check";

import { EXECUTORS, ROLES } from "../../skills/executor-subagents/scripts/lib/project-config.mjs";

/** Um executor valido (`codex`, `agy` ou `claude-code`). */
export function arbExecutor() {
  return fc.constantFrom(...EXECUTORS);
}

/** Os quatro papeis, cada um com um executor valido. */
export function arbRoles() {
  return fc.record(Object.fromEntries(ROLES.map((role) => [role, arbExecutor()])));
}

const INSTANT_BASE_MS = Date.parse("2020-01-01T00:00:00Z");
const INSTANT_RANGE_SECONDS = 15 * 365 * 24 * 3600; // ~15 years

/** Instante UTC canonico, precisao de segundo (o que `formatInstant` produz). */
export function arbInstant() {
  return fc
    .integer({ min: 0, max: INSTANT_RANGE_SECONDS })
    .map((offsetSeconds) => new Date(INSTANT_BASE_MS + offsetSeconds * 1000).toISOString().slice(0, 19) + "Z");
}

/** Project_Config completa e valida (papeis + `updatedAt`, sem `defaultsApplied`). */
export function arbProjectConfig() {
  return fc.record({
    schemaVersion: fc.constant(1),
    updatedAt: arbInstant(),
    ...Object.fromEntries(ROLES.map((role) => [role, arbExecutor()])),
    defaultsApplied: fc.constant([]),
  });
}

/** Ruido de espacamento/quebra de linha/aspas que o parser deve tolerar. */
export function arbFieldNoise() {
  return fc.constantFrom("", " ", "  ", "\t");
}
