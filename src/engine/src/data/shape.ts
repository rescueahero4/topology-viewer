import {
  matchShapeHeuristic,
  renderInputSchema,
  sendsToShape,
  type Issue,
  type Profile,
  type RenderInput,
  type shapedKindSchema,
} from "@qdic-topology/contract";
import { expandRows, heuristicRows, hintRows, type RowsPlan } from "./rows";
import {
  isRecord,
  notAGraph,
  nullRecord,
  own,
  parsedColumns,
  type Columns,
  type ShapedEdge,
  type ShapedNode,
  type ShapeFatal,
  type Tally,
} from "./tally";
import { walk, type Roots, type TreePlan } from "./walk";

type Kind = ReturnType<typeof shapedKindSchema.parse>;
type Heuristic = Profile["shapeHeuristics"][number];
type Hint = NonNullable<RenderInput["shape"]>;

export type Shaped = { kind: Kind; count: number };
export type ShapedSet = { nodes: string[]; edges: number[] };

export type ShapeResult =
  | { ok: true; input: RenderInput; issues: Issue[] }
  | {
      ok: true;
      input: RenderInput;
      issues: Issue[];
      shaped: Shaped;
      shapedSet: ShapedSet;
    }
  | { ok: false; fatal: ShapeFatal };

type Job =
  | { kind: "rows"; plan: RowsPlan; rows: readonly unknown[] }
  | { kind: "tree"; plan: TreePlan; roots: Roots; rawTree: boolean };

type Made = {
  nodes: ShapedNode[];
  edges: ShapedEdge[];
  issues: Issue[];
  chosen: ShapedSet;
};

// why: PRD FR-DATA-10 — the invented type `row` is an engine rule, not profile data
const ROW = "row";
// why: question 9 (c) — the keys of `renderInputSchema` on a raw tree root are payload keys
const TOP_KEYS = new Set(Object.keys(renderInputSchema.shape));

// why: question 8 and STORY-002-09 open question 12 — the hint default is profile data
function hintDefault(profile: Profile, kind: Kind): Heuristic {
  const found = profile.shapeHeuristics.find(
    (entry) => entry.kind === kind && entry.hintDefault === true,
  );
  if (found === undefined)
    throw new Error("The profile has no hint default entry.");
  return found;
}

function entryAt(profile: Profile, index: number | null): Heuristic {
  const entry = index === null ? undefined : profile.shapeHeuristics[index];
  if (entry === undefined) throw new Error("No profile heuristic matched.");
  return entry;
}

function rootColumns(root: Columns): Columns {
  return nullRecord(Object.entries(root).filter(([key]) => !TOP_KEYS.has(key)));
}

function forestRoots(nodes: readonly unknown[]): Roots {
  return {
    items: nodes,
    path: (index) => ["nodes", index],
    read: (value) => (isRecord(value) ? parsedColumns(value) : null),
  };
}

function treeRoots(data: RenderInput): Roots {
  return {
    items: [data],
    path: () => [],
    read: (value) => (isRecord(value) ? rootColumns(value) : null),
  };
}

// why: decision D7 and question 8 — the children key is the first entry column that the first
// object has as an own key; the label keys come from the same entry
function heuristicTree(entry: Heuristic, first: Columns): TreePlan {
  const children = entry.columns.find((column) => Object.hasOwn(first, column));
  if (children === undefined)
    throw new Error("The matched tree entry gives no children key.");
  return {
    children,
    label: { keys: entry.labelKeys ?? [] },
    predicate: entry.predicate,
    type: ROW,
  };
}

function treeJob(plan: TreePlan, roots: Roots, rawTree: boolean): Job {
  return { kind: "tree", plan, roots, rawTree };
}

function rawFirst(input: unknown): unknown {
  const nodes = isRecord(input) ? own(input, "nodes") : undefined;
  return Array.isArray(nodes) ? (nodes as unknown[])[0] : undefined;
}

function hintJob(
  input: unknown,
  data: RenderInput,
  hint: Hint,
  profile: Profile,
): Job | ShapeFatal {
  const nodes = data.nodes;
  if (hint.kind === "rows") {
    if (nodes === undefined) return notAGraph(["shape"]);
    const fallback = hintDefault(profile, "rows").predicate;
    return {
      kind: "rows",
      plan: hintRows(hint, rawFirst(input), fallback, ROW),
      rows: nodes,
    };
  }
  const plan: TreePlan = {
    children: hint.children,
    id: hint.id,
    label: { key: hint.label },
    predicate: hintDefault(profile, "tree").predicate,
    type: ROW,
  };
  if (nodes !== undefined) return treeJob(plan, forestRoots(nodes), false);
  if (data.neighborhood === undefined)
    return treeJob(plan, treeRoots(data), true);
  return notAGraph(["shape"]);
}

function heuristicJob(
  input: unknown,
  nodes: readonly unknown[],
  profile: Profile,
): Job {
  const entry = entryAt(profile, matchShapeHeuristic(rawFirst(input)));
  const first = isRecord(nodes[0]) ? parsedColumns(nodes[0]) : nullRecord([]);
  if (entry.kind === "tree")
    return treeJob(heuristicTree(entry, first), forestRoots(nodes), false);
  return { kind: "rows", plan: heuristicRows(entry, first, ROW), rows: nodes };
}

// why: SA v0.12 §4.1 trigger (amendment A16, Q5) — the contract functions decide, so the cap
// rule of the contract and the shaper use one rule (LEARNINGS 11)
function jobOf(
  input: unknown,
  data: RenderInput,
  profile: Profile,
): Job | ShapeFatal | null {
  if (sendsToShape(input)) {
    const hint = data.shape;
    if (hint !== null && hint !== undefined)
      return hintJob(input, data, hint, profile);
    return heuristicJob(input, data.nodes ?? [], profile);
  }
  if (data.nodes !== undefined || data.neighborhood !== undefined) return null;
  const index = matchShapeHeuristic(input);
  const entry = index === null ? undefined : profile.shapeHeuristics[index];
  if (entry?.kind !== "tree") return notAGraph([]);
  const plan = heuristicTree(entry, rootColumns(data));
  return treeJob(plan, treeRoots(data), true);
}

function edgeCount(data: RenderInput): number {
  const lists = [data.edges, data.links, data.neighborhood?.edges];
  return lists.reduce((sum, list) => sum + (list?.length ?? 0), 0);
}

function run(job: Job, tally: Tally): Made | ShapeFatal {
  if (job.kind === "rows") {
    const made = expandRows(job.rows, job.plan, tally);
    return made.ok ? made : made.fatal;
  }
  const made = walk(job.roots, job.plan, tally);
  if (!made.ok) return made.fatal;
  const ids = new Set(made.nodes.map((node) => node.id));
  return {
    ...made,
    chosen: { nodes: [...ids], edges: made.edges.map((_edge, index) => index) },
  };
}

// why: question 9 (c), lead decision D57 — the shaped edges go after every edge list of `data`
// in the `EDGE_LISTS` order, so they join the last list that has an item
function withEdges(data: RenderInput, edges: ShapedEdge[]): RenderInput {
  const { neighborhood, links } = data;
  if (neighborhood?.edges !== undefined && neighborhood.edges.length > 0)
    return {
      ...data,
      neighborhood: {
        ...neighborhood,
        edges: [...neighborhood.edges, ...edges],
      },
    };
  if (links !== undefined && links.length > 0)
    return { ...data, links: [...links, ...edges] };
  return { ...data, edges: [...(data.edges ?? []), ...edges] };
}

function payloadKeys(data: RenderInput): RenderInput {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => TOP_KEYS.has(key)),
  );
}

function assemble(job: Job, data: RenderInput, made: Made, base: number) {
  const kept = job.kind === "tree" && job.rawTree ? payloadKeys(data) : data;
  return {
    ok: true as const,
    input: { ...withEdges(kept, made.edges), nodes: made.nodes },
    issues: made.issues,
    shaped: { kind: job.kind, count: made.edges.length },
    shapedSet: {
      nodes: made.chosen.nodes,
      edges: made.chosen.edges.map((index) => base + index),
    },
  };
}

function shapeData(
  input: unknown,
  data: RenderInput,
  profile: Profile,
): ShapeResult {
  const job = jobOf(input, data, profile);
  if (job === null) return { ok: true, input: data, issues: [] };
  if ("code" in job) return { ok: false, fatal: job };
  const base = edgeCount(data);
  const tally: Tally = {
    nodes: data.neighborhood?.nodes?.length ?? 0,
    edges: base,
  };
  const made = run(job, tally);
  if ("code" in made) return { ok: false, fatal: made };
  return assemble(job, data, made, base);
}

// why: SA §5 and §11 Transport — the shaper never throws; any error becomes `not-a-graph` with
// no message or stack text (DoD item 1)
export function shape(
  input: unknown,
  data: RenderInput,
  profile: Profile,
): ShapeResult {
  try {
    return shapeData(input, data, profile);
  } catch {
    return { ok: false, fatal: notAGraph([]) };
  }
}
