import { select } from "d3-selection";
import type { DrawnId, EdgeKey } from "@qdic-topology/engine";
import type { Layers } from "./layers";
import type { Scene, SceneEdge, SceneNode } from "./scene";

export type Intent =
  | { kind: "select"; node: DrawnId | null }
  | { kind: "selectEdge"; edge: EdgeKey; anchor: DrawnId }
  | { kind: "activate"; node: DrawnId };

// why: SA §4.5 (A23.2) — the renderer reports input; the controller changes the scene. `live`
// ends the renderer when its root left the page (owner decision H8)
export type Pointer = {
  live(): boolean;
  scene(): Scene;
  emit(intent: Intent): void;
  hoverNode(node: SceneNode, event: MouseEvent): void;
  hoverEdge(edge: SceneEdge, event: MouseEvent): void;
  leave(): void;
};

const nodesOf = (layers: Layers) =>
  select(layers.nodes).selectAll<SVGGElement, SceneNode>("g.qt-node");
const hitsOf = (layers: Layers) =>
  select(layers.hits).selectAll<SVGPathElement, SceneEdge>("path.qt-ehit");

// why: mockup `selectEdge` (lib/topology.js lines 2101-2107) — the selected node stays the anchor
// when it is an end of the edge, else the subject; the engine `selectEdge` applies the same rule
function anchorOf(edge: SceneEdge, node: DrawnId | null): DrawnId {
  return node !== null && (node === edge.subject || node === edge.object)
    ? node
    : edge.subject;
}

// why: mockup node listeners (lib/topology.js lines 1018-1026) and NF-5 — click and Enter
// select, double-click and Space activate
export function bindNodes(layers: Layers, p: Pointer): void {
  nodesOf(layers)
    .on("click.qt", (event: MouseEvent, d) => {
      if (!p.live()) return;
      event.stopPropagation();
      p.emit({ kind: "select", node: d.id });
    })
    .on("dblclick.qt", (event: MouseEvent, d) => {
      if (!p.live()) return;
      event.stopPropagation();
      event.preventDefault();
      p.emit({ kind: "activate", node: d.id });
    })
    .on("keydown.qt", (event: KeyboardEvent, d) => {
      if (!p.live()) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (event.key === "Enter") p.emit({ kind: "select", node: d.id });
      else p.emit({ kind: "activate", node: d.id });
    })
    .on("mouseenter.qt", (event: MouseEvent, d) => {
      if (p.live()) p.hoverNode(d, event);
    })
    .on("mouseleave.qt", () => {
      if (p.live()) p.leave();
    });
}

// why: mockup hit-path listeners (lib/topology.js lines 979-984); a double-click on an edge gives
// no intent
export function bindHits(layers: Layers, p: Pointer): void {
  hitsOf(layers)
    .on("click.qt", (event: MouseEvent, d) => {
      if (!p.live()) return;
      event.stopPropagation();
      const anchor = anchorOf(d, p.scene().selection.node);
      p.emit({ kind: "selectEdge", edge: d.key, anchor });
    })
    .on("mouseenter.qt", (event: MouseEvent, d) => {
      if (p.live()) p.hoverEdge(d, event);
    })
    .on("mouseleave.qt", () => {
      if (p.live()) p.leave();
    });
}

// why: mockup canvas click (lib/topology.js line 552) — a click on the empty canvas clears the
// selection
export function bindCanvas(layers: Layers, p: Pointer): void {
  select(layers.svg).on("click.qt", (event: MouseEvent) => {
    if (!p.live()) return;
    if (event.target === layers.svg) p.emit({ kind: "select", node: null });
  });
}

export function unbind(layers: Layers): void {
  nodesOf(layers).on(".qt", null);
  hitsOf(layers).on(".qt", null);
  select(layers.svg).on(".qt", null);
}
