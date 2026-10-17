import { collapseTarget, undoKeys, type Undo } from "../layout/collapse";
import { adjacency, indexOf, type IconMetrics } from "../layout/drawn";
import { entitiesOf, frameOf } from "../layout/origins";
import { place, type PlaceChange, type PlaceResult } from "../layout/place";
import { undoEntries, type UndoEntry } from "../layout/undo";
import {
  entityDrawnId,
  type Around,
  type CanvasState,
  type DrawnId,
  type LayoutName,
  type MoveItem,
  type Point,
} from "../state/canvasState";
import type { Vocab } from "../vocab/resolve";
import { clusters } from "./clusters";
import type { DrawnNode, Frontier } from "./frontier";
import { homeOf } from "./home";

export type AroundInfo = {
  id: DrawnId;
  label: string | null;
  type: string | null;
  shown: number;
  total: number;
};

export type Faded = { id: DrawnId; noPointer: true };

// why: FR-CANVAS-14 — "non-tree layouts"; a tree layout refuses the grouping
const TREES = new Set<LayoutName>(["tree-h", "tree-v"]);

function neighboursOf(frontier: Frontier, id: DrawnId): DrawnNode[] {
  const at = indexOf(frontier);
  return adjacency(frontier, at)
    [at.get(id) as number].map((m) => frontier.nodes[m])
    .filter((node) => node.id !== id);
}

function inOrder(frontier: Frontier, ids: Set<DrawnId>): DrawnId[] {
  return frontier.nodes.map((node) => node.id).filter((id) => ids.has(id));
}

function linkedTo(frontier: Frontier, id: DrawnId): Set<DrawnId> {
  const near = new Set<DrawnId>([id]);
  for (const edge of frontier.edges) {
    if (edge.subject === id) near.add(edge.object);
    if (edge.object === id) near.add(edge.subject);
  }
  return near;
}

// why: SA §4.4 `view/focus`, FR-CANVAS-14 — a position transaction: `saved` keeps every drawn
// position of the first grouping, a second root first puts the old neighbours back (mockup lines
// 1251-1257); the same root again ends it (exit 1); nothing enters the Hidden list
export function groupAround(
  state: CanvasState,
  frontier: Frontier,
  rootId: DrawnId,
  metrics: IconMetrics,
): CanvasState {
  if (TREES.has(state.layout)) return state;
  const old = state.around;
  if (old !== null && old.root === rootId) return homeOf(state, frontier);
  const root = frontier.nodes.find((node) => node.id === rootId);
  const now = new Map(state.positions);
  const at = now.get(rootId);
  if (root === undefined || at === undefined) return state;
  const saved =
    old?.saved ??
    frontier.nodes.flatMap((node): [DrawnId, Point][] => {
      const p = now.get(node.id);
      return p === undefined ? [] : [[node.id, p]];
    });
  const drawn = new Set(frontier.nodes.map((node) => node.id));
  const back = new Map(saved.filter(([id]) => drawn.has(id)));
  const pos = new Map<DrawnId, Point>();
  for (const id of old?.shown ?? []) {
    const spot = back.get(id);
    if (spot !== undefined) pos.set(id, spot);
  }
  const near = neighboursOf(frontier, rootId);
  for (const [id, p] of clusters(root, at, near, metrics)) pos.set(id, p);
  const around: Around = {
    root: rootId,
    saved,
    shown: inOrder(frontier, new Set([rootId, ...near.map((n) => n.id)])),
    events: old?.events ?? [],
    seq0: old?.seq0 ?? state.seq,
  };
  return {
    ...state,
    positions: state.positions.map(([id, p]) => [id, pos.get(id) ?? p]),
    around,
  };
}

// why: mockup `aroundInfo` (lib/topology.js lines 2358-2362) — computed, never stored, because the
// label is payload text (S-C3); a group root has no frontier label
export function aroundInfo(
  state: CanvasState,
  frontier: Frontier,
): AroundInfo | null {
  const around = state.around;
  const root = frontier.nodes.find((node) => node.id === around?.root);
  if (around === null || root === undefined) return null;
  const shown = new Set(around.shown);
  return {
    id: root.id,
    label: "entity" in root ? root.label : null,
    type: root.type,
    shown: frontier.nodes.filter((node) => shown.has(node.id)).length,
    total: frontier.nodes.length,
  };
}

// why: FR-CANVAS-14, SA §6 row 11 — the fade set is data; EPIC-003 gives these no pointer events
export function fadeSet(state: CanvasState, frontier: Frontier): Faded[] {
  if (state.around === null) return [];
  const shown = new Set(state.around.shown);
  return frontier.nodes
    .filter((node) => !shown.has(node.id))
    .map((node) => ({ id: node.id, noPointer: true }));
}

// why: STORY-002-07 `place` (D68) — the event key: the group that opened, or the origin of the
// newcomers of an explore (every one has the explored entity as its origin, STORY-002-04)
function eventOf(change: PlaceChange, state: CanvasState, born: DrawnNode[]) {
  const { action } = change;
  if (action.kind === "expandGroup") {
    const was = change.before.nodes.some((n) => n.id === action.group);
    const is = change.after.nodes.some((n) => n.id === action.group);
    return was && !is ? action.group : null;
  }
  const drawn = new Set(change.before.nodes.flatMap(entitiesOf));
  const pairs = new Map(state.origins);
  for (const node of born)
    for (const entity of entitiesOf(node)) {
      const from = pairs.get(entity);
      if (from !== undefined && !drawn.has(entity)) return entityDrawnId(from);
    }
  return null;
}

const homeEntry = (state: CanvasState, id: DrawnId) =>
  state.homes.find(([key]) => key === id);

// why: story questions 3 and 6 (Q24, option (b)) — an explore or a group expand while grouped is
// not an exit: it applies as STORY-002-07 `place`, its newcomers join `shown`, the faded neighbours
// of an explored shown node join with no move, and the event gets its `around.events` pair (D24)
export function expandAround(
  state: CanvasState,
  change: PlaceChange,
  vocab: Vocab,
  metrics: IconMetrics,
): PlaceResult {
  const result = place(state, change, vocab, metrics);
  const { action } = change;
  const around = state.around;
  if (
    around === null ||
    (action.kind !== "explore" && action.kind !== "expandGroup")
  )
    return result;
  const drawn = new Set(change.before.nodes.map((n) => n.id));
  const born = change.after.nodes.filter((n) => !drawn.has(n.id));
  const key = eventOf(change, state, born);
  const shown = new Set([...around.shown, ...born.map((n) => n.id)]);
  const node =
    key ?? (action.kind === "explore" ? entityDrawnId(action.id) : null);
  if (node !== null && around.shown.includes(node))
    for (const id of linkedTo(change.after, node)) shown.add(id);
  const entry = key === null ? undefined : homeEntry(result.state, key);
  const wrote =
    entry !== undefined && entry !== homeEntry(state, key as DrawnId);
  const events: Around["events"] =
    key === null ? around.events : [...around.events, [key, wrote]];
  const next = { ...around, shown: inOrder(change.after, shown), events };
  return { ...result, state: { ...result.state, around: next } };
}

// why: story Context rule (3), D76 — the earlier events on the `around.saved` spots, then the glide
// of a target with no `true` pair. An id leaves `saved` when the collapse forgets its position; a
// node that goes back into a group keeps its position (STORY-002-07 rule (h)(4)) and its saved
// spot. A node that the collapse puts back with no saved spot gets its new position as one: D81 (1)
// for a group node with no `true` pair (it is at its home), for every such node by the build memo
function savedAfter(
  around: Around,
  change: PlaceChange,
  cached: Map<DrawnId, Point>,
  {
    early,
    glide,
    folded,
  }: Omit<Undone, "keys"> & { folded: Map<DrawnId, Point> },
): [DrawnId, Point][] {
  const before = new Set(change.before.nodes.map((n) => n.id));
  const after = new Set(change.after.nodes.map((n) => n.id));
  const kept = around.saved.filter(
    ([id]) => after.has(id) || !before.has(id) || cached.has(id),
  );
  const stay = kept.filter(([id]) => before.has(id) && after.has(id));
  const moved = new Map(undoEntries(stay, early));
  const t = glide?.[0];
  const at = t === undefined ? undefined : moved.get(t);
  if (glide !== undefined && t !== undefined && at !== undefined)
    moved.set(t, undoEntries([[t, at]], [[t, 0, [glide]]])[0][1]);
  const out = kept.map(([id, p]): [DrawnId, Point] => [
    id,
    folded.get(id) ?? moved.get(id) ?? p,
  ]);
  const has = new Set(out.map(([id]) => id));
  for (const [id, p] of cached)
    if (!has.has(id) && (folded.has(id) || (after.has(id) && !before.has(id))))
      out.push([id, p]);
  return out;
}

// why: STORY-002-07 rule (h)(4) for the earlier events, which the `place` run does not see: a node
// that goes back into a group keeps the position from before the earliest undone event that names
// it, in `positions` and in `saved`
function foldedOf(change: PlaceChange, early: UndoEntry[]) {
  const held = new Set(change.after.nodes.flatMap(entitiesOf));
  const after = new Set(change.after.nodes.map((n) => n.id));
  const folded = new Set(
    change.before.nodes
      .filter((n) => !after.has(n.id) && "entity" in n && held.has(n.entity))
      .map((n) => n.id),
  );
  const out = new Map<DrawnId, Point>();
  for (const [, , part] of [...early].sort((a, b) => b[1] - a[1]))
    if (Array.isArray(part))
      for (const [id, x, y] of part) if (folded.has(id)) out.set(id, { x, y });
  return out;
}

type Undone = {
  keys: Set<DrawnId>;
  early: UndoEntry[];
  glide: MoveItem | undefined;
};

// why: story Context rule (3) n4 — the other results of the collapse apply to the real state once:
// the records of the undone events go, and their pairs leave `around.events`
function aroundAfter(
  around: Around,
  change: PlaceChange,
  next: CanvasState,
  { keys, early, glide }: Undone,
): CanvasState {
  const folded = foldedOf(change, early);
  const positions = [
    ...next.positions.filter(([id]) => !folded.has(id)),
    ...folded,
  ];
  const cached = new Map(positions);
  const left = <T extends [DrawnId, ...unknown[]]>([id]: T) => !keys.has(id);
  return {
    ...next,
    positions,
    homes: next.homes.filter(left),
    nudges: next.nudges.filter(left),
    treeShifts: next.treeShifts.filter(left),
    around: {
      ...around,
      saved: savedAfter(around, change, cached, { early, glide, folded }),
      shown: shownAfter(around, change),
      events: around.events.filter(left),
    },
  };
}

// why: lead decision D80 (a) — a node that the collapse puts back is shown when it is the root or a
// direct neighbour of the root over the frontier edges, else faded; an id that is not drawn leaves
// `shown`
function shownAfter(around: Around, change: PlaceChange): DrawnId[] {
  const before = new Set(change.before.nodes.map((n) => n.id));
  const near = linkedTo(change.after, around.root);
  const shown = new Set(around.shown);
  return change.after.nodes
    .map((n) => n.id)
    .filter((id) => (before.has(id) ? shown.has(id) : near.has(id)));
}

type Collapse = Extract<
  PlaceChange["action"],
  { kind: "collapse" | "collapseGroup" }
>;

// why: STORY-002-07 rule (a) and D97 — the target and the set of events that the collapse undoes,
// from the same frames and records that `place` reads
function undoSetOf(
  state: CanvasState,
  change: PlaceChange,
  action: Collapse,
  { vocab, metrics }: { vocab: Vocab; metrics: IconMetrics },
) {
  const u: Undo & { state: CanvasState } = {
    state,
    before: frameOf(change.before, vocab, metrics),
    after: frameOf(change.after, vocab, metrics),
    was: new Map(state.positions),
    at: new Map<DrawnId, Point>(),
    stay: [],
    rows: null,
    homes: state.homes,
    nudges: state.nudges,
    treeShifts: state.treeShifts,
  };
  const ids = new Set(change.after.nodes.map((n) => n.id));
  const leaving = change.before.nodes
    .map((n) => n.id)
    .filter((id) => !ids.has(id));
  const key =
    action.kind === "collapseGroup"
      ? action.group
      : (collapseTarget(u, action.id)?.key ?? null);
  const drawn = action.kind === "collapse" && u.before.holder.has(action.id);
  return { key, keys: undoKeys(u, key, leaving), drawn };
}

// why: story Context rule (3) (D76, D78, D79, D81, D85, D87) — the events that STORY-002-07 rule (a)
// undoes, each in its own frame: an entry made while grouped (`seq` > `seq0`) on `positions` (the
// `place` run), an earlier one on `around.saved`; the target glides on `positions` only with a
// `true` pair. Both undos are `undoEntries`; `undoEntries` does no row-node or `keyCoord` step
export function collapseAround(
  state: CanvasState,
  change: PlaceChange,
  vocab: Vocab,
  metrics: IconMetrics,
): PlaceResult {
  const { action } = change;
  const around = state.around;
  if (
    around === null ||
    (action.kind !== "collapse" && action.kind !== "collapseGroup")
  )
    return place(state, change, vocab, metrics);
  const run = { vocab, metrics };
  const { key, keys, drawn } = undoSetOf(state, change, action, run);
  const early = ([k, seq]: UndoEntry) => keys.has(k) && seq <= around.seq0;
  const wrote = around.events.some(([k, home]) => k === key && home);
  const glide = wrote || key === null ? undefined : homeEntry(state, key);
  // why: a drawn target is found the same way in the `place` run; a target that is not drawn
  // keeps its entry there, so `place` finds it by its records (STORY-002-07 rule (h)(5))
  const strip = drawn && glide !== undefined;
  const grouped = place(
    {
      ...state,
      nudges: state.nudges.filter((e) => !early(e)),
      treeShifts: state.treeShifts.filter((e) => !early(e)),
      homes: strip ? state.homes.filter(([id]) => id !== key) : state.homes,
    },
    change,
    vocab,
    metrics,
  );
  const pre = [...state.nudges, ...state.treeShifts].filter(early);
  const undone = { keys, early: pre, glide };
  return {
    ...grouped,
    state: aroundAfter(around, change, grouped.state, undone),
  };
}
