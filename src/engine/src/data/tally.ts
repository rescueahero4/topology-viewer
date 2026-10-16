import {
  CAPS,
  checkCounts,
  type FatalInfo,
  type Issue,
} from "@qdic-topology/contract";

export type Path = Issue["path"];
export type Cell = string | number | boolean;
export type Columns = Record<string, unknown>;

export type ShapedNode = {
  id: string;
  type: string;
  label?: string;
  attrs?: Record<string, Cell>;
  _inferred: { type: string };
};

export type ShapedEdge = {
  subject: string;
  predicate: string;
  object: string;
  attrs?: Record<string, Cell>;
  _inferred: { predicate: string };
};

export type ShapeFatal = {
  code: FatalInfo["code"];
  path: Path;
  info: FatalInfo;
};

export type Tally = { nodes: number; edges: number };

const REASON = "shaped from ";
// why: STORY-002-02 open question 4 — the key in a reason is data: bounded, with no control or
// bidi characters (SA §11 Untrusted input)
const KEY_LIMIT = 64;
const HIDDEN = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;

export const notAGraph = (path: Path): ShapeFatal => ({
  code: "not-a-graph",
  path,
  info: { code: "not-a-graph" },
});

export function isRecord(value: unknown): value is Columns {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function own(record: Columns, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function reason(key: string): string {
  const clean = Array.from(key.replace(HIDDEN, ""));
  return REASON + clean.slice(0, KEY_LIMIT).join("");
}

export function isCell(value: unknown): value is Cell {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" || typeof value === "boolean";
}

// why: PRD FR-DATA-3 — an id or a label comes only from a string, finite number or boolean
// cell; an empty string is no id, as `normalize` reads it
export function cellText(value: unknown): string | undefined {
  if (!isCell(value)) return undefined;
  const text = String(value);
  return text === "" ? undefined : text;
}

export function nullRecord<T>(
  entries: Iterable<[string, T]>,
): Record<string, T> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) record[key] = value;
  return record;
}

const ATTRS = "attrs";

// why: STORY-002-02 Context — the contract keeps the node keys as fields and moves every other
// column into `attrs`, so the columns of a parsed node are both, read as own keys
export function parsedColumns(node: Columns): Columns {
  const attrs = own(node, ATTRS);
  const fields = Object.entries(node).filter(([key]) => key !== ATTRS);
  return nullRecord([
    ...(isRecord(attrs) ? Object.entries(attrs) : []),
    ...fields,
  ]);
}

// why: STORY-002-02 question 9 (d) and the rows rules — an object or array value is left out
export function cellsOf(
  columns: Columns,
  used: ReadonlySet<string>,
): Record<string, Cell> {
  const kept: [string, Cell][] = [];
  for (const [key, value] of Object.entries(columns))
    if (!used.has(key) && isCell(value)) kept.push([key, value]);
  return nullRecord(kept);
}

// why: PRD FR-DATA-8 — counted after expansion; the walk stops at the first count over a cap,
// so `got` is cap + 1 (open question 6, lead decision D34)
function overCap(tally: Tally): ShapeFatal | null {
  const issue = checkCounts(tally.nodes, tally.edges);
  if (issue === null) return null;
  const unit = issue.path[0] === "nodes" ? "nodes" : "edges";
  return {
    code: "too-large",
    path: issue.path,
    info: {
      code: "too-large",
      got: { unit, count: tally[unit] },
      limit: { unit, count: CAPS[unit] },
    },
  };
}

export function addNode(tally: Tally): ShapeFatal | null {
  tally.nodes++;
  return overCap(tally);
}

export function addEdge(tally: Tally): ShapeFatal | null {
  tally.edges++;
  return overCap(tally);
}
