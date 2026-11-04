import type {
  TopologyProfile,
  TopologyProfileInput,
  TopologyViewerOptions,
} from "../../types/index";
import neutral from "../contract/profile/neutral.json" with { type: "json" };

// `defineProfile`: a vocabulary and icons from a short description. It fills the fields that the
// strict schema of the core asks for, and it parses an icon with an allow-list and no DOM, so it also
// runs on a server. An icon goes into the page as elements from data, never as markup.

type SvgNode = [string, Record<string, string>, SvgNode[]];

const TAGS = new Set(["g", "path", "circle", "rect", "ellipse", "line", "polyline", "polygon"]);
const IGNORED_TAGS = new Set(["title", "desc", "metadata"]);
const NUMBER = String.raw`-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?`;
const ONE = new RegExp(`^${NUMBER}$`);
const POINTS = new RegExp(String.raw`^\s*${NUMBER}(?:[\s,]+${NUMBER})*\s*$`);
const VIEW_BOX = new RegExp(`^0[ ,]+0[ ,]+(${NUMBER})[ ,]+(${NUMBER})$`);
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE\n\t]+$/;
const TRANSFORM = new RegExp(
  String.raw`^\s*(?:(?:rotate|translate|scale|matrix)\(\s*${NUMBER}(?:[\s,]+${NUMBER})*\s*\)\s*)+$`,
);
const COLOUR = /^(?:#[0-9a-fA-F]{3,8}|none|currentColor|[a-zA-Z]+)$/;
const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  "stroke-linecap": ["butt", "round", "square"],
  "stroke-linejoin": ["miter", "round", "bevel"],
  "fill-rule": ["nonzero", "evenodd"],
  "clip-rule": ["nonzero", "evenodd"],
};
const NUMERIC = new Set([
  "fill-opacity", "stroke-width", "stroke-opacity", "opacity", "cx", "cy", "r", "rx", "ry",
  "x", "y", "x1", "y1", "x2", "y2", "width", "height",
]);
// These say nothing about the drawing, so an export from a design tool can keep them.
const IGNORED_ATTRIBUTES = /^(?:xmlns(?::.*)?|class|id|style|version|data-.*|aria-.*|role|focusable)$/;

function fail(what: string): never {
  throw new Error(`topology-viewer: icon: ${what}`);
}

function allowed(name: string, value: string): boolean {
  if (/url\(/i.test(value)) return false;
  if (name === "fill" || name === "stroke") return COLOUR.test(value);
  if (name === "d") return PATH_DATA.test(value);
  if (name === "points") return POINTS.test(value);
  if (name === "transform") return TRANSFORM.test(value);
  if (Object.hasOwn(KEYWORDS, name)) return (KEYWORDS[name] as readonly string[]).includes(value);
  return NUMERIC.has(name) && ONE.test(value);
}

const TAG = /<\s*(\/?)\s*([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g;

function attributesOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, double, single] of text.matchAll(ATTRIBUTE))
    out[name as string] = (double ?? single) as string;
  return out;
}

function safeAttributes(tag: string, all: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(all)) {
    if (IGNORED_ATTRIBUTES.test(name)) continue;
    if (!allowed(name, value)) fail(`<${tag}> ${name}="${value}" is not allowed`);
    out[name] = value;
  }
  return out;
}

type ParsedIcon = { w: number; h: number; fill: string; body: SvgNode[] };

/** Reads the safe subset of SVG. Anything else, such as a script or an event attribute, is an error. */
export function parseSvg(text: string): ParsedIcon {
  const stack: { tag: string; children: SvgNode[]; skip: boolean }[] = [];
  let root: { attrs: Record<string, string>; children: SvgNode[] } | null = null;
  let at = 0;
  const source = text.replace(/<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  while (at < source.length) {
    const next = source.indexOf("<", at);
    if (next === -1) {
      if (source.slice(at).trim() !== "") fail("text outside of a tag");
      break;
    }
    if (source.slice(at, next).trim() !== "" && stack.at(-1)?.skip !== true)
      fail("text inside the drawing");
    TAG.lastIndex = next;
    const found = TAG.exec(source);
    if (found === null) fail(`malformed markup at ${source.slice(next, next + 20)}`);
    const [whole, closing, tag, rawAttrs, selfClosing] = found as RegExpExecArray;
    at = next + whole.length;
    if (closing === "/") {
      stack.pop();
      continue;
    }
    const name = tag as string;
    const parent = stack.at(-1);
    if (name === "svg" && root === null) {
      root = { attrs: attributesOf(rawAttrs as string), children: [] };
      if (selfClosing !== "/") stack.push({ tag: name, children: root.children, skip: false });
      continue;
    }
    if (parent === undefined) fail("the icon must have one <svg> root");
    if (parent.skip || IGNORED_TAGS.has(name)) {
      if (selfClosing !== "/") stack.push({ tag: name, children: [], skip: true });
      continue;
    }
    if (!TAGS.has(name)) fail(`<${name}> is not allowed`);
    const children: SvgNode[] = [];
    parent.children.push([name, safeAttributes(name, attributesOf(rawAttrs as string)), children]);
    if (selfClosing !== "/") stack.push({ tag: name, children, skip: false });
  }
  if (root === null) fail("the icon must have one <svg> root");
  const viewBox = root.attrs.viewBox;
  const box = viewBox === undefined ? null : VIEW_BOX.exec(viewBox.trim());
  const w = Number(box?.[1] ?? root.attrs.width);
  const h = Number(box?.[2] ?? root.attrs.height);
  if (!(w > 0) || !(h > 0)) fail('the root needs viewBox="0 0 w h", or a width and a height');
  const fill = root.attrs.fill ?? "none";
  if (!COLOUR.test(fill)) fail(`the root fill "${fill}" is not allowed`);
  return { w, h, fill, body: root.children };
}

const SOURCE = { doc: "PRD", section: "defineProfile" };

const abbreviation = (label: string) => {
  const letters = label.toUpperCase().replace(/[^A-Z]/g, "");
  return `${letters}XX`.slice(0, 2);
};

type Vocabulary = {
  categoryOrder: string[];
  typeMenuCategories: { order: string[]; source: unknown };
  nodeTypes: Record<string, unknown>;
  predicates: Record<string, unknown>;
  inverses: Record<string, unknown>;
  [key: string]: unknown;
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Builds a profile from a short description, over a base profile. */
export function defineProfile(input: TopologyProfileInput): TopologyProfile {
  const base = input.extends;
  const vocabulary = structuredClone(
    (base?.vocabulary ?? neutral) as unknown as Vocabulary,
  );
  const sprite: Record<string, unknown> = { ...base?.sprite };
  const other = vocabulary.categoryOrder.indexOf("Other");
  for (const family of input.families ?? [])
    if (!vocabulary.categoryOrder.includes(family))
      vocabulary.categoryOrder.splice(
        other === -1 ? vocabulary.categoryOrder.length : vocabulary.categoryOrder.indexOf("Other"),
        0,
        family,
      );
  for (const [name, type] of Object.entries(input.nodeTypes ?? {})) {
    const category = type.category ?? "Custom";
    if (!vocabulary.typeMenuCategories.order.includes(category))
      vocabulary.typeMenuCategories.order.push(category);
    const shared = {
      category,
      label: type.label ?? name,
      isSystem: false,
      treeRole: type.level === undefined ? "attribute" : "structure",
      ...(type.level === undefined ? {} : { level: type.level }),
      attributeSet: null,
      attributes: [],
      source: SOURCE,
    };
    if (type.icon !== undefined) {
      const parsed = parseSvg(type.icon);
      const color = type.color ?? "#475569";
      if (!HEX.test(color)) fail(`the colour of "${name}" must be #rrggbb`);
      sprite[name] = { ...parsed, tier: type.tier ?? "asset", color };
      vocabulary.nodeTypes[name] = { ...shared, icon: name };
    } else {
      vocabulary.nodeTypes[name] = {
        ...shared,
        rank: type.rank ?? 3,
        color: type.color ?? "#475569",
        abbr: type.abbr ?? abbreviation(type.label ?? name),
        design: "pending-ddr",
      };
    }
  }
  for (const [name, predicate] of Object.entries(input.predicates ?? {})) {
    const family = predicate.family ?? "Other";
    if (!vocabulary.categoryOrder.includes(family))
      fail(`predicate "${name}": unknown family "${family}"`);
    vocabulary.predicates[name] = {
      category: family,
      inverse: predicate.inverse ?? null,
      direction: predicate.direction ?? "out",
      isSystem: false,
      ...(predicate.layoutRole === undefined ? {} : { layoutRole: predicate.layoutRole }),
      source: SOURCE,
    };
    if (predicate.inverse !== undefined)
      vocabulary.inverses[predicate.inverse] = { predicate: name, source: SOURCE };
  }
  return { vocabulary, sprite };
}

/** A profile as the core takes it. */
export function resolveProfile(
  profile: TopologyViewerOptions["profile"],
): TopologyProfile | undefined {
  return profile;
}

export const neutralProfile: TopologyProfile = {
  vocabulary: neutral as unknown as Record<string, unknown>,
};
