import {
  bubbleRooms,
  type DrawnId,
  type Frontier,
  type IconMetrics,
  type LayoutName,
  type Vocab,
} from "@qdic-topology/engine";
import type { Scene, SceneNode, SceneType } from "@qdic-topology/renderer";

// why: epic question 7, STORY-003-01 — the engine gives the room of each drawn node and the
// renderer encloses the rooms; only in layout `bubbles`, so a scene runs one `drawnOf` there and
// none in the other layouts
export function roomsOf(
  layout: LayoutName,
  frontier: Frontier,
  vocab: Vocab,
  metrics: IconMetrics,
): ReadonlyMap<DrawnId, number> {
  if (layout !== "bubbles") return new Map();
  return new Map(bubbleRooms(frontier, vocab, metrics));
}

// why: FR-CANVAS-15 — the types of the scene nodes in first-use order, with the type label of the
// node (`text.unknownType` for `null`) and its guarded node colour (STORY-003-02); a `Map` keeps
// `__proto__` and `null` as keys of their own
export function typesOf(
  layout: LayoutName,
  nodes: readonly SceneNode[],
): Scene["types"] {
  if (layout !== "bubbles") return [];
  const types = new Map<string | null, SceneType>();
  for (const n of nodes)
    if (!types.has(n.type))
      types.set(n.type, { label: n.typeLabel, colour: n.colour });
  return [...types];
}
