import type { Graph } from "../data/normalize";
import {
  groupKey,
  groupKeyOf,
  type CanvasState,
  type DrawnId,
  type Grouping,
  type GroupKey,
} from "../state/canvasState";
import { entityType, type Vocab } from "../vocab/resolve";

// why: PRD FR-QDIC-5 — triples with the same subject, predicate and object are one link
export type Link = {
  subject: number;
  predicate: string;
  object: number;
  count: number;
  // why: owner decision H5 — a link is retired when at least one of its triples is retired
  retired: boolean;
};

export type Topology = {
  ids: string[];
  labels: string[];
  types: (string | null)[];
  entityOf: Map<string, number>;
  links: Link[];
  incident: number[][];
  neighbours: number[][];
  degree: number[];
  familyOf: Map<string, string>;
};

function linksOf(graph: Graph, entityOf: Map<string, number>): Link[] {
  const byKey = new Map<string, Link>();
  for (const triple of graph.triples) {
    const key = JSON.stringify([
      triple.subject,
      triple.predicate,
      triple.object,
    ]);
    const link = byKey.get(key);
    if (link) {
      link.count++;
      link.retired ||= triple.retired;
    } else
      byKey.set(key, {
        subject: entityOf.get(triple.subject) as number,
        predicate: triple.predicate,
        object: entityOf.get(triple.object) as number,
        count: 1,
        retired: triple.retired,
      });
  }
  return [...byKey.values()];
}

function adjacency(size: number, links: Link[]) {
  const incident: number[][] = Array.from({ length: size }, () => []);
  links.forEach((link, index) => {
    incident[link.subject].push(index);
    if (link.object !== link.subject) incident[link.object].push(index);
  });
  const mark = new Int32Array(size).fill(-1);
  const neighbours = incident.map((list, entity) => {
    const out: number[] = [];
    for (const index of list) {
      const link = links[index];
      const other = link.subject === entity ? link.object : link.subject;
      if (other === entity || mark[other] === entity) continue;
      mark[other] = entity;
      out.push(other);
    }
    return out.sort((a, b) => a - b);
  });
  return { incident, neighbours, degree: incident.map((list) => list.length) };
}

// why: STORY-002-04 Context — record ids of a merged entity map to the entity first (FR-DATA-5)
export function topology(graph: Graph, vocab: Vocab): Topology {
  const entityOf = new Map<string, number>();
  graph.entities.forEach((entity, index) => {
    entityOf.set(entity.id, index);
    for (const record of entity.records) entityOf.set(record, index);
  });
  const links = linksOf(graph, entityOf);
  return {
    ids: graph.entities.map((entity) => entity.id),
    labels: graph.entities.map((entity) => entity.label),
    types: graph.entities.map((entity) => entityType(vocab, entity.id)),
    entityOf,
    links,
    ...adjacency(graph.entities.length, links),
    familyOf: new Map(
      [...vocab.predicates.values()].map((item) => [item.name, item.family]),
    ),
  };
}

// why: mockup `computeView` (lib/topology.js line 558) — an entity of a type that is off stays in
// the drawn set but is not drawn (FR-FILTER-6); `null` is the row of the entities with no type (D93 (1))
export function offOf(top: Topology, state: CanvasState): Uint8Array {
  const off = new Set(state.filters.typesOff);
  const mask = new Uint8Array(top.ids.length);
  top.types.forEach((type, entity) => {
    if (off.has(type)) mask[entity] = 1;
  });
  return mask;
}

export type Grouper = {
  add(entity: number): void;
  drop(entity: number): void;
  has(entity: number): boolean;
  count(): number;
  bucketOf(entity: number): GroupKey | null;
  sizeOf(key: GroupKey): number;
};

type Tally = {
  top: Topology;
  least: number;
  member: Uint8Array;
  degree: Int32Array;
  sum: Float64Array;
  bucket: (GroupKey | null)[];
  sizes: Map<GroupKey, number>;
  drawn: number;
  saved: number;
};

export function minimum(grouping: Grouping): number {
  return grouping === "off" ? Infinity : grouping;
}

function otherEnd(top: Topology, link: number, entity: number): number {
  const { subject, object } = top.links[link];
  return subject === entity ? object : subject;
}

function resize(tally: Tally, key: GroupKey, by: number) {
  const gain = (n: number) => (n >= tally.least ? n - 1 : 0);
  const before = tally.sizes.get(key) ?? 0;
  tally.sizes.set(key, before + by);
  tally.saved += gain(before + by) - gain(before);
}

// why: mockup `bucketize` (lib/topology.js lines 615-632) — a leaf has one drawn link and its
// other end has more; `sum` holds the index of the only link when the degree is 1
function leafKey(tally: Tally, entity: number): GroupKey | null {
  const { top, member, degree, sum } = tally;
  if (member[entity] === 0 || degree[entity] !== 1) return null;
  const anchor = otherEnd(top, sum[entity], entity);
  if (degree[anchor] < 2) return null;
  const link = top.links[sum[entity]];
  const direction = link.subject === anchor ? ">" : "<";
  return groupKey(
    top.ids[anchor],
    link.predicate,
    direction,
    top.types[entity],
  );
}

function refresh(tally: Tally, entity: number) {
  const key = leafKey(tally, entity);
  const before = tally.bucket[entity];
  if (key === before) return;
  if (before !== null) resize(tally, before, -1);
  if (key !== null) resize(tally, key, 1);
  tally.bucket[entity] = key;
}

// why: a link changes the leaf state of its two ends and, when an end goes from 1 to 2 links (or
// back), of the far end of that end's other link; nothing else changes (NF-1)
function change(tally: Tally, entity: number, by: 1 | -1) {
  const { top, member, degree, sum } = tally;
  const touched = [entity];
  for (const link of top.incident[entity]) {
    const next = otherEnd(top, link, entity);
    if (next === entity) {
      degree[entity] += 2 * by;
      sum[entity] += 2 * by * link;
      continue;
    }
    if (member[next] === 0) continue;
    if (degree[next] === (by === 1 ? 1 : 2)) {
      const sole = by === 1 ? sum[next] : sum[next] - link;
      touched.push(otherEnd(top, sole, next));
    }
    degree[entity] += by;
    sum[entity] += by * link;
    degree[next] += by;
    sum[next] += by * link;
    touched.push(next);
  }
  for (const item of touched) refresh(tally, item);
}

// why: the grouped count is kept up to date one entity at a time, so the hop fill stays
// near-linear in the graph size (NF-1)
export function grouper(top: Topology, grouping: Grouping): Grouper {
  const size = top.ids.length;
  const tally: Tally = {
    top,
    least: minimum(grouping),
    member: new Uint8Array(size),
    degree: new Int32Array(size),
    sum: new Float64Array(size),
    bucket: new Array<GroupKey | null>(size).fill(null),
    sizes: new Map(),
    drawn: 0,
    saved: 0,
  };
  return {
    add(entity) {
      if (tally.member[entity] === 1) return;
      tally.member[entity] = 1;
      tally.drawn++;
      change(tally, entity, 1);
    },
    drop(entity) {
      if (tally.member[entity] === 0) return;
      change(tally, entity, -1);
      tally.member[entity] = 0;
      tally.drawn--;
    },
    has: (entity) => tally.member[entity] === 1,
    count: () => tally.drawn - tally.saved,
    bucketOf: (entity) => tally.bucket[entity],
    sizeOf: (key) => tally.sizes.get(key) ?? 0,
  };
}

export type Grouped = {
  groupOf: (GroupKey | null)[];
  members: Map<GroupKey, number[]>;
};

// why: PRD FR-CANVAS-1 — a bucket of the Grouping size or more is one node unless it is expanded
export function groupsOf(
  top: Topology,
  state: CanvasState,
  drawn: Grouper,
): Grouped {
  const least = minimum(state.grouping);
  const expanded = new Set(state.expandedGroups);
  const groupOf: (GroupKey | null)[] = [];
  const members = new Map<GroupKey, number[]>();
  for (let entity = 0; entity < top.ids.length; entity++) {
    const key = drawn.bucketOf(entity);
    const grouped =
      key !== null && drawn.sizeOf(key) >= least && !expanded.has(key);
    groupOf.push(grouped ? key : null);
    if (!grouped) continue;
    const list = members.get(key) ?? [];
    list.push(entity);
    members.set(key, list);
  }
  return { groupOf, members };
}

export function maskOf(top: Topology, revealed: string[] | null): Uint8Array {
  const mask = new Uint8Array(top.ids.length);
  if (revealed === null) return mask.fill(1);
  for (const id of revealed) {
    const entity = top.entityOf.get(id);
    if (entity !== undefined) mask[entity] = 1;
  }
  return mask;
}

export function idsOf(top: Topology, mask: Uint8Array): string[] {
  return top.ids.filter((_, entity) => mask[entity] === 1);
}

export function drawnGrouper(top: Topology, state: CanvasState) {
  const mask = maskOf(top, state.revealed);
  const off = offOf(top, state);
  const drawn = grouper(top, state.grouping);
  mask.forEach((bit, entity) => {
    if (bit === 1 && off[entity] === 0) drawn.add(entity);
  });
  return { mask, off, drawn };
}

// why: mockup `expand` (lib/topology.js lines 2122-2132) — only a drawn group opens
export function expandGroup(
  top: Topology,
  state: CanvasState,
  group: DrawnId,
): CanvasState {
  const key = groupKeyOf(group);
  if (key === null) return state;
  const { drawn } = drawnGrouper(top, state);
  if (!groupsOf(top, state, drawn).members.has(key)) return state;
  return { ...state, expandedGroups: [...state.expandedGroups, key] };
}

export function collapseGroup(state: CanvasState, group: DrawnId): CanvasState {
  const key = groupKeyOf(group);
  if (key === null || !state.expandedGroups.includes(key)) return state;
  return {
    ...state,
    expandedGroups: state.expandedGroups.filter((item) => item !== key),
  };
}
