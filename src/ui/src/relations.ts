import {
  pairingsOf,
  type DrawnEdge,
  type DrawnId,
  type DrawnNode,
  type Frontier,
  type Graph,
  type GroupNode,
  type Lang,
  type Triple,
  type Vocab,
} from "@qdic-topology/engine";
import { valueText } from "./formatValue";
import { typeName } from "./names";
import { rendererText } from "./rendererText";
import { MISSING, t } from "./strings/index";

export type Direction = "out" | "in";
export type Relation = {
  edge: DrawnEdge;
  direction: Direction;
  other: DrawnId;
};
export type FamilyBlock = { family: string; rows: Relation[] };
export type Nodes = ReadonlyMap<DrawnId, DrawnNode>;

// why: rule 5 (Security gap 1, LEARNINGS 22) — at most 20 triples give lines, then "N more"; a value,
// a key and a line stop at 1,000 characters, as the STORY-004-04 value rule
const LINE_CAP = 20;
const TEXT_LIMIT = 1000;
const CUT = "…";
const PART = " · ";
// why: STORY-004-01 Rule H — the profile word for "every type" stays `any`; the shell names it
const ANY = "any";

const cut = (text: string) =>
  text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT - 1)}${CUT}` : text;

export const isGroup = (node: DrawnNode): node is GroupNode =>
  "members" in node;

// why: rule 1, questions 8 and 9 (mockup `relationsOf`, lib/topology.js lines 2074-2081) — one row
// per drawn edge of the node, in frontier edge order; the subject test comes first, so a self-loop
// gives one "out" row
export function relationsOf(frontier: Frontier, id: DrawnId): Relation[] {
  const rows: Relation[] = [];
  for (const edge of frontier.edges) {
    if (edge.subject === id)
      rows.push({ edge, direction: "out", other: edge.object });
    else if (edge.object === id)
      rows.push({ edge, direction: "in", other: edge.subject });
  }
  return rows;
}

// why: rule 2 (mockup app.js line 721) — the rows and the distinct other ends
export function countsOf(rows: readonly Relation[]) {
  return { rows: rows.length, ends: new Set(rows.map((r) => r.other)).size };
}

// why: rule 4 — one block per family in the `vocab.families` order
export function familyBlocks(
  vocab: Vocab,
  rows: readonly Relation[],
): FamilyBlock[] {
  const order = new Map(vocab.families.map((family, i) => [family.key, i]));
  const blocks = new Map<string, Relation[]>();
  for (const row of rows) {
    const family = vocab.predicates.get(row.edge.predicate)?.family ?? "";
    const list = blocks.get(family) ?? [];
    list.push(row);
    blocks.set(family, list);
  }
  const place = (family: string) => order.get(family) ?? order.size;
  return [...blocks]
    .map(([family, list]) => ({ family, rows: list }))
    .sort((a, b) => place(a.family) - place(b.family));
}

// why: the canvas group text: `RendererText.groupLabel` of the type display name and the count;
// STORY-004-06 names a hidden group row and a group root with it (rules 1, 2)
export function groupText(
  lang: Lang,
  vocab: Vocab,
  type: string | null,
  count: number,
): string {
  return rendererText(lang).groupLabel(
    typeName(lang, type, vocab.types),
    count,
  );
}

// why: rule 5 (Implementer item 4) — an entity end shows its label; a group end the canvas text
export function endName(lang: Lang, vocab: Vocab, node: DrawnNode | undefined) {
  if (node === undefined) return MISSING;
  if (!isGroup(node)) return node.label;
  return groupText(lang, vocab, node.type, node.count);
}

const endsOf = (node: DrawnNode | undefined): ReadonlySet<string> =>
  new Set(
    node === undefined ? [] : isGroup(node) ? node.members : [node.entity],
  );

function hasAttrs(attrs: Triple["attrs"]): boolean {
  for (const key in attrs) if (Object.hasOwn(attrs, key)) return true;
  return false;
}

const hasParts = (triple: Triple) =>
  hasAttrs(triple.attrs) ||
  triple.isActive !== undefined ||
  triple.validFrom !== undefined ||
  triple.validTo !== undefined;

// why: FR-QDIC-5 — the attributes, then the validity and `isActive` of one triple; the walk stops
// when the line is full, so a triple with many keys does no more work
function tripleLine(lang: Lang, triple: Triple): string {
  const parts: string[] = [];
  let length = 0;
  const add = (name: string, value: unknown) => {
    const part = t(lang, "relations.attr", {
      name: cut(name),
      value: cut(valueText(lang, value)),
    });
    parts.push(part);
    length += part.length + PART.length;
  };
  for (const key in triple.attrs) {
    if (length > TEXT_LIMIT) break;
    if (Object.hasOwn(triple.attrs, key)) add(key, triple.attrs[key]);
  }
  if (triple.isActive !== undefined)
    add(t(lang, "relations.isActive"), triple.isActive);
  if (triple.validFrom !== undefined)
    add(t(lang, "relations.validFrom"), triple.validFrom);
  if (triple.validTo !== undefined)
    add(t(lang, "relations.validTo"), triple.validTo);
  return cut(parts.join(PART));
}

// why: rule 5 (Implementer item 3) — the triples behind a row have the row predicate and go from
// the subject end to the object end; a group end gives each of its members
export function attributeLines(
  lang: Lang,
  graph: Graph,
  nodes: Nodes,
  edge: DrawnEdge,
): string[] {
  const subjects = endsOf(nodes.get(edge.subject));
  const objects = endsOf(nodes.get(edge.object));
  const lines: string[] = [];
  let more = 0;
  for (const triple of graph.triples) {
    if (triple.predicate !== edge.predicate) continue;
    if (!subjects.has(triple.subject) || !objects.has(triple.object)) continue;
    if (!hasParts(triple)) continue;
    if (lines.length < LINE_CAP) lines.push(tripleLine(lang, triple));
    else more++;
  }
  if (more > 0) lines.push(t(lang, "relations.more", { count: more }));
  return lines;
}

// why: rule 10 (a), FR-QDIC-8 — the profile pairings of the predicate by their display names
export function allowedLine(lang: Lang, vocab: Vocab, predicate: string) {
  const pairs = pairingsOf(predicate);
  if (pairs.length === 0) return null;
  const name = (type: string) =>
    type === ANY
      ? t(lang, "relations.anyType")
      : typeName(lang, type, vocab.types);
  const text = pairs
    .map((pair) =>
      t(lang, "relations.pair", {
        subject: name(pair.subject),
        object: name(pair.object),
      }),
    )
    .join(", ");
  return t(lang, "relations.allowed", { pairs: text });
}

// why: rules 5 and 10 (a), questions 20, FR-QDIC-3, FR-QDIC-7 — the lines of the predicate tip, made
// only when the tip opens
export function predicateLines(
  lang: Lang,
  model: { graph: Graph; vocab: Vocab },
  nodes: Nodes,
  edge: DrawnEdge,
): string[] {
  const name = edge.predicate;
  const predicate = model.vocab.predicates.get(name);
  const inverse = predicate?.inverse ?? null;
  const lines = [
    inverse === null ? name : t(lang, "relations.inverse", { name, inverse }),
  ];
  if (predicate?.builtIn === true) lines.push(t(lang, "inspector.builtIn"));
  if (predicate?.retired === true) lines.push(t(lang, "inspector.retired"));
  lines.push(...attributeLines(lang, model.graph, nodes, edge));
  const allowed = allowedLine(lang, model.vocab, name);
  if (allowed !== null) lines.push(allowed);
  return lines;
}
