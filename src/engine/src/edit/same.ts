import type { Graph } from "../data/normalize";
import { baseKeysOf, locate } from "./apply";
import { fieldOf, valueOf, type EditColumn, type RowRef } from "./types";

// why: PRD-002 FR-CELL-6 and addendum 0.3 — the rows of the same row type in the whole graph with
// the same stored value, in graph order; an empty old value gives only the row itself
export function sameValueRows(
  graph: Graph,
  row: RowRef,
  column: EditColumn,
): RowRef[] {
  const { kind, index } = locate(graph, row);
  const field = fieldOf(kind, column);
  const items = kind === "node" ? graph.records : graph.triples;
  const value = valueOf(items[index], field);
  if (value === undefined || value === null) return [row];
  const refs: RowRef[] =
    kind === "node"
      ? graph.records.map((record) => ({ record: record.id }))
      : baseKeysOf(graph).map((key) => ({ triple: key }));
  return refs.filter((_, at) => valueOf(items[at], field) === value);
}
