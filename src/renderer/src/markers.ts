import { select } from "d3-selection";
import { isHex, setColour } from "./marks";
import type { SceneEdge } from "./scene";

export type Markers = (colour: string) => string | null;

// why: mockup `markerFor` (lib/topology.js lines 446-457) — one arrowhead per edge colour. The id
// holds the prefix and the six digits of a re-checked `#rrggbb`, never a model string
function addMarker(defs: Element, id: string, colour: string): void {
  const marker = select(defs)
    .append("marker")
    .attr("id", id)
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 8)
    .attr("refY", 0)
    .attr("markerUnits", "userSpaceOnUse")
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto");
  const path = marker.append("path").attr("d", "M0,-3.5L8,0L0,3.5");
  setColour(path.node() as SVGPathElement, "fill", colour);
}

// why: FR-FILTER-6 — a muted edge has no arrowhead, and Structure has none (mockup `edgeStyle`,
// lib/topology.js line 1053), so their colours make no marker. The symbols of the same draw
// replaced every child of `defs` before this, so no unused marker stays
export function drawMarkers(
  defs: Element,
  edges: readonly SceneEdge[],
  prefix: string,
): Markers {
  const urls = new Map<string, string>();
  for (const { colour, muted, structure } of edges) {
    if (muted || structure || !isHex(colour) || urls.has(colour)) continue;
    const id = `${prefix}-a-${colour.slice(1)}`;
    addMarker(defs, id, colour);
    urls.set(colour, `url(#${id})`);
  }
  return (colour) => urls.get(colour) ?? null;
}
