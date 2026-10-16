import { profile } from "@qdic-topology/contract";

export type Raw = Record<string, unknown>;

export function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(input: unknown, field: "nodes" | "edges"): Raw[] {
  if (!isRecord(input)) return [];
  const items = input[field];
  return Array.isArray(items) ? items.filter(isRecord) : [];
}

export const nodesOf = (input: unknown) => list(input, "nodes");
export const edgesOf = (input: unknown) => list(input, "edges");

function asId(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function nodeId(node: Raw): string | undefined {
  return asId(node.id ?? node.globalId);
}

function edgeEnds(edge: Raw): [string, string] {
  return [
    String(edge.source ?? edge.subject ?? edge.subjectNodeId),
    String(edge.target ?? edge.object ?? edge.objectNodeId),
  ];
}

export interface SkipCounts {
  "no-id": number;
  "duplicate-id": number;
  "dangling-edge": number;
}

// why: the mockup `normalise()` rules — a record without id, a repeated id and an edge to a missing node are skipped and counted
export function skipCounts(input: unknown): SkipCounts {
  const counts: SkipCounts = {
    "no-id": 0,
    "duplicate-id": 0,
    "dangling-edge": 0,
  };
  const ids = new Set<string>();
  const rawNodes =
    isRecord(input) && Array.isArray(input.nodes) ? input.nodes : [];
  for (const node of rawNodes) {
    const id = isRecord(node) ? nodeId(node) : undefined;
    if (id === undefined) counts["no-id"] += 1;
    else if (ids.has(id)) counts["duplicate-id"] += 1;
    else ids.add(id);
  }
  for (const edge of edgesOf(input)) {
    const [from, to] = edgeEnds(edge);
    if (!ids.has(from) || !ids.has(to)) counts["dangling-edge"] += 1;
  }
  return counts;
}

function mostConnected(input: unknown): string | null {
  const degree = new Map<string, number>();
  for (const node of nodesOf(input)) {
    const id = nodeId(node);
    if (id !== undefined) degree.set(id, 0);
  }
  for (const edge of edgesOf(input)) {
    const ends = edgeEnds(edge);
    if (ends.every((end) => degree.has(end)))
      for (const end of ends) degree.set(end, (degree.get(end) ?? 0) + 1);
  }
  let best: string | null = null;
  let top = -1;
  for (const [id, count] of degree) {
    if (count > top) {
      best = id;
      top = count;
    }
  }
  return best;
}

// why: mockup `storyInfo()` — a valid root reads as active, no hint as passive; an active
// payload with an unknown root falls back to the most connected node
export function firstPaintOf(input: unknown) {
  const view = isRecord(input) && isRecord(input.view) ? input.view : {};
  const ids = new Set(nodesOf(input).map(nodeId));
  const hinted = asId(view.root);
  const root = hinted !== undefined && ids.has(hinted) ? hinted : null;
  const approach =
    view.approach === "active" || view.approach === "passive"
      ? view.approach
      : root === null
        ? "passive"
        : "active";
  return {
    approach,
    selected: approach === "passive" ? null : (root ?? mostConnected(input)),
  };
}

type Triple = [predicate: string, subject: string, object: string];

const ANY = "any";
const SYSTEM = "System";
// why: STORY-002-09 T5 — an edge with no predicate gets the default predicate of the engine
const DEFAULT_PREDICATE = "relatedTo";

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function ownType(node: Raw): string | undefined {
  return text(node.type) ?? text(node.nodeType);
}

function prefixType(node: Raw): string | undefined {
  const globalId = text(node.globalId);
  if (globalId === undefined) return undefined;
  const found = Object.entries(profile.globalIdPrefixes).find(([prefix]) =>
    globalId.startsWith(prefix),
  );
  return found?.[1].type ?? undefined;
}

function vocabularyRows(input: unknown, list: string): Raw[] {
  const vocabulary = isRecord(input) ? input.vocabulary : undefined;
  const rows = isRecord(vocabulary) ? vocabulary[list] : undefined;
  return Array.isArray(rows) ? rows.filter(isRecord) : [];
}

// why: STORY-002-09 T5 — the first record of each id; entity merge changes no count in the corpus
function entities(input: unknown): Map<string, Raw> {
  const found = new Map<string, Raw>();
  for (const node of nodesOf(input)) {
    const id = nodeId(node);
    if (id !== undefined && !found.has(id)) found.set(id, node);
  }
  return found;
}

// why: PRD FR-DATA-3 and epic Q4 — one count per node whose type no source declares, or with no type
export function unknownTypeCount(input: unknown): number {
  const supplied = isRecord(input) && isRecord(input.types) ? input.types : {};
  const names = new Set(vocabularyRows(input, "nodeTypes").map((r) => r.name));
  return [...entities(input).values()].filter((node) => {
    const type = ownType(node);
    if (type === undefined) return prefixType(node) === undefined;
    return (
      !Object.hasOwn(supplied, type) &&
      !names.has(type) &&
      !Object.hasOwn(profile.nodeTypes, type)
    );
  }).length;
}

function fold(predicate: string, subject: string, object: string): Triple {
  const inverse = Object.hasOwn(profile.inverses, predicate)
    ? profile.inverses[predicate]
    : undefined;
  return inverse
    ? [inverse.predicate, object, subject]
    : [predicate, subject, object];
}

function suppliedConstraints(input: unknown): Triple[] {
  return vocabularyRows(input, "edgeConstraints").map((row) =>
    fold(
      String(row.predicate),
      String(row.subject_node_type),
      String(row.object_node_type),
    ),
  );
}

// why: PRD FR-QDIC-7 and epic Q2 — System pairings and supplied constraints constrain a predicate;
// any pairing or supplied constraint that matches allows the edge; one count per distinct triple
export function constraintViolationCount(input: unknown): number {
  const types = new Map(
    [...entities(input)].map(([id, node]) => [
      id,
      ownType(node) ?? prefixType(node),
    ]),
  );
  const supplied = suppliedConstraints(input);
  const pairings = profile.pairings.map((p) =>
    fold(p.predicate, p.subject, p.object),
  );
  const constrained = new Set([
    ...profile.pairings
      .filter((p) => p.owner === SYSTEM)
      .map((p) => fold(p.predicate, p.subject, p.object)[0]),
    ...supplied.map(([predicate]) => predicate),
  ]);
  const allowed = [...pairings, ...supplied];
  const seen = new Set<string>();
  let count = 0;
  for (const edge of edgesOf(input)) {
    const [from, to] = edgeEnds(edge);
    const triple = fold(text(edge.predicate) ?? DEFAULT_PREDICATE, from, to);
    const [predicate, subject, object] = triple;
    const key = JSON.stringify(triple);
    if (!types.has(subject) || !types.has(object) || seen.has(key)) continue;
    seen.add(key);
    const [s, o] = [types.get(subject), types.get(object)];
    if (s === undefined || o === undefined || !constrained.has(predicate))
      continue;
    const match = allowed.some(
      ([p, a, b]) =>
        p === predicate && (a === ANY || a === s) && (b === ANY || b === o),
    );
    if (!match) count += 1;
  }
  return count;
}
