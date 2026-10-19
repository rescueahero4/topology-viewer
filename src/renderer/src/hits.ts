import { select } from "d3-selection";
import { endOf, type Ends } from "./edges";
import type { Camera } from "./fit";
import type { SceneEdge } from "./scene";

// why: STORY-003-04 Context "Viewport hit paths" — the viewport is the container widened by 12
// screen px at each side
const MARGIN = 12;

export type Viewport = { camera: Camera; w: number; h: number };

// why: SA §5 Renderer, T10 — a hit path only for an edge whose screen box (the box of its two end
// centres under the transform) meets the widened container; a 0 × 0 container has no viewport
export function hitEdges(
  edges: readonly SceneEdge[],
  ends: Ends,
  view: Viewport,
): SceneEdge[] {
  const { camera: t, w, h } = view;
  if (!(w > 0) || !(h > 0)) return [];
  return edges.filter((edge) => {
    const s = endOf(ends, edge.subject);
    const o = endOf(ends, edge.object);
    const sx = t.x + t.k * s.x;
    const ox = t.x + t.k * o.x;
    const sy = t.y + t.k * s.y;
    const oy = t.y + t.k * o.y;
    return (
      Math.max(sx, ox) >= -MARGIN &&
      Math.min(sx, ox) <= w + MARGIN &&
      Math.max(sy, oy) >= -MARGIN &&
      Math.min(sy, oy) <= h + MARGIN
    );
  });
}

export function drawHits(
  layer: SVGGElement,
  edges: readonly SceneEdge[],
  d: (edge: SceneEdge) => string,
): void {
  select(layer)
    .selectAll<SVGPathElement, SceneEdge>("path.qt-ehit")
    .data(edges, (e) => e.key)
    .join("path")
    .attr("class", "qt-ehit")
    .attr("d", d);
}
