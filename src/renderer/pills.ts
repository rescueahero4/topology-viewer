import { select } from "d3-selection";
import type { DrawnId } from "#engine";
import { endOf, type At, type Ends } from "./edges";
import { pickedEdge } from "./highlight";
import { setColour } from "./marks";
import type { Scene, SceneEdge, SceneNode } from "./scene";
import type { RendererText } from "./text";

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
  return node === null ? [] : nodePills(scene.edges, node);
}

// why: the pills follow the lights — a lit node shows the pills of its edges that are not muted,
// on hover as on select
export const nodePills = (edges: readonly SceneEdge[], node: DrawnId) =>
  edges.filter((e) => !e.muted && (e.subject === node || e.object === node));

// why: FR-QDIC-5, TL-15 — a retired edge says so in its pill; the width uses the shown text, and
// the pill is not cut (epic question 23)
function fillPill(g: SVGGElement, edge: SceneEdge, text: RendererText): void {
  g.replaceChildren();
  const pill = select(g);
  const label = edge.retired ? text.pillRetired(edge.label) : edge.label;
  const w = label.length * CHAR_W + PAD_W;
  const rect = pill
    .append("rect")
    .attr("x", -w / 2)
    .attr("y", -PILL_H / 2)
    .attr("width", w)
    .attr("height", PILL_H)
    .attr("rx", PILL_RX);
  setColour(rect.node() as SVGRectElement, "fill", edge.colour);
  pill.append("text").attr("y", 0.5).text(label);
}

// why: mockup `mid` and `placeOverlays` (lib/topology.js lines 1090-1101) — a pill sits halfway
// between the centres and keeps its screen size at each zoom `k`
const pillTransform = (s: SceneNode, t: SceneNode, k: number) =>
  `translate(${(s.x + t.x) / 2},${(s.y + t.y) / 2}) scale(${1 / k})`;

export function scalePills(layer: SVGGElement, ends: Ends, k: number): void {
  select(layer)
    .selectAll<SVGGElement, SceneEdge>("g.qt-elabel")
    .attr("transform", (e) =>
      pillTransform(endOf(ends, e.subject), endOf(ends, e.object), k),
    );
}

// why: STORY-003-05 frame writes — the pill of an edge with a moving end
export function pillMover(
  layer: SVGGElement,
  moving: ReadonlySet<DrawnId>,
): (at: At, k: number) => void {
  const els: [SVGGElement, SceneEdge][] = [];
  select(layer)
    .selectAll<SVGGElement, SceneEdge>("g.qt-elabel")
    .each((e, i, groups) => {
      if (moving.has(e.subject) || moving.has(e.object))
        els.push([groups[i], e]);
    });
  return (at, k) => {
    for (const [el, e] of els)
      el.setAttribute(
        "transform",
        pillTransform(at(e.subject), at(e.object), k),
      );
  };
}

export function drawPills(
  layer: SVGGElement,
  edges: readonly SceneEdge[],
  ends: Ends,
  k: number,
  text: RendererText,
): void {
  select(layer)
    .selectAll<SVGGElement, SceneEdge>("g.qt-elabel")
    .data(edges, (e) => e.key)
    .join("g")
    .attr("class", "qt-elabel")
    .each((e, i, groups) => fillPill(groups[i], e, text));
  scalePills(layer, ends, k);
}
