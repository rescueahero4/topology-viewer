import { select } from "d3-selection";
import type { DrawnId, EdgeKey } from "#engine";
import type { Layers } from "./layers";
import type { Scene, SceneEdge, SceneNode } from "./scene";

export type Lights = {
  nodes: ReadonlySet<DrawnId>;
  edges: ReadonlySet<EdgeKey>;
} | null;

// why: mockup `highlight` (lib/topology.js lines 2067-2072) — the node, each node that shares an
// edge with it, and those edges
export function nodeLights(edges: readonly SceneEdge[], id: DrawnId): Lights {
  const nodes = new Set([id]);
  const keys = new Set<EdgeKey>();
  for (const edge of edges)
    if (edge.subject === id || edge.object === id) {
      keys.add(edge.key);
      nodes.add(edge.subject);
      nodes.add(edge.object);
    }
  return { nodes, edges: keys };
}

// why: mockup `highlightEdge` (lib/topology.js lines 2049-2053) — the edge and its two ends
export function edgeLights(edge: SceneEdge): Lights {
  return {
    nodes: new Set([edge.subject, edge.object]),
    edges: new Set([edge.key]),
  };
}

export function pickedEdge(scene: Scene): SceneEdge | null {
  const { edge } = scene.selection;
  if (edge === null) return null;
  return scene.edges.find((e) => e.key === edge) ?? null;
}

// why: mockup `restoreHighlight` (lib/topology.js lines 2044-2047) — the lights of the current
// edge pick, else of the selected node, else none
export function selectionLights(scene: Scene): Lights {
  const picked = pickedEdge(scene);
  if (picked !== null) return edgeLights(picked);
  const { node } = scene.selection;
  return node === null ? null : nodeLights(scene.edges, node);
}

export function showLights(
  root: HTMLDivElement,
  layers: Layers,
  lights: Lights,
): void {
  root.classList.toggle("qt-dim", lights !== null);
  select(layers.nodes)
    .selectAll<SVGGElement, SceneNode>("g.qt-node")
    .classed("qt-hl", (d) => lights?.nodes.has(d.id) ?? false);
  select(layers.edges)
    .selectAll<SVGPathElement, SceneEdge>("path.qt-edge")
    .classed("qt-hl", (d) => lights?.edges.has(d.key) ?? false);
}

// why: mockup `select` and `selectEdge` (lib/topology.js lines 2082-2113) — one selected node
// (the anchor of an edge pick, SA §6 row 19) and the picked edge
export function showSelection(layers: Layers, scene: Scene): void {
  const picked = pickedEdge(scene)?.key ?? null;
  select(layers.nodes)
    .selectAll<SVGGElement, SceneNode>("g.qt-node")
    .classed("qt-selected", (d) => d.id === scene.selection.node);
  select(layers.edges)
    .selectAll<SVGPathElement, SceneEdge>("path.qt-edge")
    .classed("qt-picked", (d) => d.key === picked);
}
