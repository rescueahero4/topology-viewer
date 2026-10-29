import {
  fold,
  matchEntities,
  type Graph,
  type Lang,
  type Profile,
  type Vocab,
} from "@qdic-topology/engine";
import { typeName } from "./names";
import { SHOWN } from "./SearchResults";

// why: STORY-008-05 rule 2 (FR-CELL-4) — the system types in profile order, then the other types of
// the edited data in first-use order; a `Set` holds the names, so a prototype name is a plain name
export function kindItems(profile: Profile, graph: Graph): string[] {
  const items = new Set(Object.keys(profile.nodeTypes));
  for (const record of graph.records)
    if (record.type !== undefined) items.add(record.type);
  return [...items];
}

// why: STORY-008-05 rule 3 (FR-CELL-4; PRD-002 §10 risk row 5) — the canonical predicates in
// profile order, then the other predicates of the edited data in first-use order; no inverse name
export function predicateItems(profile: Profile, graph: Graph): string[] {
  const items = new Set(Object.keys(profile.predicates));
  for (const triple of graph.triples) items.add(triple.predicate);
  return [...items].filter((name) => !Object.hasOwn(profile.inverses, name));
}

// why: STORY-008-05 rule 2 — the `fold` rule of the picker search on the name and the shown text
export function filtered(
  items: readonly string[],
  query: string,
  shown: (item: string) => string,
): string[] {
  const key = fold(query.trim());
  if (key === "") return [...items];
  return items.filter(
    (item) => fold(item).includes(key) || fold(shown(item)).includes(key),
  );
}

export const kindText = (ui: Lang, vocab: Vocab) => (item: string) =>
  typeName(ui, item, vocab.types);

// why: STORY-008-05 rule 4 — the nodes (canvas entities) by name, the first 50 as in the canvas
// search; no free text
export const nodeHits = (graph: Graph, query: string) =>
  matchEntities(graph, query).slice(0, SHOWN);
