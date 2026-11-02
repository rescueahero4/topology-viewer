import type { Designed } from "#engine";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEX = /^#[0-9a-f]{6}$/;
// why: SA §4.1 — the glyph pattern and cap, checked again here because a scene is plain data
const GLYPH = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/;
const GLYPH_CAP = 512;
const SIDES: Readonly<Record<string, number>> = {
  diamond: 4,
  pentagon: 5,
  hexagon: 6,
  heptagon: 7,
  octagon: 8,
};

export function isHex(value: string): boolean {
  return HEX.test(value);
}

// why: SA §5 Renderer — a colour attribute takes only a re-checked `#rrggbb`; a bad value sets
// nothing, so the element keeps the colour of its token class
export function setColour(
  el: Element,
  name: "fill" | "stroke",
  value: string,
): void {
  if (isHex(value)) el.setAttribute(name, value);
}

function svgElement(doc: Document, tag: string, attrs: [string, string][]) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of attrs) el.setAttribute(name, value);
  return el;
}

// why: mockup `polygon` (lib/topology.js lines 242-247)
function polygon(n: number, cx: number, cy: number, R: number): string {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(cx + R * Math.cos(a)).toFixed(2)},${(cy + R * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

type Outline = { el: Element; cy: number; inner: number };

// why: mockup `designIcon` (lib/topology.js lines 250-260); the engine already chose the shape
function outline(doc: Document, d: Designed): Outline {
  const S = d.size;
  const c = S / 2;
  const R = c - 1.5;
  if (d.shape === "square") {
    const x = String(c - R * 0.88);
    const side = String(R * 1.76);
    const attrs: [string, string][] = [
      ["x", x],
      ["y", x],
      ["width", side],
      ["height", side],
      ["rx", String(S * 0.12)],
    ];
    return { el: svgElement(doc, "rect", attrs), cy: c, inner: 0.56 };
  }
  if (d.shape === "triangle") {
    const rho = R * 1.155;
    const cy = c + rho / 4;
    const points = polygon(3, c, cy, rho);
    const el = svgElement(doc, "polygon", [["points", points]]);
    el.setAttribute("stroke-linejoin", "round");
    return { el, cy, inner: 0.42 };
  }
  const sides = Object.hasOwn(SIDES, d.shape) ? SIDES[d.shape] : 0;
  if (sides === 0) {
    const attrs: [string, string][] = [
      ["cx", String(c)],
      ["cy", String(c)],
      ["r", String(R)],
    ];
    return { el: svgElement(doc, "circle", attrs), cy: c, inner: 0.56 };
  }
  const el = svgElement(doc, "polygon", [["points", polygon(sides, c, c, R)]]);
  el.setAttribute("stroke-linejoin", "round");
  return { el, cy: c, inner: d.shape === "diamond" ? 0.48 : 0.56 };
}

function glyphMark(doc: Document, d: Designed, at: Outline, glyph: string) {
  const g = d.size * at.inner;
  const c = d.size / 2;
  const group = svgElement(doc, "g", [
    ["transform", `translate(${c - g / 2},${at.cy - g / 2}) scale(${g / 24})`],
  ]);
  const path = svgElement(doc, "path", [
    ["fill", "none"],
    ["stroke-width", "2.2"],
    ["stroke-linecap", "round"],
    ["stroke-linejoin", "round"],
  ]);
  path.setAttribute("d", glyph);
  setColour(path, "stroke", d.ink);
  group.appendChild(path);
  return group;
}

// why: mockup `designIcon` (lib/topology.js line 266) — the centring and weight are attributes on
// the text, because a CSS rule does not reach text inside a `<symbol>` drawn by `<use>` in each host
function lettersMark(doc: Document, d: Designed, at: Outline, letters: string) {
  const size = Math.max(7, d.size * at.inner * 0.62);
  const text = svgElement(doc, "text", [
    ["x", String(d.size / 2)],
    ["y", String(at.cy + 0.5)],
    ["font-size", size.toFixed(1)],
    ["font-weight", "700"],
    ["text-anchor", "middle"],
    ["dominant-baseline", "central"],
  ]);
  setColour(text, "fill", d.ink);
  text.textContent = letters;
  return text;
}

function markOf(doc: Document, d: Designed, at: Outline): Element | null {
  const glyph = d.glyph;
  if (glyph !== undefined && glyph.length <= GLYPH_CAP && GLYPH.test(glyph))
    return glyphMark(doc, d, at, glyph);
  if (d.letters !== undefined && d.letters !== "")
    return lettersMark(doc, d, at, d.letters);
  return null;
}

// why: mockup `designIcon` (lib/topology.js lines 250-271) — shape with the white outline of the
// `qt-mark` class, then the glyph, else the letters
export function designedSymbol(
  doc: Document,
  id: string,
  d: Designed,
): Element {
  const symbol = svgElement(doc, "symbol", [
    ["id", id],
    ["viewBox", `0 0 ${d.size} ${d.size}`],
  ]);
  const at = outline(doc, d);
  at.el.setAttribute("class", "qt-mark");
  setColour(at.el, "fill", d.color);
  symbol.appendChild(at.el);
  const mark = markOf(doc, d, at);
  if (mark !== null) symbol.appendChild(mark);
  return symbol;
}
