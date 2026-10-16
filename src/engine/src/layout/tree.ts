import type { DrawnId, Point, TreeRows } from "../state/canvasState";
import type { Frontier } from "../view/frontier";
import type { ResolvedType, Vocab } from "../vocab/resolve";
import { byTypeThenLabel, indexOf, type Drawn, type Laid } from "./drawn";

type Rows = {
  n: number;
  level: (number | undefined)[];
  role: (ResolvedType["treeRole"] | undefined)[];
  sameType: (a: number, b: number) => boolean;
  near: number[][];
  contains: [number, number][];
  children: number[][];
};

// why: STORY-002-05 Context "Tree row keys" — the attribute lane goes 5 steps deep (mockup
// lib/topology.js line 1562), the curation zone starts at 100 (line 1581)
const LANE_DEPTH = 5;
const ZONE = 100;
// why: owner decision D92 (2) and lead item L-1 — a type level above 99 is read as 99, so no model
// type shares the rows of the curation zone, and -0 is read as 0
const LEVEL_CAP = 99;

// why: lead decision D47 — levels, tree roles, `role` and `layoutRole` come from `vocab` only
function rowsInput(frontier: Frontier, vocab: Vocab): Rows {
  const at = indexOf(frontier);
  const types = frontier.nodes.map((node) =>
    node.type === null ? undefined : vocab.types.get(node.type),
  );
  const near: number[][] = types.map(() => []);
  const children: number[][] = types.map(() => []);
  const contains: [number, number][] = [];
  for (const edge of frontier.edges) {
    const s = at.get(edge.subject) as number;
    const o = at.get(edge.object) as number;
    const predicate = vocab.predicates.get(edge.predicate);
    if (predicate?.role === "containment") {
      contains.push([s, o]);
      children[s].push(o);
    }
    if (predicate?.layoutRole !== "lineage") {
      near[s].push(o);
      near[o].push(s);
    }
  }
  return {
    n: types.length,
    level: types.map((type) =>
      type?.level === undefined
        ? undefined
        : Math.min(Math.max(type.level, 0), LEVEL_CAP),
    ),
    role: types.map((type) => type?.treeRole),
    sameType: (a, b) => frontier.nodes[a].type === frontier.nodes[b].type,
    near,
    contains,
    children,
  };
}

// why: rule (1), mockup lines 1549-1554 — the type level; a nested container of the same type
// goes one row down (3 passes)
function levelled(rows: Rows): (number | undefined)[] {
  const level = [...rows.level];
  for (let pass = 0; pass < 3; pass++)
    for (const [s, o] of rows.contains) {
      const above = level[s];
      const below = level[o];
      if (above !== undefined && below !== undefined && below <= above)
        if (rows.sameType(s, o)) level[o] = above + 1;
    }
  return level;
}

// why: rule (2), mockup lines 1558-1572, owner decision D92 (1) — the smallest level an attribute
// hangs off, with the v56 update inside one round: a value changed in a round is read again in the
// same round; the canonical edge order makes the result repeatable (NF-3)
function lane(rows: Rows, level: readonly (number | undefined)[]) {
  const from: (number | undefined)[] = [...level];
  const depth: number[] = [];
  let front = level.flatMap((l, at) => (l === undefined ? [] : [at]));
  for (let step = 1; front.length > 0 && step <= LANE_DEPTH; step++) {
    const next: number[] = [];
    const read = new Map<number, number>();
    for (const at of front) {
      const l = from[at] as number;
      // why: a second read of an unchanged value changes nothing, so it is skipped (bounded work)
      if (read.get(at) === l) continue;
      read.set(at, l);
      for (const m of rows.near[at]) {
        if (rows.role[m] !== "attribute" || level[m] !== undefined) continue;
        const cur = from[m];
        if (cur === undefined || l < cur || (l === cur && step < depth[m])) {
          from[m] = l;
          depth[m] = step;
          next.push(m);
        }
      }
    }
    front = next;
  }
  return { from, depth };
}

// why: rule (3), mockup lines 1573-1581 — steps over non-lineage edges from the rows of rules (1)
// and (2), through nodes that are in neither
function zone(rows: Rows, placed: readonly boolean[]): number[] {
  const dist: number[] = [];
  let front = placed.flatMap((yes, at) => (yes ? [at] : []));
  for (let k = 1; front.length > 0; k++) {
    const next: number[] = [];
    for (const at of front)
      for (const m of rows.near[at])
        if (!placed[m] && dist[m] === undefined) {
          dist[m] = k;
          next.push(m);
        }
    front = next;
  }
  return dist;
}

// why: rule (4), lead decisions D43, D57 — the nearest levelled containment ancestor, the smallest
// level when two are at the same distance
function underLevel(rows: Rows, level: readonly (number | undefined)[]) {
  const base: (number | undefined)[] = [...level];
  const dist: number[] = level.map((l) => (l === undefined ? -1 : 0));
  let front = level.flatMap((l, at) => (l === undefined ? [] : [at]));
  for (let k = 1; front.length > 0; k++) {
    const found = new Map<number, number>();
    for (const at of front)
      for (const child of rows.children[at]) {
        if (dist[child] !== -1) continue;
        const best = found.get(child);
        const l = base[at] as number;
        if (best === undefined || l < best) found.set(child, l);
      }
    for (const [at, l] of found) {
      base[at] = l;
      dist[at] = k;
    }
    front = [...found.keys()];
  }
  return { base, dist };
}

function lowestOpen(deg: readonly number[], done: Uint8Array): number {
  let pick = -1;
  for (let at = 0; at < deg.length; at++)
    if (done[at] === 0 && (pick === -1 || deg[at] < deg[pick])) pick = at;
  return pick;
}

// why: rule (4), mockup lines 1611-1636 — longest-path layering along containment edges (Kahn); a
// cycle is released lowest indegree first
function chainLength(rows: Rows): number[] {
  const layer = new Array<number>(rows.n).fill(0);
  const deg = new Array<number>(rows.n).fill(0);
  for (const [, o] of rows.contains) deg[o]++;
  const done = new Uint8Array(rows.n);
  let count = 0;
  let queue = deg.flatMap((d, at) => (d === 0 ? [at] : []));
  while (count < rows.n) {
    if (queue.length === 0) queue = [lowestOpen(deg, done)];
    const next: number[] = [];
    for (const at of queue) {
      if (done[at] === 1) continue;
      done[at] = 1;
      count++;
      for (const child of rows.children[at]) {
        if (done[child] === 1) continue;
        layer[child] = Math.max(layer[child], layer[at] + 1);
        if (--deg[child] === 0) next.push(child);
      }
    }
    queue = next;
  }
  return layer;
}

function rowKeysOf(frontier: Frontier, vocab: Vocab): number[] {
  const rows = rowsInput(frontier, vocab);
  const level = levelled(rows);
  const { from, depth } = lane(rows, level);
  const keys: (number | undefined)[] = level.map((l, at) =>
    l === undefined && depth[at] !== undefined
      ? (from[at] as number) + depth[at] / 10
      : l,
  );
  const dist = zone(
    rows,
    keys.map((key) => key !== undefined),
  );
  const { base, dist: steps } = underLevel(rows, level);
  const chain = chainLength(rows);
  return keys.map((key, at) => {
    if (key !== undefined) return key;
    if (rows.role[at] === "curation") return ZONE + (dist[at] ?? 1);
    if (steps[at] > 0) return (base[at] as number) + steps[at];
    return chain[at];
  });
}

export function treeRowKeys(
  frontier: Frontier,
  vocab: Vocab,
): [DrawnId, number][] {
  const keys = rowKeysOf(frontier, vocab);
  return frontier.nodes.map((node, at) => [node.id, keys[at]]);
}

// why: mockup `rowPositions` (lib/topology.js line 1644) — the row step on the row axis
const STEP_H = 240;
const STEP_V = 150;
const SWEEPS = 2;

// why: mockup `lineageDepth` (lib/topology.js lines 1585-1598) — the longest chain of lineage edges
// into a node (the subject is downstream of the object); an explicit stack, so a deep chain cannot
// overflow
function lineageDepth(drawn: Drawn, vocab: Vocab): number[] {
  const up: number[][] = drawn.nodes.map(() => []);
  for (const link of drawn.links)
    if (vocab.predicates.get(link.predicate)?.layoutRole === "lineage")
      up[link.subject].push(link.object);
  const depth = new Array<number>(up.length).fill(-1);
  for (let start = 0; start < up.length; start++) {
    if (depth[start] >= 0) continue;
    const seen = new Set([start]);
    const stack = [{ at: start, next: 0, best: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.next < up[top.at].length) {
        const m = up[top.at][top.next++];
        if (depth[m] >= 0) top.best = Math.max(top.best, depth[m] + 1);
        else if (seen.has(m)) top.best = Math.max(top.best, 1);
        else {
          seen.add(m);
          stack.push({ at: m, next: 0, best: 0 });
        }
        continue;
      }
      stack.pop();
      depth[top.at] = top.best;
      const parent = stack[stack.length - 1];
      if (parent !== undefined)
        parent.best = Math.max(parent.best, top.best + 1);
    }
  }
  return depth;
}

// why: mockup `placeLayers` (lib/topology.js lines 1648-1663) — upstream first, then type and label
// (C5), then two barycentre sweeps over the drawn neighbours in lower rows
function ordered(
  drawn: Drawn,
  layers: number[][],
  layerOf: number[],
  lin: number[],
) {
  const order: number[] = [];
  for (const row of layers) {
    row.sort(
      (a, b) =>
        lin[a] - lin[b] || byTypeThenLabel(drawn.nodes[a], drawn.nodes[b]),
    );
    row.forEach((at, i) => (order[at] = i));
  }
  const lower = drawn.adj.map((list, at) =>
    list.filter((m) => layerOf[m] < layerOf[at]),
  );
  const centre: number[] = [];
  for (let sweep = 0; sweep < SWEEPS; sweep++)
    for (const row of layers) {
      for (const at of row) {
        const nb = lower[at];
        centre[at] =
          nb.length > 0
            ? nb.reduce((sum, m) => sum + order[m], 0) / nb.length
            : order[at];
      }
      row.sort((a, b) => centre[a] - centre[b] || lin[a] - lin[b]);
      row.forEach((at, i) => (order[at] = i));
    }
}

// why: mockup lines 1667-1672 — the room of a node along its row: the label width side by side in
// a vertical tree, the icon and the two-line label stacked in a horizontal one
function sizeOf(node: Laid, vertical: boolean): number {
  if (!vertical) return node.h + (node.named ? 36 : 22);
  return node.named
    ? Math.max(node.w + 24, node.chars * 7.6 + 20)
    : node.w + 28;
}

function placed(drawn: Drawn, layers: number[][], vertical: boolean): Point[] {
  const pos: Point[] = [];
  const step = vertical ? STEP_V : STEP_H;
  layers.forEach((row, li) => {
    const sizes = row.map((at) => sizeOf(drawn.nodes[at], vertical));
    let along = -sizes.reduce((sum, size) => sum + size, 0) / 2;
    row.forEach((at, i) => {
      const c = along + sizes[i] / 2;
      along += sizes[i];
      pos[at] = vertical ? { x: c, y: li * step } : { x: li * step, y: c };
    });
  });
  return pos;
}

// why: mockup `rowPositions` (lib/topology.js lines 1640-1645) — the row keys compacted to indexes;
// the rows stay in `CanvasState.treeRows` for STORY-002-07 (epic C4)
export function treeLayout(
  drawn: Drawn,
  frontier: Frontier,
  vocab: Vocab,
  vertical: boolean,
): { positions: [DrawnId, Point][]; treeRows: TreeRows } {
  const keys = rowKeysOf(frontier, vocab);
  const sorted = [...new Set(keys)].sort((a, b) => a - b);
  const index = new Map(sorted.map((key, i) => [key, i]));
  const layerOf = keys.map((key) => index.get(key) as number);
  const layers: number[][] = sorted.map(() => []);
  layerOf.forEach((li, at) => layers[li].push(at));
  ordered(drawn, layers, layerOf, lineageDepth(drawn, vocab));
  const pos = placed(drawn, layers, vertical);
  const step = vertical ? STEP_V : STEP_H;
  return {
    positions: drawn.nodes.map((node, at) => [node.id, pos[at]]),
    treeRows: {
      vertical,
      rows: drawn.nodes.map((node, at) => [node.id, keys[at]]),
      keyCoord: sorted.map((key, i) => [key, i * step]),
    },
  };
}
