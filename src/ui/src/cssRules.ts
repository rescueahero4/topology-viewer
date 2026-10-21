// why: STORY-004-09 T5, LEARNINGS 37, 55 — the CSS text tests (motionCss.test.ts,
// motionDom.test.tsx, shellCss.test.ts) read whole rules with the comments removed, and each
// rule keeps the at-rule (for example `@media (prefers-reduced-motion: reduce)`) that holds it
export type CssRule = {
  selectors: string[];
  at: string | null;
  decls: { property: string; value: string }[];
};

const squash = (text: string) => text.trim().replace(/\s+/g, " ");

function topLevel(text: string, by: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === by && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(squash).filter((part) => part !== "");
}

function declarations(body: string): CssRule["decls"] {
  return topLevel(body, ";").map((decl) => {
    const colon = decl.indexOf(":");
    return {
      property: decl.slice(0, colon).trim(),
      value: squash(decl.slice(colon + 1)),
    };
  });
}

export function cssRules(text: string): CssRule[] {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  const at: string[] = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "}") {
      at.pop();
      start = i + 1;
    }
    if (css[i] !== "{") continue;
    const prelude = squash(css.slice(start, i));
    if (prelude.startsWith("@")) {
      at.push(prelude);
      start = i + 1;
      continue;
    }
    const end = css.indexOf("}", i);
    rules.push({
      selectors: topLevel(prelude, ","),
      at: at.at(-1) ?? null,
      decls: declarations(css.slice(i + 1, end)),
    });
    i = end;
    start = end + 1;
  }
  return rules;
}

// why: STORY-004-09 rule 1 (SA §6 row 7) — the panels are the inspector card, the Hidden card, the
// search card and the Workbench; S1 and S12 read the same list
export const PANELS = [".inspector", ".hidden-panel", ".tools", ".workbench"];
export const REDUCED = "@media (prefers-reduced-motion: reduce)";

// why: the subject of a selector is its last compound, so `.canvas[data-hidden] .tools` is a rule
// of the search card and `.inspector .insp-head` is not a panel rule
const subject = (selector: string) => selector.split(/\s+|>|\+|~/).at(-1) ?? "";
const hasClass = (compound: string, name: string) =>
  compound.split(/(?=[.[:#])/).includes(name);
export const panelOf = (selector: string) =>
  PANELS.find((panel) => hasClass(subject(selector), panel));

const NAMED = (
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
  "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
  "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
  "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
  "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
  "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
  "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
  "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
  "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
  "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
  "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
  "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
  "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
  "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
  "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
  "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
  "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
).split(" ");

// why: STORY-004-02 rule 17, STORY-004-09 S14 (B3) — the colour literal forms; `var(--c)` and a
// `color-mix` of it are the one exception, and a length fallback in `var()` is not a colour
const COLOUR =
  /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|text-decoration(-color)?|caret-color|accent-color|column-rule)$/;

export function colourLiterals(
  value: string,
  property: string,
  tokens: ReadonlySet<string>,
): string[] {
  const found: string[] = [];
  if (/#[0-9a-f]{3,8}\b/i.test(value)) found.push("hex");
  if (/%23[0-9a-f]{3,8}/i.test(value)) found.push("%23 hex");
  if (/\b(rgba?|hsla?|color)\(/i.test(value)) found.push("colour function");
  const words =
    value
      .replace(/var\([^)]*\)/g, " ")
      .toLowerCase()
      .match(/[a-z-]+/g) ?? [];
  for (const word of words)
    if (NAMED.includes(word)) found.push(`named ${word}`);
  for (const m of value.matchAll(/var\((--[\w-]+)\s*(?:,\s*([^)]*))?\)/g)) {
    const [, name, fallback] = m;
    if (
      fallback !== undefined &&
      !/^-?[\d.]+(px|%|em|rem|ms|s)?$/.test(fallback.trim())
    )
      found.push(`fallback ${fallback}`);
    if (COLOUR.test(property) && name !== "--c" && !tokens.has(name))
      found.push(`not a token ${name}`);
  }
  return found;
}
