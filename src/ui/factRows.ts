import {
  slotKeys,
  type Graph,
  type Lang,
  type NodeRecord,
  type Payload,
} from "#engine";
import type { CanvasModel } from "./canvas/index";
import { isKey, t } from "./strings/index";

export type Attribute = {
  key: string;
  label: string;
  why?: string;
  value: unknown;
  inferred?: string;
};

export type FactRow =
  | { kind: "records"; ids: readonly string[] }
  | ({ kind: "attribute" } & Attribute);

// why: mockup `genericRows` skip lists — generic mode leaves out these keys (app.js line 752), and
// "Other attributes" leaves out `is_lost` (its own line) and `asset_type` (line 753)
const GENERIC_SKIP = new Set([
  "description",
  "service_name",
  "is_lost",
  "name",
]);
const OTHER_SKIP = new Set(["is_lost", "asset_type"]);
const PRIVATE = "_";

const byGraph = new WeakMap<Graph, ReadonlyMap<string, NodeRecord>>();

function recordsOf(graph: Graph): ReadonlyMap<string, NodeRecord> {
  let known = byGraph.get(graph);
  if (known === undefined) {
    known = new Map(graph.records.map((record) => [record.id, record]));
    byGraph.set(graph, known);
  }
  return known;
}

function recordIds(model: CanvasModel, entityId: string): readonly string[] {
  return model.graph.entities.find((e) => e.id === entityId)?.records ?? [];
}

export function firstRecord(
  model: CanvasModel,
  entityId: string,
): NodeRecord | undefined {
  const [first] = recordIds(model, entityId);
  return first === undefined ? undefined : recordsOf(model.graph).get(first);
}

// why: mockup `humanise` (app.js line 571) — words from camel case, `_` and `-`, first letter upper
export function humanise(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

// why: rule 7 (Security round 4) — the `fields` read and the mockup `FACT_LABELS` read take own
// keys only, so `constructor` or `toString` gives its own humanised text, never an inherited value
function labelOf(
  lang: Lang,
  payload: Payload,
  key: string,
): { label: string; why?: string } {
  const fields = payload.fields;
  const field =
    fields !== undefined && Object.hasOwn(fields, key)
      ? fields[key]
      : undefined;
  if (field?.label !== undefined && field.label !== "")
    return { label: field.label, why: field.why ?? "" };
  const fact = `fact.${key}`;
  return { label: isKey(fact) ? t(lang, fact) : humanise(key) };
}

// why: mockup `genericRows` (app.js lines 677-683) — the keys of the first record in record key
// order with a value; a key that starts with `_` is private
function attributes(
  lang: Lang,
  model: CanvasModel,
  entityId: string,
  skip: (key: string) => boolean,
): FactRow[] {
  const record = firstRecord(model, entityId);
  if (record === undefined) return [];
  return Object.entries(record.attrs)
    .filter(
      ([key, value]) =>
        value !== "" &&
        value !== null &&
        value !== undefined &&
        !key.startsWith(PRIVATE) &&
        !skip(key),
    )
    .map(([key, value]) => {
      const row: FactRow = {
        kind: "attribute",
        key,
        value,
        ...labelOf(lang, model.payload, key),
      };
      if (Object.hasOwn(record.inferred, key))
        row.inferred = record.inferred[key];
      return row;
    });
}

// why: FR-DATA-5, rule 6 — a merged entity lists its record ids first; PRD-002 FR-CELL-21 — each
// as its shown ID (SA 0.33 (2))
function recordsRow(model: CanvasModel, entityId: string): FactRow[] {
  const ids = recordIds(model, entityId);
  if (ids.length < 2) return [];
  const shown = new Map(model.graph.records.map((r) => [r.id, r.shownId]));
  return [{ kind: "records", ids: ids.map((id) => shown.get(id) ?? id) }];
}

export function genericRows(
  lang: Lang,
  model: CanvasModel,
  entityId: string,
): FactRow[] {
  return [
    ...recordsRow(model, entityId),
    ...attributes(lang, model, entityId, (key) => GENERIC_SKIP.has(key)),
  ];
}

// why: rule 4, STORY-004-01 Rule E — the keys that no slot reads, so the slot map stays in the
// profile (FR-INSPECT-4)
export function otherRows(
  lang: Lang,
  model: CanvasModel,
  entityId: string,
): FactRow[] {
  const read = slotKeys(model.vocab, model.payload, entityId);
  return [
    ...recordsRow(model, entityId),
    ...attributes(
      lang,
      model,
      entityId,
      (key) => read.has(key) || OTHER_SKIP.has(key),
    ),
  ];
}

export type FieldOption = {
  key?: string;
  label?: string;
  value?: (node: unknown) => unknown;
  format?: (value: unknown, node: unknown) => unknown;
  hidden?: boolean;
};

/**
 * The `fields` option over the rows: a field with a `key` changes or hides that row, a field with a
 * `value` adds a row, and `only` keeps just the listed fields, in their order.
 */
export function fieldRows(
  rows: readonly FactRow[],
  fields: readonly FieldOption[],
  only: boolean,
  node: unknown,
  attrs: Readonly<Record<string, unknown>>,
): FactRow[] {
  const rowOf = (key: string): (FactRow & { kind: "attribute" }) | undefined =>
    rows.find((row) => row.kind === "attribute" && row.key === key) as
      | (FactRow & { kind: "attribute" })
      | undefined;
  const made = (field: FieldOption): FactRow | null => {
    const { key = "", label, value, format } = field;
    const known = rowOf(key);
    const raw = value !== undefined ? value(node) : known?.value ?? attrs[key];
    if (value === undefined && known === undefined && !Object.hasOwn(attrs, key))
      return null;
    return {
      ...known,
      kind: "attribute",
      key,
      label: label ?? known?.label ?? humanise(key),
      value: format === undefined ? raw : format(raw, node),
    };
  };
  const shown = fields.filter((field) => field.hidden !== true);
  if (only) return shown.flatMap((field) => made(field) ?? []);
  const named = new Map(fields.flatMap((one) => (one.key === undefined ? [] : [[one.key, one]])));
  const kept = rows.flatMap((row): FactRow[] => {
    if (row.kind !== "attribute") return [row];
    const field = named.get(row.key);
    if (field === undefined) return [row];
    if (field.hidden === true) return [];
    return [made(field) ?? row];
  });
  const added = shown.filter(
    (field) => field.key === undefined || rowOf(field.key) === undefined,
  );
  return [...kept, ...added.flatMap((field) => made(field) ?? [])];
}
