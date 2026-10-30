import { stableJson } from "../data/hash";
import type { NodeRecord, Triple } from "../data/merge";
import type { Graph } from "../data/normalize";
import { baseKeysOf, locate } from "./apply";
import {
  fieldOf,
  valueOf,
  type EditColumn,
  type Field,
  type RowKind,
  type RowRef,
} from "./types";

// why: SA §4.8 addendum 0.33 (3), (5), (7) — the Type label with its default row kind, the Family
// by the predicate, a list or an object by `stableJson`
function sameOf(kind: RowKind, field: Field) {
  if (field.key === "typeLabel")
    return (item: NodeRecord | Triple) => item.typeLabel ?? kind;
  if (field.key === "family")
    return (item: NodeRecord | Triple) => (item as Triple).predicate;
  return (item: NodeRecord | Triple) => {
    const value = valueOf(item, field);
    return typeof value === "object" && value !== null
      ? stableJson(value)
      : value;
  };
}

// why: PRD-002 FR-CELL-6 and addendum 0.3 — the rows of the same row type in the whole graph with
// the same stored value, in graph order; an empty old value gives only the row itself. SA §4.8
// addendum 0.33 (2) — an ID gives only the row itself
export function sameValueRows(
  graph: Graph,
  row: RowRef,
  column: EditColumn,
): RowRef[] {
  const { kind, index } = locate(graph, row);
  const field = fieldOf(kind, column);
  if (field.key === "shownId") return [row];
  const items: readonly (NodeRecord | Triple)[] =
    kind === "node" ? graph.records : graph.triples;
  const read = sameOf(kind, field);
  const value = read(items[index]);
  if (value === undefined || value === null) return [row];
  const refs: RowRef[] =
    kind === "node"
      ? graph.records.map((record) => ({ record: record.id }))
      : baseKeysOf(graph).map((key) => ({ triple: key }));
  return refs.filter((_, at) => read(items[at]) === value);
}
