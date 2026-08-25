import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * `.executor/checkpoint.json` como INDICE, nao mais como estado por-run.
 *
 * Ate a versao 4 (pre-port), o checkpoint era um unico arquivo global editado
 * a mao pelo LLM, misturando o indice de execucoes (`execucao_atual`,
 * `historico[]`) com o estado detalhado da execucao ativa (`fase_atual`,
 * `slices`, `agentes`, `arquivos_alterados`, ...). A partir da versao 5, o
 * estado detalhado de cada execucao vive em `{artefatos_dir}/state.json` +
 * `events.jsonl`, gerenciado por `executor-state.mjs` (escrita atomica, log de
 * eventos, replay). O checkpoint volta a ser so o que o nome sugere: um
 * indice pequeno e barato de ler.
 *
 * O checkpoint continua guardando dois campos que NAO migram para
 * `state.json`: `plano_predefinido` e `plano_predefinido_fonte`.
 * `references/handoff-contract.md` — documento byte-identico nos tres plugins
 * do workflow — manda literalmente "Registre as fontes em
 * `plano_predefinido_fonte` e `plano_predefinido` no `.executor/checkpoint.json`"
 * na secao 7. Mover esses dois campos exclusivamente para `state.json`
 * tornaria essa frase do contrato compartilhado falsa, o que exigiria editar a
 * copia canonica no `cc-pensador` e ressincronizar os tres repositorios — um
 * custo desproporcional para dois campos. Eles ficam duplicados por
 * conveniencia: presentes no checkpoint (por exigencia do contrato) e tambem,
 * quando aplicavel, no `state.json` da run.
 */

export const CHECKPOINT_SCHEMA_VERSION = 5;
export const CHECKPOINT_DIRECTORY = ".executor";
export const CHECKPOINT_FILENAME = "checkpoint.json";
export const CHECKPOINT_RELATIVE_PATH = `${CHECKPOINT_DIRECTORY}/${CHECKPOINT_FILENAME}`;

export class CheckpointIndexError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CheckpointIndexError";
    this.code = code;
    this.details = details;
  }
}

export function checkpointPath(projectRoot = process.cwd()) {
  return join(resolve(projectRoot ?? "."), CHECKPOINT_DIRECTORY, CHECKPOINT_FILENAME);
}

function freshIndex() {
  return {
    version: String(CHECKPOINT_SCHEMA_VERSION),
    execucao_atual: "",
    historico: [],
    plano_predefinido: false,
    plano_predefinido_fonte: "",
  };
}

function isV5Shaped(raw) {
  return raw != null && typeof raw === "object" && String(raw.version ?? "") === String(CHECKPOINT_SCHEMA_VERSION);
}

/**
 * Migra um checkpoint v4 (ou anterior) para o indice v5.
 *
 * Idempotente: um arquivo ja v5 volta inalterado, com `migrationNotes: []`.
 *
 * `historico[]` passa adiante sem reescrita — cada entrada e um resumo opaco
 * de uma execucao passada (incluindo `status: "ABANDONED"`, que so existe
 * dentro de `historico[]` e nunca foi um status vivo de run; nao inventamos
 * um `RUN_STATUSES` novo so para preservar esse rotulo).
 *
 * Quando o arquivo v4 tem uma execucao ativa (`fase_atual`/`status: RUNNING`
 * e demais campos por-run soltos na raiz), ela e reportada em `adoptedRun`
 * para o chamador decidir se inicializa `state.json` para ela (adocao real
 * acontece em `executor-state.mjs init --adopt`, nao aqui: este modulo nao
 * toca `state.json`).
 */
export function migrateCheckpoint(raw) {
  if (isV5Shaped(raw)) {
    return {
      index: {
        version: String(CHECKPOINT_SCHEMA_VERSION),
        execucao_atual: String(raw.execucao_atual ?? ""),
        historico: Array.isArray(raw.historico) ? raw.historico : [],
        plano_predefinido: raw.plano_predefinido === true,
        plano_predefinido_fonte: String(raw.plano_predefinido_fonte ?? ""),
      },
      migrationNotes: [],
      adoptedRun: null,
    };
  }

  const migrationNotes = [];
  if (raw?.codex_excluido === true) {
    migrationNotes.push(
      "codex_excluido:true foi retirado; configure backendExecutor/frontendExecutor em .executor/project-config.md",
    );
  }

  const hasLegacyRunFields =
    raw != null &&
    typeof raw === "object" &&
    ("fase_atual" in raw || "slices" in raw || "agentes" in raw || "demanda_slug" in raw);

  let adoptedRun = null;
  if (hasLegacyRunFields && raw.artefatos_dir) {
    adoptedRun = {
      demanda: raw.demanda ?? "",
      demanda_slug: raw.demanda_slug ?? "",
      artefatos_dir: raw.artefatos_dir,
      fase_atual: raw.fase_atual ?? 0,
      status: raw.status ?? "RUNNING",
      tipo_trabalho: raw.tipo_trabalho ?? "",
      risco: raw.risco ?? "LOW",
      plano_predefinido: raw.plano_predefinido === true,
      plano_predefinido_fonte: raw.plano_predefinido_fonte ?? "",
      timestamp_inicio: raw.timestamp_inicio ?? "",
    };
    migrationNotes.push(
      `execucao ativa v4 detectada em ${raw.artefatos_dir}; rode "executor-state.mjs init --dir <artefatos_dir> --adopt" para lhe dar um state.json`,
    );
  }

  return {
    index: {
      version: String(CHECKPOINT_SCHEMA_VERSION),
      execucao_atual: String(raw?.execucao_atual ?? (hasLegacyRunFields ? raw?.artefatos_dir ?? "" : "")),
      historico: Array.isArray(raw?.historico) ? raw.historico : [],
      plano_predefinido: raw?.plano_predefinido === true,
      plano_predefinido_fonte: String(raw?.plano_predefinido_fonte ?? ""),
    },
    migrationNotes,
    adoptedRun,
  };
}

/**
 * Le o indice, migrando de v4 para v5 em memoria quando necessario. Nunca
 * escreve o arquivo: a gravacao e sempre uma acao explicita de
 * `writeCheckpointIndex`.
 */
export function readCheckpointIndex(projectRoot = process.cwd()) {
  const path = checkpointPath(projectRoot);
  if (!existsSync(path)) {
    return { exists: false, path, index: freshIndex(), migrationNotes: [], adoptedRun: null };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new CheckpointIndexError(
      "CHECKPOINT_UNPARSEABLE",
      `Checkpoint file ${path} is not valid JSON: ${error.message}`,
      { path },
    );
  }
  const migrated = migrateCheckpoint(raw);
  return { exists: true, path, ...migrated };
}

/** Grava o indice de forma atomica (arquivo temporario + fsync + rename). */
export function writeCheckpointIndex(projectRoot, index, options = {}) {
  const path = checkpointPath(projectRoot);
  const directory = dirname(path);
  const payload = {
    version: String(CHECKPOINT_SCHEMA_VERSION),
    execucao_atual: String(index.execucao_atual ?? ""),
    historico: Array.isArray(index.historico) ? index.historico : [],
    plano_predefinido: index.plano_predefinido === true,
    plano_predefinido_fonte: String(index.plano_predefinido_fonte ?? ""),
  };
  const content = `${JSON.stringify(payload, null, 2)}\n`;

  let temporary = null;
  try {
    mkdirSync(directory, { recursive: true });
    temporary = join(directory, `.${CHECKPOINT_FILENAME}.${process.pid}.${randomUUID()}.tmp`);
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, content, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
    temporary = null;
  } catch (error) {
    if (temporary !== null) {
      try {
        unlinkSync(temporary);
      } catch {
        // Temporary orphan does not invalidate the previous file.
      }
    }
    throw new CheckpointIndexError(
      "CHECKPOINT_WRITE_FAILED",
      `Checkpoint file ${path} could not be written: ${error.message}`,
      { path, reason: error.message },
    );
  }

  return { path, content, index: payload, now: options.now };
}

/**
 * Adiciona ou atualiza uma entrada de `historico[]` pelo `artefatos_dir`, e
 * opcionalmente aponta `execucao_atual` para ela (quando a execucao continua
 * ativa) ou limpa `execucao_atual` (quando a entrada e terminal e era a
 * execucao ativa).
 */
export function upsertRunEntry(index, entry, options = {}) {
  if (!entry?.artefatos_dir) {
    throw new CheckpointIndexError("CHECKPOINT_INVALID_ENTRY", "entry.artefatos_dir is required");
  }
  const historico = Array.isArray(index.historico) ? [...index.historico] : [];
  const position = historico.findIndex((item) => item.artefatos_dir === entry.artefatos_dir);
  if (position >= 0) historico[position] = { ...historico[position], ...entry };
  else historico.push(entry);

  const active = options.active === true;
  const execucao_atual = active
    ? entry.artefatos_dir
    : index.execucao_atual === entry.artefatos_dir
      ? ""
      : index.execucao_atual ?? "";

  return { ...index, historico, execucao_atual };
}
