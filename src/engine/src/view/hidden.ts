import type { Graph } from "../data/normalize";
import {
  entityDrawnId,
  entityOfDrawnId,
  type CanvasState,
  type DrawnId,
  type HiddenEntry,
} from "../state/canvasState";
import { entityType, type Vocab } from "../vocab/resolve";
import { drawnIdOf, drawnView, revealInto } from "./frontier";
import { idsOf, maskOf, offOf, type Topology } from "./group";

export type HideResult = {
  state: CanvasState;
  hidden: number;
  refused?: "last-drawn";
};

export type HiddenItem = {
  key: DrawnId;
  members: string[];
  stranded: number;
  seq: number;
};

// why: P20, SA §4.5 — `faded` is a state of its own (PRD Q22, f-0036)
export type OnCanvas = "drawn" | "not-drawn" | "hidden" | "faded";

// why: lead decision D93 (4), SA §4.4 — the refusal and the strand rule count only entities of
// types that are on (`on`); `live` counts the links of each such entity to the others (a self-loop
// counts), so each strand test reads one number and a hide stays linear in the graph size (NF-1)
type DrawnSet = {
  mask: Uint8Array;
  on: Uint8Array;
  live: Int32Array;
  size: number;
};

function drawnSet(top: Topology, state: CanvasState): DrawnSet {
  const mask = maskOf(top, state.revealed);
  const off = offOf(top, state);
  const on = mask.map((bit, entity) => bit & (1 - off[entity]));
  const live = new Int32Array(top.ids.length);
  for (const { subject, object } of top.links) {
    if (on[subject] === 0 || on[object] === 0) continue;
    live[subject]++;
    if (object !== subject) live[object]++;
  }
  return { mask, on, live, size: on.reduce((sum, bit) => sum + bit, 0) };
}

function leave(top: Topology, set: DrawnSet, entity: number) {
  set.mask[entity] = 0;
  if (set.on[entity] === 0) return;
  set.on[entity] = 0;
  set.size--;
  for (const index of top.incident[entity]) {
    const { subject, object } = top.links[index];
    const other = subject === entity ? object : subject;
    if (other !== entity && set.on[other] === 1) set.live[other]--;
  }
}

// why: STORY-002-06 strand rule (mockup `prune`, lib/topology.js lines 766-769) — direct neighbours
// in canonical order, each against the drawn set as it shrinks; the last entity always stays
function strand(top: Topology, set: DrawnSet, from: number[]): number[] {
  const near = [...new Set(from.flatMap((entity) => top.neighbours[entity]))];
  const stranded: number[] = [];
  for (const entity of near.sort((a, b) => a - b))
    if (set.on[entity] === 1 && set.size > 1 && set.live[entity] === 0) {
      leave(top, set, entity);
      stranded.push(entity);
    }
  return stranded;
}

function entryOf(
  top: Topology,
  key: DrawnId,
  members: number[],
  stranded: number[],
  seq: number,
): HiddenEntry {
  const names = (list: number[]) => list.map((entity) => top.ids[entity]);
  return { key, members: names(members), stranded: names(stranded), seq };
}

// why: mockup `prune` (lib/topology.js lines 771-773) — a second hide of a key goes to the top, and
// a canvas that showed everything is now a custom scope. STORY-002-04 Context and SA §6 row 2 — every
// `origins` pair with an end that leaves goes, so a key stays unique and an entity that comes back
// starts a new hop (QA findings F-1, F-2)
function hiddenState(
  top: Topology,
  state: CanvasState,
  set: DrawnSet,
  entries: HiddenEntry[],
): CanvasState {
  const keys = new Set(entries.map((entry) => entry.key));
  const kept = state.hidden.filter((entry) => !keys.has(entry.key));
  const drawn = (id: string) => set.mask[top.entityOf.get(id) as number] === 1;
  return {
    ...state,
    revealed: idsOf(top, set.mask),
    origins: state.origins.filter(
      ([child, from]) => drawn(child) && drawn(from),
    ),
    scope:
      state.scope.mode === "all"
        ? { ...state.scope, mode: "custom" }
        : state.scope,
    hidden: [...kept, ...entries],
  };
}

function nodeKey(top: Topology, node: DrawnId): DrawnId {
  const id = entityOfDrawnId(node);
  const entity = id === null ? undefined : top.entityOf.get(id);
  return entity === undefined ? node : entityDrawnId(top.ids[entity]);
}

// why: STORY-002-06 question 2 (Q19, option (b)) — a hide that would leave no entity in the drawn
// set is refused, so the user gets the reason (FR-TABLE-5, guardrail 6)
export function hideNode(
  top: Topology,
  state: CanvasState,
  node: DrawnId,
): HideResult {
  const key = nodeKey(top, node);
  const target = drawnView(top, state).frontier.nodes.find(
    (item) => item.id === key,
  );
  if (target === undefined) return { state, hidden: 0 };
  const members = ("members" in target ? target.members : [target.entity]).map(
    (id) => top.entityOf.get(id) as number,
  );
  const set = drawnSet(top, state);
  if (members.length >= set.size)
    return { state, hidden: 0, refused: "last-drawn" };
  for (const entity of members) leave(top, set, entity);
  const entry = entryOf(
    top,
    key,
    members,
    strand(top, set, members),
    state.seq,
  );
  return {
    state: hiddenState(top, state, set, [entry]),
    hidden: members.length,
  };
}

// why: mockup `hideMany` (lib/topology.js lines 783-808) — every listed entity leaves first, then
// the strand rule runs per entity in call order; the first listed entity of a type that is on stays
// when all of them would go, and with no such entity drawn the call is refused (D93 (4), STORY-002-06
// Context "Bulk rules")
export function hideMany(
  top: Topology,
  state: CanvasState,
  ids: string[],
): HideResult {
  const set = drawnSet(top, state);
  if (set.size === 0) return { state, hidden: 0, refused: "last-drawn" };
  const seen = new Uint8Array(top.ids.length);
  const list: number[] = [];
  for (const id of ids) {
    const entity = top.entityOf.get(id);
    if (entity === undefined || seen[entity] === 1) continue;
    seen[entity] = 1;
    if (set.mask[entity] === 1) list.push(entity);
  }
  const shown = list.filter((entity) => set.on[entity] === 1);
  const cut = shown.length >= set.size;
  if (cut) list.splice(list.indexOf(shown[0]), 1);
  if (list.length === 0)
    return cut
      ? { state, hidden: 0, refused: "last-drawn" }
      : { state, hidden: 0 };
  for (const entity of list) leave(top, set, entity);
  const entries = list.map((entity) =>
    entryOf(
      top,
      entityDrawnId(top.ids[entity]),
      [entity],
      strand(top, set, [entity]),
      state.seq,
    ),
  );
  return {
    state: hiddenState(top, state, set, entries),
    hidden: list.length,
  };
}

function indexes(top: Topology, ids: string[]): number[] {
  return ids.flatMap((id) => top.entityOf.get(id) ?? []);
}

// why: mockup `hiddenList` (lib/topology.js line 828) — an entry stays only while one of its
// members is off the canvas
function listed(top: Topology, entries: HiddenEntry[], mask: Uint8Array) {
  return entries.filter((entry) =>
    indexes(top, entry.members).some((entity) => mask[entity] === 0),
  );
}

export function settled(top: Topology, state: CanvasState): CanvasState {
  if (state.hidden.length === 0) return state;
  const hidden = listed(top, state.hidden, maskOf(top, state.revealed));
  return hidden.length === state.hidden.length ? state : { ...state, hidden };
}

// why: mockup `restore` (lib/topology.js lines 849-853) — a drawn neighbour in canonical order, else
// the origin of a neighbour that returns in the same call
function originsOf(
  top: Topology,
  state: CanvasState,
  mask: Uint8Array,
  back: number[],
) {
  const off = offOf(top, state);
  const from = new Int32Array(top.ids.length).fill(-1);
  for (const entity of back)
    from[entity] =
      top.neighbours[entity].find(
        (next) => mask[next] === 1 && off[next] === 0,
      ) ?? -1;
  for (const entity of back) {
    if (from[entity] !== -1) continue;
    const via = top.neighbours[entity].find((next) => from[next] !== -1);
    if (via !== undefined) from[entity] = from[via];
  }
  return [
    ...state.origins,
    ...back.flatMap((entity): [string, string][] =>
      from[entity] === -1 ? [] : [[top.ids[entity], top.ids[from[entity]]]],
    ),
  ];
}

// why: mockup `restore` (lib/topology.js lines 839-855) — members and strands come back, except a
// member of another entry still on the list; with nothing left off, the scope is all again and the
// drawn set stays a list, so a collapse still works
export function restore(
  top: Topology,
  state: CanvasState,
  keys: DrawnId[],
): CanvasState {
  const wanted = new Set(keys);
  const chosen = state.hidden.filter((entry) => wanted.has(entry.key));
  if (chosen.length === 0) return state;
  const mask = maskOf(top, state.revealed);
  const rest = listed(
    top,
    state.hidden.filter((entry) => !wanted.has(entry.key)),
    mask,
  );
  const held = new Uint8Array(top.ids.length);
  for (const entry of rest)
    for (const entity of indexes(top, entry.members)) held[entity] = 1;
  const mark = new Uint8Array(top.ids.length);
  for (const entry of chosen)
    for (const entity of indexes(top, [...entry.members, ...entry.stranded]))
      if (held[entity] === 0 && mask[entity] === 0) mark[entity] = 1;
  const back = [...mark.keys()].filter((entity) => mark[entity] === 1);
  const origins = originsOf(top, state, mask, back);
  for (const entity of back) mask[entity] = 1;
  const whole = mask.every((bit) => bit === 1) && rest.length === 0;
  return {
    ...state,
    revealed: idsOf(top, mask),
    origins,
    hidden: rest,
    scope:
      whole && state.scope.mode === "custom"
        ? { ...state.scope, mode: "all" }
        : state.scope,
  };
}

// why: STORY-002-06 Context "Restore rule" — a member first, else a strand (FR-CANVAS-12 lists
// strands; the mockup checks members only, line 834); the oldest entry first, as the mockup
function keysOf(top: Topology, entries: HiddenEntry[]) {
  const byMember = new Map<number, DrawnId>();
  const byStrand = new Map<number, DrawnId>();
  for (const entry of entries) {
    for (const entity of indexes(top, entry.members))
      if (!byMember.has(entity)) byMember.set(entity, entry.key);
    for (const entity of indexes(top, entry.stranded))
      if (!byStrand.has(entity)) byStrand.set(entity, entry.key);
  }
  return (entity: number) => byMember.get(entity) ?? byStrand.get(entity);
}

// why: mockup `showMany` (lib/topology.js lines 811-824) — hidden ids restore their entries; the
// other ids arrive along their path (STORY-002-06 question 4)
export function showMany(
  top: Topology,
  state: CanvasState,
  ids: string[],
): CanvasState {
  if (state.revealed === null) return state;
  const mask = maskOf(top, state.revealed);
  const keyOf = keysOf(top, listed(top, state.hidden, mask));
  const origins = [...state.origins];
  const keys: DrawnId[] = [];
  for (const entity of new Set(indexes(top, ids))) {
    if (mask[entity] === 1) continue;
    const key = keyOf(entity);
    if (key !== undefined) keys.push(key);
    else revealInto(top, mask, origins, entity);
  }
  const shown = { ...state, revealed: idsOf(top, mask), origins };
  return keys.length === 0 ? shown : restore(top, shown, keys);
}

function entityIndex(graph: Graph, id: string): number {
  return graph.entities.findIndex(
    (item) => item.id === id || item.records.includes(id),
  );
}

function offTheCanvas(state: CanvasState) {
  const drawn = new Set(state.revealed ?? []);
  return (id: string) => state.revealed !== null && !drawn.has(id);
}

// why: mockup `hiddenList` (lib/topology.js lines 826-830) — newest first, with the strands that
// are still off the canvas
export function hiddenList(state: CanvasState): HiddenItem[] {
  const off = offTheCanvas(state);
  return state.hidden
    .filter((entry) => entry.members.some(off))
    .reverse()
    .map((entry) => ({
      key: entry.key,
      members: entry.members,
      stranded: entry.stranded.filter(off).length,
      seq: entry.seq,
    }));
}

export function hiddenOf(
  state: CanvasState,
  graph: Graph,
  id: string,
): DrawnId | null {
  const at = entityIndex(graph, id);
  if (at === -1) return null;
  const entity = graph.entities[at].id;
  const off = offTheCanvas(state);
  if (!off(entity)) return null;
  const entries = state.hidden.filter((entry) => entry.members.some(off));
  const owner =
    entries.find((entry) => entry.members.includes(entity)) ??
    entries.find((entry) => entry.stranded.includes(entity));
  return owner?.key ?? null;
}

// why: PRD FR-TABLE-4 and SA §4.4 — an entity of a type that is off is not drawn (finding f-0016;
// the mockup returns drawn), an entity on the Hidden list is hidden, and a drawn entity outside
// the shown set of Group around root is faded (FR-CANVAS-14)
export function onCanvas(
  state: CanvasState,
  graph: Graph,
  vocab: Vocab,
  id: string,
): OnCanvas {
  const at = entityIndex(graph, id);
  if (at === -1) return "not-drawn";
  const entity = graph.entities[at].id;
  if (offTheCanvas(state)(entity))
    return hiddenOf(state, graph, entity) === null ? "not-drawn" : "hidden";
  if (state.filters.typesOff.includes(entityType(vocab, entity)))
    return "not-drawn";
  if (state.around === null) return "drawn";
  const node = drawnIdOf(state, graph, vocab, entity);
  return node !== null && !state.around.shown.includes(node)
    ? "faded"
    : "drawn";
}
