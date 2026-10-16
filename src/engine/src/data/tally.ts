import {
  CAPS,
  checkCounts,
  type FatalInfo,
  type Issue,
} from "@qdic-topology/contract";

export type Path = Issue["path"];
export type Cell = string | number | boolean;
export type Columns = Record<string, unknown>;

// why: lead decision D32 — the engine-internal fields of a shaped record have symbol keys, so no
// input key (a JSON key is a string) can hide or replace them (QA S1 fix loop 1)
export const REASON = Symbol("shaped reason");
export const KEYS_PATH = Symbol("keys path");

export type ShapedNode = {
  id: string;
  type: string;
  label?: string;
  attrs?: Columns;
  _inferred: { type: string };
  [KEYS_PATH]?: Path;
};

export type ShapedEdge = {
  subject: string;
  predicate: string;
  object: string;
  attrs?: Columns;
  [REASON]: string;
};

export type ShapeFatal = {
  code: FatalInfo["code"];
  path: Path;
  info: FatalInfo;
};

export type Tally = { nodes: number; edges: number };

const REASON_TEXT = "shaped from ";
// why: STORY-002-02 open question 4 — the key in a reason is data: bounded, with no control or
// bidi characters (SA §11 Untrusted input)
const KEY_LIMIT = 64;
const HIDDEN = /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

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
  return REASON_TEXT + clean.slice(0, KEY_LIMIT).join("");
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

export function reasonOf(item: object): string | undefined {
  const value: unknown = (item as { [REASON]?: unknown })[REASON];
  return typeof value === "string" ? value : undefined;
}

export function keysPathOf(item: object): Path | undefined {
  const value: unknown = (item as { [KEYS_PATH]?: unknown })[KEYS_PATH];
  return Array.isArray(value) ? (value as Path) : undefined;
}

// why: the rows rule leaves out only an object or array cell, so `null` stays (PRD FR-DATA-1)
export function isRowAttribute(value: unknown): boolean {
  return typeof value !== "object" || value === null;
}

// why: question 9 (d) names the values that a tree object keeps: string, finite number, boolean
export function cellsOf(
  columns: Columns,
  used: ReadonlySet<string>,
  keep: (value: unknown) => boolean,
): Columns {
  const kept: [string, unknown][] = [];
  for (const [key, value] of Object.entries(columns))
    if (!used.has(key) && keep(value)) kept.push([key, value]);
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
