import {
  tripleKey,
  type Entity,
  type NodeRecord,
  type Triple,
} from "../data/merge";
import type { Graph } from "../data/normalize";
import { isRetired } from "../data/records";
import {
  fieldOf,
  valueOf,
  type CellChange,
  type Edit,
  type Field,
  type RowKind,
  type RowRef,
} from "./types";

// why: STORY-008-01 rule 2 (LEARNINGS 27) — an edge row is named by the key of its triple in the
// base graph; each edited graph keeps that key list, so `sameValueRows` and `checkEdit` find the
// row after its key changed (memo 2026-10-29-implementer-story-01-build)
const baseKeys = new WeakMap<Graph, readonly string[]>();

export function baseKeysOf(graph: Graph): readonly string[] {
  return baseKeys.get(graph) ?? graph.triples.map((triple) => triple.key);
}

export function locate(
  graph: Graph,
  row: RowRef,
): { kind: RowKind; index: number } {
  const found =
    "record" in row
      ? {
          kind: "node" as const,
          index: graph.records.findIndex((item) => item.id === row.record),
        }
      : { kind: "edge" as const, index: baseKeysOf(graph).indexOf(row.triple) };
  if (found.index < 0) throw new Error("The row is not in the graph.");
  return found;
}

type Work = {
  records: NodeRecord[];
  entities: Entity[];
  triples: Triple[];
  recordAt: ReadonlyMap<string, number>;
  tripleAt: ReadonlyMap<string, number>;
  entityAt: ReadonlyMap<string, number>;
  entityIds: ReadonlySet<string>;
  touched: Set<number>;
  unshaped: { records: Set<string>; triples: Set<string> };
};

function workOf(base: Graph, keys: readonly string[]): Work {
  const entityAt = new Map<string, number>();
  base.entities.forEach((entity, index) => {
    for (const id of entity.records) entityAt.set(id, index);
  });
  return {
    records: [...base.records],
    entities: [...base.entities],
    triples: [...base.triples],
    recordAt: new Map(base.records.map((record, index) => [record.id, index])),
    tripleAt: new Map(keys.map((key, index) => [key, index])),
    entityAt,
    entityIds: new Set(base.entities.map((entity) => entity.id)),
    touched: new Set(),
    unshaped: { records: new Set(), triples: new Set() },
  };
}

// why: STORY-008-01 rule 4 (LEARNINGS 68) — a spread with a computed key and `Object.fromEntries`
// make an own data property, also for `__proto__`; `after: undefined` removes the key (FR-CELL-5)
function withKey<T extends object>(target: T, key: string, value: unknown): T {
  if (value !== undefined) return { ...target, [key]: value };
  return Object.fromEntries(
    Object.entries(target).filter(([name]) => name !== key),
  ) as T;
}

function fits(work: Work, field: Field, after: unknown): boolean {
  if (field.attr) return true;
  switch (field.key) {
    case "label":
    case "predicate":
      return typeof after === "string";
    case "subject":
    case "object":
      return typeof after === "string" && work.entityIds.has(after);
    case "isActive":
      return after === undefined || typeof after === "boolean";
    default:
      return after === undefined || typeof after === "string";
  }
}

// why: PRD-002 FR-CELL-1, SA §5 Errors — a list or object attribute cell is read-only, and a value
// that the field cannot hold is a programmer error (the shell runs `checkEdit` first)
function guard(work: Work, field: Field, current: unknown, after: unknown) {
  if (field.attr && typeof current === "object" && current !== null)
    throw new Error("The cell is read-only.");
  if (!fits(work, field, after))
    throw new Error("The value does not fit the field.");
}

// why: PRD-002 FR-CELL-8 rules over STORY-008-01 rule 4 (lead 2026-10-29) — a typed kind, predicate
// or end is the user's value, so its record or triple leaves the shaped set and resolves `custom`
const SHAPED_FIELDS = new Set(["type", "predicate", "subject", "object"]);

// why: PRD-002 FR-CELL-7, FR-CELL-8 addendum 0.3 — the merge never runs again; the entity takes
// the newest saved name or kind; the edit removes the AI reason of the field
function nodeChange(work: Work, index: number, field: Field, after: unknown) {
  const record = work.records[index];
  if (!field.attr && SHAPED_FIELDS.has(field.key))
    work.unshaped.records.add(record.id);
  const inferred = Object.hasOwn(record.inferred, field.key)
    ? withKey(record.inferred, field.key, undefined)
    : record.inferred;
  const next = field.attr
    ? { ...record, attrs: withKey(record.attrs, field.key, after) }
    : withKey(record, field.key, after);
  work.records[index] = { ...next, inferred };
  if (field.attr) return;
  const at = work.entityAt.get(record.id) as number;
  work.entities[at] = withKey(work.entities[at], field.key, after);
}

function edgeChange(work: Work, index: number, field: Field, after: unknown) {
  const triple = work.triples[index];
  if (!field.attr && SHAPED_FIELDS.has(field.key))
    work.unshaped.triples.add(triple.key);
  const next = field.attr
    ? { ...triple, attrs: withKey(triple.attrs, field.key, after) }
    : withKey(triple, field.key, after);
  const predicate = !field.attr && field.key === "predicate";
  work.triples[index] = predicate ? withKey(next, "inferred", undefined) : next;
  work.touched.add(index);
}

function applyChange(work: Work, change: CellChange) {
  const { row, after } = change;
  const kind: RowKind = "triple" in row ? "edge" : "node";
  const index =
    "triple" in row
      ? work.tripleAt.get(row.triple)
      : work.recordAt.get(row.record);
  if (index === undefined) throw new Error("The row is not in the graph.");
  const field = fieldOf(kind, change.column);
  const target = kind === "edge" ? work.triples[index] : work.records[index];
  guard(work, field, valueOf(target, field), after);
  if (kind === "edge") edgeChange(work, index, field, after);
  else nodeChange(work, index, field, after);
}

const moved = (base: Triple, triple: Triple) =>
  base.subject !== triple.subject ||
  base.predicate !== triple.predicate ||
  base.object !== triple.object;

// why: STORY-008-01 rule 4, PRD-001 FR-QDIC-5 — only a moved triple gets a new key: its triad, or
// the first free variant number; the other triples keep their keys, so every key stays unique
function rekey(base: readonly Triple[], triples: Triple[]) {
  const used = new Set(
    triples.filter((triple, i) => !moved(base[i], triple)).map((t) => t.key),
  );
  triples.forEach((triple, index) => {
    if (!moved(base[index], triple)) return;
    const triad = [triple.subject, triple.predicate, triple.object];
    let variant = 0;
    while (used.has(tripleKey(triad, variant))) variant++;
    const key = tripleKey(triad, variant);
    used.add(key);
    triples[index] = { ...triple, key };
  });
}

// why: SA §4.8 and addendum 0.29, D18 — the edits are an overlay over the base graph: the base never
// changes, the record and triple order and count stay (FR-CELL-10), and `now` is the date that
// `normalize` got, so the engine reads no clock
export function applyEdits(
  base: Graph,
  edits: readonly Edit[],
  now: string,
): Graph {
  const keys = baseKeysOf(base);
  const work = workOf(base, keys);
  for (const edit of edits)
    for (const change of edit.changes) applyChange(work, change);
  for (const index of work.touched) {
    const triple = work.triples[index];
    work.triples[index] = { ...triple, retired: isRetired(triple, now) };
  }
  rekey(base.triples, work.triples);
  const { unshaped } = work;
  const graph: Graph = {
    records: work.records,
    entities: work.entities,
    triples: work.triples,
    shapedSet: {
      records: base.shapedSet.records.filter((id) => !unshaped.records.has(id)),
      triples: base.shapedSet.triples.filter(
        (key) => !unshaped.triples.has(key),
      ),
    },
  };
  baseKeys.set(graph, keys);
  return graph;
}
