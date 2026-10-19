// why: TL-8 — the checks of the one DOM allow-list of EPIC-003 (rules DA-1 to DA-5, SA §10
// guardrail 8, SA §11 harm criterion 2); the lists are in `domAllowList.ts`

import type { Graph, Vocab } from "@qdic-topology/engine";
import type { Scene, SceneEdge, SceneNode } from "@qdic-topology/renderer";
import {
  ATTRIBUTES,
  CLASS_NAMES,
  COLOUR,
  FORMS,
  GLYPH_CAP,
  HTML_NS,
  KEYWORD_FORMS,
  NUMERIC,
  ONE_NUMBER,
  PATH_DATA,
  STYLES,
  SVG_NS,
} from "./domAllowList";

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

const hasClass = (el: Element | null, name: string) =>
  el?.classList.contains(name) === true;

// why: STORY-003-03 — the root and the tooltip also carry state classes (`qt-dim`, `qt-paused`,
// `qt-on`), so DA-1 reads the class tokens; DA-3 checks each token against the list
function divAllowed(el: Element, root: Element): boolean {
  const parent = el.parentElement;
  if (el === root) return hasClass(el, "qt-root");
  if (hasClass(el, "qt-tip")) return parent === root;
  return (
    (hasClass(el, "qt-tip-main") || hasClass(el, "qt-tip-sub")) &&
    hasClass(parent, "qt-tip") &&
    parent?.parentElement === root
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

function inDefs(el: Element, id: string, tag: string, a: Audit): boolean {
  const target = inRoot(el, id, a);
  const defs = target?.parentElement;
  return (
    target?.localName === tag &&
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
    if (!ok || !inDefs(el, value.slice(1), "symbol", a))
      a.out.push("DA-1 <use> href does not resolve to a symbol");
  }
  if (name === "aria-labelledby") {
    const ok = new RegExp(`^${p}-l-[0-9a-f]+$`).test(value);
    if (!ok || !a11yText(el, value, a))
      a.out.push("DA-1 aria-labelledby does not resolve to a text.qt-a11y");
  }
  if (name === "marker-end") {
    const ok = new RegExp(String.raw`^url\(#${p}-a-[0-9a-f]{6}\)$`).test(value);
    if (!ok || !inDefs(el, value.slice(5, -1), "marker", a))
      a.out.push("DA-1 marker-end does not resolve to a marker");
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
  // why: a value of a closed keyword form (for example `markerUnits="userSpaceOnUse"`, which
  // holds the type key "user") is a constant of the renderer and carries no model data
  if (KEYWORD_FORMS.has(name) && FORMS[name].test(value)) return;
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
const NOT_TEXT: ReadonlySet<keyof SceneNode | keyof SceneEdge> = new Set([
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
  for (const item of [...scene.nodes, ...scene.edges])
    for (const [key, value] of Object.entries(item))
      if (typeof value === "string" && !NOT_TEXT.has(key as keyof SceneNode))
        add(value);
  return [...out];
}
