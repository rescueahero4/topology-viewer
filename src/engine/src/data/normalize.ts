import {
  CAPS,
  copyBytes,
  parseRenderInput,
  profile,
  rawCounts,
  type FatalInfo,
  type GotToken,
  type Issue,
  type RenderInput,
  type WarningEntry,
} from "@qdic-topology/contract";
import { violations } from "./constraints";
import { fnv1a, stableJson } from "./hash";
import { merge, type EdgeRecord, type Merged, type NodeRecord } from "./merge";
import { warningEntries } from "./notices";
import {
  readEdges,
  readNodes,
  type EdgeList,
  type NodeList,
  type Path,
} from "./records";
import { shape, type Shaped, type ShapedSet } from "./shape";

export type Payload = Pick<
  RenderInput,
  "types" | "predicates" | "fields" | "vocabulary" | "view" | "defaults"
>;

export type Graph = Merged & {
  shapedSet: { records: string[]; triples: string[] };
};

export type Counts = {
  records: number;
  entities: number;
  merged: number;
  relationships: number;
  edgeRecords: number;
  skipped: { "no-id": number; "duplicate-id": number; "dangling-edge": number };
};

export type Fatal =
  | { code: FatalInfo["code"]; path: Path; info: FatalInfo }
  | { code: "error-fallback"; path: Path };

export type Normalized =
  | {
      ok: true;
      graph: Graph;
      issues: Issue[];
      warnings: WarningEntry[];
      counts: Counts;
      hash: number;
      payload: Payload;
      shaped?: Shaped;
    }
  | { ok: false; fatal: Fatal };

const PAYLOAD_KEYS = [
  "types",
  "predicates",
  "fields",
  "vocabulary",
  "view",
  "defaults",
] as const;

const KB = 1024;

function own(value: unknown, key: string | number): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function at(raw: unknown, path: Path): unknown {
  return path.reduce<unknown>((value, key) => own(value, key), raw);
}

// why: mockup `kindOf` (lib/topology.js line 336) as a token; the catalog holds its texts (D2)
function kindOf(value: unknown): GotToken {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const kind = typeof value;
  if (kind === "string" || kind === "number" || kind === "boolean") return kind;
  return "object";
}

// why: lead decisions D2, D34, D39 — each `too-large` value is the count of the check that refused
function tooLarge(input: unknown, path: Path): FatalInfo {
  const counts = rawCounts(input);
  if (path.length === 1 && path[0] === "nodes")
    return {
      code: "too-large",
      got: { unit: "nodes", count: counts.nodes },
      limit: { unit: "nodes", count: CAPS.nodes },
    };
  if (path.length === 1 && path[0] === "edges")
    return {
      code: "too-large",
      got: { unit: "edges", count: counts.edges },
      limit: { unit: "edges", count: CAPS.edges },
    };
  return {
    code: "too-large",
    got: { unit: "kb", count: Math.ceil(copyBytes(input).sum / KB) },
    limit: { unit: "kb", count: CAPS.bytes / KB },
  };
}

function fatalInfo(input: unknown, fatal: Issue): FatalInfo {
  switch (fatal.code) {
    case "not-object":
    case "nodes-not-array":
    case "edges-not-array":
      return { code: fatal.code, got: kindOf(at(input, fatal.path)) };
    case "too-large":
      return tooLarge(input, fatal.path);
    case "not-a-graph":
      return { code: "not-a-graph" };
    default:
      throw new Error("The contract gave a fatal code with no info rule.");
  }
}

function payloadOf(data: RenderInput): Payload {
  const payload: Payload = {};
  for (const key of PAYLOAD_KEYS)
    if (Object.hasOwn(data, key)) Object.assign(payload, { [key]: data[key] });
  return payload;
}

// why: lead decision D38 — a shaped record takes no `defaults` value
function nodeLists(data: RenderInput, shaped: boolean): NodeList[] {
  return [
    {
      path: ["nodes"],
      items: data.nodes ?? [],
      defaults: !shaped,
    },
    {
      path: ["neighborhood", "nodes"],
      items: data.neighborhood?.nodes ?? [],
      defaults: true,
    },
  ];
}

// why: the contract `EDGE_LISTS` order (raw.ts); STORY-002-02 maps shaped positions over it
function edgeLists(data: RenderInput): EdgeList[] {
  return [
    { path: ["edges"], items: data.edges ?? [] },
    { path: ["links"], items: data.links ?? [] },
    { path: ["neighborhood", "edges"], items: data.neighborhood?.edges ?? [] },
  ];
}

// why: PRD FR-CANVAS-7 — a record id of a merged entity resolves through the record → entity map
function viewIssues(input: unknown, map: Map<string, string>): Issue[] {
  const issues: Issue[] = [];
  const root = at(input, ["view", "root"]);
  if (typeof root === "string" && !map.has(root))
    issues.push({ code: "root-not-found", path: ["view", "root"] });
  const reveal = at(input, ["view", "reveal"]);
  if (!Array.isArray(reveal)) return issues;
  reveal.forEach((id: unknown, index) => {
    if (typeof id === "string" && !map.has(id))
      issues.push({
        code: "reveal-not-found",
        path: ["view", "reveal", index],
      });
  });
  return issues;
}

function constraintIssues(
  graph: Graph,
  payload: Payload,
  paths: Path[],
): Issue[] {
  return violations(graph, payload.vocabulary, graph.shapedSet).map(
    (triple) => ({
      code: "constraint-violation",
      path: paths[triple.records[0]],
    }),
  );
}

// why: epic condition C5 — the hash leaves out `retired`, so the layout seed is the same each day
function hashOf(graph: Graph): number {
  const triples = graph.triples.map((triple) => ({
    ...triple,
    retired: undefined,
  }));
  return fnv1a(stableJson({ ...graph, triples }));
}

function countsOf(graph: Merged, edges: EdgeRecord[], issues: Issue[]): Counts {
  const count = (code: Issue["code"]) =>
    issues.filter((issue) => issue.code === code).length;
  return {
    records: graph.records.length,
    entities: graph.entities.length,
    merged: graph.records.length - graph.entities.length,
    relationships: graph.triples.length,
    edgeRecords: edges.length,
    skipped: {
      "no-id": count("no-id"),
      "duplicate-id": count("duplicate-id"),
      "dangling-edge": count("dangling-edge"),
    },
  };
}

function itemCount(lists: { items: unknown[] }[]): number {
  return lists.reduce((sum, list) => sum + list.items.length, 0);
}

// why: lead decision D41 — only the records and triples that `data/shape` chose are in the set
function shapedSetOf(merged: Merged, set: ShapedSet | undefined) {
  const nodes = new Set(set?.nodes);
  const edges = new Set(set?.edges);
  return {
    records: merged.records
      .filter((record) => nodes.has(record.id))
      .map((record) => record.id),
    triples: merged.triples
      .filter((triple) => edges.has(triple.records[0]))
      .map((triple) => triple.key),
  };
}

// why: PRD FR-DATA-3 and lead decision D40 — no node with an id is fatal, also when `shape` made
// no node from its raw items
function noValidNodes(
  records: NodeRecord[],
  issues: Issue[],
  raw: NodeList[],
  shaped: boolean,
): Normalized | null {
  if (records.length > 0) return null;
  const count = itemCount(raw);
  if (!issues.some((issue) => issue.code === "no-id") && !(shaped && count > 0))
    return null;
  const info: FatalInfo = { code: "no-valid-nodes", rawNodes: count };
  return { ok: false, fatal: { code: info.code, path: ["nodes"], info } };
}

function run(input: unknown, now: string): Normalized {
  const parsed = parseRenderInput(input);
  if (!parsed.ok) {
    const info = fatalInfo(input, parsed.fatal);
    return {
      ok: false,
      fatal: { code: info.code, path: parsed.fatal.path, info },
    };
  }
  const { data } = parsed;
  const shaped = shape(input, data, profile);
  if (!shaped.ok) return { ok: false, fatal: shaped.fatal };
  const made = "shaped" in shaped ? shaped : undefined;
  const payload = payloadOf(data);
  const issues: Issue[] = [...parsed.issues, ...shaped.issues];
  if (made) issues.push({ code: "shaped-from", path: ["shape"] });
  const lists = nodeLists(shaped.input, made !== undefined);
  const { records, identities } = readNodes(lists, data.defaults, issues);
  const empty = noValidNodes(records, issues, nodeLists(data, false), !!made);
  if (empty) return empty;
  const ids = new Set(records.map((record) => record.id));
  const read = readEdges(
    edgeLists(shaped.input),
    ids,
    data.defaults,
    now,
    issues,
  );
  const { graph: merged, map } = merge(
    records,
    read.edges,
    payload.predicates,
    identities,
  );
  const graph: Graph = {
    ...merged,
    shapedSet: shapedSetOf(merged, made?.shapedSet),
  };
  issues.push(...constraintIssues(graph, payload, read.paths));
  issues.push(...viewIssues(input, map));
  return {
    ok: true,
    graph,
    issues,
    warnings: warningEntries(issues, made?.shaped),
    counts: countsOf(merged, read.edges, issues),
    hash: hashOf(graph),
    payload,
    ...(made ? { shaped: made.shaped } : {}),
  };
}

// why: SA §5 — the engine never throws for data; a thrown error becomes the generic fallback
// with no message or stack text (SA §11 Transport, S32)
export function normalize(
  input: unknown,
  options: { now: string },
): Normalized {
  try {
    return run(input, options.now);
  } catch {
    return { ok: false, fatal: { code: "error-fallback", path: [] } };
  }
}
