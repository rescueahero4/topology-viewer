import type { Graph } from "../data/normalize";
import { fold } from "../vocab/predicates";

// why: STORY-004-01 Rule B (G2; mockup `search`, lib/topology.js lines 2187-2195) — the label
// contains the query, or a record id equals it, after NFC and lower case; one id for each entity
// (FR-DATA-5), all entities with a grouped or undrawn one (FR-CANVAS-4); the shell shows the first 50
export function matchEntities(graph: Graph, query: string): string[] {
  const key = fold(query.trim());
  if (key === "") return [];
  // why: SA §4.8 addendum 0.33 (2) — the shown ID of each record, not the old id
  const shown = new Map(graph.records.map((r) => [r.id, r.shownId ?? r.id]));
  return graph.entities
    .filter(
      (entity) =>
        fold(entity.label).includes(key) ||
        entity.records.some((id) => fold(shown.get(id) ?? id) === key),
    )
    .map((entity) => entity.id);
}
