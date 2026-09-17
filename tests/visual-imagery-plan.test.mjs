import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyVisualImageryTask } from '../skills/executor-subagents/scripts/visual-imagery-plan.mjs';

describe('classifyVisualImageryTask', () => {
  for (const text of [
    'Criar catálogo público de peças automotivas',
    'Vitrine de equipamentos para locação',
    'Adicionar fotos ao catálogo de produtos',
  ]) {
    it(`requires AGY assets for catalog inventory: ${text}`, () => {
      const result = classifyVisualImageryTask(text);
      assert.equal(result.policy, 'required');
      assert.equal(result.provider, 'agy');
      assert.equal(result.minimumAssets, 3);
      assert.equal(result.createImageAssetSlice, true);
      assert.ok(result.reasons.includes('catalog-visual-merchandising'));
    });
  }

  for (const text of ['Landing page institucional', 'Nova área pública de marketing', 'Refazer a homepage']) {
    it(`requires AGY assets for a public conversion surface, not merely recommends it: ${text}`, () => {
      // A conversion surface is a structural signal (every public reference
      // in the cross-sector benchmark used real photography), not a "nice
      // to have" — mirrors the cc-pensador/cc-orchestrador-subagents fix.
      const result = classifyVisualImageryTask(text);
      assert.equal(result.policy, 'required');
      assert.equal(result.minimumAssets, 3);
      assert.equal(result.createImageAssetSlice, true);
      assert.ok(result.reasons.includes('public-conversion-surface'));
    });
  }

  it('detects a "catalogo/vitrine de X" phrasing beyond the fixed keyword list', () => {
    assert.equal(classifyVisualImageryTask('Vitrine com catalogo de equipamentos').policy, 'required');
  });

  it('detects an English-only task description (fixes the old regex bilingual gap)', () => {
    assert.equal(classifyVisualImageryTask('Build a public storefront with a product gallery').policy, 'required');
  });

  it('does not force required just because the task mentions generic UI words like "hero"/"banner"/"mockup"', () => {
    // The old regex matched these words directly; now they carry no signal
    // on their own unless the task also names a conversion/catalog surface
    // or an explicit per-item photo mandate.
    const result = classifyVisualImageryTask('Ajustar o componente de hero banner no mockup do dashboard interno');
    assert.equal(result.policy, 'not-applicable');
  });

  it('requires AGY assets for an explicit per-item photo mandate, independent of surface', () => {
    const result = classifyVisualImageryTask('Permitir upload de foto do produto no cadastro interno');
    assert.equal(result.policy, 'required');
    assert.ok(result.reasons.includes('explicit-imagery-requirement'));
  });

  it('does not invent imagery work for a backend-only task', () => {
    assert.deepEqual(classifyVisualImageryTask('Corrigir índice SQL da API'), {
      schemaVersion: 1,
      policy: 'not-applicable',
      provider: 'agy',
      minimumAssets: 0,
      reasons: [],
      createImageAssetSlice: false,
    });
  });
});
