import type { Graph } from "../data/normalize";
import { fold } from "../vocab/predicates";

// why: STORY-004-01 Rule B (G2; mockup `search`, lib/topology.js lines 2187-2195) — the label
// contains the query, or a record id equals it, after NFC and lower case; one id for each entity
// (FR-DATA-5), all entities with a grouped or undrawn one (FR-CANVAS-4); the shell shows the first 50
export function matchEntities(graph: Graph, query: string): string[] {
  const key = fold(query.trim());
  if (key === "") return [];
  return graph.entities
    .filter(
      (entity) =>
        fold(entity.label).includes(key) ||
        entity.records.some((record) => fold(record) === key),
    )
    .map((entity) => entity.id);
}
