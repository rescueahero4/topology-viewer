import type { Graph } from "../data/normalize";

// why: Product Owner, epic review — the parts of an edge-row ID join with a middle dot; a repeat
// number follows the same join
const PART = " · ";

// why: SA §4.8 addendum 0.33 (2) — the shown ID of each row in row order (records, then triples):
// `shownId`, else the record id, else `subject · predicate · object` with the shown IDs of the end
// entities and ` · n` from the second triple with the same three parts on
export function rowIds(graph: Graph): string[] {
  const shown = new Map(graph.entities.map((e) => [e.id, e.shownId ?? e.id]));
  const idOf = (id: string) => shown.get(id) ?? id;
  const seen = new Map<string, number>();
  const edges = graph.triples.map((triple) => {
    const { subject, predicate, object } = triple;
    const parts = JSON.stringify([subject, predicate, object]);
    const place = (seen.get(parts) ?? 0) + 1;
    seen.set(parts, place);
    if (triple.shownId !== undefined) return triple.shownId;
    const id = [idOf(subject), predicate, idOf(object)].join(PART);
    return place === 1 ? id : `${id}${PART}${place}`;
  });
  return [...graph.records.map((r) => r.shownId ?? r.id), ...edges];
}
