import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import fc from "fast-check";

import {
  buildDesignChangeRequests,
  contractSha256,
  definedTokens,
  lintDesignSource,
  runDesignGate,
  verifyContractHash,
} from "../skills/executor-subagents/scripts/lib/design-tokens.mjs";
import { planGates } from "../skills/executor-subagents/scripts/lib/gates.mjs";

const GATES_SCRIPT = fileURLToPath(new URL("../skills/executor-subagents/scripts/executor-gates.mjs", import.meta.url));

function makeContract() {
  const body = {
    schemaVersion: 2,
    systemId: "demo",
    themes: {
      light: { "--bg": "#ffffff", "--fg": "#111111", "--accent": "#2563eb" },
      dark: { "--bg": "#0b0b0b", "--fg": "#eeeeee", "--accent": "#60a5fa" },
    },
    tokens: { "--space-2": "8px", "--radius-md": "8px" },
  };
  return { ...body, sha256: contractSha256(body) };
}

const clean = ".card { background: var(--bg); color: var(--fg); padding: var(--space-2); border-radius: var(--radius-md); }\n";

test("canonical hash is independent of key order and ignores the embedded sha256", () => {
  const contract = makeContract();
  const shuffled = { tokens: contract.tokens, sha256: "0".repeat(64), themes: { dark: contract.themes.dark, light: contract.themes.light }, systemId: "demo", schemaVersion: 2 };
  assert.equal(contractSha256(shuffled), contract.sha256);
});

test("verifyContractHash accepts a consistent contract and the matching handoff sha", () => {
  const contract = makeContract();
  assert.equal(verifyContractHash(contract, contract.sha256).ok, true);
});

test("verifyContractHash rejects a tampered token and a stale handoff sha", () => {
  const contract = makeContract();
  const tampered = { ...contract, tokens: { ...contract.tokens, "--space-2": "9px" } };
  assert.deepEqual(verifyContractHash(tampered).issues.map((i) => i.code), ["CONTRACT_SHA_MISMATCH"]);
  const stale = verifyContractHash(contract, "a".repeat(64));
  assert.deepEqual(stale.issues.map((i) => i.code), ["HANDOFF_SHA_MISMATCH"]);
});

test("definedTokens collects theme and shared tokens", () => {
  const names = definedTokens(makeContract());
  assert.ok(names.has("--bg") && names.has("--accent") && names.has("--space-2") && names.has("--radius-md"));
});

test("clean source passes the gate", () => {
  const contract = makeContract();
  const result = runDesignGate({ contract, expectedSha: contract.sha256, sources: [{ file: "card.css", content: clean }] });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.violations, []);
});

test("an invented token is rejected and becomes a DESIGN_CHANGE_REQUEST", () => {
  const contract = makeContract();
  const content = ".hero { color: var(--brand-glow); }\n.cta { background: var(--brand-glow); }\n";
  const result = runDesignGate({ contract, sources: [{ file: "hero.css", content }] });
  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.violations.map((v) => v.rule), ["undefined-token", "undefined-token"]);
  assert.equal(result.changeRequests.length, 1);
  assert.equal(result.changeRequests[0].type, "DESIGN_CHANGE_REQUEST");
  assert.equal(result.changeRequests[0].token, "--brand-glow");
  assert.equal(result.changeRequests[0].usages.length, 2);
});

test("hex literal, px spacing/radius and inline style are rejected", () => {
  const contract = makeContract();
  const content = [
    ".a { color: #ff0000; }",
    ".b { padding: 12px; }",
    ".c { border-radius: 6px; }",
    "const x = <div style={{ margin: 8 }} />;",
    ".hairline { border: 1px solid var(--fg); }",
    "/* #123456 in a comment is ignored */",
  ].join("\n");
  const rules = lintDesignSource(content, { defined: definedTokens(contract) }).map((v) => v.rule);
  assert.deepEqual(rules, ["hardcoded-hex", "hardcoded-px", "hardcoded-px", "inline-style"]);
});

test("token definitions are only allowed when explicitly requested", () => {
  const line = ":root { --x: 1; }\n--bg: #ffffff;\n";
  assert.equal(lintDesignSource(line, { defined: [] }).some((v) => v.rule === "hardcoded-hex"), true);
  assert.equal(lintDesignSource(line, { defined: [], allowTokenDefinitions: true }).some((v) => v.rule === "hardcoded-hex"), false);
});

test("a tampered contract fails the gate even with clean sources", () => {
  const contract = makeContract();
  const tampered = { ...contract, tokens: { ...contract.tokens, "--radius-md": "99px" } };
  assert.equal(runDesignGate({ contract: tampered, sources: [{ file: "c.css", content: clean }] }).status, "FAIL");
});

test("property: any var(--name) absent from the contract is flagged, any present one is not", () => {
  const contract = makeContract();
  const defined = definedTokens(contract);
  const name = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/).map((s) => `--${s}`);
  fc.assert(fc.property(name, (token) => {
    const violations = lintDesignSource(`.x { color: var(${token}); }`, { defined });
    assert.equal(violations.length > 0, !defined.has(token));
    if (violations.length > 0) assert.equal(buildDesignChangeRequests(violations)[0].token, token);
  }));
});

test("planGates adds the design-tokens gate regardless of risk when a design contract is in use", () => {
  const { gates } = planGates({ risk: "LOW", designContract: true });
  const gate = gates.find((g) => g.id === "design-tokens");
  assert.ok(gate);
  assert.equal(gate.kind, "script");
  assert.ok(gate.command.includes("design-lint"));
  assert.ok(planGates({ risk: "LOW" }).skipped.some((s) => s.id === "design-tokens"));
});

test("CLI design-lint exits 1 with a DESIGN_CHANGE_REQUEST for an invented token and 0 for a clean file", () => {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-design-lint-test-"));
  try {
    const contract = makeContract();
    const contractFile = join(dir, "design-contract.json");
    writeFileSync(contractFile, JSON.stringify(contract));
    const good = join(dir, "good.css");
    const bad = join(dir, "bad.css");
    writeFileSync(good, clean);
    writeFileSync(bad, ".x { color: var(--invented); }\n");

    const ok = spawnSync(process.execPath, [GATES_SCRIPT, "design-lint", "--contract", contractFile, "--files", good, "--expected-sha", contract.sha256], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).status, "PASS");

    const fail = spawnSync(process.execPath, [GATES_SCRIPT, "design-lint", "--contract", contractFile, "--files", `${good},${bad}`], { encoding: "utf8" });
    assert.equal(fail.status, 1);
    const out = JSON.parse(fail.stdout);
    assert.equal(out.status, "FAIL");
    assert.equal(out.changeRequests[0].token, "--invented");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const rulesOf = (content, options = {}) =>
  lintDesignSource(content, { defined: definedTokens(makeContract()), ...options }).map((v) => v.rule);

test("JS/TS object literals: numeric spacing/radius and functional or named colors are rejected", () => {
  assert.deepEqual(rulesOf("const s = { padding: 12, borderRadius: 8 };"), ["hardcoded-number", "hardcoded-number"]);
  assert.deepEqual(rulesOf("const s = { gap: '16px' };"), ["hardcoded-px"]);
  assert.deepEqual(rulesOf("const t = { color: 'red', backgroundColor: 'rgba(0,0,0,.5)' };"), ["hardcoded-color", "hardcoded-color"]);
  assert.deepEqual(rulesOf("const t = { color: '#fff' };"), ["hardcoded-hex"]);
});

test("object literals: no false positives on 0/1, non visual keys, tokens and ambiguous keys", () => {
  const ok = [
    "const s = { padding: 0, margin: 1, zIndex: 40, opacity: 0.5, flex: 1, lineHeight: 24, order: 3 };",
    "const s = { top: 12, left: 8, width: 240, retries: 5, timeout: 3000 };",
    "const s = { padding: 'var(--space-2)', color: 'var(--fg)', background: 'transparent' };",
    "type Props = { padding: number; color: string };",
    "const t = { color: 'inherit', fill: 'currentColor' };",
  ].join("\n");
  assert.deepEqual(rulesOf(ok), []);
});

test("CSS-in-JS template strings are linted line by line", () => {
  const content = [
    "const Box = styled.div`",
    "  padding: 12px;",
    "  color: #ff0000;",
    "  margin: var(--space-2);",
    "`;",
  ].join("\n");
  assert.deepEqual(rulesOf(content), ["hardcoded-px", "hardcoded-hex"]);
});

test("Tailwind arbitrary values for spacing/radius/size/color functions are rejected", () => {
  assert.deepEqual(rulesOf('<div className="p-[13px] md:rounded-[6px] text-[13px]" />'), ["tailwind-arbitrary", "tailwind-arbitrary", "tailwind-arbitrary"]);
  assert.deepEqual(rulesOf('<div className="bg-[#fff]" />'), ["hardcoded-hex"]);
  assert.deepEqual(rulesOf('<div className="bg-[rgb(0,0,0)]" />'), ["tailwind-arbitrary"]);
  assert.deepEqual(rulesOf('<div className="p-4 rounded-md bg-[var(--bg)] p-[1px] m-[0px] gap-[var(--space-2)]" />'), []);
});

test("allowTokenDefinitions frees theme objects but not usage", () => {
  const theme = "export const theme = {\n  color: '#fff',\n  padding: 12,\n  'radius': '8px',\n};\n";
  assert.notDeepEqual(rulesOf(theme), []);
  assert.deepEqual(rulesOf(theme, { allowTokenDefinitions: true }), []);
  // uso em CSS continua reprovado mesmo com a flag
  assert.deepEqual(rulesOf(".a { padding: 12px; }", { allowTokenDefinitions: true }), ["hardcoded-px"]);
});

test("property: any bare number above 1 on a spacing key is flagged, 0/1 never", () => {
  const key = fc.constantFrom("padding", "margin", "gap", "borderRadius", "paddingTop", "marginInline", "rowGap");
  fc.assert(fc.property(key, fc.integer({ min: -500, max: 500 }), (k, n) => {
    const rules = rulesOf(`const s = { ${k}: ${n} };`);
    assert.equal(rules.length > 0, Math.abs(n) > 1);
  }));
  const twKey = fc.constantFrom("p", "px", "mt", "gap", "rounded", "rounded-t", "inset-x");
  fc.assert(fc.property(twKey, fc.integer({ min: 2, max: 400 }), (k, n) => {
    assert.deepEqual(rulesOf(`<i className="${k}-[${n}px]" />`), ["tailwind-arbitrary"]);
  }));
});

const violationsOf = (content, options = {}) =>
  lintDesignSource(content, { defined: definedTokens(makeContract()), ...options }).map((v) => [v.rule, v.line]);

test("multiline: value on the next line, multiline objects/arrays and CSS-in-JS report the value's start line", () => {
  assert.deepEqual(violationsOf(".a {\n  padding:\n    12px;\n}"), [["hardcoded-px", 3]]);
  assert.deepEqual(violationsOf("const s = {\n  padding:\n    12,\n  margin: 0,\n};"), [["hardcoded-number", 3]]);
  assert.deepEqual(violationsOf("const s = {\n  padding: [\n    8,\n    16,\n  ],\n};"), [["hardcoded-number", 2], ["hardcoded-number", 2]]);
  const styled = "const Box = styled.div`\n  color: red;\n  margin:\n    2rem;\n`;";
  assert.deepEqual(violationsOf(styled), [["hardcoded-color", 2], ["hardcoded-px", 4]]);
  // sem separador entre propriedades: a proxima chave nao e engolida pelo valor anterior
  assert.deepEqual(violationsOf("type P = {\n  padding: number\n  margin: number\n};\nconst s = {\n  gap: 9\n  radius: 5\n};"), [["hardcoded-number", 6], ["hardcoded-number", 7]]);
});

test("spacing arrays are flagged element by element; 0/1 and tokens are not", () => {
  assert.deepEqual(violationsOf("const s = { padding: [8, 16] };"), [["hardcoded-number", 1], ["hardcoded-number", 1]]);
  assert.deepEqual(violationsOf("const s = { padding: [0, 1, 'var(--space-2)'] };"), []);
  assert.deepEqual(violationsOf("const s = { margin: ['4px', '0'] };"), [["hardcoded-px", 1]]);
});

test("expressions with a literal operand are flagged outside var() and calc multipliers", () => {
  assert.deepEqual(violationsOf("const s = { padding: base * 2 };"), [["hardcoded-expression", 1]]);
  assert.deepEqual(violationsOf("const s = { gap: 8 * 2 };"), [["hardcoded-expression", 1]]);
  assert.deepEqual(violationsOf("const Box = styled.div`\n  padding: ${8}px;\n  margin: ${base * 2}px;\n  gap: ${theme.space}px;\n`;"), [["hardcoded-px", 2], ["hardcoded-expression", 3]]);
  assert.deepEqual(violationsOf(".a { padding: calc(12px + var(--space-2)); }"), [["hardcoded-px", 1]]);
  assert.deepEqual(violationsOf(".a { padding: calc(var(--space-2) * 2); margin: calc(-1 * var(--space-2)); }"), []);
  assert.deepEqual(violationsOf("const s = { padding: space - 1, margin: count + 1, gap: theme.gap };"), []);
});

test("rem/em on spacing and radius are flagged in CSS and objects; 0 and tokens are not", () => {
  assert.deepEqual(violationsOf(".a { padding: 1rem; border-radius: 0.5em; margin: 0 auto; }"), [["hardcoded-px", 1], ["hardcoded-px", 1]]);
  assert.deepEqual(violationsOf("const s = { padding: '1.5rem', gap: '0rem' };"), [["hardcoded-px", 1]]);
  assert.deepEqual(violationsOf(".a { padding: var(--space-2); letter-spacing: 0.02em; width: 20rem; }"), []);
});

test("full CSS named color list is flagged, including shorthands; keywords are not", () => {
  assert.deepEqual(violationsOf(".a { color: rebeccapurple; background: url(x.png) no-repeat lightgoldenrodyellow; }"), [["hardcoded-color", 1], ["hardcoded-color", 1]]);
  assert.deepEqual(violationsOf(".a { border: 1px solid black; outline: 2px dashed Tomato; }"), [["hardcoded-color", 1], ["hardcoded-color", 1]]);
  assert.deepEqual(violationsOf(".a { color: inherit; fill: currentColor; background: transparent; border: none; outline: initial; stroke: unset; }"), []);
  assert.deepEqual(violationsOf(".a { border: 1px solid var(--fg); background: var(--bg) no-repeat; }"), []);
});

test("comments and non visual strings are ignored, visual strings are not", () => {
  const content = [
    "/* padding: 12px; color: #ff0000 */",
    "// margin: 20px; #abc123",
    "<a href=\"#add-to-cart\" id=\"#bad\" aria-label=\"x\">go</a>",
    "import logo from './#fade.png';",
    ".b { background: url(http://cdn.example.com/#abc); }",
    "const url = 'https://example.com/a//b';",
    "/* multi",
    "   line #ffffff */",
    ".c { color: #fff; }",
  ].join("\n");
  assert.deepEqual(violationsOf(content), [["hardcoded-hex", 9]]);
});

test("multiline style={{}} reports inline-style once and does not double report bare numbers", () => {
  const content = "const el = (\n  <div style={{\n    padding: 12,\n    color: 'blue',\n  }} />\n);";
  assert.deepEqual(violationsOf(content), [["inline-style", 2], ["hardcoded-color", 4]]);
});

test("allowTokenDefinitions still frees multiline theme objects and keeps flagging CSS usage", () => {
  const theme = "export const theme = {\n  color:\n    '#fff',\n  padding: [8, 16],\n  radius: '0.5rem'\n};\n";
  assert.notDeepEqual(violationsOf(theme), []);
  assert.deepEqual(violationsOf(theme, { allowTokenDefinitions: true }), []);
  assert.deepEqual(violationsOf(".a {\n  padding:\n    1rem;\n}", { allowTokenDefinitions: true }), [["hardcoded-px", 3]]);
});

test("property: reported line is the value's start line whatever the leading blank lines/newline after the colon", () => {
  const key = fc.constantFrom("padding", "margin", "gap", "borderRadius");
  fc.assert(fc.property(key, fc.integer({ min: 2, max: 400 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 3 }), (k, n, lead, gap) => {
    const src = `${"\n".repeat(lead)}const s = {\n  ${k}:${"\n".repeat(gap)} ${n},\n};`;
    const found = lintDesignSource(src, { defined: [] });
    assert.equal(found.length, 1);
    assert.equal(found[0].rule, "hardcoded-number");
    assert.equal(found[0].line, lead + 2 + gap);
  }));
  const clean = fc.constantFrom("var(--space-2)", "0", "1", "auto", "inherit");
  fc.assert(fc.property(key, clean, fc.integer({ min: 0, max: 3 }), (k, v, gap) => {
    assert.deepEqual(lintDesignSource(`const s = {\n  ${k}:${"\n".repeat(gap)} '${v}',\n};`, { defined: ["--space-2"] }), []);
  }));
});

// ---------------------------------------------------------------------------
// 2.14.0: tamanho em px, atributos SVG/JSX, ternarios, constantes do arquivo, chaves de espaco extras
// ---------------------------------------------------------------------------

test("size properties: px above 1 is flagged in CSS and objects; 0, 1px, %, auto, rem/em, viewport units and tokens are not", () => {
  assert.deepEqual(violationsOf(".a { width: 240px; min-height: 48px; max-width: 1200px; font-size: 14px; line-height: 20px; }"),
    [["hardcoded-px", 1], ["hardcoded-px", 1], ["hardcoded-px", 1], ["hardcoded-px", 1], ["hardcoded-px", 1]]);
  assert.deepEqual(violationsOf("const s = { width: '240px', minHeight: '48px', fontSize: 14, lineHeight: '20px' };"),
    [["hardcoded-px", 1], ["hardcoded-px", 1], ["hardcoded-number", 1], ["hardcoded-px", 1]]);
  assert.deepEqual(violationsOf(".a { width: 100%; height: auto; min-width: 0; max-height: 1px; width: 20rem; height: 100vh; font-size: 1.25em; line-height: 1.5; width: calc(100% - var(--space-2)); font-size: var(--radius-md); }"), []);
  assert.deepEqual(violationsOf("const s = { width: 240, height: 48, lineHeight: 24, fontSize: 'var(--radius-md)', fontSize: 1 };"), []);
});

test("size px: media/container queries and matchMedia are exempt, calc literals are not", () => {
  assert.deepEqual(violationsOf("@media (min-width: 768px) and (max-width: 1024px) { .a { color: var(--fg); } }\n@container (min-width: 400px) { .b { gap: var(--space-2); } }"), []);
  assert.deepEqual(violationsOf("const m = window.matchMedia('(min-width: 768px)');\nconst q = useMediaQuery(\"(max-width: 600px)\");"), []);
  assert.deepEqual(violationsOf(".a { width: calc(100vw - 32px); }"), [["hardcoded-px", 1]]);
});

test("allowSize frees structural px by property, property:value, *:value or RegExp", () => {
  const css = ".icon { width: 24px; height: 24px; } .card { max-width: 640px; }";
  assert.equal(violationsOf(css).length, 3);
  assert.deepEqual(violationsOf(css, { allowSize: ["width:24px", "height:24px"] }), [["hardcoded-px", 1]]);
  assert.deepEqual(violationsOf(css, { allowSize: ["*:24px", "max-width"] }), []);
  assert.deepEqual(violationsOf(css, { allowSize: [/^(?:width|height):24px$/, /^max-width:/] }), []);
  assert.deepEqual(violationsOf('<svg viewBox="0 0 24 24" width="24" height="24" />'), []);
  assert.deepEqual(violationsOf('<svg width="24px" />'), [["hardcoded-px", 1]]);
  assert.deepEqual(violationsOf('<svg width="24px" />', { allowSize: ["width:24px"] }), []);
});

test("extra spacing keys get spacing rigor: horizontal/vertical/x/y, spacing, gutter, inset-x", () => {
  assert.deepEqual(rulesOf("const s = { paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 12, spacing: 4, gutter: 24, gapX: 6 };"),
    Array(6).fill("hardcoded-number"));
  assert.deepEqual(rulesOf(".a { padding-inline: 12px; margin-block: 8px; inset-x: 4px; }"), ["hardcoded-px", "hardcoded-px", "hardcoded-px"]);
  assert.deepEqual(rulesOf("const s = { paddingHorizontal: 0, spacing: 1, gutter: 'var(--space-2)', marginVertical: 'auto' };"), []);
});

test("SVG/JSX color attributes: named and functional colors are flagged; currentColor/none/url()/var() are not", () => {
  assert.deepEqual(violationsOf('<path fill="red" stroke="rgb(0,0,0)" stopColor="rebeccapurple" />'),
    [["hardcoded-color", 1], ["hardcoded-color", 1], ["hardcoded-color", 1]]);
  assert.deepEqual(violationsOf("<stop stop-color='hsl(10 50% 50%)' flood-color=\"tomato\" />"), [["hardcoded-color", 1], ["hardcoded-color", 1]]);
  assert.deepEqual(violationsOf("<Text color={dark ? 'white' : 'black'} />"), [["hardcoded-color", 1]]);
  assert.deepEqual(violationsOf('<path fill="#abcdef" />'), [["hardcoded-hex", 1]]);
  assert.deepEqual(violationsOf('<g fill="currentColor" stroke="none"><rect fill="url(#grad)" stroke="url(#abc)" /><path fill="var(--accent)" fill={theme.fill} /></g>'), []);
  assert.deepEqual(violationsOf('<Text color="primary" />'), []);
});

test("JSX spacing/size attributes: px strings are flagged, scale-index numbers are not", () => {
  assert.deepEqual(violationsOf('<Box padding="12px" gap={"16px"} width="240px" />'), [["hardcoded-px", 1], ["hardcoded-px", 1], ["hardcoded-px", 1]]);
  assert.deepEqual(violationsOf('<Stack gap={4} spacing={2} padding={dense ? 1 : 2} margin="0" />'), []);
  assert.deepEqual(violationsOf("<Box gap={dense ? '8px' : '16px'} />"), [["hardcoded-px", 1], ["hardcoded-px", 1]]);
});

test("ternaries with visual literals are flagged; ternaries over tokens/0/1 are not", () => {
  assert.deepEqual(violationsOf("const s = { padding: dense ? 8 : 16 };"), [["hardcoded-number", 1], ["hardcoded-number", 1]]);
  assert.deepEqual(violationsOf("const s = { fontSize: big ? 18 : 14, color: dark ? 'white' : 'black' };"), [["hardcoded-number", 1], ["hardcoded-number", 1], ["hardcoded-color", 1]]);
  assert.deepEqual(violationsOf("const s = { color: dark ? '#fff' : '#000' };"), [["hardcoded-hex", 1], ["hardcoded-hex", 1]]);
  assert.deepEqual(violationsOf("const s = { padding: dense ? 0 : 1, gap: a ? 'var(--space-2)' : 'var(--radius-md)', margin: x ?? 8 };"), []);
});

test("same-file constants are resolved at the use line, with their origin", () => {
  const src = "const P = 12;\nconst COLOR = 'red';\nconst GAP = '16px';\nconst s = {\n  padding: P,\n  color: COLOR,\n  gap: GAP,\n  margin: dense ? P : 0,\n};";
  const found = lintDesignSource(src, { defined: [] });
  const use = found.filter((v) => v.via === "const");
  assert.deepEqual(use.map((v) => [v.rule, v.line, v.origin.name, v.origin.line]),
    [["hardcoded-number", 5, "P", 1], ["hardcoded-color", 6, "COLOR", 2], ["hardcoded-px", 7, "GAP", 3], ["hardcoded-number", 8, "P", 1]]);
  assert.equal(use[0].origin.value, "12");
  // JSX: constante em atributo so vale para px/cor, nao para numero (indice de escala)
  assert.deepEqual(violationsOf("const G = '8px'; const N = 4;\nconst el = <Box gap={G} spacing={N} />;").filter(([, line]) => line === 2), [["hardcoded-px", 2]]);
});

test("constants: reassigned, redeclared, non literal, imported and 0/1 constants are not resolved", () => {
  assert.deepEqual(rulesOf("let p = 12;\np = 16;\nconst s = { padding: p };"), []);
  assert.deepEqual(rulesOf("let p = 12;\np += 4;\nconst s = { padding: p };"), []);
  assert.deepEqual(rulesOf("let n = 12;\nn++;\nconst s = { gap: n };"), []);
  assert.deepEqual(rulesOf("const p = 12;\nfunction f() { const p = theme.space; return { padding: p }; }"), []);
  assert.deepEqual(rulesOf("const p = base * 2;\nconst s = { padding: p };"), []);
  assert.deepEqual(rulesOf("const p = 1; const z = 0; const s = { padding: p, margin: z, gap: unknown };"), []);
  assert.deepEqual(rulesOf("import { P } from './tokens';\nconst s = { padding: P };"), []);
  // let sem reatribuicao ainda resolve
  assert.deepEqual(rulesOf("let p = 12;\nconst s = { padding: p };"), ["hardcoded-number"]);
});

test("constants and allowTokenDefinitions/allowSize interplay", () => {
  assert.deepEqual(rulesOf("const P = 12;\nexport const theme = {\n  padding: P,\n};", { allowTokenDefinitions: true }), []);
  assert.deepEqual(rulesOf("const P = 12;\nconst W = '24px';\nconst s = { padding: P, width: W };", { allowSize: ["width:24px"] }), ["hardcoded-number"]);
});

test("property: px above 1 on a size key is flagged, 0/1 and non-px units never", () => {
  const key = fc.constantFrom("width", "height", "min-width", "max-height", "font-size", "line-height", "flex-basis");
  fc.assert(fc.property(key, fc.integer({ min: -400, max: 400 }), (k, n) => {
    const rules = rulesOf(`.a { ${k}: ${n}px; }`);
    assert.equal(rules.length > 0, Math.abs(n) > 1);
  }));
  const unit = fc.constantFrom("rem", "em", "%", "vh", "vw", "ch");
  fc.assert(fc.property(key, unit, fc.integer({ min: 1, max: 400 }), (k, u, n) => {
    assert.deepEqual(rulesOf(`.a { ${k}: ${n}${u}; }`), []);
  }));
});

test("property: a constant resolved on a spacing key is flagged exactly when the literal is above 1, at the use line", () => {
  const key = fc.constantFrom("padding", "margin", "gap", "paddingHorizontal", "spacing");
  fc.assert(fc.property(key, fc.integer({ min: -50, max: 50 }), fc.integer({ min: 0, max: 4 }), (k, n, lead) => {
    const src = `${"\n".repeat(lead)}const V = ${n};\nconst s = {\n  ${k}: V,\n};`;
    const found = lintDesignSource(src, { defined: [] });
    assert.equal(found.length > 0, Math.abs(n) > 1);
    if (found.length) {
      assert.equal(found[0].line, lead + 3);
      assert.equal(found[0].origin.line, lead + 1);
    }
  }));
});

test("CLI design-lint accepts --allow-size and exits accordingly", () => {
  const dir = mkdtempSync(join(tmpdir(), "lint-size-"));
  try {
    const contract = join(dir, "design-contract.json");
    const file = join(dir, "icon.css");
    writeFileSync(contract, JSON.stringify(makeContract()));
    writeFileSync(file, ".icon { width: 24px; height: 24px; }\n");
    const run = (extra) => spawnSync(process.execPath, [GATES_SCRIPT, "design-lint", "--contract", contract, "--files", file, ...extra], { encoding: "utf8" });
    assert.equal(run([]).status, 1);
    const allowed = run(["--allow-size", "width:24px,height:24px"]);
    assert.equal(allowed.status, 0, allowed.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
