import {
  entityDrawnId,
  groupKeyOf,
  type Action,
  type CanvasState,
  type DrawnId,
  type MoveItem,
  type Point,
  type TreeRows,
} from "../state/canvasState";
import type { DrawnNode, Frontier } from "../view/frontier";
import type { Vocab } from "../vocab/resolve";
import {
  centroid,
  moveOut,
  placeArcs,
  placeInBubbles,
  type Newcomer,
} from "./arcs";
import { bodyOf, roomOf, type Placed } from "./clear";
import {
  collapseTarget,
  comeBack,
  goHome,
  undoEvents,
  undoKeys,
  type Undo,
} from "./collapse";
import type { IconMetrics } from "./drawn";
import { MAX_MOVE, nudge } from "./nudge";
import {
  entitiesOf,
  frameOf,
  newcomersOf,
  spotBefore,
  type Origins,
} from "./origins";
import { inRows, rowsOf, shiftRows } from "./rows";

export type PlaceChange = { action: Action; before: Frontier; after: Frontier };

export type PlaceResult = {
  state: CanvasState;
  starts: [DrawnId, Point][];
  retractTo: [DrawnId, Point][];
  crowded: boolean;
  candidates: [DrawnId, number][];
};

type Work = Undo & {
  state: CanvasState;
  action: Action;
  fresh: number[];
  expanded: Set<string>;
};

// why: STORY-002-07 rule (a) — an explore or a group expand is an expansion: it can move its target,
// shift rows and nudge, and it keeps what it moved under its event key, the drawn id of the target
// (epic C4)
type Event = {
  key: DrawnId | null;
  expand: boolean;
  spot: Point | null;
  target: DrawnId | null;
};

const NO_EVENT: Event = { key: null, expand: false, spot: null, target: null };

// why: STORY-002-07 rule (g) — `state.positions` still holds the positions before the event; a node
// drawn before with a position stays where it is unless a rule moves it, every other node is new
function workOf(
  state: CanvasState,
  change: PlaceChange,
  vocab: Vocab,
  metrics: IconMetrics,
): Work {
  const was = new Map(state.positions);
  const drawn = new Set(change.before.nodes.map((node) => node.id));
  const stay: DrawnId[] = [];
  const fresh: number[] = [];
  change.after.nodes.forEach((node, i) => {
    if (drawn.has(node.id) && was.has(node.id)) stay.push(node.id);
    else fresh.push(i);
  });
  return {
    state,
    action: change.action,
    before: frameOf(change.before, vocab, metrics),
    after: frameOf(change.after, vocab, metrics),
    was,
    at: new Map(stay.map((id) => [id, was.get(id) as Point])),
    stay,
    fresh,
    rows: rowsOf(state, change.after, vocab, drawn),
    homes: state.homes,
    nudges: state.nudges,
    treeShifts: state.treeShifts,
    expanded: new Set(state.expandedGroups),
  };
}

function leavingOf(w: Work): DrawnNode[] {
  const drawn = new Set(w.after.frontier.nodes.map((node) => node.id));
  return w.before.frontier.nodes.filter((node) => !drawn.has(node.id));
}

type Collapsed = { retract: Point | undefined; back: Map<DrawnId, Point> };

// why: STORY-002-07 rule (a) "Collapse of X" and Origins — undo, then the nodes that leave retract to
// the position of the target before the glide (D73), the members of a group to its home. Rule
// (h)(4): a node that goes back into a group keeps its position from before the undone event
function collapseOf(w: Work, leaving: DrawnNode[]): Collapsed {
  const { action } = w;
  const target =
    action.kind === "collapse" ? collapseTarget(w, action.id) : null;
  const key =
    action.kind === "collapseGroup" ? action.group : (target?.key ?? null);
  const keys = undoKeys(
    w,
    key,
    leaving.map((node) => node.id),
  );
  const undone = undoEvents(w, keys);
  goHome(w, key, keys);
  comeBack(w);
  const folded = new Set(
    leaving.flatMap((node) =>
      "entity" in node && w.after.holder.has(node.entity) ? [node.id] : [],
    ),
  );
  const back = new Map<DrawnId, Point>();
  for (const [id, x, y] of undone) if (folded.has(id)) back.set(id, { x, y });
  const retract =
    action.kind === "collapseGroup" ? w.at.get(action.group) : target?.spot;
  return { retract, back };
}

// why: STORY-002-04 explore — every entity that an explore brings has the explored entity as its
// origin, so a record id needs no graph (D68)
function explored(w: Work): string | null {
  const pairs = new Map(w.state.origins);
  for (const node of w.after.frontier.nodes)
    for (const entity of entitiesOf(node))
      if (!w.before.holder.has(entity) && pairs.has(entity))
        return pairs.get(entity) as string;
  return null;
}

function eventOf(w: Work, origins: Origins): Event {
  const { action } = w;
  if (action.kind === "expandGroup")
    return {
      ...NO_EVENT,
      key: action.group,
      expand: true,
      spot: w.was.get(action.group) ?? null,
    };
  if (action.kind !== "explore") return NO_EVENT;
  const entity = explored(w);
  if (entity === null) return NO_EVENT;
  const key = entityDrawnId(entity);
  return {
    key,
    expand: true,
    spot: spotBefore(origins, entity) ?? null,
    target: w.at.has(key) ? key : null,
  };
}

function originsOf(w: Work): Origins {
  const stay = new Set(w.stay);
  return {
    action: w.action,
    before: w.before,
    after: w.after,
    was: w.was,
    pairs: new Map(w.state.origins),
    known: (id) => stay.has(id),
    spot: null,
  };
}

function placedOf(w: Work, without: DrawnId | null): Placed[] {
  return w.after.frontier.nodes.flatMap((node, i) => {
    const at = w.at.get(node.id);
    return at === undefined || node.id === without
      ? []
      : [{ node: w.after.drawn.nodes[i], at }];
  });
}

// why: mockup `runLocal` (lib/topology.js lines 1354-1356) — rows in a tree, the bubble of the type
// in Bubbles, `moveOut` for the target of an explore, else arcs around the origin; after a `moveOut`
// with no fit, the target stays an obstacle (mockup line 1454). Returns the `moveOut` spot
function search(w: Work, ev: Event, list: Newcomer[]): Point | null {
  if (list.length === 0) return null;
  const layout = w.state.layout;
  const placed = placedOf(w, null);
  const centre = centroid(placed.map((p) => p.at));
  if (w.rows !== null) inRows(w.rows, list, placed);
  else if (layout === "bubbles")
    placeInBubbles(list, roomOf(placed), placed, centre);
  else if (ev.target === null) placeArcs(list, roomOf(placed), centre, layout);
  else {
    const others = placedOf(w, ev.target);
    const room = roomOf(others);
    const target = placed.find((p) => p.node.id === ev.target) as Placed;
    const around = centroid(others.map((p) => p.at));
    const spot = moveOut(target, list, room, around, layout);
    if (spot !== null) return spot;
    room.add(bodyOf(target.node, target.at));
    placeArcs(list, room, centre, layout);
  }
  return null;
}

// why: STORY-002-07 rule (a) `homes` (D59, D70, D75) — the first `moveOut` of a target keeps its
// home and its spot; a later one keeps the entry and gives its own move as an item of its event
function movedOut(w: Work, target: DrawnId, spot: Point): MoveItem[] {
  const from = w.at.get(target) as Point;
  w.at.set(target, spot);
  const item: MoveItem = [target, from.x, from.y, spot.x, spot.y];
  if (!w.homes.some(([id]) => id === target)) {
    w.homes = [...w.homes, item];
    return [];
  }
  return spot.x === from.x && spot.y === from.y ? [] : [item];
}

// why: STORY-002-07 rules (b), (d) — only an expansion nudges, never in Bubbles (SA §6 row 16); only
// the newcomers push (D55), and each node keeps 100 px minus its row shift
function nudged(
  w: Work,
  ev: Event,
  list: Newcomer[],
  shiftOf: Map<number, number>,
) {
  if (!ev.expand || w.state.layout === "bubbles") return [];
  const shift = (id: DrawnId) => {
    const row = w.rows?.keyOf.get(id);
    return row === undefined ? 0 : (shiftOf.get(row) ?? 0);
  };
  const movers = w.stay
    .filter((id) => id !== ev.target)
    .map((id) => ({
      id,
      at: w.at.get(id) as Point,
      room: MAX_MOVE - shift(id),
    }));
  const items = nudge(
    movers,
    list.map((item) => item.spot as Point),
  );
  for (const [id, , , x, y] of items) w.at.set(id, { x, y });
  return items;
}

// why: story rule (h)(4) — an expansion that draws a node out of a group stores the position that
// the node kept in the group, so the collapse of the expansion puts it back there. The item moves
// nothing (as the `homes` entry of a group, rule (a)), so a node that stays drawn does not move
function cameOut(w: Work, ev: Event): MoveItem[] {
  if (!ev.expand) return [];
  return w.fresh.flatMap((i): MoveItem[] => {
    const node = w.after.frontier.nodes[i];
    const kept = w.was.get(node.id);
    const at = "entity" in node ? w.before.holder.get(node.entity) : undefined;
    if (kept === undefined || at === undefined) return [];
    if (!("members" in w.before.frontier.nodes[at])) return [];
    return [[node.id, kept.x, kept.y, kept.x, kept.y]];
  });
}

// why: STORY-002-07 rule (a) — the items of one entry in frontier order, the move item of a later
// `moveOut` first
function itemsOf(w: Work, out: MoveItem[], rest: MoveItem[]): MoveItem[] {
  const order = new Map(w.after.frontier.nodes.map((node, i) => [node.id, i]));
  const rank = (item: MoveItem) => order.get(item[0]) as number;
  return [...out, ...rest.sort((a, b) => rank(a) - rank(b))];
}

// why: STORY-002-07 rule (a) "Group node" — a group that opens leaves the drawn set, and its spot
// before the event is its home (a group expand, or a path that opens the group of its target)
function groupHomes(w: Work, leaving: DrawnNode[]) {
  for (const node of leaving) {
    const key = groupKeyOf(node.id);
    const at = w.was.get(node.id);
    if (key === null || at === undefined || !w.expanded.has(key)) continue;
    const home: MoveItem = [node.id, at.x, at.y, at.x, at.y];
    w.homes = [...w.homes.filter(([id]) => id !== node.id), home];
  }
}

// why: STORY-002-07 rule (d), rule (h)(3), S16, S21, S24 — a hide keeps every position (STORY-002-08
// S8 reads them); a Grouping change and a collapse forget the nodes that leave (each came with an
// expansion that the collapse undoes, except rule (h)(4)); else a node is forgotten when its
// entities leave the drawn set or when it is a group that opened (its home is in `homes`). A node
// that goes into a group keeps its position, so a collapse puts it back there (mockup line 2216)
function dropped(w: Work, node: DrawnNode): boolean {
  const kind = w.action.kind;
  if (kind === "hide" || kind === "hideMany") return false;
  if (kind === "grouping" || kind === "collapse" || kind === "collapseGroup")
    return true;
  const key = groupKeyOf(node.id);
  if (key !== null && w.expanded.has(key)) return true;
  return !entitiesOf(node).some((entity) => w.after.holder.has(entity));
}

function positionsOf(
  w: Work,
  leaving: DrawnNode[],
  back: Map<DrawnId, Point>,
): [DrawnId, Point][] {
  const drop = new Set(
    leaving.filter((node) => dropped(w, node)).map((node) => node.id),
  );
  const drawn = w.after.frontier.nodes.map((node): [DrawnId, Point] => [
    node.id,
    w.at.get(node.id) as Point,
  ]);
  const shown = new Set(drawn.map(([id]) => id));
  const kept = w.state.positions.flatMap(([id, p]): [DrawnId, Point][] => {
    if (shown.has(id)) return [];
    const home = back.get(id);
    if (home !== undefined) return [[id, home]];
    return drop.has(id) ? [] : [[id, p]];
  });
  return [...drawn, ...kept];
}

function treeRowsOf(w: Work): TreeRows | null {
  const rows = w.rows;
  if (rows === null) return w.state.treeRows;
  return {
    vertical: rows.vertical,
    rows: w.after.frontier.nodes.map((node): [DrawnId, number] => [
      node.id,
      rows.keyOf.get(node.id) as number,
    ]),
    keyCoord: [...rows.coord].sort((a, b) => a[0] - b[0]),
  };
}

// why: SA §4.4 `layout/place`, P1, guardrail 5 — newcomers go to free space next to their origin and
// no layout runs; STORY-002-07 rule (g) gives the arguments and the result, rule (a) the records
export function place(
  state: CanvasState,
  change: PlaceChange,
  vocab: Vocab,
  metrics: IconMetrics,
): PlaceResult {
  const w = workOf(state, change, vocab, metrics);
  const seq = state.seq + 1;
  const leaving = leavingOf(w);
  const { kind } = change.action;
  const collapse = kind === "collapse" || kind === "collapseGroup";
  const undone = collapse ? collapseOf(w, leaving) : null;
  const origins = originsOf(w);
  const ev = collapse ? NO_EVENT : eventOf(w, origins);
  const { starts, list } = newcomersOf(
    { ...origins, spot: ev.spot },
    w.fresh,
    w.at,
  );
  const room = ev.expand ? MAX_MOVE : 0;
  const inserted = w.rows && shiftRows(w.rows, list, w.at, w.stay, room);
  const spot = search(w, ev, list);
  for (const item of list) w.at.set(item.id, item.spot as Point);
  const out = spot && ev.target ? movedOut(w, ev.target, spot) : [];
  const shifted = inserted?.shiftOf ?? new Map<number, number>();
  const rest = [...nudged(w, ev, list, shifted), ...cameOut(w, ev)];
  const items = itemsOf(w, out, rest);
  groupHomes(w, leaving);
  const key = ev.key as DrawnId;
  const shift = ev.expand ? inserted?.entry : undefined;
  const retract = undone?.retract;
  return {
    state: {
      ...state,
      seq,
      positions: positionsOf(
        w,
        leaving,
        undone?.back ?? new Map<DrawnId, Point>(),
      ),
      treeRows: treeRowsOf(w),
      homes: w.homes,
      nudges: items.length > 0 ? [...w.nudges, [key, seq, items]] : w.nudges,
      treeShifts: shift ? [...w.treeShifts, [key, seq, shift]] : w.treeShifts,
    },
    starts,
    retractTo: collapse
      ? leaving.map((node) => [
          node.id,
          retract ?? (w.was.get(node.id) as Point),
        ])
      : [],
    crowded: list.some((item) => item.crowded),
    candidates: list.map((item) => [item.id, item.tries]),
  };
}
