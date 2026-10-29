import {
  valueKind,
  type CellChange,
  type EditCode,
  type EditColumn,
  type Graph,
  type Triple,
} from "@qdic-topology/engine";
import type { Key } from "./strings/index";
import type { Column } from "./workbenchColumns";
import type { Row } from "./workbenchRows";

export type InputKind =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "kind"
  | "predicate"
  | "node";

export type FieldKind = Exclude<
  InputKind,
  "boolean" | "kind" | "predicate" | "node"
>;

// why: STORY-008-04 rule 5 — a date-only value takes the browser date input; any other date form
// (a date-time with its time and zone) takes a text input with the `checkEdit` ISO 8601 check
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const own = (attrs: Readonly<Record<string, unknown>>, key: string) =>
  Object.hasOwn(attrs, key) ? attrs[key] : undefined;

const NODE_CORE = new Set(["kind", "name", "system", "description"]);
const EDGE_CORE = new Set([
  "name",
  "predicate",
  "subject",
  "object",
  "attributes",
]);

const CORE_INPUTS = new Map<string, InputKind>([
  ["kind", "kind"],
  ["name", "text"],
  ["system", "text"],
  ["description", "text"],
  ["predicate", "predicate"],
  ["subject", "node"],
  ["object", "node"],
]);

// why: STORY-008-06 — a cell of the table, or one fact line of the edge facts form
export type Target = Column | { fact: string };

// why: STORY-008-01 rule 3 — the three named facts that the triple holds outside `attrs`
const NAMED_FACTS: readonly [string, "validFrom" | "validTo" | "isActive"][] = [
  ["valid_from", "validFrom"],
  ["valid_to", "validTo"],
  ["isActive", "isActive"],
];

function factValue(triple: Triple, key: string): unknown {
  const named = NAMED_FACTS.find(([name]) => name === key);
  return named === undefined ? own(triple.attrs, key) : triple[named[1]];
}

export type Fact = { key: string; value: unknown };

// why: STORY-008-06 rule 2 (FR-CELL-4) — one line for each fact in the order of `attributesText`:
// the attribute keys of the triple, then `valid_from`, `valid_to`, `isActive` when the triple has them
export function factsOf(triple: Triple): Fact[] {
  const lines = Object.keys(triple.attrs).map((key) => ({
    key,
    value: own(triple.attrs, key),
  }));
  for (const [key, field] of NAMED_FACTS)
    if (triple[field] !== undefined) lines.push({ key, value: triple[field] });
  return lines;
}

// why: STORY-008-04 rule 1 — the value of a cell as the record or the triple holds it
export function cellValue(row: Row, column: Target): unknown {
  if ("fact" in column)
    return row.rtype === "edge"
      ? factValue(row.triple, column.fact)
      : undefined;
  if ("attr" in column)
    return row.rtype === "node"
      ? own(row.record.attrs, column.attr)
      : undefined;
  const key = column.core;
  if (row.rtype === "node") {
    if (key === "kind") return row.record.type;
    if (key === "name") return row.record.label;
    if (key === "system") return own(row.record.attrs, "service_name");
    if (key === "description") return own(row.record.attrs, "description");
    return undefined;
  }
  if (key === "name" || key === "predicate") return row.triple.predicate;
  if (key === "subject") return row.triple.subject;
  if (key === "object") return row.triple.object;
  return undefined;
}

// why: STORY-008-04 rule 1 (PRD-002 FR-CELL-1, FR-CELL-2) — the one decision of an editable cell;
// an empty or `null` attribute takes text, a list or an object attribute is read-only
export function editable(row: Row, column: Column, value: unknown): boolean {
  if ("attr" in column) {
    if (row.rtype !== "node") return false;
    const kind = valueKind(value);
    return kind !== "list" && kind !== "object";
  }
  return (row.rtype === "node" ? NODE_CORE : EDGE_CORE).has(column.core);
}

export type LineKind = FieldKind | "boolean";

// why: STORY-008-04 rule 5 — the input of a value by its kind; `null` for a list or an object
export function valueInput(value: unknown): LineKind | null {
  const kind = valueKind(value);
  if (kind === "list" || kind === "object") return null;
  if (kind === "number") return "number";
  if (kind === "boolean") return "boolean";
  if (kind === "date")
    return typeof value === "string" && DATE_ONLY.test(value)
      ? "date"
      : "datetime";
  return "text";
}

export type EditorKind = InputKind | "facts";

// why: STORY-008-04 rule 5 — the input of an editable cell. STORY-008-05 rule 1 — Kind takes the
// type list, an edge Name and Predicate the predicate list, Subject and Object the node search.
// STORY-008-06 rule 1 — the edge Attributes cell takes the facts form; an edge with no fact has none
export function inputOf(
  row: Row,
  column: Column,
  value: unknown,
): EditorKind | null {
  if (!editable(row, column, value)) return null;
  if ("attr" in column) return valueInput(value);
  if (row.rtype === "edge" && column.core === "attributes")
    return factsOf(row.triple).length > 0 ? "facts" : null;
  return row.rtype === "edge" && column.core === "name"
    ? "predicate"
    : (CORE_INPUTS.get(column.core) ?? null);
}

// why: STORY-008-04 rule 5 — the text of the input at the start; an empty or `null` cell is empty
export function startText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

export type Read = { code: EditCode } | { after: unknown };

// why: STORY-008-07 rules 1-3 — a valid save of a value that 2 or more rows share asks first: the
// count, the rows of them that the Workbench does not show, and the save of one or all rows
export type Ask = {
  count: number;
  hidden: number;
  apply: (all: boolean) => EditCode | null;
};

export type Saved = EditCode | null | Ask;

export const isAsk = (saved: Saved): saved is Ask =>
  typeof saved === "object" && saved !== null;

type Field = { value: string; validity: { badInput: boolean } };

// why: STORY-008-04 rule 5 — the browser gives an empty `value` for a bad number or a bad date, so
// `badInput` decides first and a bad input never clears the cell; only an empty input with no bad
// input clears (FR-CELL-5)
export function readField(kind: FieldKind, field: Field): Read {
  const bad = field.validity.badInput;
  if (kind === "number" && bad) return { code: "not-a-number" };
  if (kind === "date" && bad) return { code: "not-a-date" };
  const text = field.value;
  if (text === "") return { after: undefined };
  return { after: kind === "number" ? Number(text) : text };
}

const blank = (value: unknown) => value === undefined || value === null;

// why: an unchanged value, also an empty cell that stays empty, is no edit
export const sameValue = (before: unknown, after: unknown) =>
  Object.is(before, after) || (blank(before) && blank(after));

const columnOf = (column: Target): EditColumn =>
  "fact" in column
    ? { fact: column.fact }
    : "attr" in column
      ? { attr: column.attr }
      : column.core;

// why: SA §4.8, STORY-008-01 rule 2 — a node row names its record by id; an edge row names its
// triple by the key in the base graph, at the same place (the edited graph keeps the triple order)
export function changeOf(
  base: Graph,
  row: Row,
  column: Target,
  after: unknown,
): CellChange {
  const ref =
    row.rtype === "node"
      ? { record: row.id }
      : { triple: base.triples[row.index - base.records.length].key };
  return {
    row: ref,
    column: columnOf(column),
    before: cellValue(row, column),
    after,
  };
}

// why: STORY-008-04 rule 7 (PRD-002 FR-CELL-5) — one short message for each code
export const MESSAGES: Readonly<Record<EditCode, Key>> = {
  empty: "edit.empty",
  "self-edge": "edit.selfEdge",
  "not-a-number": "edit.notANumber",
  "not-a-date": "edit.notADate",
  "inverse-name": "edit.inverseName",
};
