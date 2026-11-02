import {
  CUSTOM,
  fold,
  matchEntities,
  type Graph,
  type Lang,
  type Profile,
  type Vocab,
} from "#engine";
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

// why: SA §4.8 addendum 0.33 (8) — Type: `node`, `edge`, then the labels in use
export function typeLabelItems(graph: Graph): string[] {
  const items = new Set(["node", "edge"]);
  for (const item of [...graph.records, ...graph.triples])
    if (item.typeLabel !== undefined) items.add(item.typeLabel);
  return [...items];
}

// why: addendum 0.33 (8) — Family: `profile.categoryOrder`, then Custom, then the families of the
// edited vocabulary
export function familyItems(profile: Profile, vocab: Vocab): string[] {
  const items = new Set([...profile.categoryOrder, CUSTOM]);
  for (const { key } of vocab.families) items.add(key);
  return [...items];
}

// why: addendum 0.33 (8), 0.33.1 — the text values of an attribute key in first-use order: System
// (`service_name`) on node and edge rows, any other key on node rows
export function valueItems(graph: Graph, key: string): string[] {
  const items = new Set<string>();
  const holders =
    key === "service_name"
      ? [...graph.records, ...graph.triples]
      : graph.records;
  for (const { attrs } of holders) {
    const value = Object.hasOwn(attrs, key) ? attrs[key] : undefined;
    if (typeof value === "string" && value !== "") items.add(value);
  }
  return [...items];
}

export const CANVAS_ITEMS = ["on", "off"];

// why: STORY-008-05 rule 4 — the nodes (canvas entities) by name, the first 50 as in the canvas
// search; no free text
export const nodeHits = (graph: Graph, query: string) =>
  matchEntities(graph, query).slice(0, SHOWN);
