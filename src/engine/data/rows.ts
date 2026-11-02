import type { Issue } from "#contract";
import {
  addEdge,
  addNode,
  cellText,
  cellsOf,
  isRecord,
  isRowAttribute,
  own,
  parsedColumns,
  REASON,
  reason,
  type Columns,
  type ShapedEdge,
  type ShapedNode,
  type ShapeFatal,
  type Tally,
} from "./tally";

type Slot = { key: string } | { literal: string } | null;

export type RowsPlan = {
  subject: string;
  object: string;
  predicate: Slot;
  type: Slot;
  fallback: string;
  row: string;
};

export type Expanded =
  | {
      ok: true;
      nodes: ShapedNode[];
      edges: ShapedEdge[];
      issues: Issue[];
      chosen: { nodes: string[]; edges: number[] };
    }
  | { ok: false; fatal: ShapeFatal };

type End = { first: string; cell?: string };

const WILDCARD = "*";
const LITERAL_TYPE = "shape.type";
const LITERAL_PREDICATE = "shape.predicate";

// why: lead decisions D38 and D52 — a hint value is a key only when it is an own key of the raw
// `nodes[0]` and that item is a plain object; the contract copy bound uses the same test
function slotOf(value: string | undefined, rawFirst: unknown): Slot {
  if (value === undefined) return null;
  return isRecord(rawFirst) && Object.hasOwn(rawFirst, value)
    ? { key: value }
    : { literal: value };
}

export function hintRows(
  hint: { subject: string; object: string; predicate?: string; type?: string },
  rawFirst: unknown,
  fallback: string,
  row: string,
): RowsPlan {
  return {
    subject: hint.subject,
    object: hint.object,
    predicate: slotOf(hint.predicate, rawFirst),
    type: slotOf(hint.type, rawFirst),
    fallback,
    row,
  };
}

// why: decision D7 — the columns come from the matched profile entry; for `*_id` they are the
// first two keys of the first row that end in the rest of the name, in its key order
export function heuristicRows(
  entry: { columns: readonly string[]; predicate: string },
  first: Columns,
  row: string,
): RowsPlan {
  const [head, second] = entry.columns;
  const pair = head.startsWith(WILDCARD)
    ? Object.keys(first).filter((key) =>
        key.endsWith(head.slice(WILDCARD.length)),
      )
    : [head, second];
  if (pair.length < 2)
    throw new Error("The matched profile entry gives no column pair.");
  return {
    subject: pair[0],
    object: pair[1],
    predicate: null,
    type: null,
    fallback: entry.predicate,
    row,
  };
}

function addEnd(
  ends: Map<string, End>,
  id: string,
  column: string,
  tally: Tally,
): ShapeFatal | null {
  if (ends.has(id)) return null;
  const fatal = addNode(tally);
  if (fatal === null) ends.set(id, { first: reason(column) });
  return fatal;
}

function predicateOf(
  columns: Columns,
  plan: RowsPlan,
): [string, string, boolean] {
  if (plan.predicate !== null && "literal" in plan.predicate)
    return [plan.predicate.literal, reason(LITERAL_PREDICATE), true];
  if (plan.predicate !== null) {
    const value = own(columns, plan.predicate.key);
    if (typeof value === "string")
      return [value, reason(plan.predicate.key), false];
  }
  return [plan.fallback, reason(plan.subject), true];
}

function edgeOf(
  columns: Columns,
  subject: string,
  object: string,
  plan: RowsPlan,
): { edge: ShapedEdge; chosen: boolean } {
  const used = new Set([plan.subject, plan.object]);
  for (const slot of [plan.predicate, plan.type])
    if (slot !== null && "key" in slot) used.add(slot.key);
  const [predicate, why, chosen] = predicateOf(columns, plan);
  return {
    edge: {
      subject,
      predicate,
      object,
      attrs: cellsOf(columns, used, isRowAttribute),
      [REASON]: why,
    },
    chosen,
  };
}

// why: lead decision D63 — the model's cell type wins over the default `row`; the first row in
// row order that gives a cell type sets it
function noteType(end: End, columns: Columns, plan: RowsPlan): void {
  if (plan.type === null || !("key" in plan.type) || end.cell !== undefined)
    return;
  const value = own(columns, plan.type.key);
  if (typeof value === "string") end.cell = value;
}

function typeOf(end: End, plan: RowsPlan): [string, string, boolean] {
  const slot = plan.type;
  if (slot !== null && "literal" in slot)
    return [slot.literal, reason(LITERAL_TYPE), true];
  if (slot !== null && end.cell !== undefined)
    return [end.cell, reason(slot.key), false];
  return [plan.row, end.first, true];
}

function nodesOf(ends: Map<string, End>, plan: RowsPlan) {
  const nodes: ShapedNode[] = [];
  const chosen: string[] = [];
  for (const [id, end] of ends) {
    const [type, why, byShaper] = typeOf(end, plan);
    if (byShaper) chosen.push(id);
    nodes.push({ id, type, label: id, _inferred: { type: why } });
  }
  return { nodes, chosen };
}

// why: STORY-002-02 rows rules (Q6) — one edge per row; a row with no usable end is skipped and
// counted; the counts run after expansion and stop at a cap before more is built (FR-DATA-8)
export function expandRows(
  rows: readonly unknown[],
  plan: RowsPlan,
  tally: Tally,
): Expanded {
  const ends = new Map<string, End>();
  const edges: ShapedEdge[] = [];
  const issues: Issue[] = [];
  const chosenEdges: number[] = [];
  for (const [index, row] of rows.entries()) {
    const columns = isRecord(row) ? parsedColumns(row) : null;
    const subject =
      columns === null ? undefined : cellText(own(columns, plan.subject));
    const object =
      columns === null ? undefined : cellText(own(columns, plan.object));
    if (columns === null || subject === undefined || object === undefined) {
      issues.push({ code: "dangling-edge", path: ["nodes", index] });
      continue;
    }
    const fatal =
      addEnd(ends, subject, plan.subject, tally) ??
      addEnd(ends, object, plan.object, tally) ??
      addEdge(tally);
    if (fatal !== null) return { ok: false, fatal };
    noteType(ends.get(subject) as End, columns, plan);
    const made = edgeOf(columns, subject, object, plan);
    if (made.chosen) chosenEdges.push(edges.length);
    edges.push(made.edge);
  }
  const { nodes, chosen } = nodesOf(ends, plan);
  return {
    ok: true,
    nodes,
    edges,
    issues,
    chosen: { nodes: chosen, edges: chosenEdges },
  };
}
