import {
  profile,
  type Profile,
  type RenderInput,
} from "@qdic-topology/contract";
import { byCodePoint, stableJson, type Attrs } from "./hash";

export type NodeRecord = {
  id: string;
  type?: string;
  label: string;
  attrs: Attrs;
  idSource: "id" | "globalId";
  logicalName?: string;
  isWritable?: boolean;
  inferred: Record<string, string>;
  position: number;
};

export type EdgeRecord = {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  attrs: Attrs;
  isActive?: boolean;
  validFrom?: string;
  validTo?: string;
  retired: boolean;
  sourcePredicate?: string;
};

export type Entity = {
  id: string;
  type?: string;
  label: string;
  records: string[];
};

export type Triple = Omit<EdgeRecord, "id"> & {
  key: string;
  inferred?: { predicate?: string };
  records: number[];
};

export type Merged = {
  records: NodeRecord[];
  entities: Entity[];
  triples: Triple[];
};

type Predicates = RenderInput["predicates"];

// why: mockup `mergeEntities` (lib/topology.js line 384) — at most 4 passes, so a deep chain
// cannot hang the merge (S16, S31)
const MAX_PASSES = 4;

// why: PRD FR-DATA-5 and FR-VOC-7, lead decision D12 — containment comes from the profile and
// payload `role` only, never from a predicate name in code
export function containment(
  source: Profile,
  predicates: Predicates,
): Set<string> {
  const set = new Set<string>();
  for (const [name, entry] of Object.entries(source.predicates))
    if (entry.role === "containment") set.add(name);
  for (const [name, entry] of Object.entries(predicates ?? {}))
    if (entry?.role === "containment") set.add(name);
  return set;
}

// why: PRD FR-QDIC-4 — the record fields of the profile set `record` never take part in the key
const RECORD_FIELDS = new Set(
  (Object.hasOwn(profile.attributeSets, "record")
    ? profile.attributeSets.record
    : []
  ).map((attribute) => attribute.key),
);

function keyAttrs(attrs: Attrs): Attrs {
  return Object.fromEntries(
    Object.entries(attrs).filter(([key]) => !RECORD_FIELDS.has(key)),
  );
}

function finder(canon: Map<string, string>) {
  return (id: string): string => {
    let current = id;
    for (let next = canon.get(current); next !== undefined;) {
      current = next;
      next = canon.get(current);
    }
    return current;
  };
}

function parentsOf(
  edges: EdgeRecord[],
  contains: Set<string>,
  find: (id: string) => string,
): Map<string, Set<string>> {
  const parents = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!contains.has(edge.predicate)) continue;
    const set = parents.get(edge.object) ?? new Set<string>();
    set.add(find(edge.subject));
    parents.set(edge.object, set);
  }
  return parents;
}

function mergeKey(record: NodeRecord, parents: Set<string> | undefined) {
  return stableJson([
    record.type ?? null,
    record.label,
    keyAttrs(record.attrs),
    [...(parents ?? [])].sort(byCodePoint),
  ]);
}

function runPasses(
  records: NodeRecord[],
  edges: EdgeRecord[],
  contains: Set<string>,
  identities: ReadonlySet<string>,
) {
  const canon = new Map<string, string>();
  const find = finder(canon);
  let passes = 0;
  while (passes < MAX_PASSES) {
    const parents = parentsOf(edges, contains, find);
    const first = new Map<string, string>();
    let merged = 0;
    for (const record of records) {
      // why: PRD FR-QDIC-6 — a record that arrived with a `globalId` is a hard identity and
      // never merges, also when its `id` is the record id
      if (identities.has(record.id) || canon.has(record.id)) continue;
      const key = mergeKey(record, parents.get(record.id));
      const earlier = first.get(key);
      if (earlier === undefined) first.set(key, record.id);
      else {
        canon.set(record.id, earlier);
        merged++;
      }
    }
    if (merged === 0) break;
    passes++;
  }
  return { find, passes };
}

function entitiesOf(records: NodeRecord[], find: (id: string) => string) {
  const entities = new Map<string, Entity>();
  const map = new Map<string, string>();
  for (const record of records) {
    const id = find(record.id);
    map.set(record.id, id);
    const entity = entities.get(id);
    if (entity) entity.records.push(record.id);
    else {
      const { type, label } = record;
      entities.set(id, {
        id,
        ...(type === undefined ? {} : { type }),
        label,
        records: [record.id],
      });
    }
  }
  return { entities: [...entities.values()], map };
}

// why: PRD FR-QDIC-5 — two edge records are one triple only when every identity field is equal
function identity(edge: Omit<EdgeRecord, "id">): string {
  return stableJson([
    edge.subject,
    edge.predicate,
    edge.object,
    edge.attrs,
    edge.isActive ?? null,
    edge.validFrom ?? null,
    edge.validTo ?? null,
  ]);
}

// why: PRD FR-QDIC-5 — a second triple on the same ends and predicate (other attributes) gets its
// number in the key, so every key stays unique; `edit/apply` uses the same rule (SA §4.8)
export function tripleKey(triad: readonly string[], variant: number): string {
  return JSON.stringify(variant === 0 ? triad : [...triad, variant]);
}

function triplesOf(edges: EdgeRecord[], map: Map<string, string>): Triple[] {
  const triples = new Map<string, Triple>();
  const variants = new Map<string, number>();
  for (const edge of edges) {
    const { id, ...rest } = edge;
    const ends = {
      subject: map.get(edge.subject) as string,
      object: map.get(edge.object) as string,
    };
    const remapped = { ...rest, ...ends };
    const known = identity(remapped);
    const triple = triples.get(known);
    if (triple) {
      triple.records.push(id);
      continue;
    }
    const triad = [ends.subject, edge.predicate, ends.object];
    const variant = variants.get(tripleKey(triad, 0)) ?? 0;
    variants.set(tripleKey(triad, 0), variant + 1);
    const key = tripleKey(triad, variant);
    triples.set(known, { key, ...remapped, records: [id] });
  }
  return [...triples.values()];
}

export function merge(
  records: NodeRecord[],
  edges: EdgeRecord[],
  predicates: Predicates,
  identities: ReadonlySet<string>,
): { graph: Merged; map: Map<string, string>; passes: number } {
  const contains = containment(profile, predicates);
  const { find, passes } = runPasses(records, edges, contains, identities);
  const { entities, map } = entitiesOf(records, find);
  return {
    graph: { records, entities, triples: triplesOf(edges, map) },
    map,
    passes,
  };
}
