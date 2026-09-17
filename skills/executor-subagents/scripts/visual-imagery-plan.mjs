#!/usr/bin/env node
/**
 * Classifies whether a task needs real AGY-generated imagery, and how many
 * bound assets that implies.
 *
 * Root cause fixed here (mirrors cc-pensador >= 2.27.0's
 * inferVisualImageryPlan() and cc-orchestrador-subagents' >= 4.19.0
 * classifyVisualImageryTask() — see either module's docstring for the
 * fuller root-cause note): the previous version matched loose UI
 * vocabulary — "banner", "hero", "mockup" — directly against `required`,
 * which both false-blocked (a task merely describing a component's shape,
 * e.g. "hero com CTA", not demanding real photography) and false-negatived
 * on an English task description (no pt-BR keyword ever matched). It also
 * used a `recommended` tier (dispensable with a registered justification)
 * for "site publico/landing page/institucional" tasks — but the benchmark
 * evidence behind the cc-pensador/cc-orchestrador-subagents fix showed a
 * public conversion surface uses real photography as consistently as a
 * catalog does (every reference in the cross-sector benchmark used a real
 * hero photo prominently), so treating it as merely "nice to have" was
 * itself part of the same bug, not a separate design choice. Policy is now
 * binary (`required`/`not-applicable`) and comes from the TASK'S SURFACE (a
 * conversion/catalog public page is a structural, high-confidence signal),
 * not from loose words. A per-item explicit mandate ("upload de foto do
 * produto") is kept as an independent, narrower trigger.
 *
 * Kept intentionally small and dependency-free (this repo has no shared
 * package with cc-pensador/cc-orchestrador-subagents to import their
 * surface detector from) — a subset of cc-pensador's
 * SECONDARY_SURFACE_SIGNALS/CATALOG_MERCHANDISING_RE covering
 * task-description-shaped text, not a full product-archetype classifier.
 */
import path from 'node:path';

const normalize = (value) => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Bilingual surface signals — same set cc-pensador's SECONDARY_SURFACE_SIGNALS.conversion/catalog uses. */
const CONVERSION_SURFACE_RE = /\b(?:site publico|pagina publica|area publica|landing page|vitrine institucional|captacao de leads?|formulario de orcamento|formulario de contato|homepage|pagina inicial|marketing|site institucional|public site|public page|public facing page|marketing page|lead capture)\b/;
const CATALOG_KEYWORD_RE = /\b(?:vitrine de pecas|vitrine de produtos|vitrine de servicos|catalogo publico|galeria de produtos|product gallery|public catalog|storefront|product showcase)\b/;
/** "catalogo/vitrine DE <itens>" with arbitrary words in between — same pattern as cc-pensador's CATALOG_MERCHANDISING_RE. */
const CATALOG_MERCHANDISING_RE = /\b(?:catalogo|vitrine)\b.*\b(?:pecas|equipamentos|produtos|servicos|itens)\b|\b(?:pecas|equipamentos)\b.*\b(?:catalogo|vitrine)\b/;
/** Narrower than the old "imagem|foto|banner|hero|mockup" bucket on purpose — only an explicit per-item photo mandate, not UI vocabulary. */
const EXPLICIT_ITEM_IMAGE_RE = /\b(?:upload de foto|fotos? do produto|fotos? do item|galeria de fotos|banner personalizado)\b/;

export function classifyVisualImageryTask(input) {
  const text = normalize(typeof input === 'string' ? input : input?.text);
  const reasons = [];
  if (EXPLICIT_ITEM_IMAGE_RE.test(text)) reasons.push('explicit-imagery-requirement');
  const isCatalog = CATALOG_KEYWORD_RE.test(text) || CATALOG_MERCHANDISING_RE.test(text);
  if (isCatalog) reasons.push('catalog-visual-merchandising');
  const isConversion = CONVERSION_SURFACE_RE.test(text);
  if (isConversion) reasons.push('public-conversion-surface');
  const required = reasons.includes('explicit-imagery-requirement') || isCatalog || isConversion;
  const policy = required ? 'required' : 'not-applicable';
  return {
    schemaVersion: 1,
    policy,
    provider: 'agy',
    minimumAssets: required ? 3 : 0,
    reasons,
    createImageAssetSlice: required,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const textIndex = args.indexOf('--text');
  if (textIndex >= 0 && args[textIndex + 1]) return args[textIndex + 1];
  return args.filter((arg) => !arg.startsWith('--')).join(' ');
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'visual-imagery-plan.mjs';
if (isMain) process.stdout.write(`${JSON.stringify(classifyVisualImageryTask(parseArgs(process.argv.slice(2))), null, 2)}\n`);
