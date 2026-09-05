import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { validateHandoff } from "./handoff-validator.mjs";

/**
 * Ingestao de upstream do Executor (WF-011): descobre e le o handoff em
 * modo conjunto — Testador (preferencial) ou Orchestrador (fallback) — para
 * determinar se esta run tem um plano pre-definido e de onde vem.
 *
 * Antes desta implementacao, esse algoritmo existia so como prosa em
 * `SKILL.md` (linha 131) — nenhum codigo o executava, e `commands/executor.md`
 * chegou a descrever uma ordem diferente e desatualizada (N-13, revisao
 * 2026-09-04). Porta o mesmo padrao que `cc-testador-subagents`'s
 * `upstream-ingest.mjs` ja usa: probe ordenado, deteccao de ambiguidade,
 * fallback legado, degradacao explicita quando nada valida.
 *
 * Ordem de descoberta (por slug):
 * 1. `.testador/<slug>/artefatos/handoff.json` (preferencial)
 * 2. `.orchestration/<slug>/report/handoff.json` (layout v2 do Orchestrador,
 *    quando o Testador nao rodou)
 * 3. `.orchestration/<slug>/handoff.json` (raiz, layout pre-v2)
 * 4. Nada disso resolve -> modo avulso (o Executor le
 *    `implementation-report.md` + `plan/` + `contracts/` por convencao).
 *
 * Sem slug explicito, o slug e descoberto escaneando `.testador/` e
 * `.orchestration/` — cada diretorio so conta como candidato se tiver um
 * `handoff.json` legivel em algum dos caminhos acima (um diretorio orfao de
 * uma run cancelada nao deve forcar uma ambiguidade espuria).
 *
 * Regra absoluta: NUNCA escreve em `.testador/` ou `.orchestration/`. Apenas le.
 */

export class UpstreamIngestError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "UpstreamIngestError";
    this.code = code;
    this.details = details;
  }
}

function readHandoffSafe(path) {
  if (!existsSync(path)) return null;
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { handoff: null, valid: false, version_mismatch: false, errors: [{ code: "HANDOFF_INVALID_JSON", message: error.message }], path };
  }
  const result = validateHandoff(raw);
  if (!result.ok) {
    const first = result.errors[0];
    return {
      handoff: raw,
      valid: false,
      version_mismatch: first?.code === "UNSUPPORTED_HANDOFF_VERSION",
      errors: result.errors,
      path,
    };
  }
  return { handoff: raw, valid: true, version_mismatch: false, errors: [], path };
}

function upstreamHandoffCandidates(projectRoot, slug) {
  return [
    { stage: "testador", path: join(projectRoot, ".testador", slug, "artefatos", "handoff.json") },
    { stage: "orchestrador", path: join(projectRoot, ".orchestration", slug, "report", "handoff.json") },
    { stage: "orchestrador", path: join(projectRoot, ".orchestration", slug, "handoff.json") },
  ];
}

/**
 * Tenta ler o handoff upstream para um dado `slug`, na ordem de preferencia
 * (Testador > Orchestrador v2 > Orchestrador legado). Prefere o primeiro
 * candidato que EXISTE E VALIDA — um handoff do Testador presente mas
 * corrompido nao deve mascarar um handoff valido do Orchestrador no
 * caminho seguinte.
 */
function readUpstreamHandoff(projectRoot, slug) {
  let firstInvalid = null;
  for (const candidate of upstreamHandoffCandidates(projectRoot, slug)) {
    const result = readHandoffSafe(candidate.path);
    if (!result) continue;
    if (result.valid) return { ...result, stage: candidate.stage };
    firstInvalid ??= { ...result, stage: candidate.stage };
  }
  return firstInvalid;
}

/** Descobre slugs candidatos escaneando `.testador/` e `.orchestration/`, filtrando por presenca real de um handoff.json legivel. */
function discoverUpstreamSlugs(projectRoot) {
  const slugs = new Set();
  for (const [base, ] of [[".testador"], [".orchestration"]]) {
    const dir = join(projectRoot, base);
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (upstreamHandoffCandidates(projectRoot, entry.name).some((c) => existsSync(c.path))) {
          slugs.add(entry.name);
        }
      }
    } catch {
      // ignore unreadable directory
    }
  }
  return [...slugs];
}

function buildStandaloneResult(warning, extras = {}) {
  return {
    mode: "standalone",
    slug: null,
    upstreamHandoff: null,
    upstreamHandoffPath: null,
    upstreamStage: null,
    warning,
    ...extras,
  };
}

/**
 * Ponto de entrada principal.
 *
 * @param {object} options
 * @param {string} options.projectRoot  Raiz do projeto.
 * @param {string} [options.slug]       Slug do handoff a ingerir. Sem slug,
 *                                      varre `.testador/`/`.orchestration/`
 *                                      e usa o unico slug distinto disponivel.
 * @returns {{
 *   mode: "joint"|"ambiguous"|"standalone",
 *   slug: string|null,
 *   upstreamHandoff: object|null,
 *   upstreamHandoffPath: string|null,
 *   upstreamStage: "testador"|"orchestrador"|null,
 *   slugCandidates?: string[],
 *   warning: string|null,
 * }}
 */
export function ingestUpstream(options = {}) {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const requestedSlug = options.slug ?? null;

  let slug = requestedSlug;
  if (!slug) {
    const slugs = discoverUpstreamSlugs(projectRoot);
    if (slugs.length === 0) {
      return buildStandaloneResult("No .testador/ or .orchestration/ handoff found — running in standalone mode.");
    }
    if (slugs.length > 1) {
      return {
        mode: "ambiguous",
        slugCandidates: slugs,
        warning: `Multiple upstream slugs found (${slugs.join(", ")}); pass an explicit slug to select one.`,
        slug: null,
        upstreamHandoff: null,
        upstreamHandoffPath: null,
        upstreamStage: null,
      };
    }
    slug = slugs[0];
  }

  const read = readUpstreamHandoff(projectRoot, slug);
  if (!read) {
    return buildStandaloneResult(`No upstream handoff found for slug "${slug}" — running in standalone mode.`);
  }
  if (!read.valid) {
    const reason = read.version_mismatch
      ? "handoff version mismatch"
      : `handoff failed validation (${read.errors[0]?.code})`;
    return buildStandaloneResult(
      `Could not ingest upstream handoff for slug "${slug}" (${reason}) — degrading to standalone mode.`,
      { invalidHandoff: read },
    );
  }

  return {
    mode: "joint",
    slug,
    upstreamHandoff: read.handoff,
    upstreamHandoffPath: read.path,
    upstreamStage: read.stage,
    warning: null,
  };
}
