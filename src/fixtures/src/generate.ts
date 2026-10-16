export type GeneratedNode = { id: string; type: string; label: string };
export type GeneratedEdge = {
  subject: string;
  predicate: string;
  object: string;
};
export type GeneratedGraph = {
  nodes: GeneratedNode[];
  edges: GeneratedEdge[];
};
export type Cell = [id: string, col: number, row: number];
export type TreeObject = { [key: string]: string | TreeObject[] };

type Options = { type?: string; predicate?: string };

// why: STORY-002-01 T7 — synthetic names only (S-C4); `t0` is not declared in any `types`
const TYPE = "t0";
const PREDICATE = "relatedTo";

function node(index: number, type = TYPE): GeneratedNode {
  return { id: `n${index}`, type, label: `Node ${index}` };
}

function nodes(
  count: number,
  type: (index: number) => string,
): GeneratedNode[] {
  return Array.from({ length: count }, (_, index) => node(index, type(index)));
}

export function chain(
  n: number,
  { type = TYPE, predicate = PREDICATE }: Options = {},
): GeneratedGraph {
  return {
    nodes: nodes(n, () => type),
    edges: Array.from({ length: Math.max(n - 1, 0) }, (_, k) => ({
      subject: `n${k}`,
      predicate,
      object: `n${k + 1}`,
    })),
  };
}

export function star(
  leaves: number,
  { type = TYPE, predicate = PREDICATE }: Options = {},
): GeneratedGraph {
  return {
    nodes: nodes(leaves + 1, () => type),
    edges: Array.from({ length: leaves }, (_, k) => ({
      subject: "n0",
      predicate,
      object: `n${k + 1}`,
    })),
  };
}

// why: mockup `rng` (mock-data.js lines 10-16), mulberry32
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function random(
  nodeCount: number,
  edgeCount: number,
  seed: number,
): GeneratedGraph {
  if (edgeCount > nodeCount * (nodeCount - 1))
    throw new Error("Too many edges for the node count.");
  const draw = mulberry32(seed);
  const pick = () => Math.floor(draw() * nodeCount);
  const seen = new Set<string>();
  const edges: GeneratedEdge[] = [];
  while (edges.length < edgeCount) {
    const subject = pick();
    const object = pick();
    const pair = `${subject} ${object}`;
    if (subject === object || seen.has(pair)) continue;
    seen.add(pair);
    edges.push({
      subject: `n${subject}`,
      predicate: PREDICATE,
      object: `n${object}`,
    });
  }
  return { nodes: nodes(nodeCount, (index) => `t${index % 5}`), edges };
}

export function grid(
  cols: number,
  rows: number,
): GeneratedGraph & { cells: Cell[] } {
  const cells: Cell[] = Array.from({ length: cols * rows }, (_, index) => [
    `n${index}`,
    index % cols,
    Math.floor(index / cols),
  ]);
  return { nodes: nodes(cols * rows, () => TYPE), edges: [], cells };
}

type TreeOptions = { width?: number; children?: string; label?: string };

export function tree(
  depth: number,
  { width = 1, children = "children", label = "name" }: TreeOptions = {},
): TreeObject {
  let created = 0;
  const make = (): TreeObject => ({ [label]: `Node ${created++}` });
  const root = make();
  if (depth < 2) return root;
  for (let branch = 0; branch < width; branch++) {
    let parent = root;
    for (let level = 2; level <= depth; level++) {
      const child = make();
      const list = parent[children];
      if (Array.isArray(list)) list.push(child);
      else parent[children] = [child];
      parent = child;
    }
  }
  return root;
}
