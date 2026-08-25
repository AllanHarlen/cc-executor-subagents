import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Guarda de sincronia entre `references/mcp-context.md` e
 * `references/subagent-prompts.md`.
 *
 * `mcp-context.md` documenta um bloco "Prompt para subagente" que instrui uso
 * do Codebase Memory antes de varrer arquivos. Esse teste verifica que todo
 * placeholder `Context7:` do template real (`subagent-prompts.md`) tem um
 * `Codebase Memory:` correspondente ao lado — sem isso, a instrucao documentada
 * fica so em `mcp-context.md`, nunca chega ao prompt que de fato delega a task.
 */

const REPO_ROOT = join(import.meta.dirname, "..");
const PROMPTS_PATH = join(REPO_ROOT, "skills", "executor-subagents", "references", "subagent-prompts.md");
const MCP_CONTEXT_PATH = join(REPO_ROOT, "skills", "executor-subagents", "references", "mcp-context.md");

function countLabelOccurrences(content, label) {
  const pattern = new RegExp(`^${label}:$`, "gm");
  return (content.match(pattern) ?? []).length;
}

test("protocolo comum instrui uso do Codebase Memory condicionado ao sinal por agente, com fallback ao agregado", () => {
  const content = readFileSync(PROMPTS_PATH, "utf8");
  assert.match(
    content,
    /checks\.optional\.mcpPerAgent/,
    "protocolo comum deveria preferir o sinal ao vivo por agente (mcpPerAgent) ao agregado de arquivo",
  );
  assert.match(
    content,
    /checks\.optional\.mcp\.<servidor>\.ok|checks\.optional\.mcp\["codebase-memory"\]\.ok/,
    "protocolo comum deveria manter o fallback para o check agregado quando mcpPerAgent nao estiver disponivel",
  );
});

test("todo placeholder Context7: tem um Codebase Memory: correspondente no template", () => {
  const content = readFileSync(PROMPTS_PATH, "utf8");
  const context7Count = countLabelOccurrences(content, "Context7");
  const codebaseMemoryCount = countLabelOccurrences(content, "Codebase Memory");

  assert.ok(context7Count > 0, "template deveria ter ao menos um placeholder Context7:");
  assert.equal(
    codebaseMemoryCount,
    context7Count,
    `Codebase Memory: deveria aparecer ${context7Count}x (uma por placeholder Context7:), encontrado ${codebaseMemoryCount}x`,
  );
});

test("mcp-context.md continua documentando o bloco de prompt para subagente", () => {
  const mcpContext = readFileSync(MCP_CONTEXT_PATH, "utf8");
  assert.match(
    mcpContext,
    /Prompt para subagente/,
    "mcp-context.md deveria continuar documentando o bloco de prompt do Codebase Memory para subagentes",
  );
});
