import { profile, type RenderInput } from "@qdic-topology/contract";
import type { Merged, Triple } from "./merge";

type Pair = { subject: string; object: string };
type ShapedSet = { records: string[]; triples: string[] };
type Vocabulary = RenderInput["vocabulary"];

// why: profile pairing value — the `any` type of the GV pairings matches every node type
const ANY = "any";
// why: question 2 (Product Owner, 2026-10-14) — only the pairings of this owner are constraints
const CONSTRAINT_OWNER = "System";

function add(map: Map<string, Pair[]>, predicate: string, pair: Pair) {
  const list = map.get(predicate) ?? [];
  list.push(pair);
  map.set(predicate, list);
}

function constraintsOf(vocabulary: Vocabulary): Map<string, Pair[]> {
  const map = new Map<string, Pair[]>();
  for (const row of vocabulary?.edgeConstraints ?? []) {
    if (row === undefined) continue;
    const { predicate, subject_node_type, object_node_type } = row;
    if (predicate === undefined) continue;
    if (subject_node_type === undefined || object_node_type === undefined)
      continue;
    add(map, predicate, {
      subject: subject_node_type,
      object: object_node_type,
    });
  }
  for (const pairing of profile.pairings)
    if (pairing.owner === CONSTRAINT_OWNER)
      add(map, pairing.predicate, pairing);
  return map;
}

const PAIRINGS = new Map<string, Pair[]>();
for (const pairing of profile.pairings)
  add(PAIRINGS, pairing.predicate, pairing);

function matches(pairs: Pair[] | undefined, subject: string, object: string) {
  return (pairs ?? []).some(
    (pair) =>
      (pair.subject === ANY || pair.subject === subject) &&
      (pair.object === ANY || pair.object === object),
  );
}

// why: PRD v0.9 FR-QDIC-7 addendum and lead decision D88 (4) — an edge that `data/shape` made
// between two shaped records is the engine's structure, so it is not checked; the test reads the
// shaped set, not a type name
function shapedEdges(graph: Merged, shaped: ShapedSet): Set<string> {
  const records = new Set(shaped.records);
  const allShaped = new Set(
    graph.entities
      .filter((entity) => entity.records.every((id) => records.has(id)))
      .map((entity) => entity.id),
  );
  const keys = new Set(shaped.triples);
  return new Set(
    graph.triples
      .filter(
        (triple) =>
          keys.has(triple.key) &&
          allShaped.has(triple.subject) &&
          allShaped.has(triple.object),
      )
      .map((triple) => triple.key),
  );
}

// why: PRD FR-QDIC-7 and question 2 — a violation needs a constraint on the predicate, no match
// with a constraint and no match with any profile pairing (a proposed pairing never reports)
export function violations(
  graph: Merged,
  vocabulary: Vocabulary,
  shaped: ShapedSet,
): Triple[] {
  const constraints = constraintsOf(vocabulary);
  const types = new Map(
    graph.entities.map((entity) => [entity.id, entity.type]),
  );
  const skipped = shapedEdges(graph, shaped);
  return graph.triples.filter((triple) => {
    if (skipped.has(triple.key)) return false;
    const pairs = constraints.get(triple.predicate);
    if (pairs === undefined) return false;
    const subject = types.get(triple.subject);
    const object = types.get(triple.object);
    if (subject === undefined || object === undefined) return false;
    return (
      !matches(pairs, subject, object) &&
      !matches(PAIRINGS.get(triple.predicate), subject, object)
    );
  });
}
