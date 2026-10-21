import type { Designed, Visual } from "@qdic-topology/engine";
import { symbolOf } from "./sprite";

const SVG_NS = "http://www.w3.org/2000/svg";

// why: mockup `glyph` (app.js lines 73-77) — the mark keeps the aspect of its view box `0 0 w h`
// and fits in a square of `size` pixels
function sizeOf(svg: SVGSVGElement, box: string, size: number): void {
  const [, , w, h] = box.split(" ").map(Number);
  const k = size / Math.max(w, h);
  svg.setAttribute("width", String(Math.round(w * k)));
  svg.setAttribute("height", String(Math.round(h * k)));
}

// why: gap G6, STORY-004-02 rule 10 — the type mark of the shell is the same sprite copy or
// designed mark as the canvas node, made by `symbolOf`; only the view box, the fill and the
// children of the symbol move into a new `<svg>`, so no `id` goes with them
export function typeMark(
  visual: Visual | null,
  size: number,
  untyped: Designed | null,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  const from = visual ?? untyped;
  if (from === null) {
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    return svg;
  }
  const symbol = symbolOf(document, "", from);
  const box = symbol.getAttribute("viewBox") ?? `0 0 ${size} ${size}`;
  svg.setAttribute("viewBox", box);
  const fill = symbol.getAttribute("fill");
  if (fill !== null) svg.setAttribute("fill", fill);
  svg.append(...symbol.childNodes);
  sizeOf(svg, box, size);
  return svg;
}
