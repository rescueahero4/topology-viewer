import { select } from "d3-selection";
import type { DrawnId, LayoutName } from "@qdic-topology/engine";
import type { Layers } from "./layers";
import type { Markers } from "./markers";
import { setColour } from "./marks";
import type { Scene, SceneEdge, SceneNode } from "./scene";

export type Ends = ReadonlyMap<DrawnId, SceneNode>;

// why: mockup tree curves (lib/topology.js lines 1068-1078) — an arrow edge ends 3 px before the
// side of the object; a Structure edge ends at the side
const TREE_GAP = 3;
// why: mockup `edgePath` (lib/topology.js line 1066) — the arrow tip stops 2 px before the
// object circle
const ARROW_GAP = 2;

export function endsOf(nodes: readonly SceneNode[]): Ends {
  return new Map(nodes.map((n) => [n.id, n]));
}

export function endOf(ends: Ends, id: DrawnId): SceneNode {
  const node = ends.get(id);
  // why: SA §4.5 — the controller draws an edge only between drawn nodes
  if (node === undefined) throw new Error("draw: an edge end is not drawn");
  return node;
}

// why: mockup `edgePath` (lib/topology.js lines 1062-1081). Epic question 11 — a self-loop has
// zero length in the straight layouts (`len` = 1, `d` = 0) and the side-to-side curve in a tree
export function edgePath(
  edge: SceneEdge,
  s: SceneNode,
  t: SceneNode,
  layout: LayoutName,
): string {
  const gap = edge.structure ? 0 : TREE_GAP;
  if (layout === "tree-h") {
    const dir = t.x >= s.x ? 1 : -1;
    const x1 = s.x + (dir * s.w) / 2;
    const x2 = t.x - dir * (t.w / 2 + gap);
    const mx = (x1 + x2) / 2;
    return `M${x1},${s.y}C${mx},${s.y} ${mx},${t.y} ${x2},${t.y}`;
  }
  if (layout === "tree-v") {
    const dir = t.y >= s.y ? 1 : -1;
    const y1 = s.y + (dir * s.h) / 2;
    const y2 = t.y - dir * (t.h / 2 + gap);
    const my = (y1 + y2) / 2;
    return `M${s.x},${y1}C${s.x},${my} ${t.x},${my} ${t.x},${y2}`;
  }
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const pad = edge.structure ? 0 : t.r + ARROW_GAP;
  return `M${s.x},${s.y}L${t.x - (dx / len) * pad},${t.y - (dy / len) * pad}`;
}

function classOf(edge: SceneEdge): string {
  if (edge.muted) return "qt-edge qt-muted";
  return edge.dashed ? "qt-edge qt-dashed" : "qt-edge";
}

// why: FR-FILTER-6 — a muted edge takes its grey and dots from the `qt-muted` class and has no
// arrowhead; mockup `edgeStyle` (lib/topology.js lines 1048-1053)
function styleEdge(el: SVGPathElement, edge: SceneEdge, markers: Markers) {
  el.removeAttribute("stroke");
  el.removeAttribute("marker-end");
  if (edge.muted) return;
  setColour(el, "stroke", edge.colour);
  const marker = edge.structure ? null : markers(edge.colour);
  if (marker !== null) el.setAttribute("marker-end", marker);
}

export const pathsOf =
  (scene: Scene, ends: Ends) =>
  (edge: SceneEdge): string =>
    edgePath(
      edge,
      endOf(ends, edge.subject),
      endOf(ends, edge.object),
      scene.layout,
    );

// why: SA §5 Renderer — one `path.qt-edge` per scene edge, joined by the edge key, in scene
// order; `hits.ts` draws the hit paths of the edges in the viewport (T10)
export function drawEdges(
  layers: Layers,
  scene: Scene,
  ends: Ends,
  markers: Markers,
): void {
  select(layers.edges)
    .selectAll<SVGPathElement, SceneEdge>("path.qt-edge")
    .data(scene.edges, (e) => e.key)
    .join("path")
    .attr("class", classOf)
    .attr("d", pathsOf(scene, ends))
    .each((edge, i, paths) => styleEdge(paths[i], edge, markers));
}
