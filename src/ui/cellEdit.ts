import { peekOption } from "./custom";
import { saveState } from "./state";
import { columnConfig, publicRow } from "./tableConfig";
import {
  attributeSet,
  readJsonCell,
  valueKind,
  writeAttributes,
  type CellChange,
  type EditCode,
  type EditColumn,
  type AttrEntry,
  type Graph,
} from "#engine";
import type { Key } from "./strings/index";
import type { Column } from "./workbenchColumns";
import type { Row } from "./workbenchRows";

export type PickKind =
  "kind" | "predicate" | "canvas" | "typeLabel" | "family" | "values";

export type InputKind =
  | PickKind
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "node"
  | "attributes"
  | "list"
  | "object";

export type FieldKind = Exclude<InputKind, PickKind | "boolean" | "node">;

// why: STORY-008-04 rule 5 — a date-only value takes the browser date input; any other date form
// (a date-time with its time and zone) takes a text input with the `checkEdit` ISO 8601 check
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const own = (attrs: Readonly<Record<string, unknown>>, key: string) =>
  Object.hasOwn(attrs, key) ? attrs[key] : undefined;

// why: SA §4.8 addendum 0.33, 0.33.1 (STORY-008-09 rule 10) — every data cell of the row type is
// editable; a cell with no data for the row type (edge Kind, node Predicate, Subject, Object,
// Family) stays empty and not editable
const SHARED = ["canvas", "id", "type", "name", "system", "description"];
const NODE_CORE = new Set([...SHARED, "kind", "attributes"]);
const EDGE_CORE = new Set([
  ...SHARED,
  ...["predicate", "subject", "object", "family", "attributes"],
]);

const CORE_INPUTS = new Map<string, InputKind>([
  ["canvas", "canvas"],
  ["id", "text"],
  ["type", "typeLabel"],
  ["family", "family"],
  ["attributes", "attributes"],
  ["kind", "kind"],
  ["name", "text"],
  ["system", "values"],
  ["description", "text"],
  ["predicate", "predicate"],
  ["subject", "node"],
  ["object", "node"],
]);

// why: SA §4.8 addendum 0.33 (2)-(5), 0.33.1 — the shown ID, the Type label, the Family of the
// predicate, and System and Description (`service_name`, `description`) on both row types
function sharedValue(row: Row, key: string): unknown {
  const item = row.rtype === "node" ? row.record : row.triple;
  if (key === "canvas") return row.rtype;
  if (key === "id") return row.shownId;
  if (key === "type") return item.typeLabel ?? row.rtype;
  if (key === "family") return row.rtype === "edge" ? row.family : undefined;
  if (key === "system") return own(item.attrs, "service_name");
  if (key === "description") return own(item.attrs, "description");
  return undefined;
}

// why: STORY-008-04 rule 1 — the value of a cell as the record or the triple holds it
export function cellValue(row: Row, column: Column): unknown {
  if ("attr" in column)
    return row.rtype === "node"
      ? own(row.record.attrs, column.attr)
      : undefined;
  const key = column.core;
  if (row.rtype === "node") {
    if (key === "kind") return row.record.type;
    if (key === "name") return row.record.label;
    if (key === "attributes") return attributeSet("node", row.record);
    return sharedValue(row, key);
  }
  if (key === "name" || key === "predicate") return row.triple.predicate;
  if (key === "subject") return row.triple.subject;
  if (key === "object") return row.triple.object;
  if (key === "attributes") return attributeSet("edge", row.triple);
  return sharedValue(row, key);
}

// why: STORY-008-04 rule 1 (PRD-002 FR-CELL-1) — the one decision of an editable cell.
// STORY-008-09 rule 19 — every node attribute cell, also a list or an object, is editable
export function editable(row: Row, column: Column): boolean {
  if (saveState.peek().saving) return false;
  if (peekOption<boolean>("table", "readOnly") === true) return false;
  const config = columnConfig(column);
  if (config?.value !== undefined) return false;
  const given = config?.editable;
  if (given === false) return false;
  if (typeof given === "function" && !given(publicRow(row))) return false;
  if ("attr" in column) return row.rtype === "node";
  return (row.rtype === "node" ? NODE_CORE : EDGE_CORE).has(column.core);
}

export type LineKind = Exclude<FieldKind, "attributes"> | "boolean";

// why: STORY-008-04 rule 5 — the input of a value by its kind. STORY-008-09 rule 19 — a list or
// an object takes a JSON text; SA §4.8 addendum 0.33 (8) — a text value takes the value list
export function valueInput(value: unknown): LineKind | "values" {
  const kind = valueKind(value);
  if (kind === "list" || kind === "object") return kind;
  if (kind === "number") return "number";
  if (kind === "boolean") return "boolean";
  if (kind === "date")
    return typeof value === "string" && DATE_ONLY.test(value)
      ? "date"
      : "datetime";
  return "values";
}

// why: STORY-008-04 rule 5 — the input of an editable cell. STORY-008-05 rule 1 — Kind takes the
// type list, an edge Name and Predicate the predicate list, Subject and Object the node search.
// STORY-008-09 rules 10-13, 17, 18 — Canvas, Type and Family take a list, ID a text, Attributes
// one text for the whole set
export function inputOf(
  row: Row,
  column: Column,
  value: unknown,
): InputKind | null {
  if (!editable(row, column)) return null;
  const editor = columnConfig(column)?.editor;
  if (typeof editor === "string") return editor;
  if (typeof editor === "object") return "values";
  if ("attr" in column) return valueInput(value);
  return row.rtype === "edge" && column.core === "name"
    ? "predicate"
    : (CORE_INPUTS.get(column.core) ?? null);
}

// why: STORY-008-04 rule 5 — the text of the input at the start; an empty or `null` cell is empty.
// STORY-008-09 rules 18, 19 — the attribute set as `key=value` text, a list or an object as JSON
export function startText(value: unknown, kind?: InputKind): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (kind === "attributes" && Array.isArray(value))
    return writeAttributes(value as AttrEntry[]);
  if (kind === "list" || kind === "object") return JSON.stringify(value);
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
// input clears (FR-CELL-5). STORY-008-09 rules 18, 19 — the Attributes text goes to the save as
// typed (the engine reads it by the row type); a list or object cell takes JSON
export function readField(kind: FieldKind, field: Field): Read {
  if (kind === "attributes") return { after: field.value };
  if (kind === "list" || kind === "object") {
    const parsed = readJsonCell(field.value);
    return "code" in parsed ? parsed : { after: parsed.value };
  }
  const bad = field.validity.badInput;
  if (kind === "number" && bad) return { code: "not-a-number" };
  if (kind === "date" && bad) return { code: "not-a-date" };
  const text = field.value;
  if (text === "") return { after: undefined };
  return { after: kind === "number" ? Number(text) : text };
}

const blank = (value: unknown) => value === undefined || value === null;
const isTree = (value: unknown) => typeof value === "object" && value !== null;

// why: an unchanged value, also an empty cell that stays empty, is no edit; a set, a list or an
// object is the same when its JSON text is the same (STORY-008-09 rules 18, 19)
export const sameValue = (before: unknown, after: unknown) =>
  Object.is(before, after) ||
  (blank(before) && blank(after)) ||
  (isTree(before) &&
    isTree(after) &&
    JSON.stringify(before) === JSON.stringify(after));

const columnOf = (column: Column): EditColumn =>
  "attr" in column ? { attr: column.attr } : column.core;

// why: SA §4.8, STORY-008-01 rule 2 — a node row names its record by id; an edge row names its
// triple by the key in the base graph, at the same place (the edited graph keeps the triple order)
export function changeOf(
  base: Graph,
  row: Row,
  column: Column,
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
  "duplicate-id": "edit.duplicateId",
  "bad-syntax": "edit.badSyntax",
  "bad-json": "edit.badJson",
  "bad-xml": "edit.badXml",
  "empty-key": "edit.emptyKey",
  "duplicate-key": "edit.duplicateKey",
  "reserved-key": "edit.reservedKey",
  "too-large": "edit.tooLarge",
  "not-a-boolean": "edit.notABoolean",
  custom: "edit.custom",
};
