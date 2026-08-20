/**
 * Especificacao determinística do fluxo do Executor.
 *
 * Modulo puro, sem I/O, sem dependencias de outros modulos do plugin, e **nao
 * importado em runtime** por nenhum script/CLI. Ele existe para que
 * `SKILL.md`, `references/workflow.md` e os testes de doc-sync
 * (`tests/docs-consistency.test.mjs`) tenham uma unica fonte da verdade sobre
 * a ordem de fases, os tipos de trabalho, os niveis de risco e os
 * identificadores retirados do vocabulario do plugin.
 *
 * Mudar uma fase, um tipo de trabalho ou um identificador retirado significa
 * mudar este arquivo **e** a prosa no mesmo commit — o teste de doc-sync falha
 * se so um lado mudar.
 */

/**
 * Ordem canonica das fases do fluxo rapido, identica em `SKILL.md` e
 * `references/workflow.md`. A Fase 8 (monitoramento) e a excecao ao avanco
 * sequencial: roda em paralelo das Fases 4-6.5, nao depois delas.
 *
 * A Fase 1.3 do port Tier 1/Tier 2 acrescenta a Fase 6.6 (verificacao E2E no
 * navegador real, condicional) — quando isso acontecer, adicione `6.6` aqui
 * **no mesmo commit** que introduz a secao `### Fase 6.6` em `SKILL.md`, para
 * o guard de doc-sync continuar valendo.
 */
export const PHASE_ORDER = Object.freeze([0, 1, 2, 3, 4, 5, 6, 6.5, 7, 8, 9]);

/** Nome curto de cada fase, na mesma ordem de `PHASE_ORDER`. */
export const PHASE_NAMES = Object.freeze({
  0: "Preflight leve",
  1: "Triagem",
  2: "Plano curto",
  3: "Paralelizar ou executar direto",
  4: "Delegacao",
  5: "Integracao",
  6: "Verificacao",
  6.5: "Review plano vs entrega",
  7: "Fechamento interno",
  8: "Monitoramento",
  9: "Relatorio final",
});

/** Tipos de trabalho reconhecidos na Fase 1 (triagem). Espelha `WORK_TYPES` de `lib/project-config.mjs`. */
export const WORK_TYPES = Object.freeze([
  "BUG",
  "REFACTOR",
  "FEATURE_SLICE",
  "TEST_FIX",
  "UI_FRONTEND",
  "IMAGE_ASSET",
  "DOCS",
  "REVIEW",
]);

/** Niveis de risco usados para decidir gates proporcionais. */
export const RISK_LEVELS = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

/**
 * Identificadores retirados do vocabulario do plugin. Um teste de regressao
 * (`tests/docs-consistency.test.mjs`) falha se qualquer um destes voltar a
 * aparecer em `skills/`, `commands/` ou `README*.md` — a lista e montada por
 * fragmentos no proprio teste para o guard nao se auto-detectar.
 *
 * `codex_excluido` foi retirado na Fase 1.1 do port Tier 1/Tier 2: a
 * obrigatoriedade de CLI passou a vir inteira da Project_Config
 * (`backendExecutor`/`frontendExecutor` = `claude-code`), entao a excecao
 * ad-hoc de "front-end puro pode seguir sem Codex" deixou de existir.
 */
export const RETIRED_IDENTIFIERS = Object.freeze(["codex_excluido"]);

/** Avanca para a proxima fase na ordem canonica; sem efeito no final da lista. */
export function nextPhase(phase) {
  const index = PHASE_ORDER.indexOf(phase);
  if (index === -1 || index === PHASE_ORDER.length - 1) return phase;
  return PHASE_ORDER[index + 1];
}
