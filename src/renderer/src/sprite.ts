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

function symbolOf(doc: Document, id: string, visual: Designed | Icon): Element {
  if (!("icon" in visual)) return designedSymbol(doc, id, visual);
  const icon = spriteIcon(visual.icon);
  if (icon === undefined)
    throw new Error("drawSymbols: an icon key is not in the sprite");
  return iconSymbol(doc, id, icon);
}

export type Hrefs = (node: SceneNode) => string;

// why: mockup `ensureSymbol` (lib/topology.js lines 459-469) — one `<symbol>` per distinct
// visual; ids are numbers in first-use order, so no type name reaches an id
export function drawSymbols(
  defs: Element,
  nodes: readonly SceneNode[],
  prefix: string,
): Hrefs {
  const doc = defs.ownerDocument;
  const ids = new Map<string, string>();
  const symbols: Element[] = [];
  for (const { visual } of nodes) {
    const key = keyOf(visual);
    if (ids.has(key)) continue;
    const id = `${prefix}-s-${ids.size}`;
    ids.set(key, id);
    symbols.push(symbolOf(doc, id, visual));
  }
  defs.replaceChildren(...symbols);
  return (node) => `#${ids.get(keyOf(node.visual))}`;
}
