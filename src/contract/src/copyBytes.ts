import { CAPS } from "./caps";
import { defaultsSchema, edgeSchema, nodeSchema, shapeHint } from "./input";
import { at, EDGE_LISTS, isRecord, own, type Path, type Raw } from "./raw";
import { countedNodeLists } from "./shapeTrigger";

type Term = { path: Path; value: string | undefined; records: number };

const encoder = new TextEncoder();

function items(raw: Raw, lists: Path[]): unknown[] {
  return lists.flatMap((path) => {
    const list = at(raw, path);
    return Array.isArray(list) ? (list as unknown[]) : [];
  });
}

function untyped(item: unknown): boolean {
  const node = nodeSchema.parse(item);
  if (node === null) return false;
  if (Array.isArray(node)) return node[1] === undefined;
  return node.type === undefined && node.nodeType === undefined;
}

function noPredicate(item: unknown): boolean {
  const edge = edgeSchema.parse(item);
  return edge !== null && !Array.isArray(edge) && edge.predicate === undefined;
}

function defaultTerms(raw: Raw): Term[] {
  const defaults = defaultsSchema.safeParse(own(raw, "defaults"));
  if (!defaults.success) return [];
  return [
    {
      path: ["defaults", "type"],
      value: defaults.data.type,
      records: items(raw, countedNodeLists(raw)).filter(untyped).length,
    },
    {
      path: ["defaults", "predicate"],
      value: defaults.data.predicate,
      records: items(raw, EDGE_LISTS).filter(noPredicate).length,
    },
  ];
}

// why: lead decisions D38 and D52 — a hint value is a key only when it is an own key of a plain
// first row; Object.hasOwn is never called on null or undefined
function hintTerms(raw: Raw): Term[] {
  const hint = shapeHint.safeParse(own(raw, "shape"));
  if (!hint.success || hint.data?.kind !== "rows") return [];
  const nodes = own(raw, "nodes");
  const rows = Array.isArray(nodes) ? nodes.length : 0;
  const first: unknown = Array.isArray(nodes) ? nodes[0] : undefined;
  const literal = (value: string | undefined) =>
    value !== undefined && isRecord(first) && Object.hasOwn(first, value)
      ? undefined
      : value;
  return [
    {
      path: ["shape", "type"],
      value: literal(hint.data.type),
      records: Math.min(2 * rows, CAPS.nodes),
    },
    {
      path: ["shape", "predicate"],
      value: literal(hint.data.predicate),
      records: Math.min(rows, CAPS.edges),
    },
  ];
}

function bytes({ value, records }: Term): number {
  if (value === undefined) return 0;
  return encoder.encode(JSON.stringify(value)).length * records;
}

// why: PRD FR-DATA-8 and SA §4.1 — 256 KB of canonical JSON per render also bounds each value
// that the engine copies into many records (lead decision D10, SA ruling S4, PO ruling P7)
export function copyBytes(raw: unknown): { sum: number; path: Path | null } {
  if (!isRecord(raw)) return { sum: 0, path: null };
  let sum = 0;
  let largest = 0;
  let path: Path | null = null;
  for (const term of [...defaultTerms(raw), ...hintTerms(raw)]) {
    const size = bytes(term);
    sum += size;
    if (size > largest) {
      largest = size;
      path = term.path;
    }
  }
  return { sum, path };
}
