import {
  edgeKey,
  type CanvasState,
  type DrawnId,
  type EdgeKey,
} from "../state/canvasState";
import type { Topology } from "./group";

export type DrawnEdge = {
  key: EdgeKey;
  subject: DrawnId;
  predicate: string;
  object: DrawnId;
  count: number;
  muted: boolean;
};

// why: mockup `isMuted` (lib/topology.js line 1047) — a family or predicate filter only styles an
// edge (FR-FILTER-6)
export function mutedOf(top: Topology, state: CanvasState) {
  const families = new Set(state.filters.familiesOff);
  const predicates = new Set(state.filters.predicatesOff);
  return (predicate: string) => {
    const family = top.familyOf.get(predicate);
    return (
      predicates.has(predicate) ||
      (family !== undefined && families.has(family))
    );
  };
}

export function edgesOf(
  top: Topology,
  drawnOf: (DrawnId | null)[],
  muted: (predicate: string) => boolean,
) {
  const edges = new Map<EdgeKey, DrawnEdge>();
  for (const link of top.links) {
    const subject = drawnOf[link.subject];
    const object = drawnOf[link.object];
    if (subject === null || object === null) continue;
    const key = edgeKey(subject, link.predicate, object);
    const edge = edges.get(key);
    if (edge) edge.count += link.count;
    else
      edges.set(key, {
        key,
        subject,
        predicate: link.predicate,
        object,
        count: link.count,
        muted: muted(link.predicate),
      });
  }
  return [...edges.values()];
}
