import { select } from "d3-selection";
import type { DrawnId } from "#engine";
import type { Layers } from "./layers";
import type { Scene, SceneEdge, SceneNode } from "./scene";

// why: FR-CANVAS-14, SA §6 row 11 — one fixed class; the `tokens.css` rule takes the pointer
// events, the keyboard focus and the opacity, so no code writes a style inline (DA-5)
const OFF = "qt-off";

type Off = ReadonlySet<DrawnId>;

export const fadedOf = (scene: Scene): Off =>
  new Set(scene.nodes.filter((n) => n.faded).map((n) => n.id));

const edgeOff = (off: Off) => (e: SceneEdge) =>
  off.has(e.subject) || off.has(e.object);

// why: STORY-003-04 — the viewport update makes hit paths after the draw, so they get the class
// again; the flags join by the edge key data, never by a selector text (Security notes)
export function fadeHits(layer: SVGGElement, scene: Scene): void {
  select(layer)
    .selectAll<SVGPathElement, SceneEdge>("path.qt-ehit")
    .classed(OFF, edgeOff(fadedOf(scene)));
}

// why: a hover draws the pills again, so they get the class again
export function fadePills(layer: SVGGElement, scene: Scene): void {
  select(layer)
    .selectAll<SVGGElement, SceneEdge>("g.qt-elabel")
    .classed(OFF, edgeOff(fadedOf(scene)));
}

// why: FR-CANVAS-14 — a faded node, each edge, hit path and pill with a faded end, and the halo
// of a faded node fade with it (story Context "Fade")
export function drawFade(layers: Layers, scene: Scene): void {
  const off = fadedOf(scene);
  const node = (d: SceneNode) => off.has(d.id);
  select(layers.nodes)
    .selectAll<SVGGElement, SceneNode>("g.qt-node")
    .classed(OFF, node);
  select(layers.edges)
    .selectAll<SVGPathElement, SceneEdge>("path.qt-edge")
    .classed(OFF, edgeOff(off));
  fadeHits(layers.hits, scene);
  fadePills(layers.edgeLabels, scene);
  select(layers.focus)
    .selectAll<SVGGElement, SceneNode>("g.qt-focus")
    .classed(OFF, node);
}
