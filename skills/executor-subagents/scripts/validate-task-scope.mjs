#!/usr/bin/env node
/**
 * Mechanizes Fase 5, passo 2 ("verifique se houve toque fora do ownership"):
 * compares the files a slice actually touched against the ownership patterns
 * declared for that slice, instead of eyeballing the diff.
 *
 * Standalone by design: the executor has no state.json/task model, so scope
 * is passed directly via --allowed instead of being looked up from a run.
 *
 * Usage:
 *   node validate-task-scope.mjs --root . --allowed "src/api/**,src/dto/**" [--base <gitRef>]
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { executeJsonCli, listArg, parseArgs, required } from "./lib/cli-utils.mjs";

function git(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).trim();
  } catch {
    return "";
  }
}

function changedFiles(root, base) {
  const names = new Set();
  if (base) {
    for (const line of git(root, ["diff", "--name-only", `${base}..HEAD`]).split(/\r?\n/)) {
      if (line.trim()) names.add(line.trim());
    }
  }
  // Always include uncommitted work (staged + unstaged) so scope checks stay
  // useful mid-slice, before anything has been committed.
  for (const line of git(root, ["diff", "--name-only", "HEAD"]).split(/\r?\n/)) {
    if (line.trim()) names.add(line.trim());
  }
  for (const line of git(root, ["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/)) {
    if (line.trim()) names.add(line.trim());
  }
  return [...names]
    .filter((path) => {
      const normalized = path.replaceAll("\\", "/");
      return !normalized.startsWith(".executor/");
    })
    .sort();
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

function main(argv) {
  const args = parseArgs(argv);
  const root = resolve(args.root ?? process.cwd());
  const allowedPatterns = listArg(required(args, "allowed"));
  const base = args.base ? String(args.base) : null;

  const files = changedFiles(root, base);
  const outOfScope = allowedPatterns.length === 0
    ? files
    : files.filter((path) => !matchesScope(path, allowedPatterns));

  const summary = {
    filesChanged: files.length,
    allowedPatterns: allowedPatterns.length,
    outOfScope: outOfScope.length,
    valid: allowedPatterns.length > 0 && outOfScope.length === 0,
  };

  return {
    tool: "validate-task-scope",
    summary,
    detail: { changedFiles: files, allowedPatterns, outOfScope },
  };
}

executeJsonCli(main);
