import type { Designed, Hex, IconMetrics, Tier } from "@qdic-topology/engine";
import type { SceneNode, SceneVisual } from "./scene";
import { designedSymbol } from "./marks";
import sprite from "./sprite.json";

type Icon = { icon: string };
type SpriteElement = [string, Record<string, string>, SpriteElement[]];
type SpriteIcon = {
  w: number;
  h: number;
  tier: Tier;
  color: string;
  fill: string;
  body: SpriteElement[];
};

const SVG_NS = "http://www.w3.org/2000/svg";
// why: SA §2, ddr-0012 — `sprite.json` is the output of `scripts/build-icons.mjs`; its shape is
// fixed by that script, and TypeScript infers only unions for the JSON tuples
const ICONS = sprite as unknown as Readonly<Record<string, SpriteIcon>>;
const NAMES = Object.keys(ICONS);

export const iconMetrics: IconMetrics = Object.fromEntries(
  NAMES.map((name) => {
    const { w, h, tier } = ICONS[name];
    return [name, { w, h, tier }];
  }),
);

export const spriteColours: ReadonlyMap<string, Hex> = new Map(
  NAMES.map((name) => [name, ICONS[name].color as Hex]),
);

function spriteIcon(key: string): SpriteIcon | undefined {
  return Object.hasOwn(ICONS, key) ? ICONS[key] : undefined;
}

function elementOf(doc: Document, [tag, attrs, children]: SpriteElement) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs))
    el.setAttribute(name, value);
  for (const child of children) el.appendChild(elementOf(doc, child));
  return el;
}

// why: build-time item (a) of readiness round 2 — the root `fill` (`none`) goes on the symbol,
// so the body elements with no `fill` do not draw black (the mockup body is `<g fill="none">`)
function iconSymbol(doc: Document, id: string, icon: SpriteIcon): Element {
  const symbol = doc.createElementNS(SVG_NS, "symbol");
  symbol.setAttribute("id", id);
  symbol.setAttribute("viewBox", `0 0 ${icon.w} ${icon.h}`);
  symbol.setAttribute("fill", icon.fill);
  for (const child of icon.body) symbol.appendChild(elementOf(doc, child));
  return symbol;
}

// why: a scene holds copies of the visuals, so a distinct visual is found by its values, never
// by object identity
function keyOf(visual: SceneVisual): string {
  if ("icon" in visual) return `i ${visual.icon}`;
  const { shape, size, color, ink, letters, glyph } = visual;
  return JSON.stringify(["d", shape, size, color, ink, letters, glyph]);
}

export function symbolOf(
  doc: Document,
  id: string,
  visual: Designed | Icon,
): Element {
  if (!("icon" in visual)) return designedSymbol(doc, id, visual);
  const icon = spriteIcon(visual.icon);
  if (icon === undefined)
    throw new Error("drawSymbols: an icon key is not in the sprite");
  return iconSymbol(doc, id, icon);
}

export type Hrefs = (node: SceneNode) => string;

type Drawn = { key: string; symbol: Element };

// why: STORY-005-09 rule 2 (b), (c) — the id and the `keyOf` key of each drawn symbol stay in
// memory only, by `defs`
const drawnSymbols = new WeakMap<Element, ReadonlyMap<string, Drawn>>();

// why: mockup `ensureSymbol` (lib/topology.js lines 459-469) — one `<symbol>` per distinct
// visual; ids are numbers in first-use order, so no type name reaches an id. ISSUE-015: a new
// `<symbol>` makes Chromium build each `<use>` of it again, which stops a `dblclick`, so a
// symbol with the same id and key stays; every other child of `defs` goes
export function drawSymbols(
  defs: Element,
  nodes: readonly SceneNode[],
  prefix: string,
): Hrefs {
  const doc = defs.ownerDocument;
  const last = drawnSymbols.get(defs);
  const ids = new Map<string, string>();
  const drawn = new Map<string, Drawn>();
  for (const { visual } of nodes) {
    const key = keyOf(visual);
    if (ids.has(key)) continue;
    const id = `${prefix}-s-${ids.size}`;
    ids.set(key, id);
    const old = last?.get(id);
    const symbol =
      old?.key === key && old.symbol.parentNode === defs
        ? old.symbol
        : symbolOf(doc, id, visual);
    drawn.set(id, { key, symbol });
  }
  const symbols = new Set([...drawn.values()].map((d) => d.symbol));
  for (const child of [...defs.children])
    if (!symbols.has(child)) child.remove();
  for (const symbol of symbols)
    if (symbol.parentNode !== defs) defs.appendChild(symbol);
  drawnSymbols.set(defs, drawn);
  return (node) => `#${ids.get(keyOf(node.visual))}`;
}
