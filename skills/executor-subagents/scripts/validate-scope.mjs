#!/usr/bin/env node

/**
 * Valida se as mudancas de um agente ficaram dentro do ownership declarado.
 *
 * Duas fontes de padroes, nesta ordem de precedencia:
 *
 * 1. `--own <glob>` (repetivel) na linha de comando — uso stateless, sem
 *    `--dir`. E o caminho para validar um agente unico sem run ativa.
 * 2. `state.tasks[<task>].allowedPaths` (ou `.expectedFiles` se
 *    `allowedPaths` estiver vazio) via `{artefatos_dir}/state.json`, quando
 *    `--dir` e `--task` sao passados. Requer que a task tenha sido
 *    registrada com `executor-state.mjs task register --own ...`.
 *
 * `--deny <glob>` (repetivel) sempre participa, em qualquer modo: um arquivo
 * que bate com `--deny` e violacao mesmo que tambem bata com `--own` — o
 * prompt do executor ja distingue "ownership" de "arquivos proibidos"
 * (`references/subagent-prompts.md`), este script torna essa distincao
 * verificavel.
 *
 * Sem nenhum padrao de ownership (nem `--own` nem task com `allowedPaths`),
 * todo arquivo alterado conta como fora de escopo — mesmo comportamento do
 * `validate-task-scope.mjs` do Orchestrador: ownership vazio nao e "permite
 * tudo", e "nada foi declarado".
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { boolArg, executeJsonCli, parseArgs } from "./lib/cli-utils.mjs";
import { intelligenceResult, persistIntelligenceEvidence } from "./lib/intelligence.mjs";
import { inspectGit, loadRun } from "./lib/executor-state.mjs";

function listArg(value) {
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function committedFiles(root, before, head) {
  if (!before || !head || before === head) return [];
  try {
    return execFileSync("git", ["diff", "--name-only", `${before}..${head}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function patternRegex(pattern) {
  const normalized = String(pattern).replaceAll("\\", "/").replace(/^\.\//, "");
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "::DOUBLE_STAR::")
    .replaceAll("*", "[^/]*")
    .replaceAll("::DOUBLE_STAR::", ".*");
  return new RegExp(`^${escaped}${normalized.endsWith("/") ? ".*" : "(?:$|/.*)"}`);
}

function matchesScope(path, patterns) {
  const normalized = path.replaceAll("\\", "/");
  return patterns.some((pattern) => patternRegex(pattern).test(normalized));
}

function overlap(left, right) {
  return left.some((leftPattern) => right.some((rightPattern) => {
    const leftBase = String(leftPattern).replace(/[*].*$/, "").replace(/\/$/, "");
    const rightBase = String(rightPattern).replace(/[*].*$/, "").replace(/\/$/, "");
    return leftBase && rightBase &&
      (leftBase === rightBase || leftBase.startsWith(`${rightBase}/`) || rightBase.startsWith(`${leftBase}/`));
  }));
}

// Only the Executor's own coordination artifacts are exempt from scope checks — a run
// necessarily writes its own workflow-log.md/state.json/etc. under `.executor/`, and that
// bookkeeping isn't a product-code violation of the declared ownership. `.orchestration/`
// (the Orchestrador's own coordination tree) is deliberately NOT exempt: the handoff
// contract's rule that "o consumidor nunca edita artefatos do produtor" makes any write
// there a real scope violation, not bookkeeping — see references/handoff-contract.md
// section 8.
function ignoredPrefix(path) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.startsWith(".executor/");
}

function main(argv) {
  const args = parseArgs(argv);
  const root = resolve(args.root ?? process.cwd());
  const ownFlags = listArg(args.own);
  const denyPatterns = listArg(args.deny);
  const artifactDir = args.dir && args.dir !== true ? resolve(String(args.dir)) : null;
  const taskId = args.task && args.task !== true ? String(args.task) : null;

  let ownPatterns = ownFlags;
  let overlappingTasks = [];
  let taskNotRegistered = false;
  let taskCommitBefore = null;

  if (artifactDir && taskId) {
    const state = loadRun(artifactDir, { verifyReplay: boolArg(args["verify-replay"], false) }).state;
    const task = state.tasks?.[taskId];
    if (!task) {
      const error = new Error(`Task not found: ${taskId}`);
      error.code = "TASK_NOT_FOUND";
      throw error;
    }
    if (ownFlags.length === 0) {
      const declared = task.allowedPaths?.length ? task.allowedPaths : task.expectedFiles;
      ownPatterns = declared ?? [];
      taskNotRegistered = ownPatterns.length === 0;
    }
    taskCommitBefore = task.commitBefore ?? null;
    overlappingTasks = Object.values(state.tasks)
      .filter((candidate) => candidate.id !== taskId && !["DONE", "CANCELLED"].includes(candidate.status))
      .map((candidate) => ({
        taskId: candidate.id,
        patterns: candidate.allowedPaths?.length ? candidate.allowedPaths : (candidate.expectedFiles ?? []),
      }))
      .filter((candidate) => overlap(ownPatterns, candidate.patterns))
      .map((candidate) => candidate.taskId);
  }

  const git = inspectGit(root);
  // Sem `--since`, cai para o `commitBefore` da task. Isso NAO e opcional: um
  // agente que **commita** o proprio trabalho deixa a working tree limpa, e
  // olhar so para `git.changedFiles` faria o gate reportar `valid: true` com
  // zero arquivos justamente quando ele deveria acusar escrita fora do
  // ownership. Sem task (modo stateless) nao ha baseline, entao so a working
  // tree e considerada.
  const sinceCommit = args.since && args.since !== true ? String(args.since) : taskCommitBefore;
  const changedFiles = [...new Set([
    ...(git.changedFiles ?? []),
    ...(sinceCommit ? committedFiles(root, sinceCommit, git.head) : []),
  ])].filter((path) => !ignoredPrefix(path)).sort();

  const deniedFiles = denyPatterns.length === 0 ? [] : changedFiles.filter((path) => matchesScope(path, denyPatterns));
  const outOfOwnership = ownPatterns.length === 0
    ? changedFiles
    : changedFiles.filter((path) => !matchesScope(path, ownPatterns));
  const outOfScope = [...new Set([...outOfOwnership, ...deniedFiles])].sort();

  const summary = {
    taskId,
    filesChanged: changedFiles.length,
    ownPatterns: ownPatterns.length,
    denyPatterns: denyPatterns.length,
    outOfScope: outOfScope.length,
    deniedHits: deniedFiles.length,
    overlappingActiveTasks: overlappingTasks.length,
    taskOwnershipNotRegistered: taskNotRegistered,
    // Baseline de commits considerado, para o leitor saber se o gate olhou
    // apenas a working tree (null) ou tambem o historico desde este commit.
    sinceCommit,
    valid: outOfScope.length === 0 && overlappingTasks.length === 0,
  };
  const result = intelligenceResult("validate-scope", summary, {
    changedFiles,
    ownPatterns,
    denyPatterns,
    outOfScope,
    deniedFiles,
    overlappingTasks,
  });
  return {
    result,
    persistence: artifactDir
      ? persistIntelligenceEvidence(result, { artifactDir, taskId, projectRoot: root })
      : null,
  };
}

executeJsonCli(main);
