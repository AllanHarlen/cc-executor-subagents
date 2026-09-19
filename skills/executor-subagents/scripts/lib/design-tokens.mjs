/**
 * Gate de design system do Executor (Fase 9 do plano de design system).
 *
 * Modulo puro (so builtins do Node). Faz duas coisas mecanicas que antes
 * existiam so como prosa em `subagent-prompts.md`:
 *
 *  1. confere o `contractSha256` do `design-contract.json` em `resolved/`
 *     (mesma serializacao canonica de `cc-pensador/scripts/lib/token-mapper.mjs`);
 *  2. lint de fontes de front-end contra os tokens do contrato: hex literal,
 *     px/rem/em de espaco/raio, `style={{}}` inline, `var(--x)` inexistente e, fora de
 *     `style`, literais de design em objetos JS/TS (`{ padding: 12, color: 'red' }`),
 *     arrays (`padding: [8, 16]`), expressoes com literal (`base * 2`, `${8}px`),
 *     CSS-in-JS e valores arbitrarios do Tailwind (`p-[13px]`, `bg-[rgb(...)]`).
 *
 * O lint analisa o arquivo inteiro por declaracao (nao linha a linha): um valor
 * pode comecar na linha seguinte ao `:` ou se estender por varias linhas. Antes
 * disso um tokenizador simples mascara comentarios e strings nao visuais
 * (URLs, `href`, `import`, `id`, `aria-*`...) preservando as quebras de linha.
 * Tambem cobre: px de largura/altura/fonte (`width`, `min-*`, `max-*`, `font-size`,
 * `line-height`, com `allowSize` para excecoes estruturais), cores em atributos
 * SVG/JSX (`fill`, `stroke`, `stopColor`...), ternarios com literais visuais e
 * constantes do mesmo arquivo (`const p = 12; ... padding: p`).
 * Nao e um AST: ver "Limites" no CHANGELOG.
 *
 * Um `var(--x)` fora do contrato e um token inventado: nao se corrige
 * criando o token, e sim com um `DESIGN_CHANGE_REQUEST` (token novo so entra
 * por uma nova versao do Pensador).
 */

import { createHash } from "node:crypto";

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

/** sha256 do contrato canonico sem o proprio campo `sha256`. */
export function contractSha256(contract) {
  const { sha256: _ignored, ...rest } = contract;
  return createHash("sha256").update(canonicalJson(rest)).digest("hex");
}

/**
 * Confere o contrato: o `sha256` embutido tem de bater com o recomputado e,
 * quando informado, com o `contractSha256` do handoff.
 */
export function verifyContractHash(contract, expectedSha = null) {
  const computed = contractSha256(contract ?? {});
  const embedded = contract?.sha256 ?? null;
  const issues = [];
  if (embedded !== computed) issues.push({ code: "CONTRACT_SHA_MISMATCH", embedded, computed });
  if (expectedSha && expectedSha !== computed) {
    issues.push({ code: "HANDOFF_SHA_MISMATCH", expected: expectedSha, computed });
  }
  return { ok: issues.length === 0, computed, embedded, expected: expectedSha ?? null, issues };
}

/** Nomes de token (`--x`) definidos pelo contrato: temas de cor e tokens compartilhados. */
export function definedTokens(contract) {
  const names = new Set();
  const add = (group) => {
    if (!group || typeof group !== "object") return;
    for (const key of Object.keys(group)) if (key.startsWith("--")) names.add(key);
  };
  add(contract?.tokens);
  for (const theme of Object.values(contract?.themes ?? {})) add(theme);
  return names;
}

const SIDE = "(?:-(?:top|right|bottom|left|inline|block|horizontal|vertical|x|y)(?:-(?:start|end))?)?";
const SPACE_RADIUS_PROPERTY = new RegExp(`^(?:margin|padding|gap|row-gap|column-gap|radius|top|right|bottom|left|inset|border-radius|border-(?:top|bottom)-(?:left|right)-radius|spacing|gutters?)${SIDE}$`);
// Numero cru (`padding: 12`) so em chaves inequivocas: `top`/`left`/`inset` sao comuns em objetos nao visuais.
const BARE_NUMBER_PROPERTY = new RegExp(`^(?:margin|padding|gap|row-gap|column-gap|radius|border-radius|border-(?:top|bottom)-(?:left|right)-radius|spacing|gutters?)${SIDE}$`);
// Tamanho: so `px` literal (> 1) reprova; `rem`/`em`, %, auto e viewport units passam. Numero cru so em `font-size`.
const SIZE_PROPERTY = /^(?:width|height|min-width|min-height|max-width|max-height|block-size|inline-size|min-block-size|min-inline-size|max-block-size|max-inline-size|flex-basis|font-size|line-height)$/;
const BARE_SIZE_PROPERTY = /^font-size$/;
// Propriedades cujo valor pode conter cor (atalhos `border`/`outline`/`*-shadow` incluidos: varre cada palavra).
const COLOR_PROPERTY = /^(?:color|background|background-color|border|border-(?:top|right|bottom|left)|border-color|border-(?:top|right|bottom|left)-color|outline|outline-color|caret-color|accent-color|text-decoration|text-decoration-color|column-rule|box-shadow|text-shadow|fill|stroke|stop-color|flood-color|lighting-color)$/;
const FUNCTIONAL_COLOR = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;
// Lista CSS completa de cores nomeadas; `transparent`/`inherit`/`currentColor`/`initial`/`unset` ficam de fora de proposito.
const NAMED_COLORS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue " +
    "chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey " +
    "darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray " +
    "darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen " +
    "fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen " +
    "lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime " +
    "limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
    "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
    "olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue " +
    "slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke " +
    "yellow yellowgreen").split(" "),
);
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
// Unidade de comprimento: `0px`/`1px` (hairline) e `0rem` nao sao escala de espaco; o resto precisa de token.
const LENGTH = /(?<![\w.-])(-?\d*\.?\d+)(px|rem|em)\b/g;
// `${8}px`: literal numerico interpolado numa unidade.
const INTERPOLATED_LENGTH = /\$\{\s*(-?\d*\.?\d+)\s*\}\s*(px|rem|em)\b/g;
// Declaracao CSS (`padding: 12px`) ou propriedade de objeto JS (`borderRadius: '8px'`, `"padding": 12`), inclusive com o
// valor na linha seguinte. O valor aceita `(...)` com um nivel de aninhamento, `[...]` e `${...}`, e para antes da proxima
// chave (`\n  outra: ...`) quando o separador foi omitido.
const DECLARATION = /(?:^|[{,;\s(])(['"]?)(-{0,2}[a-zA-Z][\w-]*)\1\s*:\s*((?:(?!\n[ \t]*['"]?[\w-]+['"]?[ \t]*:(?!:))(?:[^;{},()[\]$]|\$(?!\{)|\$\{[^{}]*\}|\((?:[^()]|\([^()]*\))*\)|\[[^[\]]*\]))+)/dg;
const VAR_USE = /var\(\s*(--[\w-]+)/g;
const INLINE_STYLE = /style=\{\{|style\s*=\s*["'][^"']*:/g;
// Tailwind com valor arbitrario: `p-[13px]`, `md:rounded-[6px]`, `text-[13px]`, `bg-[rgb(0,0,0)]`.
const TW_UNIT = /(?<![\w-])-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|text|rounded(?:-(?:[trbl]|tl|tr|br|bl|s|e|ss|se|ee|es))?)-\[(-?\d*\.?\d+)(px|rem|em)\]/g;
const TW_COLOR_FN = /(?<![\w-])(?:bg|text|border|fill|stroke|ring|outline|shadow|from|via|to|divide|decoration|accent|caret)-\[(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
// Strings que nao carregam design: caminho, URL, id, atributo de acessibilidade, import/require.
const NON_VISUAL_STRING_PREFIX = /(?:\b(?:href|src|id|htmlFor|role|action|from|import)\s*=?\s*|\brequire\s*\(\s*|\burl\s*\(\s*|\b(?:data|aria)-[\w-]+\s*=\s*)\{?\s*$/;

// Atributo JSX/SVG: `fill="red"`, `padding="12px"`, `gap={dense ? '8px' : '16px'}` (uma chave aninhada).
const ATTR = /(?<![\w.$-])([a-zA-Z][\w-]*)\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|(["'])((?:(?!\3)[^\n])*)\3)/g;
// Constante do arquivo com literal visual: `const P = 12;`, `let g = '16px'`, `const C: string = '#fff'`.
const CONST_LITERAL = /(?<![\w$.])(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(-?\d*\.?\d+(?:px|rem|em)?|(['"`])([^'"`\n$]*)\4)\s*(?=[;,)\n]|$)/gm;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const QUERY_RANGE = /@(?:media|container|supports)\b[^{;]*|\b(?:matchMedia|useMediaQuery)\s*\(\s*(['"`])[^'"`]*\1/g;

const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * Mascara comentarios e strings nao visuais com espacos, preservando o
 * comprimento e as quebras de linha (os numeros de linha continuam validos).
 * Strings com `'`/`"` terminam na quebra de linha (apostrofos em texto JSX);
 * template strings atravessam linhas e so mascaram `/* *\/` dentro delas.
 */
export function maskSource(source) {
  const out = source.split("");
  const size = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < size; k += 1) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  // `fill="url(#grad)"`: o `#grad` e referencia, nao cor.
  const blankUrls = (from, to) => {
    for (const match of source.slice(from, to).matchAll(/url\(\s*(?![\s'"])([^)]*)\)/gi)) {
      blank(from + match.index + match[0].indexOf("(") + 1, from + match.index + match[0].length - 1);
    }
  };
  const nonVisual = (at) => NON_VISUAL_STRING_PREFIX.test(source.slice(Math.max(0, at - 40), at));
  let i = 0;
  while (i < size) {
    const char = source[i];
    const next = source[i + 1];
    if (char === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      const end = close < 0 ? size : close + 2;
      blank(i, end);
      i = end;
    } else if (char === "/" && next === "/" && source[i - 1] !== ":") {
      const newline = source.indexOf("\n", i);
      const end = newline < 0 ? size : newline;
      blank(i, end);
      i = end;
    } else if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < size && source[j] !== char && source[j] !== "\n") j += source[j] === "\\" ? 2 : 1;
      if (nonVisual(i)) blank(i + 1, Math.min(j, size));
      else blankUrls(i + 1, Math.min(j, size));
      i = j + 1;
    } else if (char === "`") {
      let j = i + 1;
      while (j < size && source[j] !== "`") {
        if (source[j] === "\\") j += 2;
        else if (source[j] === "/" && source[j + 1] === "*") {
          const close = source.indexOf("*/", j + 2);
          const end = close < 0 ? size : close + 2;
          blank(j, end);
          j = end;
        } else j += 1;
      }
      if (nonVisual(i)) blank(i + 1, Math.min(j, size));
      else blankUrls(i + 1, Math.min(j, size));
      i = j + 1;
    } else if ((char === "u" || char === "U") && /^url\(\s*[^\s'")]/i.test(source.slice(i, i + 12)) && !/[\w-]/.test(source[i - 1] ?? "")) {
      // url(http://x/#abc) sem aspas
      const close = source.indexOf(")", i);
      const end = close < 0 ? size : close;
      blank(i + 4, end);
      i = end + 1;
    } else i += 1;
  }
  return out.join("");
}

function lineTable(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k += 1) if (text[k] === "\n") starts.push(k + 1);
  return starts;
}

function lineAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

/** Intervalos `style={{ ... }}` (chaves balanceadas) para nao reportar o mesmo literal duas vezes. */
function inlineStyleRanges(text) {
  const ranges = [];
  for (const match of text.matchAll(/style=\{\{/g)) {
    let depth = 0;
    let end = text.length;
    for (let k = match.index + 6; k < text.length; k += 1) {
      if (text[k] === "{") depth += 1;
      else if (text[k] === "}") {
        depth -= 1;
        if (depth === 0) { end = k; break; }
      }
    }
    ranges.push([match.index, end]);
  }
  return ranges;
}

const inside = (ranges, offset) => ranges.some(([from, to]) => offset >= from && offset <= to);
const isAmount = (text) => /^-?\d*\.?\d+$/.test(text);
const strip = (text) => text.replace(/^['"`]|['"`]$/g, "");

/** Literal numerico > 1 ao lado de um operador aritmetico (`base * 2`, `8 * 2`, `x + 4`). */
function expressionLiteral(expression) {
  const cleaned = expression.replace(/var\([^)]*\)/g, " ").replace(/(['"`])(?:\\.|(?!\1).)*\1/g, " ");
  for (const match of cleaned.matchAll(/(?:[*/+]\s*|\s-\s)(\d*\.?\d+)(?![\w.])|(?<![\w.$-])(\d*\.?\d+)\s*(?:[*/+]|\s-\s)/g)) {
    const amount = Number.parseFloat(match[1] ?? match[2]);
    if (amount > 1) return String(amount);
  }
  return null;
}

function makeSizeAllowed(list) {
  const entries = (list ?? []).map((entry) => (entry instanceof RegExp ? entry : String(entry).trim().toLowerCase())).filter(Boolean);
  return (property, literal) => entries.some((entry) => (entry instanceof RegExp
    ? entry.test(`${property}:${literal}`)
    : entry === property || entry === `${property}:${literal}` || entry === `*:${literal}`));
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Termos de um valor: elementos de array, ramos de ternario ou o proprio valor. */
function splitTerms(value) {
  const inner = value.trim();
  if (inner.startsWith("[") && inner.endsWith("]")) return inner.slice(1, -1).split(",").map((item) => item.trim());
  if (inner.includes("?") && inner.includes(":")) return inner.split(/[?:]/).slice(1).map((item) => item.trim());
  return [inner];
}

/** Constantes literais do arquivo, sem redeclaracao nem reatribuicao (escopo do arquivo inteiro, sem sombreamento). */
function collectConstants(text, starts) {
  const declared = new Map();
  for (const match of text.matchAll(/(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    declared.set(match[1], (declared.get(match[1]) ?? 0) + 1);
  }
  const constants = new Map();
  for (const match of text.matchAll(CONST_LITERAL)) {
    const [, keyword, name, literal, quote, inner] = match;
    if (declared.get(name) !== 1) continue;
    if (keyword !== "const") {
      const id = escapeRegExp(name);
      const assigned = new RegExp(`(?<![\\w$.])${id}\\s*(?:\\*\\*|<<|>>>?|&&|\\|\\||\\?\\?|[-+*/%&|^])?=(?![=>])|(?:\\+\\+|--)${id}(?![\\w$])|(?<![\\w$.])${id}(?:\\+\\+|--)`, "g");
      if ([...text.matchAll(assigned)].length > 1) continue;
    }
    const body = quote ? inner.trim() : literal;
    let entry = null;
    if (!quote && /^-?\d*\.?\d+$/.test(body)) entry = { kind: "number", amount: Number.parseFloat(body) };
    else if (/^-?\d*\.?\d+(?:px|rem|em)$/.test(body)) {
      const unit = body.match(/(px|rem|em)$/)[1];
      entry = { kind: "length", amount: Number.parseFloat(body), unit };
    } else if (quote) {
      const named = body.split(/[\s,/()]+/).filter(Boolean).some((word) => NAMED_COLORS.has(word.toLowerCase()));
      if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(body) || FUNCTIONAL_COLOR.test(body) || named) entry = { kind: "color" };
    }
    if (entry) constants.set(name, { ...entry, name, raw: literal, line: lineAt(starts, match.index) });
  }
  return constants;
}

/**
 * Lint de uma fonte de front-end. `allowTokenDefinitions` libera `--x: #hex`
 * e `key: valor,` de objeto JS (definicao de token) em arquivos que declaram tokens.
 * `allowSize` libera excecoes estruturais de largura/altura/fonte em px:
 * `"width"`, `"width:24px"`, `"*:24px"` ou uma RegExp testada contra `propriedade:valor`.
 */
export function lintDesignSource(content, { defined, file = null, allowTokenDefinitions = false, allowSize = [] } = {}) {
  const known = defined instanceof Set ? defined : new Set(defined ?? []);
  const original = content.split(/\r?\n/);
  const text = maskSource(content);
  const starts = lineTable(text);
  const found = [];
  const push = (category, offset, rule, extra = {}) => {
    const line = lineAt(starts, offset);
    found.push({ line, category, offset, violation: { rule, file, line, snippet: (original[line - 1] ?? "").trim(), ...extra } });
  };

  const seen = new Set();
  const pushOnce = (category, offset, rule, extra = {}) => {
    const key = `${lineAt(starts, offset)}|${rule}|${extra.property ?? ""}|${extra.value ?? ""}|${extra.via ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    push(category, offset, rule, extra);
  };
  const sizeAllowed = makeSizeAllowed(allowSize);
  const constants = collectConstants(text, starts);
  const queryRanges = [...text.matchAll(QUERY_RANGE)].map((match) => [match.index, match.index + match[0].length]);

  const checkSizePx = (property, valueNoVars, offset) => {
    if (inside(queryRanges, offset)) return;
    for (const match of valueNoVars.matchAll(LENGTH)) {
      if (match[2] !== "px" || Math.abs(Number.parseFloat(match[1])) <= 1) continue;
      const literal = `${match[1]}px`;
      if (!sizeAllowed(property, literal)) pushOnce(1, offset, "hardcoded-px", { property, value: literal });
    }
  };
  const colorLiteral = (valueNoVars) => {
    const bare = valueNoVars.replace(/url\([^)]*\)/gi, " ").replace(/['"`]/g, " ");
    return FUNCTIONAL_COLOR.test(bare) || bare.split(/[\s,/()]+/).filter(Boolean).some((word) => NAMED_COLORS.has(word.toLowerCase()));
  };
  const checkConstants = (property, value, offset, { jsx = false, insideStyle = false } = {}) => {
    const spacing = SPACE_RADIUS_PROPERTY.test(property);
    const size = SIZE_PROPERTY.test(property);
    const color = COLOR_PROPERTY.test(property);
    const bare = BARE_NUMBER_PROPERTY.test(property) || BARE_SIZE_PROPERTY.test(property);
    if (!spacing && !size && !color) return;
    for (const term of splitTerms(value)) {
      const constant = IDENT.test(term) ? constants.get(term) : null;
      if (!constant) continue;
      const via = { via: "const", origin: { name: constant.name, line: constant.line, value: constant.raw } };
      if (constant.kind === "number") {
        if (bare && !jsx && !insideStyle && Math.abs(constant.amount) > 1) pushOnce(1, offset, "hardcoded-number", { property, value: String(constant.amount), ...via });
      } else if (constant.kind === "length") {
        const literal = `${constant.amount}${constant.unit}`;
        if (spacing && (constant.unit === "px" ? Math.abs(constant.amount) > 1 : constant.amount !== 0)) pushOnce(1, offset, "hardcoded-px", { property, value: literal, ...via });
        else if (size && constant.unit === "px" && Math.abs(constant.amount) > 1 && !inside(queryRanges, offset) && !sizeAllowed(property, literal)) {
          pushOnce(1, offset, "hardcoded-px", { property, value: literal, ...via });
        }
      } else if (constant.kind === "color" && color) pushOnce(1, offset, "hardcoded-color", { property, value: term, ...via });
    }
  };

  const styleRanges = inlineStyleRanges(text);
  const exempt = [];
  const declarations = [];
  for (const match of text.matchAll(DECLARATION)) {
    const [valueFrom, valueTo] = match.indices[3];
    const raw = match[3];
    const value = raw.trim();
    const start = valueFrom + (raw.length - raw.trimStart().length);
    const end = start + value.length;
    const terminator = text[valueTo] ?? "";
    const between = text.slice(end, valueTo);
    const jsStyle = terminator !== ";" && (terminator === "," || /\n/.test(between) || valueTo >= text.length);
    const property = match[2];
    const isDefinition = allowTokenDefinitions && (property.startsWith("--") || jsStyle);
    if (isDefinition) exempt.push([start, end]);
    declarations.push({ property: kebab(property), value, start, end, isDefinition });
  }

  // 0. hex literal (fora de definicoes de token liberadas)
  for (const match of text.matchAll(HEX)) {
    if (!inside(exempt, match.index)) push(0, match.index, "hardcoded-hex", { value: match[0] });
  }

  // 1. declaracoes CSS / propriedades de objeto JS
  for (const { property, value, start, isDefinition } of declarations) {
    if (isDefinition) continue;
    const spacing = SPACE_RADIUS_PROPERTY.test(property);
    const bare = BARE_NUMBER_PROPERTY.test(property) || BARE_SIZE_PROPERTY.test(property);
    const insideStyle = inside(styleRanges, start);
    const withoutVars = value.replace(/var\([^)]*\)/g, " ");
    if (spacing) {
      for (const match of withoutVars.matchAll(LENGTH)) {
        const amount = Number.parseFloat(match[1]);
        const literal = match[2] === "px" ? Math.abs(amount) > 1 : amount !== 0;
        if (literal) push(1, start, "hardcoded-px", { property, value: `${match[1]}${match[2]}` });
      }
      for (const match of value.matchAll(INTERPOLATED_LENGTH)) {
        const amount = Number.parseFloat(match[1]);
        if (match[2] === "px" ? Math.abs(amount) > 1 : amount !== 0) push(1, start, "hardcoded-px", { property, value: `${match[1]}${match[2]}` });
      }
      for (const interpolation of value.matchAll(/\$\{([^{}]*)\}\s*(?:px|rem|em)?/g)) {
        const literal = expressionLiteral(interpolation[1]);
        if (literal && !/^\s*-?\d*\.?\d+\s*$/.test(interpolation[1])) {
          push(1, start, "hardcoded-expression", { property, value: interpolation[0].trim() });
          break;
        }
      }
    }
    if (SIZE_PROPERTY.test(property)) checkSizePx(property, withoutVars, start);
    checkConstants(property, value, start, { insideStyle });
    if (bare && !insideStyle) {
      const unquoted = strip(value);
      if (isAmount(unquoted)) {
        const amount = Number.parseFloat(unquoted);
        if (amount > 1 || amount < -1) push(1, start, "hardcoded-number", { property, value: String(amount) });
      } else if (value.startsWith("[")) {
        for (const element of value.slice(1, -1).split(",")) {
          const item = strip(element.trim());
          if (isAmount(item) && Math.abs(Number.parseFloat(item)) > 1) push(1, start, "hardcoded-number", { property, value: item });
        }
      } else if (value.includes("?") && value.includes(":")) {
        // ternario com literal numerico: `dense ? 8 : 16`
        for (const branch of splitTerms(value)) {
          const literal = strip(branch);
          if (isAmount(literal) && Math.abs(Number.parseFloat(literal)) > 1) push(1, start, "hardcoded-number", { property, value: literal });
        }
      } else if (!/^['"`]/.test(value) && !/calc\(/.test(value) && !value.includes("${")) {
        const literal = expressionLiteral(withoutVars);
        if (literal) push(1, start, "hardcoded-expression", { property, value });
      }
    }
    if (COLOR_PROPERTY.test(property) && !/^var\(/.test(value)) {
      const words = withoutVars.replace(/['"`]/g, " ").split(/[\s,/()]+/).filter(Boolean);
      if (FUNCTIONAL_COLOR.test(withoutVars) || words.some((word) => NAMED_COLORS.has(word.toLowerCase()))) {
        push(1, start, "hardcoded-color", { property, value });
      }
    }
  }

  // 1b. atributos JSX/SVG (`fill="red"`, `padding="12px"`); numero cru nao: `gap={4}` costuma ser indice de escala do tema
  for (const match of text.matchAll(ATTR)) {
    const property = kebab(match[1]);
    const spacing = SPACE_RADIUS_PROPERTY.test(property);
    const size = SIZE_PROPERTY.test(property);
    const color = COLOR_PROPERTY.test(property) || property === "color";
    if (!spacing && !size && !color) continue;
    const raw = match[2] ?? match[4];
    if (!raw || !raw.trim()) continue;
    const eq = match[0].indexOf("=");
    const offset = match.index + match[0].indexOf(raw, eq);
    const value = raw.trim();
    const withoutVars = value.replace(/var\([^)]*\)/g, " ");
    if (spacing) {
      for (const length of withoutVars.matchAll(LENGTH)) {
        const amount = Number.parseFloat(length[1]);
        if (length[2] === "px" ? Math.abs(amount) > 1 : amount !== 0) pushOnce(1, offset, "hardcoded-px", { property, value: `${length[1]}${length[2]}` });
      }
    }
    if (size) checkSizePx(property, withoutVars, offset);
    if (color && !/^var\(/.test(value) && colorLiteral(withoutVars)) pushOnce(1, offset, "hardcoded-color", { property, value });
    checkConstants(property, value, offset, { jsx: true });
  }

  // 2. JSX: style={{ padding: 12, borderRadius: '8px' }} (uma vez por linha)
  const inlineLines = new Set();
  for (const match of text.matchAll(INLINE_STYLE)) {
    const line = lineAt(starts, match.index);
    if (inlineLines.has(line)) continue;
    inlineLines.add(line);
    push(2, match.index, "inline-style");
  }

  // 3. Tailwind arbitrary values
  const colorLines = new Set();
  for (const match of text.matchAll(TW_UNIT)) {
    const amount = Number.parseFloat(match[1]);
    if (match[2] === "px" ? Math.abs(amount) > 1 : amount !== 0) push(3, match.index, "tailwind-arbitrary", { value: match[0].trim() });
  }
  for (const match of text.matchAll(TW_COLOR_FN)) {
    const line = lineAt(starts, match.index);
    if (colorLines.has(line)) continue;
    colorLines.add(line);
    push(3, match.index, "tailwind-arbitrary");
  }

  // 4. var(--x) inexistente
  for (const match of text.matchAll(VAR_USE)) {
    if (!known.has(match[1])) push(4, match.index, "undefined-token", { token: match[1] });
  }

  return found
    .sort((a, b) => a.line - b.line || a.category - b.category || a.offset - b.offset)
    .map((entry) => entry.violation);
}

/** Cada token inventado vira um pedido de mudanca; nao se cria o token localmente. */
export function buildDesignChangeRequests(violations) {
  const byToken = new Map();
  for (const violation of violations) {
    if (violation.rule !== "undefined-token") continue;
    const entry = byToken.get(violation.token) ?? { type: "DESIGN_CHANGE_REQUEST", token: violation.token, usages: [] };
    entry.usages.push({ file: violation.file, line: violation.line });
    byToken.set(violation.token, entry);
  }
  return [...byToken.values()].map((request) => ({
    ...request,
    resolution: "Token novo so entra por uma nova versao do Pensador; ate la, use um token existente do design-contract.json.",
  }));
}

/**
 * Gate completo: hash do contrato + lint de todas as fontes.
 * `status`: PASS | FAIL. Qualquer violacao ou divergencia de hash reprova.
 */
export function runDesignGate({ contract, expectedSha = null, sources = [], allowTokenDefinitions = false, allowSize = [] }) {
  const hash = verifyContractHash(contract, expectedSha);
  const defined = definedTokens(contract);
  const violations = sources.flatMap(({ file, content }) =>
    lintDesignSource(content, { defined, file, allowTokenDefinitions, allowSize }));
  const changeRequests = buildDesignChangeRequests(violations);
  return {
    status: hash.ok && violations.length === 0 ? "PASS" : "FAIL",
    hash,
    tokenCount: defined.size,
    violations,
    changeRequests,
  };
}
