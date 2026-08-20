import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  ROLES,
  parseProjectConfig,
  renderProjectConfig,
} from "../skills/executor-subagents/scripts/lib/project-config.mjs";
import { arbFieldNoise, arbProjectConfig, arbRoles } from "./helpers/project-config-arbitraries.mjs";

const NUM_RUNS = 200;

// Property 1: round-trip do serializador de configuracao.
// Para toda Project_Config valida, renderizar e depois reler devolve os
// mesmos seis campos canonicos (schemaVersion, updatedAt, os quatro papeis).
test("Property 1: render -> parse e um round-trip exato dos campos canonicos", () => {
  fc.assert(
    fc.property(arbProjectConfig(), (config) => {
      const content = renderProjectConfig(config, { now: config.updatedAt });
      const reparsed = parseProjectConfig(content);
      assert.equal(reparsed.schemaVersion, config.schemaVersion);
      assert.equal(reparsed.updatedAt, config.updatedAt);
      for (const role of ROLES) assert.equal(reparsed[role], config[role]);
    }),
    { numRuns: NUM_RUNS },
  );
});

// Property 2: idempotencia do renderer.
// Renderizar duas vezes a mesma configuracao (com o mesmo `now`) produz
// exatamente o mesmo conteudo byte a byte.
test("Property 2: renderProjectConfig e deterministico para a mesma entrada", () => {
  fc.assert(
    fc.property(arbProjectConfig(), (config) => {
      const first = renderProjectConfig(config, { now: config.updatedAt });
      const second = renderProjectConfig(config, { now: config.updatedAt });
      assert.equal(first, second);
    }),
    { numRuns: NUM_RUNS },
  );
});

// Property 3: tolerancia a ruido de espacamento nao muda o resultado.
// Espacos extras ao redor do valor do campo nao alteram o executor lido.
test("Property 3: espacamento extra em torno do valor nao muda o papel lido", () => {
  fc.assert(
    fc.property(arbRoles(), arbFieldNoise(), arbFieldNoise(), (roles, before, after) => {
      const lines = [
        "# EXECUTOR PROJECT CONFIG",
        "",
        "- **schemaVersion**: 1",
        "- **updatedAt**: 2026-01-01T00:00:00Z",
        ...ROLES.map((role) => `- **${role}**:${before}${roles[role]}${after}`),
      ];
      const parsed = parseProjectConfig(lines.join("\n"));
      for (const role of ROLES) assert.equal(parsed[role], roles[role]);
    }),
    { numRuns: NUM_RUNS },
  );
});

// Property 4: ordem arbitraria das linhas de campo nao muda o resultado.
test("Property 4: ordem das linhas de campo e irrelevante para o parser", () => {
  fc.assert(
    fc.property(arbRoles(), fc.shuffledSubarray(ROLES, { minLength: ROLES.length }), (roles, order) => {
      const roleLines = order.map((role) => `- **${role}**: ${roles[role]}`);
      const lines = [
        "# EXECUTOR PROJECT CONFIG",
        "- **updatedAt**: 2026-01-01T00:00:00Z",
        "- **schemaVersion**: 1",
        ...roleLines,
      ];
      const parsed = parseProjectConfig(lines.join("\n"));
      for (const role of ROLES) assert.equal(parsed[role], roles[role]);
    }),
    { numRuns: NUM_RUNS },
  );
});

// Property 5: BOM e CRLF sao removidos sem alterar o resultado.
test("Property 5: BOM e CRLF nao alteram os campos lidos", () => {
  fc.assert(
    fc.property(arbRoles(), (roles) => {
      const lines = [
        "# EXECUTOR PROJECT CONFIG",
        "- **schemaVersion**: 1",
        "- **updatedAt**: 2026-01-01T00:00:00Z",
        ...ROLES.map((role) => `- **${role}**: ${roles[role]}`),
      ];
      const withCrlf = `﻿${lines.join("\r\n")}`;
      const parsed = parseProjectConfig(withCrlf);
      for (const role of ROLES) assert.equal(parsed[role], roles[role]);
    }),
    { numRuns: NUM_RUNS },
  );
});
