import type { Graph } from "../data/normalize";
import {
  entityDrawnId,
  type CanvasState,
  type DrawnId,
  type LayoutName,
  type Point,
  type TreeRows,
} from "../state/canvasState";
import type { Frontier } from "../view/frontier";
import type { Vocab } from "../vocab/resolve";
import { atomicCentre, atomicLayout } from "./atomic";
import { bubbleLayout, type Bubble } from "./bubbles";
import { drawnOf, type IconMetrics } from "./drawn";
import { forceConfig, forceLayout } from "./force";
import { treeLayout } from "./tree";

// The layouts of the developer, by their name in `LayoutName`. A layout is a pure function of the
// drawn nodes and edges, so a new draw gives the same places.
export type LayoutRun = (graph: {
  nodes: { id: DrawnId; type: string | null; label: string; w: number; h: number }[];
  edges: { subject: DrawnId; object: DrawnId; predicate: string }[];
}) => ReadonlyMap<DrawnId, Point>;

const customLayouts = new Map<string, LayoutRun>();

export function setCustomLayouts(next: ReadonlyMap<string, LayoutRun>): void {
  customLayouts.clear();
  for (const [name, run] of next) customLayouts.set(name, run);
}

export const hasCustomLayout = (name: unknown) =>
  typeof name === "string" && customLayouts.has(name);

export type LayoutResult = {
  positions: [DrawnId, Point][];
  ticks: number;
  treeRows: TreeRows | null;
  bubbles: Bubble[];
};

// why: STORY-002-05 Context "Force rules" — 0.8 for a request of the same layout (mockup
// `setLayout`, lib/topology.js line 2329); 1 for a new dataset and a layout change, where the
// mockup uses 0.8 (line 2331; the build memo records this)
function startAlpha(state: CanvasState): number {
  return state.layout === "force" && state.positions.length > 0 ? 0.8 : 1;
}

export function layout(
  state: CanvasState,
  frontier: Frontier,
  vocab: Vocab,
  name: LayoutName,
  metrics: IconMetrics,
  seed: number,
): LayoutResult {
  const empty: LayoutResult = {
    positions: [],
    ticks: 0,
    treeRows: null,
    bubbles: [],
  };
  if (frontier.nodes.length === 0) return empty;
  const drawn = drawnOf(frontier, vocab, metrics);
  const run = customLayouts.get(name);
  if (run !== undefined) {
    const placed = run({
      nodes: drawn.nodes.map(({ id, type, label, w, h }) => ({ id, type, label, w, h })),
      edges: frontier.edges.map(({ subject, object, predicate }) => ({ subject, object, predicate })),
    });
    const before = new Map(state.positions);
    return {
      ...empty,
      positions: drawn.nodes.map((node): [DrawnId, Point] => [
        node.id,
        placed.get(node.id) ?? before.get(node.id) ?? { x: 0, y: 0 },
      ]),
    };
  }
  if (name === "force")
    return {
      ...empty,
      ...forceLayout(
        drawn,
        vocab,
        new Map(state.positions),
        startAlpha(state),
        seed,
        forceConfig(drawn.nodes.length),
      ),
    };
  if (name === "atomic")
    return {
      ...empty,
      positions: atomicLayout(drawn, atomicCentre(state, frontier)),
    };
  if (name === "bubbles") return { ...empty, ...bubbleLayout(drawn) };
  return { ...empty, ...treeLayout(drawn, frontier, vocab, name === "tree-v") };
}

// why: P1, guardrail 5 — a layout runs only on this explicit request; it writes only `layout`,
// `positions` and `treeRows` (lead decision D86)
export function setLayout(
  state: CanvasState,
  frontier: Frontier,
  vocab: Vocab,
  name: LayoutName,
  metrics: IconMetrics,
): CanvasState {
  const result = layout(state, frontier, vocab, name, metrics, state.graphHash);
  return {
    ...state,
    layout: name,
    positions: result.positions,
    treeRows: result.treeRows,
  };
}

// why: mockup `recenter` (lib/topology.js lines 2346-2350) — Atomic again around an entity drawn
// alone; outside Atomic nothing runs
export function recenter(
  state: CanvasState,
  frontier: Frontier,
  graph: Graph,
  vocab: Vocab,
  metrics: IconMetrics,
  id: string,
): CanvasState {
  if (state.layout !== "atomic") return state;
  const entity = graph.entities.find(
    (item) => item.id === id || item.records.includes(id),
  );
  if (entity === undefined) return state;
  const centre = entityDrawnId(entity.id);
  if (!frontier.nodes.some((node) => node.id === centre)) return state;
  return {
    ...state,
    positions: atomicLayout(drawnOf(frontier, vocab, metrics), centre),
    treeRows: null,
  };
}
