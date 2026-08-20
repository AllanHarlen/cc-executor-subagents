import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  CHECKPOINT_SCHEMA_VERSION,
  checkpointPath,
  migrateCheckpoint,
  readCheckpointIndex,
  upsertRunEntry,
  writeCheckpointIndex,
} from "../skills/executor-subagents/scripts/lib/checkpoint-index.mjs";

const roots = [];

function projectRoot() {
  const root = mkdtempSync(join(process.cwd(), ".tmp-checkpoint-migration-test-"));
  roots.push(root);
  return root;
}

test.afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

const V4_ACTIVE_RUN = Object.freeze({
  version: "4",
  execucao_atual: ".executor/build-crud-clientes/artefatos",
  historico: [
    { artefatos_dir: ".executor/old-run/artefatos", demanda_slug: "old-run", status: "DONE" },
    { artefatos_dir: ".executor/abandoned-run/artefatos", demanda_slug: "abandoned-run", status: "ABANDONED" },
  ],
  demanda: "build crud clientes",
  demanda_slug: "build-crud-clientes",
  fase_atual: 4,
  timestamp_inicio: "2026-01-01T00:00:00.000Z",
  timestamp_fim: "",
  status: "RUNNING",
  agy_disponivel: true,
  tipo_trabalho: "FEATURE_SLICE",
  risco: "MEDIUM",
  plano_predefinido: false,
  plano_predefinido_fonte: "",
  baseline_plano_path: "",
  review_plano_vs_entrega: { obrigatorio: false, status: "N/A", path: "" },
  slices: [],
  waves: [],
  interface_contract: false,
  agentes: [],
  arquivos_alterados: [],
  fallbacks_acionados: [],
  proxima_acao: "",
  artefatos_dir: ".executor/build-crud-clientes/artefatos",
});

test("a v4 checkpoint with a live RUNNING execution migrates without losing execucao_atual", () => {
  const migrated = migrateCheckpoint(V4_ACTIVE_RUN);
  assert.equal(migrated.index.version, String(CHECKPOINT_SCHEMA_VERSION));
  assert.equal(migrated.index.execucao_atual, ".executor/build-crud-clientes/artefatos");
  assert.ok(migrated.adoptedRun, "an active v4 execution must be surfaced as adoptedRun");
  assert.equal(migrated.adoptedRun.artefatos_dir, ".executor/build-crud-clientes/artefatos");
  assert.equal(migrated.adoptedRun.fase_atual, 4);
});

test("historico[] entries pass through unchanged, including ABANDONED", () => {
  const migrated = migrateCheckpoint(V4_ACTIVE_RUN);
  assert.deepEqual(migrated.index.historico, V4_ACTIVE_RUN.historico);
  const abandoned = migrated.index.historico.find((entry) => entry.demanda_slug === "abandoned-run");
  assert.equal(abandoned.status, "ABANDONED");
});

test("codex_excluido: true produces a migration note and is not carried into the v5 shape", () => {
  const legacy = { ...V4_ACTIVE_RUN, codex_excluido: true };
  const migrated = migrateCheckpoint(legacy);
  assert.ok(migrated.migrationNotes.some((note) => note.includes("codex_excluido")));
  assert.equal("codex_excluido" in migrated.index, false);
});

test("codex_excluido: false produces no note (only true is a legacy signal worth surfacing)", () => {
  const legacy = { ...V4_ACTIVE_RUN, codex_excluido: false };
  const migrated = migrateCheckpoint(legacy);
  assert.equal(migrated.migrationNotes.some((note) => note.includes("codex_excluido")), false);
});

test("migration is idempotent: migrating an already-v5 file twice is a no-op", () => {
  const v5 = { version: "5", execucao_atual: ".executor/x/artefatos", historico: [{ artefatos_dir: ".executor/x/artefatos", status: "DONE" }] };
  const once = migrateCheckpoint(v5);
  const twice = migrateCheckpoint(once.index);
  assert.deepEqual(once.index, twice.index);
  assert.deepEqual(twice.migrationNotes, []);
  assert.equal(twice.adoptedRun, null);
});

test("readCheckpointIndex migrates a v4 file on disk in memory without rewriting it", () => {
  const root = projectRoot();
  const path = checkpointPath(root);
  mkdirSync(join(root, ".executor"), { recursive: true });
  writeFileSync(path, JSON.stringify(V4_ACTIVE_RUN, null, 2), "utf8");
  const before = readFileSync(path, "utf8");

  const result = readCheckpointIndex(root);
  assert.equal(result.exists, true);
  assert.equal(result.index.version, String(CHECKPOINT_SCHEMA_VERSION));
  assert.equal(result.index.execucao_atual, ".executor/build-crud-clientes/artefatos");
  assert.ok(result.adoptedRun);

  // readCheckpointIndex never writes; the v4 file on disk is untouched.
  assert.equal(readFileSync(path, "utf8"), before);
});

test("readCheckpointIndex returns a fresh v5 skeleton when no file exists", () => {
  const root = projectRoot();
  const result = readCheckpointIndex(root);
  assert.equal(result.exists, false);
  assert.deepEqual(result.index, {
    version: String(CHECKPOINT_SCHEMA_VERSION),
    execucao_atual: "",
    historico: [],
    plano_predefinido: false,
    plano_predefinido_fonte: "",
  });
});

test("plano_predefinido and plano_predefinido_fonte survive migration and write/read round-trips (handoff-contract section 7)", () => {
  const legacy = { ...V4_ACTIVE_RUN, plano_predefinido: true, plano_predefinido_fonte: ".orchestration/build-crud-clientes/handoff.json" };
  const migrated = migrateCheckpoint(legacy);
  assert.equal(migrated.index.plano_predefinido, true);
  assert.equal(migrated.index.plano_predefinido_fonte, ".orchestration/build-crud-clientes/handoff.json");

  const root = projectRoot();
  writeCheckpointIndex(root, migrated.index);
  const reread = readCheckpointIndex(root);
  assert.equal(reread.index.plano_predefinido, true);
  assert.equal(reread.index.plano_predefinido_fonte, ".orchestration/build-crud-clientes/handoff.json");
});

test("writeCheckpointIndex persists atomically and round-trips through readCheckpointIndex", () => {
  const root = projectRoot();
  const written = writeCheckpointIndex(root, { execucao_atual: ".executor/a/artefatos", historico: [] });
  assert.ok(existsSync(written.path));

  const reread = readCheckpointIndex(root);
  assert.equal(reread.index.execucao_atual, ".executor/a/artefatos");
  assert.deepEqual(reread.migrationNotes, []);
});

test("upsertRunEntry adds a new historico entry and can set/clear execucao_atual", () => {
  let index = { version: "5", execucao_atual: "", historico: [] };
  index = upsertRunEntry(index, { artefatos_dir: ".executor/a/artefatos", status: "RUNNING" }, { active: true });
  assert.equal(index.execucao_atual, ".executor/a/artefatos");
  assert.equal(index.historico.length, 1);

  index = upsertRunEntry(index, { artefatos_dir: ".executor/a/artefatos", status: "DONE" }, { active: false });
  assert.equal(index.execucao_atual, "");
  assert.equal(index.historico.length, 1);
  assert.equal(index.historico[0].status, "DONE");
});
