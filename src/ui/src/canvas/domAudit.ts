// why: TL-8 — the one DOM allow-list of EPIC-003 (rules DA-1 to DA-5, SA §10 guardrail 8, SA §11
// harm criterion 2). A later story adds only its own element, attribute and class names

import type { Graph, Vocab } from "@qdic-topology/engine";
import type { Scene, SceneNode } from "@qdic-topology/renderer";

const SVG_NS = "http://www.w3.org/2000/svg";
const HTML_NS = "http://www.w3.org/1999/xhtml";

export const CLASS_NAMES: readonly string[] = [
  "qt-root",
  "qt-svg",
  "qt-viewport",
  "qt-node",
  "qt-grouped",
  "qt-leaf",
  "qt-name",
  "qt-sub",
  "qt-a11y",
  "qt-badge",
  "qt-more",
  "qt-open",
  "qt-mark",
  "qt-nomark",
  "qt-lod-mid",
  "qt-lod-low",
  "qt-big",
  "qt-culled",
  "qt-hl",
];

// why: the attributes of the sprite allow-list of `scripts/build-icons.mjs`
const SPRITE = [
  "fill",
  "stroke",
  "d",
  "transform",
  "points",
  "stroke-linecap",
  "stroke-linejoin",
  "fill-rule",
  "clip-rule",
  "fill-opacity",
  "stroke-width",
  "stroke-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
];
const SHAPE = ["class", ...SPRITE];

const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  div: ["class"],
  svg: ["class", "role", "aria-label"],
  defs: [],
  symbol: ["id", "viewBox", "fill"],
  g: ["class", "tabindex", "aria-labelledby", ...SPRITE],
  use: ["href", "x", "y", "width", "height"],
  path: SHAPE,
  rect: SHAPE,
  circle: SHAPE,
  ellipse: SHAPE,
  line: SHAPE,
  polyline: SHAPE,
  polygon: SHAPE,
  text: ["class", "id", "x", "y", "dy", "fill", "font-size"],
  tspan: ["class"],
  marker: [],
};

const NUMERIC = new Set([
  "fill-opacity",
  "stroke-width",
  "stroke-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "font-size",
  "tabindex",
]);

const NUMBER = String.raw`-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?`;
const NUMBERS = String.raw`${NUMBER}(?:[\s,]+${NUMBER})*`;
// why: SA §4.1 — the path-data pattern and the glyph cap
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/;
const GLYPH_CAP = 512;
const FORMS: Readonly<Record<string, RegExp>> = {
  d: PATH_DATA,
  dy: /^\d+(\.\d+)?em$/,
  points: new RegExp(String.raw`^${NUMBERS}$`),
  role: /^group$/,
  transform: new RegExp(
    String.raw`^(?:\s*(?:translate|scale|rotate|matrix)\(${NUMBERS}\)\s*)+$`,
  ),
  viewBox: new RegExp(String.raw`^${NUMBER} ${NUMBER} ${NUMBER} ${NUMBER}$`),
  "stroke-linecap": /^(butt|round|square)$/,
  "stroke-linejoin": /^(miter|round|bevel)$/,
  "fill-rule": /^(nonzero|evenodd)$/,
  "clip-rule": /^(nonzero|evenodd)$/,
};
const ONE_NUMBER = new RegExp(`^${NUMBER}$`);
const COLOUR = /^#[0-9a-f]{6}$/;

type Audit = {
  root: Element;
  prefix: string | null;
  strings: readonly string[];
  canvasName: string;
  out: string[];
};

function prefixOf(elements: readonly Element[]): string | null {
  const first = elements.find((el) => el.hasAttribute("id"));
  const match = /^(qt[0-9]+)-/.exec(first?.getAttribute("id") ?? "");
  return match === null ? null : match[1];
}

function divAllowed(el: Element, root: Element): boolean {
  const parent = el.parentElement;
  const cls = el.getAttribute("class");
  if (el === root) return cls === "qt-root";
  if (cls === "qt-tip") return parent === root;
  return (
    (cls === "qt-tip-main" || cls === "qt-tip-sub") &&
    parent?.getAttribute("class") === "qt-tip" &&
    parent.parentElement === root
  );
}

function checkElement(el: Element, a: Audit): boolean {
  const name = el.localName;
  const ns = name === "div" ? HTML_NS : SVG_NS;
  if (!Object.hasOwn(ATTRIBUTES, name) || el.namespaceURI !== ns) {
    a.out.push(`DA-1 element <${name}> is not allowed`);
    return false;
  }
  if (name === "div" && !divAllowed(el, a.root))
    a.out.push("DA-1 a <div> is not div.qt-root, div.qt-tip or a tip line");
  return true;
}

function inRoot(el: Element, id: string, a: Audit): Element | null {
  const target = el.ownerDocument.getElementById(id);
  return target !== null && a.root.contains(target) ? target : null;
}

function symbolInDefs(el: Element, id: string, a: Audit): boolean {
  const target = inRoot(el, id, a);
  const defs = target?.parentElement;
  return (
    target?.localName === "symbol" &&
    defs?.localName === "defs" &&
    defs.parentElement === el.closest("svg")
  );
}

function a11yText(el: Element, id: string, a: Audit): boolean {
  const target = inRoot(el, id, a);
  return (
    target?.localName === "text" && target.getAttribute("class") === "qt-a11y"
  );
}

function checkReference(el: Element, name: string, value: string, a: Audit) {
  const p = a.prefix ?? "\u0000";
  if (name === "id" && !new RegExp(`^${p}-[a-z]-[0-9a-f]+$`).test(value))
    a.out.push(`DA-1 <${el.localName}> id does not match the id form`);
  if (name === "href") {
    const ok = new RegExp(`^#${p}-s-[0-9]+$`).test(value);
    if (!ok || !symbolInDefs(el, value.slice(1), a))
      a.out.push("DA-1 <use> href does not resolve to a symbol");
  }
  if (name === "aria-labelledby") {
    const ok = new RegExp(`^${p}-l-[0-9a-f]+$`).test(value);
    if (!ok || !a11yText(el, value, a))
      a.out.push("DA-1 aria-labelledby does not resolve to a text.qt-a11y");
  }
  if (name === "aria-label" && value !== a.canvasName)
    a.out.push("DA-1 aria-label is not the canvas name");
}

function checkForm(el: Element, name: string, value: string, a: Audit) {
  if (!ATTRIBUTES[el.localName].includes(name) || /^on/i.test(name)) {
    a.out.push(`DA-1 <${el.localName}> attribute ${name} is not allowed`);
    return;
  }
  if (
    NUMERIC.has(name) &&
    !(ONE_NUMBER.test(value) && Number.isFinite(Number(value)))
  )
    a.out.push(`DA-1 <${el.localName}> ${name} is not a finite number`);
  if (Object.hasOwn(FORMS, name) && !FORMS[name].test(value))
    a.out.push(`DA-1 <${el.localName}> ${name} is not in its form`);
  checkReference(el, name, value, a);
}

// why: the glyph of a designed symbol is the one attribute value from input (SA §4.1); it sits
// in `symbol > g > path` after the `qt-mark` shape
function isGlyph(el: Element, name: string, value: string): boolean {
  const g = el.parentElement;
  const symbol = g?.parentElement;
  return (
    name === "d" &&
    g?.localName === "g" &&
    symbol?.localName === "symbol" &&
    symbol.firstElementChild?.getAttribute("class") === "qt-mark" &&
    value.length <= GLYPH_CAP &&
    PATH_DATA.test(value)
  );
}

function checkModel(el: Element, name: string, value: string, a: Audit) {
  if (name === "class" || isGlyph(el, name, value)) return;
  if (
    COLOUR.test(value) ||
    (ONE_NUMBER.test(value) && Number.isFinite(Number(value)))
  )
    return;
  const hit = a.strings.some(
    (s) => s === value || (s.length >= 4 && value.includes(s)),
  );
  if (hit) a.out.push(`DA-4 <${el.localName}> ${name} holds a model string`);
}

function checkAttribute(el: Element, attr: Attr, a: Audit): void {
  const { name, value } = attr;
  if (name === "style") {
    checkModel(el, name, value, a);
    return;
  }
  checkForm(el, name, value, a);
  if (
    (name === "fill" || name === "stroke") &&
    value !== "none" &&
    !COLOUR.test(value)
  )
    a.out.push(`DA-2 <${el.localName}> ${name} is not #rrggbb or none`);
  if (name === "class")
    for (const token of value.split(/\s+/).filter(Boolean))
      if (!CLASS_NAMES.includes(token))
        a.out.push(
          `DA-3 <${el.localName}> class ${token} is not in CLASS_NAMES`,
        );
  checkModel(el, name, value, a);
}

const RGBA_ZERO = /^rgba\(0,0,0,0\)$/;
const K = /^[0-9]+(\.[0-9]+)?$/;
const PX = /^-?[0-9]+(\.[0-9]+)?(e[+-]?[0-9]+)?px$/;
const STYLES: Readonly<
  Record<string, Readonly<Record<string, (v: string) => boolean>>>
> = {
  "div.qt-root": {
    "--k": (v) => K.test(v) && Number(v) >= 0.05 && Number(v) <= 6,
  },
  "svg.qt-svg": { "-webkit-tap-highlight-color": (v) => RGBA_ZERO.test(v) },
  "g.qt-node": {
    "touch-action": (v) => v === "none",
    "-webkit-tap-highlight-color": (v) => RGBA_ZERO.test(v),
  },
  "div.qt-tip": { left: (v) => PX.test(v), top: (v) => PX.test(v) },
};

function styleKey(el: Element): string | null {
  for (const key of Object.keys(STYLES)) if (el.matches(key)) return key;
  return null;
}

// why: DA-5 reads the raw text, because jsdom drops a property it does not know from the CSSOM
function checkStyle(el: Element, a: Audit): void {
  const text = el.getAttribute("style");
  if (text === null) return;
  const key = styleKey(el);
  if (key === null) {
    a.out.push(`DA-5 <${el.localName}> may not have a style attribute`);
    return;
  }
  const parts = text.split(";");
  if (parts[parts.length - 1].trim() === "") parts.pop();
  const seen = new Set<string>();
  for (const part of parts) {
    const at = part.indexOf(":");
    const raw = at === -1 ? "" : part.slice(0, at).trim();
    const name = raw.startsWith("--") ? raw : raw.toLowerCase();
    const value = part.slice(at + 1).replace(/\s+/g, "");
    const check = Object.hasOwn(STYLES[key], name) ? STYLES[key][name] : null;
    if (
      at === -1 ||
      check === null ||
      seen.has(name) ||
      /!important/i.test(value) ||
      !check(value)
    )
      a.out.push(`DA-5 ${key} style part is not allowed`);
    seen.add(name);
  }
}

export function domAudit(
  root: Element,
  strings: readonly string[],
  canvasName: string,
): string[] {
  const elements = [root, ...root.querySelectorAll("*")];
  const a: Audit = {
    root,
    prefix: prefixOf(elements),
    strings: strings.filter((s) => s !== ""),
    canvasName,
    out: [],
  };
  for (const el of elements) {
    if (checkElement(el, a))
      for (const attr of el.attributes) checkAttribute(el, attr, a);
    checkStyle(el, a);
  }
  return a.out;
}

// why: scene fields with a fixed set of values, not model text
const NOT_TEXT: ReadonlySet<keyof SceneNode> = new Set([
  "kind",
  "tier",
  "colour",
]);

// why: build-time item B1 — the model strings of DA-4: the source strings of the graph, the type
// and predicate keys and labels, and every text field of the scene
export function auditStrings(
  graph: Graph,
  vocab: Vocab,
  scene: Scene,
): string[] {
  const out = new Set<string>();
  const add = (...values: (string | undefined)[]) => {
    for (const value of values) if (value !== undefined) out.add(value);
  };
  for (const r of graph.records) add(r.id, r.label, r.type);
  for (const e of graph.entities) add(e.id, e.label, e.type);
  for (const t of graph.triples) add(t.subject, t.predicate, t.object);
  for (const [key, type] of vocab.types) add(key, type.label);
  for (const [key, predicate] of vocab.predicates) add(key, predicate.label);
  for (const node of scene.nodes)
    for (const [key, value] of Object.entries(node))
      if (typeof value === "string" && !NOT_TEXT.has(key as keyof SceneNode))
        add(value);
  return [...out];
}
