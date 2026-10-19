import type { Graph } from "../data/normalize";
import {
  edgeKey,
  entityDrawnId,
  groupDrawnId,
  type CanvasState,
  type DrawnId,
  type EdgeKey,
  type Grouping,
} from "../state/canvasState";
import type { Vocab } from "../vocab/resolve";
import {
  drawnGrouper,
  grouper,
  groupsOf,
  idsOf,
  maskOf,
  minimum,
  offOf,
  topology,
  type Grouper,
  type Topology,
} from "./group";

export type EntityNode = {
  id: DrawnId;
  entity: string;
  type: string | null;
  label: string;
  more: number;
  opened: number;
  group: DrawnId | null;
};

export type GroupNode = {
  id: DrawnId;
  type: string | null;
  members: string[];
  count: number;
  more: number;
  opened: number;
};

export type DrawnNode = EntityNode | GroupNode;

export type DrawnEdge = {
  key: EdgeKey;
  subject: DrawnId;
  predicate: string;
  object: DrawnId;
  count: number;
  muted: boolean;
};

export type Frontier = { nodes: DrawnNode[]; edges: DrawnEdge[] };

export type DrawnView = {
  drawnOf: (DrawnId | null)[];
  frontier: Frontier;
};

// why: mockup `seedScope` (lib/topology.js line 670) — at most 2,000 entities of a hop are tried
const TRY_CAP = 2000;

function openedOf(top: Topology, state: CanvasState, mask: Uint8Array) {
  const opened = new Int32Array(top.ids.length);
  for (const [id, origin] of state.origins) {
    const entity = top.entityOf.get(id);
    const from = top.entityOf.get(origin);
    if (entity !== undefined && from !== undefined && mask[entity] === 1)
      opened[from]++;
  }
  return opened;
}

// why: mockup `offCanvas` (lib/topology.js lines 635-642) — a neighbour of a type that is off is
// not counted. PRD FR-CANVAS-14 (Q22) — while grouped, a faded neighbour also counts, per entity
function moreOf(
  top: Topology,
  state: CanvasState,
  mask: Uint8Array,
  off: Uint8Array,
  drawnOf: (DrawnId | null)[],
) {
  const shown = state.around === null ? null : new Set(state.around.shown);
  const counted = (next: number) => {
    const id = drawnOf[next];
    if (shown !== null && id !== null && !shown.has(id)) return true;
    return state.revealed !== null && mask[next] === 0 && off[next] === 0;
  };
  return (entity: number) => top.neighbours[entity].filter(counted).length;
}

// why: mockup `isMuted` (lib/topology.js line 1047) — a family or predicate filter only styles an
// edge (FR-FILTER-6)
function mutedOf(top: Topology, state: CanvasState) {
  const families = new Set(state.filters.familiesOff);
  const predicates = new Set(state.filters.predicatesOff);
  return (predicate: string) => {
    const family = top.familyOf.get(predicate);
    return (
      predicates.has(predicate) ||
      (family !== undefined && families.has(family))
    );
  };
}

function edgesOf(
  top: Topology,
  drawnOf: (DrawnId | null)[],
  muted: (predicate: string) => boolean,
) {
  const edges = new Map<EdgeKey, DrawnEdge>();
  for (const link of top.links) {
    const subject = drawnOf[link.subject];
    const object = drawnOf[link.object];
    if (subject === null || object === null) continue;
    const key = edgeKey(subject, link.predicate, object);
    const edge = edges.get(key);
    if (edge) edge.count += link.count;
    else
      edges.set(key, {
        key,
        subject,
        predicate: link.predicate,
        object,
        count: link.count,
        muted: muted(link.predicate),
      });
  }
  return [...edges.values()];
}

// why: STORY-003-01 Rule A, mockup `bucket` (lib/topology.js lines 567-570, 2115-2121) — the
// expanded group that a `collapseGroup` makes again, so a member can close it (FR-CANVAS-1)
function memberGroupOf(state: CanvasState, drawn: Grouper) {
  const least = minimum(state.grouping);
  const expanded = new Set(state.expandedGroups);
  return (entity: number): DrawnId | null => {
    const key = drawn.bucketOf(entity);
    return key !== null && expanded.has(key) && drawn.sizeOf(key) >= least
      ? groupDrawnId(key)
      : null;
  };
}

// why: epic condition C4 — nodes in canonical entity order (a group at its first member), edges in
// canonical triple order
export function drawnView(top: Topology, state: CanvasState): DrawnView {
  const { mask, off, drawn } = drawnGrouper(top, state);
  const { groupOf, members } = groupsOf(top, state, drawn);
  const group = memberGroupOf(state, drawn);
  const drawnOf = groupOf.map((key, entity) => {
    if (mask[entity] === 0 || off[entity] === 1) return null;
    return key === null ? entityDrawnId(top.ids[entity]) : groupDrawnId(key);
  });
  const opened = openedOf(top, state, mask);
  const more = moreOf(top, state, mask, off, drawnOf);
  const nodes: DrawnNode[] = [];
  groupOf.forEach((key, entity) => {
    const id = drawnOf[entity];
    if (id === null) return;
    if (key === null) {
      nodes.push({
        id,
        entity: top.ids[entity],
        type: top.types[entity],
        label: top.labels[entity],
        more: more(entity),
        opened: opened[entity],
        group: group(entity),
      });
      return;
    }
    const list = members.get(key) as number[];
    if (list[0] !== entity) return;
    nodes.push({
      id: groupDrawnId(key),
      type: top.types[entity],
      members: list.map((index) => top.ids[index]),
      count: list.length,
      more: 0,
      opened: 0,
    });
  });
  const edges = edgesOf(top, drawnOf, mutedOf(top, state));
  return { drawnOf, frontier: { nodes, edges } };
}

export function frontier(
  state: CanvasState,
  graph: Graph,
  vocab: Vocab,
): Frontier {
  return drawnView(topology(graph, vocab), state).frontier;
}

export function drawnIdOf(
  state: CanvasState,
  graph: Graph,
  vocab: Vocab,
  id: string,
): DrawnId | null {
  const top = topology(graph, vocab);
  const entity = top.entityOf.get(id);
  return entity === undefined ? null : drawnView(top, state).drawnOf[entity];
}

export function mostConnected(top: Topology): number | null {
  let best: number | null = null;
  top.degree.forEach((degree, entity) => {
    if (best === null || degree > top.degree[best]) best = entity;
  });
  return best;
}

export function wholeCount(top: Topology, grouping: Grouping): number {
  const all = grouper(top, grouping);
  for (let entity = 0; entity < top.ids.length; entity++) all.add(entity);
  return all.count();
}

function tryOneByOne(
  top: Topology,
  drawn: Grouper,
  ring: number[],
  budget: number,
) {
  for (const entity of ring) drawn.drop(entity);
  // why: lead decision D17 — highest degree first, ties in canonical entity order (NF-3)
  const order = [...ring].sort(
    (a, b) => top.degree[b] - top.degree[a] || a - b,
  );
  for (const entity of order.slice(0, TRY_CAP)) {
    drawn.add(entity);
    if (drawn.count() > budget) drawn.drop(entity);
  }
}

// why: mockup `seedScope` (lib/topology.js lines 661-674) — a whole hop goes in while the grouped
// count stays within the budget; else its entities one by one, then stop (FR-CANVAS-5)
export function fill(
  top: Topology,
  root: number,
  budget: number,
  grouping: Grouping,
): string[] {
  const drawn = grouper(top, grouping);
  const seen = new Uint8Array(top.ids.length);
  drawn.add(root);
  seen[root] = 1;
  let hop = [root];
  while (hop.length > 0) {
    const ring: number[] = [];
    for (const entity of hop)
      for (const next of top.neighbours[entity])
        if (seen[next] === 0) {
          seen[next] = 1;
          ring.push(next);
        }
    if (ring.length === 0) break;
    for (const entity of ring) drawn.add(entity);
    if (drawn.count() <= budget) {
      hop = ring;
      continue;
    }
    tryOneByOne(top, drawn, ring, budget);
    break;
  }
  return top.ids.filter((_, entity) => drawn.has(entity));
}

// why: mockup `explore` (lib/topology.js lines 692-708) — the undrawn neighbours of a type that is
// on come in with this entity as origin (FR-CANVAS-6)
export function explore(
  top: Topology,
  state: CanvasState,
  id: string,
): CanvasState {
  const entity = top.entityOf.get(id);
  if (state.revealed === null || entity === undefined) return state;
  const mask = maskOf(top, state.revealed);
  const off = offOf(top, state);
  if (mask[entity] === 0 || off[entity] === 1) return state;
  const added = top.neighbours[entity].filter(
    (next) => mask[next] === 0 && off[next] === 0,
  );
  if (added.length === 0) return state;
  for (const next of added) mask[next] = 1;
  const origin = top.ids[entity];
  return {
    ...state,
    revealed: idsOf(top, mask),
    origins: [
      ...state.origins,
      ...added.map((next): [string, string] => [top.ids[next], origin]),
    ],
  };
}

// why: mockup `unexplore` (lib/topology.js lines 710-737) — all that this entity brought in, and
// all that those brought in, leave with their origins
export function collapse(
  top: Topology,
  state: CanvasState,
  id: string,
): CanvasState {
  const entity = top.entityOf.get(id);
  if (state.revealed === null || entity === undefined) return state;
  const origin = top.ids[entity];
  const children = new Map<string, string[]>();
  for (const [child, from] of state.origins) {
    const list = children.get(from) ?? [];
    list.push(child);
    children.set(from, list);
  }
  const drop = new Set<string>();
  const stack = [origin];
  while (stack.length > 0)
    for (const child of children.get(stack.pop() as string) ?? [])
      if (child !== origin && !drop.has(child)) {
        drop.add(child);
        stack.push(child);
      }
  if (drop.size === 0) return state;
  return {
    ...state,
    revealed: state.revealed.filter((item) => !drop.has(item)),
    origins: state.origins.filter(([child]) => !drop.has(child)),
  };
}

const PATH_HOPS = 4;

// why: mockup `revealPath` (lib/topology.js lines 866-887) — breadth first from the target, so the
// first drawn entity found ends the shortest path (FR-CANVAS-4); `prev` holds only the entities
// visited, so a bulk Show stays near-linear (S26)
function pathTo(top: Topology, mask: Uint8Array, target: number) {
  const prev = new Map<number, number>([[target, -1]]);
  let ring = [target];
  for (let hop = 0; hop < PATH_HOPS && ring.length > 0; hop++) {
    const next: number[] = [];
    for (const entity of ring)
      for (const near of top.neighbours[entity]) {
        if (prev.has(near)) continue;
        prev.set(near, entity);
        if (mask[near] === 1) return { hit: near, prev };
        next.push(near);
      }
    ring = next;
  }
  return { hit: null, prev };
}

// why: mockup `revealPath` (lib/topology.js lines 867-888) — the target arrives alone when no drawn
// entity is within 4 hops; `mask` and `origins` change in place, so a bulk Show builds them once
export function revealInto(
  top: Topology,
  mask: Uint8Array,
  origins: [string, string][],
  target: number,
) {
  const { hit, prev } = pathTo(top, mask, target);
  if (hit === null) mask[target] = 1;
  else
    for (
      let from = hit, step = prev.get(hit) as number;
      step !== -1;
      step = prev.get(step) as number
    ) {
      mask[step] = 1;
      origins.push([top.ids[step], top.ids[from]]);
      from = step;
    }
}

function reveal(top: Topology, state: CanvasState, target: number) {
  const mask = maskOf(top, state.revealed);
  const origins = [...state.origins];
  revealInto(top, mask, origins, target);
  return { ...state, revealed: idsOf(top, mask), origins };
}

// why: mockup `focus` (lib/topology.js lines 2166-2178) — draw the path, then open the group that
// holds the target
export function path(
  top: Topology,
  state: CanvasState,
  id: string,
): CanvasState {
  const target = top.entityOf.get(id);
  if (target === undefined) return state;
  const drawnBefore = maskOf(top, state.revealed)[target] === 1;
  const next = drawnBefore ? state : reveal(top, state, target);
  const { drawn } = drawnGrouper(top, next);
  const key = groupsOf(top, next, drawn).groupOf[target];
  if (key === null) return next;
  return { ...next, expandedGroups: [...next.expandedGroups, key] };
}
