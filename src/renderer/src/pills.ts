import { select } from "d3-selection";
import { endOf, type Ends } from "./edges";
import { pickedEdge } from "./highlight";
import { setColour } from "./marks";
import type { Scene, SceneEdge } from "./scene";

// why: mockup `renderEdgeLabels` (lib/topology.js lines 1103-1115) — the pill size
const CHAR_W = 6.4;
const PAD_W = 14;
const PILL_H = 18;
const PILL_RX = 4;

// why: FR-CANVAS-10, FR-FILTER-6 — a picked edge shows its pill also when muted; a selected node
// shows the pills of its edges that are not muted
export function pillEdges(scene: Scene): SceneEdge[] {
  const picked = pickedEdge(scene);
  if (picked !== null) return [picked];
  const { node } = scene.selection;
  if (node === null) return [];
  return scene.edges.filter(
    (e) => !e.muted && (e.subject === node || e.object === node),
  );
}

function fillPill(g: SVGGElement, edge: SceneEdge): void {
  g.replaceChildren();
  const pill = select(g);
  const w = edge.label.length * CHAR_W + PAD_W;
  const rect = pill
    .append("rect")
    .attr("x", -w / 2)
    .attr("y", -PILL_H / 2)
    .attr("width", w)
    .attr("height", PILL_H)
    .attr("rx", PILL_RX);
  setColour(rect.node() as SVGRectElement, "fill", edge.colour);
  pill.append("text").attr("y", 0.5).text(edge.label);
}

// why: mockup `mid` (lib/topology.js lines 1097-1101) — a pill sits halfway between the centres
export function drawPills(
  layer: SVGGElement,
  edges: readonly SceneEdge[],
  ends: Ends,
): void {
  select(layer)
    .selectAll<SVGGElement, SceneEdge>("g.qt-elabel")
    .data(edges, (e) => e.key)
    .join("g")
    .attr("class", "qt-elabel")
    .attr("transform", (e) => {
      const s = endOf(ends, e.subject);
      const t = endOf(ends, e.object);
      return `translate(${(s.x + t.x) / 2},${(s.y + t.y) / 2})`;
    })
    .each((e, i, groups) => fillPill(groups[i], e));
}
