import {
  entityDrawnId,
  entityOfDrawnId,
  groupKey,
  groupKeyOf,
  type Around,
  type CanvasState,
  type DrawnId,
  type MoveItem,
  type NudgeEntry,
  type Point,
} from "../state/canvasState";
import type { DrawnNode, Frontier } from "./frontier";

const ZERO: Point = { x: 0, y: 0 };

// why: lead decision D98 — a group expand record holds no member list: the members are the entity
// nodes of the type of the key with a drawn link of its predicate and direction to its anchor
function groupOfMember(frontier: Frontier, groups: DrawnId[]) {
  const wanted = new Map<string, DrawnId>();
  for (const id of groups) {
    const key = groupKeyOf(id);
    if (key !== null) wanted.set(key, id);
  }
  const nodes = new Map(frontier.nodes.map((node) => [node.id, node]));
  const out = new Map<DrawnId, DrawnId>();
  if (wanted.size === 0) return out;
  for (const edge of frontier.edges)
    for (const [end, other, direction] of [
      [edge.subject, edge.object, "<"],
      [edge.object, edge.subject, ">"],
    ] as const) {
      const node = nodes.get(end);
      const anchor = entityOfDrawnId(other);
      if (node === undefined || !("entity" in node) || anchor === null)
        continue;
      const group = wanted.get(
        groupKey(anchor, edge.predicate, direction, node.type),
      );
      if (group !== undefined && !out.has(end)) out.set(end, group);
    }
  return out;
}

type Chain = {
  saved: Map<DrawnId, Point>;
  now: Map<DrawnId, Point>;
  nodes: Map<DrawnId, DrawnNode>;
  homes: Map<DrawnId, MoveItem>;
  pairs: Map<string, string>;
  member: Map<DrawnId, DrawnId>;
};

// why: STORY-002-04 `origins` — the origin of an entity; a group node takes the origin of its first
// member that has one; a member of a group expand made while grouped takes that group (D98)
function originOf(c: Chain, id: DrawnId): DrawnId | null {
  const node = c.nodes.get(id);
  const entity = node === undefined ? entityOfDrawnId(id) : null;
  const entities =
    node === undefined
      ? entity === null
        ? []
        : [entity]
      : "entity" in node
        ? [node.entity]
        : node.members;
  const from = entities.map((e) => c.pairs.get(e)).find((o) => o !== undefined);
  return from === undefined ? (c.member.get(id) ?? null) : entityDrawnId(from);
}

// why: story question 3 (Q24, option (b)) — the position of an origin is its drawn position; a
// group node that is no longer drawn is at its home (x0, y0)
function placeOf(c: Chain, id: DrawnId): Point | undefined {
  const home = c.homes.get(id);
  if (!c.nodes.has(id) && groupKeyOf(id) !== null && home !== undefined)
    return { x: home[1], y: home[2] };
  return c.now.get(id);
}

// why: story question 3 (Q24, option (b), f-0033) — a node born while grouped moves by the vector
// of the first origin up its chain that is in `saved`: that origin's saved spot minus its position
function vectorOf(c: Chain) {
  return (id: DrawnId): Point => {
    const seen = new Set([id]);
    for (let at = originOf(c, id); at !== null; at = originOf(c, at)) {
      const spot = c.saved.get(at);
      if (spot !== undefined) {
        const p = placeOf(c, at);
        return p === undefined ? ZERO : { x: spot.x - p.x, y: spot.y - p.y };
      }
      if (seen.has(at)) break;
      seen.add(at);
    }
    return ZERO;
  };
}

// why: story Context D24 rule (1), D59, D74 — only an entry that the expansion wrote while grouped
// changes: deleted for a drawn node in `saved`, the saved spot for a group node in `saved` that is
// not drawn, else moved with its node by the same sums
function homesAt(
  state: CanvasState,
  around: Around,
  c: Chain,
  vector: (id: DrawnId) => Point,
): MoveItem[] {
  const wrote = new Set(
    around.events.filter(([, home]) => home).map(([key]) => key),
  );
  return state.homes.flatMap((item): MoveItem[] => {
    const [t, x0, y0, x1, y1] = item;
    if (!wrote.has(t)) return [item];
    const spot = c.saved.get(t);
    if (spot !== undefined)
      return c.nodes.has(t) ? [] : [[t, spot.x, spot.y, spot.x, spot.y]];
    const v = vector(t);
    return [[t, x0 + v.x, y0 + v.y, x1 + v.x, y1 + v.y]];
  });
}

// why: story Context D24 rule (2), D75 — in the entries made while grouped, the nudge and move items
// of nodes in `saved` go (those nodes glide to their saved spots); an entry keeps its `seq`. A
// zero-move item is the kept position of STORY-002-07 rule (h)(4), not a nudge (D96 (1)): for a
// node in `saved` it becomes the saved spot (build memo; as the `homes` entry of a group, rule (1))
function itemAt(item: MoveItem, saved: Map<DrawnId, Point>): MoveItem[] {
  const [id, x0, y0, x1, y1] = item;
  const spot = saved.get(id);
  if (spot === undefined) return [item];
  if (x0 !== x1 || y0 !== y1) return [];
  return [[id, spot.x, spot.y, spot.x, spot.y]];
}

function nudgesAt(
  around: Around,
  saved: Map<DrawnId, Point>,
  list: NudgeEntry[],
) {
  const keys = new Set(around.events.map(([key]) => key));
  return list.flatMap((entry): NudgeEntry[] => {
    const [key, seq, items] = entry;
    if (!keys.has(key) || seq <= around.seq0) return [entry];
    const kept = items.flatMap((item) => itemAt(item, saved));
    return kept.length === 0 ? [] : [[key, seq, kept]];
  });
}

// why: SA §6 rows 9, 10, FR-CANVAS-14 — `home` of every exit: each node at its saved spot, each
// node born while grouped moved with its origin, and the grouping off (no fade set)
export function homeOf(state: CanvasState, frontier: Frontier): CanvasState {
  const around = state.around;
  if (around === null) return state;
  const groups = around.events.map(([key]) => key);
  const c: Chain = {
    saved: new Map(around.saved),
    now: new Map(state.positions),
    nodes: new Map(frontier.nodes.map((node) => [node.id, node])),
    homes: new Map(state.homes.map((item) => [item[0], item])),
    pairs: new Map(state.origins),
    member: groupOfMember(frontier, groups),
  };
  const vector = vectorOf(c);
  const positions = state.positions.map(([id, p]): [DrawnId, Point] => {
    const spot = c.saved.get(id);
    if (spot !== undefined) return [id, spot];
    if (!c.nodes.has(id)) return [id, p];
    const v = vector(id);
    return [id, v === ZERO ? p : { x: p.x + v.x, y: p.y + v.y }];
  });
  return {
    ...state,
    positions,
    homes: homesAt(state, around, c, vector),
    nudges: nudgesAt(around, c.saved, state.nudges),
    around: null,
  };
}
