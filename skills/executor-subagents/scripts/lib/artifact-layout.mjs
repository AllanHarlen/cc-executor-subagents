import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Resolucao de caminho dos artefatos de uma run do Executor.
 *
 * Layout 1 (default nesta fase do port): todos os artefatos na raiz de
 * `{artefatos_dir}`, igual ao comportamento historico do plugin.
 *
 * Layout 2 (infra pronta para a Fase 2.0 do port, ainda nao usada por
 * `initRun`): artefatos agrupados por estagio (`plan/`, `run/`, `review/`,
 * `report/`, `evidence/`).
 *
 * `state.json`, `events.jsonl`, `.state.lock`, `handoff.json` e
 * `initial-plan-baseline.md` permanecem **sempre** na raiz, nos dois layouts:
 * `state.json`/`events.jsonl`/`.state.lock` porque a descoberta de run
 * (`findRunDirectory`, `resume`) depende disso; `handoff.json` e
 * `initial-plan-baseline.md` porque `references/handoff-contract.md` — documento
 * byte-identico nos tres plugins (`cc-pensador`, `cc-orchestrador-subagents`,
 * `cc-executor-subagents`) — nomeia esses dois caminhos literalmente como
 * relativos a raiz da pasta de artefatos (secoes 4 e 7). Mover qualquer um dos
 * dois para uma subpasta e exatamente a divergencia que ja quebrou a copia do
 * `cc-orchestrador-subagents` (ele moveu para `report/handoff.json`) — nao
 * repita esse erro aqui.
 *
 * Leitura sempre tenta layout 2 e cai para layout 1, para que uma run antiga
 * continue legivel. Escrita usa o layout declarado em `state.layoutVersion` e
 * nunca duplica um artefato que ja existe no outro layout.
 */

export const ARTIFACT_LAYOUT_VERSION = 1;
export const SUPPORTED_ARTIFACT_LAYOUT_VERSIONS = Object.freeze([1, 2]);

export const LAYOUT_ROOT_FILES = Object.freeze([
  "state.json",
  "events.jsonl",
  ".state.lock",
  "handoff.json",
  "initial-plan-baseline.md",
]);

const LAYOUT_V2_FILE_DIRECTORIES = Object.freeze({
  "execution-brief.md": "plan",
  "interface-contract.md": "plan",
  "monitoring.md": "run",
  "reconciliation-probe.json": "run",
  "plan-vs-output-review.md": "review",
  "review-final.md": "review",
  "e2e-verification.md": "review",
  "implementation-report.md": "report",
  "workflow-log.md": "report",
  "subagents-context.md": "report",
});

const LAYOUT_V2_TREE_DIRECTORIES = Object.freeze({
  evidence: "evidence",
  "executor-results": "run/executor-results",
  prompts: "run/prompts",
  screenshots: "review/screenshots",
});

const LAYOUT_V2_DIRECTORIES = Object.freeze([
  "plan",
  "run",
  "run/executor-results",
  "run/prompts",
  "review",
  "review/screenshots",
  "report",
  "evidence",
]);

function normalizeLayoutVersion(value) {
  const parsed = Number(value);
  return SUPPORTED_ARTIFACT_LAYOUT_VERSIONS.includes(parsed) ? parsed : 1;
}

function toAbsolute(artifactDir, relativePath) {
  return join(resolve(artifactDir), ...String(relativePath).split("/"));
}

function unique(values) {
  return [...new Set(values)];
}

/** Nome canonico -> caminho relativo dentro do diretorio da run. */
export function artifactRelativePath(name, layoutVersion = ARTIFACT_LAYOUT_VERSION) {
  const file = String(name);
  if (LAYOUT_ROOT_FILES.includes(file)) return file;
  if (normalizeLayoutVersion(layoutVersion) !== 2) return file;
  const directory = LAYOUT_V2_FILE_DIRECTORIES[file];
  return directory ? `${directory}/${file}` : file;
}

/** Chave de arvore (`evidence`, `executor-results`, ...) -> caminho relativo. */
export function artifactTreeRelativePath(key, layoutVersion = ARTIFACT_LAYOUT_VERSION) {
  const id = String(key);
  if (normalizeLayoutVersion(layoutVersion) !== 2) return id;
  return LAYOUT_V2_TREE_DIRECTORIES[id] ?? id;
}

export function artifactLayoutDirectories(layoutVersion = ARTIFACT_LAYOUT_VERSION) {
  return normalizeLayoutVersion(layoutVersion) === 2 ? [...LAYOUT_V2_DIRECTORIES] : [];
}

/** Candidatos de leitura, em ordem de preferencia: layout 2 e depois layout 1. */
export function artifactCandidatePaths(artifactDir, name) {
  return unique([
    artifactRelativePath(name, 2),
    artifactRelativePath(name, 1),
  ]).map((relativePath) => ({ relativePath, path: toAbsolute(artifactDir, relativePath) }));
}

/** Primeiro candidato existente, ou `null`. */
export function resolveArtifact(artifactDir, name) {
  for (const candidate of artifactCandidatePaths(artifactDir, name)) {
    if (existsSync(candidate.path)) return candidate;
  }
  return null;
}

export function artifactExists(artifactDir, name) {
  return resolveArtifact(artifactDir, name) != null;
}

/**
 * Caminho de escrita. Se o artefato ja existe em qualquer layout, reusa esse
 * caminho para nao criar duas copias divergentes na mesma run.
 */
export function artifactWritePath(artifactDir, name, layoutVersion = null) {
  const existing = resolveArtifact(artifactDir, name);
  if (existing) return existing;
  const version = layoutVersion ?? detectArtifactLayout(artifactDir);
  const relativePath = artifactRelativePath(name, version);
  return { relativePath, path: toAbsolute(artifactDir, relativePath) };
}

/** Diretorio de arvore existente, ou o caminho de escrita do layout corrente. */
export function artifactTreePath(artifactDir, key, layoutVersion = null) {
  for (const relativePath of unique([
    artifactTreeRelativePath(key, 2),
    artifactTreeRelativePath(key, 1),
  ])) {
    const path = toAbsolute(artifactDir, relativePath);
    if (existsSync(path)) return { relativePath, path };
  }
  const version = layoutVersion ?? detectArtifactLayout(artifactDir);
  const relativePath = artifactTreeRelativePath(key, version);
  return { relativePath, path: toAbsolute(artifactDir, relativePath) };
}

/**
 * Layout declarado pela run. Snapshot sem `layoutVersion` e uma run criada
 * antes desta versao, portanto layout 1. Snapshot ausente ou ilegivel cai na
 * inferencia por diretorio, para que `init` e ferramentas externas funcionem
 * antes do primeiro evento.
 */
export function detectArtifactLayout(artifactDir) {
  const root = resolve(artifactDir);
  const statePath = join(root, "state.json");
  if (existsSync(statePath)) {
    try {
      const snapshot = JSON.parse(readFileSync(statePath, "utf8"));
      if (snapshot?.layoutVersion != null) return normalizeLayoutVersion(snapshot.layoutVersion);
      return 1;
    } catch {
      // snapshot danificado: nao presuma layout pelo erro, use a inferencia abaixo
    }
  }
  if (existsSync(join(root, "plan")) || existsSync(join(root, "report"))) return 2;
  // Run em andamento sem snapshot legivel: nao reorganize no meio do caminho.
  if (existsSync(join(root, "events.jsonl"))) return 1;
  return ARTIFACT_LAYOUT_VERSION;
}

export function ensureArtifactLayout(artifactDir, layoutVersion = ARTIFACT_LAYOUT_VERSION) {
  const root = resolve(artifactDir);
  mkdirSync(root, { recursive: true });
  for (const directory of artifactLayoutDirectories(layoutVersion)) {
    mkdirSync(join(root, ...directory.split("/")), { recursive: true });
  }
  return root;
}
