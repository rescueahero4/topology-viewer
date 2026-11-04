import type { NodeRecord, Triple } from "../data/merge";
import type { DrawnId } from "../state/canvasState";

export type CoreColumn =
  | "canvas"
  | "id"
  | "type"
  | "kind"
  | "name"
  | "system"
  | "description"
  | "predicate"
  | "subject"
  | "object"
  | "family"
  | "attributes";

export type EditColumn = CoreColumn | { attr: string } | { fact: string };

export type RowRef = { record: string } | { triple: string };

export type CellChange = {
  row: RowRef;
  column: EditColumn;
  before: unknown;
  after: unknown;
};

export type EditEffect = { drew: DrawnId[]; undrew: DrawnId[] };

export type Edit = { changes: readonly CellChange[]; effect: EditEffect };

export type EditCode =
  | "empty"
  | "self-edge"
  | "not-a-number"
  | "not-a-date"
  | "inverse-name"
  | "duplicate-id"
  | "bad-syntax"
  | "bad-json"
  | "bad-xml"
  | "empty-key"
  | "duplicate-key"
  | "reserved-key"
  | "too-large"
  | "not-a-boolean"
  // A message from the `validate` option of the developer.
  | "custom";

export type ValueKind =
  "text" | "number" | "boolean" | "date" | "list" | "object";

export type RowKind = "node" | "edge";

export type Field = { key: string; attr: boolean };

// why: SA §4.8 addendum 0.33 (1)-(3), (5) — the ID and the Type label are overlay fields over the
// stable ids; the Family of an edge row is the family of its predicate (`Graph.familyEdits`)
const SHARED: [CoreColumn, Field][] = [
  ["id", { key: "shownId", attr: false }],
  ["type", { key: "typeLabel", attr: false }],
];

const NODE = new Map<CoreColumn, Field>([
  ...SHARED,
  ["kind", { key: "type", attr: false }],
  ["name", { key: "label", attr: false }],
  ["system", { key: "service_name", attr: true }],
  ["description", { key: "description", attr: true }],
]);

// why: PRD-002 FR-CELL-1 — on an edge row, Name and Predicate are one value
const EDGE = new Map<CoreColumn, Field>([
  ...SHARED,
  ["family", { key: "family", attr: false }],
  // why: SA §4.8 addendum 0.33.1 — edge System and Description are edge attributes
  ["system", { key: "service_name", attr: true }],
  ["description", { key: "description", attr: true }],
  ["name", { key: "predicate", attr: false }],
  ["predicate", { key: "predicate", attr: false }],
  ["subject", { key: "subject", attr: false }],
  ["object", { key: "object", attr: false }],
]);

// why: STORY-008-01 rule 3 — the three edge facts that the triple holds outside `attrs`
const FACTS = new Map([
  ["valid_from", "validFrom"],
  ["valid_to", "validTo"],
  ["isActive", "isActive"],
]);

// why: STORY-008-01 rule 3, SA §5 Errors — a column of the other row type or a read-only column
// is a programmer error
export function fieldOf(row: RowKind, column: EditColumn): Field {
  if (typeof column === "string") {
    const field = (row === "node" ? NODE : EDGE).get(column);
    if (field !== undefined) return field;
  } else if (row === "node" && Object.hasOwn(column, "attr"))
    return { key: (column as { attr: string }).attr, attr: true };
  else if (row === "edge" && Object.hasOwn(column, "fact")) {
    const { fact } = column as { fact: string };
    const key = FACTS.get(fact);
    return key === undefined ? { key: fact, attr: true } : { key, attr: false };
  }
  throw new Error("The column is not editable on this row type.");
}

export function valueOf(target: NodeRecord | Triple, field: Field): unknown {
  const holder: object = field.attr ? target.attrs : target;
  return Object.hasOwn(holder, field.key)
    ? (holder as Record<string, unknown>)[field.key]
    : undefined;
}
