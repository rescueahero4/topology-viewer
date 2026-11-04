import { columnConfig, columnConfigs, columnsOnly, publicRow } from "./tableConfig";
import {
  attributeSet,
  type AttrEntry,
  type Graph,
  type Lang,
  type OnCanvas,
  type Triple,
  type Vocab,
} from "#engine";
import { valueText } from "./formatValue";
import { familyName, typeName } from "./names";
import { t, type Key } from "./strings/index";
import type { Row } from "./workbenchRows";

type CoreKey =
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

export type Column = { core: CoreKey } | { attr: string };

// why: rule 2 — the core columns after the tick column, in this order
export const CORE: readonly CoreKey[] = [
  "canvas",
  "id",
  "type",
  "kind",
  "name",
  "system",
  "description",
  "predicate",
  "subject",
  "object",
  "family",
  "attributes",
];

const NAMES: Readonly<Record<CoreKey, Key>> = {
  canvas: "wb.col.canvas",
  id: "wb.col.id",
  type: "wb.col.type",
  kind: "wb.col.kind",
  name: "wb.col.name",
  system: "wb.col.system",
  description: "wb.col.description",
  predicate: "wb.col.predicate",
  subject: "wb.col.subject",
  object: "wb.col.object",
  family: "wb.col.family",
  attributes: "wb.col.attributes",
};

export const coreName = (lang: Lang, key: CoreKey) =>
  columnConfigs().find((one) => one.core === key)?.label ?? t(lang, NAMES[key]);

export const attrName = (key: string) =>
  columnConfigs().find((one) => one.attr === key)?.label ?? key;

// why: rule 2, epic question 24 (Security round 4, Product Owner 2026-10-21) — the attribute
// columns with the most coverage show at first; the others start off in the "Columns" menu
const FIRST_SHOWN = 20;

// why: rule 2 — the keys of the core columns and the inspector rule for `_` keys (mockup app.js
// line 752) have no attribute column
const CORE_ATTRS = new Set(["service_name", "description"]);

const coverages = new WeakMap<Graph, readonly string[]>();

// why: rule 2 (Security round 4; STORY-004-02 rule 16) — the count is a `Map` of own keys, so
// `constructor` or `toString` is a normal key; most coverage first, a tie in the order of first
// appearance (`Map` order and a stable sort); one pass for each input
export function attributeKeys(graph: Graph): readonly string[] {
  let keys = coverages.get(graph);
  if (keys === undefined) {
    const coverage = new Map<string, number>();
    for (const record of graph.records)
      for (const key of Object.keys(record.attrs))
        if (!CORE_ATTRS.has(key) && !key.startsWith("_"))
          coverage.set(key, (coverage.get(key) ?? 0) + 1);
    const count = (key: string) => coverage.get(key) ?? 0;
    keys = [...coverage.keys()].sort((a, b) => count(b) - count(a));
    coverages.set(graph, keys);
  }
  return keys;
}

export type Choice = {
  core: ReadonlyMap<CoreKey, boolean>;
  attrs: ReadonlyMap<string, boolean>;
};

export const NO_CHOICE: Choice = { core: new Map(), attrs: new Map() };

// why: rule 12 — the session choice over the rule 2 default: every core column, and the first 20
// attribute keys in coverage order
export const attrShown = (choice: Choice, key: string, at: number) =>
  choice.attrs.get(key) ?? at < FIRST_SHOWN;

export function shownColumns(keys: readonly string[], choice: Choice) {
  const configs = columnConfigs();
  const off = (column: Column) => columnConfig(column)?.hidden === true;
  if (columnsOnly())
    return configs.flatMap((one): Column[] => {
      if (one.hidden === true) return [];
      if (one.core !== undefined) {
        const key = one.core as CoreKey;
        return (choice.core.get(key) ?? true) ? [{ core: key }] : [];
      }
      if (one.attr === undefined) return [];
      return (choice.attrs.get(one.attr) ?? true) ? [{ attr: one.attr }] : [];
    });
  const core = CORE.filter(
    (key) => (choice.core.get(key) ?? true) && !off({ core: key }),
  );
  const attrs = keys.filter(
    (key, at) => attrShown(choice, key, at) && !off({ attr: key }),
  );
  // A column of the developer that the data does not have, such as a computed one.
  for (const one of configs)
    if (
      one.attr !== undefined &&
      one.hidden !== true &&
      !keys.includes(one.attr) &&
      (choice.attrs.get(one.attr) ?? true)
    )
      attrs.push(one.attr);
  return [
    ...core.map((key): Column => ({ core: key })),
    ...attrs.map((key): Column => ({ attr: key })),
  ];
}

const own = (attrs: Readonly<Record<string, unknown>>, key: string) =>
  Object.hasOwn(attrs, key) ? attrs[key] : undefined;

const NAMED: Readonly<Record<string, Key>> = {
  valid_from: "wb.validFrom",
  valid_to: "wb.validTo",
  isActive: "wb.isActive",
};

// why: rule 2 (FR-QDIC-5) — the set of the row (SA §4.8 addendum 0.33 (6) `attributeSet`): the
// attributes in record key order, then `valid_from`, `valid_to` and `isActive` when the triple has
// them; each value by the STORY-004-04 value rule
function setText(lang: Lang, set: readonly AttrEntry[]): string {
  return set
    .map(([key, value]) =>
      t(lang, "wb.pair", {
        key: Object.hasOwn(NAMED, key) ? t(lang, NAMED[key]) : key,
        value: valueText(lang, value),
      }),
    )
    .join(t(lang, "wb.join"));
}

export const attributesText = (lang: Lang, triple: Triple) =>
  setText(lang, attributeSet("edge", triple));

// why: SA §4.8 addendum 0.33 (3) — the Type label; `node` or `edge` shows as the UI word
function typeText(lang: Lang, row: Row): string {
  const label =
    (row.rtype === "node" ? row.record.typeLabel : row.triple.typeLabel) ??
    row.rtype;
  if (label === "node") return t(lang, "wb.node");
  return label === "edge" ? t(lang, "wb.edge") : label;
}

function nodeText(lang: Lang, vocab: Vocab, key: CoreKey, row: Row): string {
  if (row.rtype !== "node") return "";
  if (key === "kind") return typeName(lang, row.type, vocab.types);
  if (key === "name") return row.name;
  if (key === "system")
    return valueText(lang, own(row.record.attrs, "service_name"));
  if (key === "description")
    return valueText(lang, own(row.record.attrs, "description"));
  if (key === "attributes")
    return setText(lang, attributeSet("node", row.record));
  return "";
}

function edgeText(lang: Lang, key: CoreKey, row: Row): string {
  if (row.rtype !== "edge") return "";
  if (key === "system")
    return valueText(lang, own(row.triple.attrs, "service_name"));
  if (key === "description")
    return valueText(lang, own(row.triple.attrs, "description"));
  if (key === "name" || key === "predicate") return row.predicate;
  if (key === "subject") return row.subjectLabel;
  if (key === "object") return row.objectLabel;
  if (key === "family") return familyName(lang, row.family);
  if (key === "attributes") return attributesText(lang, row.triple);
  return "";
}

// why: rules 2, 5 — the text of a cell; the sort reads the same text
export function cellText(lang: Lang, vocab: Vocab, column: Column, row: Row) {
  const config = columnConfig(column);
  if (config?.value === undefined && config?.format === undefined)
    return baseText(lang, vocab, column, row);
  const shown = publicRow(row);
  const value =
    config.value === undefined
      ? baseText(lang, vocab, column, row)
      : config.value(shown);
  return config.format === undefined
    ? valueText(lang, value)
    : config.format(value, shown);
}

function baseText(lang: Lang, vocab: Vocab, column: Column, row: Row) {
  if ("attr" in column)
    return row.rtype === "node"
      ? valueText(lang, own(row.record.attrs, column.attr))
      : "";
  const key = column.core;
  if (key === "id") return row.shownId;
  if (key === "type") return typeText(lang, row);
  return row.rtype === "node"
    ? nodeText(lang, vocab, key, row)
    : edgeText(lang, key, row);
}

export type Sort = { column: Column; dir: 1 | -1 } | null;

// why: mockup Canvas column `get` (app.js line 1020) — drawn (and faded, on the canvas) first,
// then not drawn, then hidden
const RANK: Readonly<Record<OnCanvas, number>> = {
  drawn: 0,
  faded: 0,
  "not-drawn": 1,
  hidden: 2,
};

const collators = new Map<Lang, Intl.Collator>();
function collatorOf(lang: Lang): Intl.Collator {
  let collator = collators.get(lang);
  if (collator === undefined) {
    collator = new Intl.Collator(lang, { numeric: true });
    collators.set(lang, collator);
  }
  return collator;
}

// why: rule 5 — ascending or descending by `Intl.Collator(lang, { numeric: true })`; a stable sort,
// so equal cells keep the default order
export function sortRows(
  rows: readonly Row[],
  sort: Sort,
  view: { lang: Lang; vocab: Vocab; states: readonly OnCanvas[] },
): readonly Row[] {
  if (sort === null) return rows;
  const { lang, vocab, states } = view;
  const { column, dir } = sort;
  if ("core" in column && column.core === "canvas")
    return [...rows].sort(
      (a, b) => (RANK[states[a.index]] - RANK[states[b.index]]) * dir,
    );
  const texts = rows.map((row) => cellText(lang, vocab, column, row));
  const order = rows.map((_, at) => at);
  const compare = collatorOf(lang).compare;
  order.sort((a, b) => compare(texts[a], texts[b]) * dir);
  return order.map((at) => rows[at]);
}

export const columnKey = (column: Column) =>
  "core" in column ? column.core : `attr:${column.attr}`;

export const sameColumn = (a: Column, b: Column) =>
  "core" in a
    ? "core" in b && a.core === b.core
    : "attr" in b && a.attr === b.attr;
