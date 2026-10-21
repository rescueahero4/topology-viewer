import {
  entityOfRecord,
  fold,
  type Graph,
  type Lang,
  type NodeRecord,
  type OnCanvas,
  type Triple,
  type Vocab,
} from "@qdic-topology/engine";
import { cellText } from "./workbenchColumns";

type NodeRow = {
  rtype: "node";
  index: number;
  id: string;
  entity: string;
  type: string | null;
  name: string;
  record: NodeRecord;
};

type EdgeRow = {
  rtype: "edge";
  index: number;
  id: string;
  subject: string;
  object: string;
  subjectLabel: string;
  objectLabel: string;
  predicate: string;
  family: string;
  triple: Triple;
};

export type Row = NodeRow | EdgeRow;

// why: rule 2, open question 1 (Product Owner, epic review) — the parts of an edge-row ID join
// with a middle dot; a repeat number follows the same join
const PART = " · ";

const built = new WeakMap<Graph, readonly Row[]>();

function nodeRows(graph: Graph, vocab: Vocab): NodeRow[] {
  const owner = entityOfRecord(graph);
  return graph.records.map((record, index) => {
    const entity = owner(record.id) ?? record.id;
    return {
      rtype: "node",
      index,
      id: record.id,
      entity,
      type: vocab.entities.get(entity)?.type ?? null,
      name: record.label,
      record,
    };
  });
}

// why: rule 2 (Security build condition) — the ID comes from the `Triple` fields; the repeat number
// is the place of the triple among the triples with the same three parts in `graph.triples`, so
// nothing parses `Triple.key` and nothing can throw
function edgeRows(graph: Graph, vocab: Vocab, start: number): EdgeRow[] {
  const seen = new Map<string, number>();
  const label = (id: string) => vocab.entities.get(id)?.label ?? id;
  return graph.triples.map((triple, at) => {
    const { subject, predicate, object } = triple;
    const parts = JSON.stringify([subject, predicate, object]);
    const place = (seen.get(parts) ?? 0) + 1;
    seen.set(parts, place);
    const id = [subject, predicate, object].join(PART);
    return {
      rtype: "edge",
      index: start + at,
      id: place === 1 ? id : `${id}${PART}${place}`,
      subject,
      object,
      subjectLabel: label(subject),
      objectLabel: label(object),
      predicate,
      family: vocab.predicates.get(predicate)?.family ?? "",
      triple,
    };
  });
}

// why: rule 1, Security notes — one node row per graph record, then one edge row per triple, in
// the graph order; built once for each input
export function rowsOf(graph: Graph, vocab: Vocab): readonly Row[] {
  let rows = built.get(graph);
  if (rows === undefined) {
    const nodes = nodeRows(graph, vocab);
    rows = [...nodes, ...edgeRows(graph, vocab, nodes.length)];
    built.set(graph, rows);
  }
  return rows;
}

type Lookup = { onCanvas(id: string): OnCanvas };

// why: rule 3 (mockup `drawnRow`, `hiddenRow`, app.js lines 1004-1006) — an edge row is hidden when
// an end is hidden, drawn when both ends are on the canvas (drawn or faded), else not drawn
export function rowState(row: Row, lookup: Lookup): OnCanvas {
  if (row.rtype === "node") return lookup.onCanvas(row.id);
  const ends = [lookup.onCanvas(row.subject), lookup.onCanvas(row.object)];
  if (ends.includes("hidden")) return "hidden";
  return ends.every((s) => s === "drawn" || s === "faded")
    ? "drawn"
    : "not-drawn";
}

export const onTheCanvas = (state: OnCanvas) =>
  state === "drawn" || state === "faded";

// why: rule 7 — the entity ids of a row: its record's entity, or the two ends of a triple
export const entitiesOf = (row: Row): string[] =>
  row.rtype === "node" ? [row.entity] : [row.subject, row.object];

export type Scope = "all" | "canvas" | "hidden";
export type RowType = "both" | "nodes" | "edges";

export type Filters = {
  scope: Scope;
  rowType: RowType;
  kinds: ReadonlySet<string | null>;
  families: ReadonlySet<string>;
  query: string;
};

// why: a typed query never holds this character, so no match spans two texts of a row
const APART = "\u0000";
const haystacks = new WeakMap<readonly Row[], Map<Lang, readonly string[]>>();

// why: rule 4 (mockup `applyWbFilters`, app.js line 1055) — the texts that the search reads, folded
// as the STORY-004-03 picker search: the id, the name, the system, the predicate, the labels and
// ids of both ends and the family (its key and its name in the UI language)
function textsOf(lang: Lang, vocab: Vocab, row: Row): string[] {
  if (row.rtype === "node")
    return [row.id, row.name, cellText(lang, vocab, { core: "system" }, row)];
  const family = cellText(lang, vocab, { core: "family" }, row);
  return [
    ...[row.id, row.predicate, row.subjectLabel, row.objectLabel],
    ...[row.subject, row.object, row.family, family],
  ];
}

export function searchTexts(rows: readonly Row[], lang: Lang, vocab: Vocab) {
  let byLang = haystacks.get(rows);
  if (byLang === undefined) {
    byLang = new Map();
    haystacks.set(rows, byLang);
  }
  let texts = byLang.get(lang);
  if (texts === undefined) {
    texts = rows.map((row) => fold(textsOf(lang, vocab, row).join(APART)));
    byLang.set(lang, texts);
  }
  return texts;
}

type View = { states: readonly OnCanvas[]; texts: readonly string[] };

// why: rule 4 — all filters AND; Kind holds only node rows back and Family only edge rows (mockup
// app.js lines 1052-1054); "On canvas" is drawn or faded (SA §6 row 11)
export function keeps(filters: Filters, view: View, row: Row): boolean {
  const { scope, rowType, kinds, families, query } = filters;
  const node = row.rtype === "node";
  if (rowType !== "both" && (rowType === "nodes") !== node) return false;
  const state = view.states[row.index];
  if (scope === "canvas" && !onTheCanvas(state)) return false;
  if (scope === "hidden" && state !== "hidden") return false;
  if (node && kinds.size > 0 && !kinds.has(row.type)) return false;
  if (!node && families.size > 0 && !families.has(row.family)) return false;
  return query === "" || view.texts[row.index].includes(query);
}
