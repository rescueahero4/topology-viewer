import { select } from "d3-selection";
import type { DrawnId, LayoutName } from "#engine";
import type { Layers } from "./layers";
import type { Markers } from "./markers";
import { setColour } from "./marks";
import type { Scene, SceneEdge, SceneNode } from "./scene";

export type Ends = ReadonlyMap<DrawnId, SceneNode>;
export type At = (id: DrawnId) => SceneNode;

// why: mockup tree curves (lib/topology.js lines 1068-1078) — an edge ends 3 px before the side
// of the object; Structure edges (`contains`; `partOf` folds to it) have an arrow too
const TREE_GAP = 3;
// why: mockup `edgePath` (lib/topology.js line 1066) — the arrow tip stops 2 px before the
// object circle
const ARROW_GAP = 2;
// why: the name and sub-line under a node are drawn above the edges (tokens.css .qt-name, .qt-sub:
// 13 px at dy 1.15em, 11 px at dy 2.55em), so an arrow that comes from below stops under them
const NAME_PX = 13;
const SUB_PX = 11;
const LABEL_H = 32;
const LABEL_H_BIG = 19;
// why: the on-screen label size is fixed, so in graph units it is the label size divided by the
// zoom; above 1,200 nodes the labels scale with the geometry (tokens.css .qt-big)
let labelScale = 1;
let labelBig = false;
export function setLabelZoom(k: number, big: boolean): boolean {
  const scale = big ? 1 : 1 / (k > 0 ? k : 1);
  const changed = scale !== labelScale || big !== labelBig;
  labelScale = scale;
  labelBig = big;
  return changed;
}

// why: the half width of the label block, from the character count (an estimate: the text is
// not measured, so no layout read happens per frame)
function labelHalfWidth(t: SceneNode): number {
  const name = t.label.length * NAME_PX * 0.62;
  const sub = labelBig ? 0 : t.sub.length * SUB_PX * 0.55;
  return (Math.max(name, sub, t.w) / 2 + 2) * labelScale;
}

const labelHeight = () => (labelBig ? LABEL_H_BIG : LABEL_H) * labelScale;

// why: the distance from the centre of `t` along (ux, uy) to the point where the ray leaves the
// label block; 0 when the ray does not cross it
function labelExit(t: SceneNode, ux: number, uy: number): number {
  if (uy <= 0 || t.label === "") return 0;
  const hw = labelHalfWidth(t);
  const y0 = t.h / 2;
  const y1 = y0 + labelHeight();
  const tyMin = y0 / uy;
  const tyMax = y1 / uy;
  const txMax = ux === 0 ? Infinity : hw / Math.abs(ux);
  return txMax >= tyMin ? Math.min(txMax, tyMax) : 0;
}

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
  const gap = TREE_GAP;
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
    const below = dir < 0 ? labelHeight() : 0;
    const y2 = t.y - dir * (t.h / 2 + gap + below);
    const my = (y1 + y2) / 2;
    return `M${s.x},${y1}C${s.x},${my} ${t.x},${my} ${t.x},${y2}`;
  }
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  let pad = t.r + ARROW_GAP;
  const exit = labelExit(t, -dx / len, -dy / len) + ARROW_GAP;
  if (exit > pad && exit < len - 8) pad = exit;
  return `M${s.x},${s.y}L${t.x - (dx / len) * pad},${t.y - (dy / len) * pad}`;
}

// why: TL-15 — `qt-retired` stays in every state; the `tokens.css` order lets muted win over
// retired and retired win over the Other dash (mockup `edgeStyle`, lib/topology.js lines 1049-1052)
function classOf(edge: SceneEdge): string {
  const base = edge.retired ? "qt-edge qt-retired" : "qt-edge";
  if (edge.muted) return `${base} qt-muted`;
  return edge.dashed ? `${base} qt-dashed` : base;
}

// why: FR-FILTER-6 — a muted edge takes its grey and dots from the `qt-muted` class and has no
// arrowhead; mockup `edgeStyle` (lib/topology.js lines 1048-1053)
function styleEdge(el: SVGPathElement, edge: SceneEdge, markers: Markers) {
  el.removeAttribute("stroke");
  el.removeAttribute("marker-end");
  if (edge.muted) return;
  setColour(el, "stroke", edge.colour);
  const marker = markers(edge.colour);
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

// why: STORY-003-05 frame writes — the `d` of each edge or hit path with a moving end
export function edgeMover(
  layer: SVGGElement,
  selector: "path.qt-edge" | "path.qt-ehit",
  moving: ReadonlySet<DrawnId>,
  layout: LayoutName,
): (at: At) => void {
  const els: [SVGPathElement, SceneEdge][] = [];
  select(layer)
    .selectAll<SVGPathElement, SceneEdge>(selector)
    .each((e, i, paths) => {
      if (moving.has(e.subject) || moving.has(e.object))
        els.push([paths[i], e]);
    });
  return (at) => {
    for (const [el, e] of els)
      el.setAttribute("d", edgePath(e, at(e.subject), at(e.object), layout));
  };
}
