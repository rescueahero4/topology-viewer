import {
  entityDrawnId,
  entityOfDrawnId,
  groupDrawnId,
  groupKey,
  groupKeyOf,
  type CanvasState,
  type DrawnId,
  type MoveItem,
  type NudgeEntry,
  type Point,
  type ShiftEntry,
} from "../state/canvasState";
import type { Frame } from "./origins";
import {
  rowIndex,
  undoEntries,
  undoRows,
  type RowsAt,
  type UndoEntry,
} from "./undo";

export type Undo = {
  before: Frame;
  after: Frame;
  was: Map<DrawnId, Point>;
  at: Map<DrawnId, Point>;
  stay: DrawnId[];
  rows: RowsAt | null;
  homes: MoveItem[];
  nudges: NudgeEntry[];
  treeShifts: ShiftEntry[];
};

// why: STORY-002-04 decision (a) — a collapse takes an entity id or a record id. An entity id gives
// the key `e:<id>`, also when the entity is not drawn and only its records hold the key (rule
// (h)(5)); `place` has no graph (D68), so a record id is found as the drawn node that stays and
// lost part of its opened count (only the target loses some: every node that a collapse takes out
// had the target up its chain of origins). The spot is that of the node that draws the target
export function collapseTarget(u: Undo, id: string) {
  const at = u.before.holder.get(id);
  const key = entityDrawnId(id);
  if (at !== undefined)
    return { key, spot: u.was.get(u.before.frontier.nodes[at].id) };
  const records = [...u.homes, ...u.nudges, ...u.treeShifts];
  if (records.some(([k]) => k === key)) return { key, spot: u.was.get(key) };
  const after = new Map(u.after.frontier.nodes.map((node) => [node.id, node]));
  const node = u.before.frontier.nodes.find((item) => {
    const next = after.get(item.id);
    return (
      "entity" in item &&
      next !== undefined &&
      "entity" in next &&
      next.opened < item.opened
    );
  });
  return node === undefined ? null : { key: node.id, spot: u.was.get(node.id) };
}

type Held = { leafStays: boolean; gone: boolean };

// why: STORY-002-04 Context "Grouping" (mockup `bucketize`, lib/topology.js lines 615-632), story
// rule (h)(9) — the drawn entity nodes that a group key can hold: an entity node of the type with a
// drawn link of the predicate and the direction to the anchor. A leaf (one drawn link) is in the
// bucket now; a node with more links can be a member that was explored or a node that never was
// one, so only a leaf that stays keeps the group expand. One pass over the edges (rule (h)(7))
function held(frame: Frame, stays: (entity: string) => boolean) {
  const nodes = new Map(frame.frontier.nodes.map((node) => [node.id, node]));
  const degree = new Map<DrawnId, number>();
  for (const edge of frame.frontier.edges)
    for (const end of [edge.subject, edge.object])
      degree.set(end, (degree.get(end) ?? 0) + 1);
  const out = new Map<DrawnId, Held>();
  for (const edge of frame.frontier.edges)
    for (const [end, other, direction] of [
      [edge.subject, edge.object, "<"],
      [edge.object, edge.subject, ">"],
    ] as const) {
      const node = nodes.get(end);
      const anchor = entityOfDrawnId(other);
      if (node === undefined || !("entity" in node) || anchor === null)
        continue;
      const id = groupDrawnId(
        groupKey(anchor, edge.predicate, direction, node.type),
      );
      const now = out.get(id) ?? { leafStays: false, gone: false };
      const left = !stays(node.entity);
      out.set(id, {
        leafStays: now.leafStays || (degree.get(end) === 1 && !left),
        gone: now.gone || left,
      });
    }
  const lone = new Set<string | null>();
  for (const node of frame.frontier.nodes)
    if ("entity" in node && !degree.has(node.id) && stays(node.entity))
      lone.add(node.type);
  return { out, lone, drawn: (id: DrawnId) => nodes.has(id) };
}

// why: STORY-002-07 rule (a), lead decisions D54, D97, rule (h)(9) — the events of the target and of
// every expansion inside the set that the collapse removes: an explore of a node that leaves, or a
// group expand with no leaf that stays, when one of its members leaves or its anchor is the target
// or leaves (then an undone event drew the group node; hidden members are not drawn). The frontier
// shows no link to an anchor that is not drawn: a leaf of an anchor whose type is off is drawn with
// no link, so a node of the type with no link that stays keeps the group expand; a hidden anchor
// strands its leaves (STORY-002-06), so then such a node is not one of them
export function undoKeys(
  u: Undo & { state: Pick<CanvasState, "hidden"> },
  key: DrawnId | null,
  leaving: DrawnId[],
) {
  const keys = new Set<DrawnId>(leaving);
  if (key !== null) keys.add(key);
  const members = held(u.before, (entity) => u.after.holder.has(entity));
  const hidden = new Set(u.state.hidden.flatMap((entry) => entry.members));
  for (const [id] of [...u.homes, ...u.nudges, ...u.treeShifts]) {
    const group = groupKeyOf(id);
    if (group === null || keys.has(id)) continue;
    const [entity, , , type] = JSON.parse(group) as [
      string,
      string,
      string,
      string | null,
    ];
    const anchor = entityDrawnId(entity);
    const seen = members.out.get(id);
    const undone = members.drawn(anchor)
      ? seen?.leafStays !== true && (seen?.gone === true || keys.has(anchor))
      : keys.has(anchor) && (hidden.has(entity) || !members.lone.has(type));
    if (undone) keys.add(id);
  }
  return keys;
}

function bySeq(list: UndoEntry[], keys: Set<DrawnId>) {
  const out = new Map<number, UndoEntry[]>();
  for (const entry of list)
    if (keys.has(entry[0])) {
      const group = out.get(entry[1]);
      if (group === undefined) out.set(entry[1], [entry]);
      else group.push(entry);
    }
  return out;
}

const idsOf = (entry: UndoEntry) =>
  Array.isArray(entry[2])
    ? entry[2].map(([id]) => id)
    : entry[2].moved.map(([id]) => id);

// why: STORY-002-07 rule (a), lead decisions D54, D65, D84, D87 — event by event, from the latest:
// `undoEntries` on the drawn positions that the event names, then the rows of that event when
// `treeRows` has the axis of the entry (no `treeRows`, no row step). Returns the items undone, in
// that order (rule (h)(4) reads them)
export function undoEvents(u: Undo, keys: Set<DrawnId>): MoveItem[] {
  const events = bySeq([...u.nudges, ...u.treeShifts], keys);
  const index = u.rows === null ? null : rowIndex(u.rows, u.stay);
  const undone: MoveItem[] = [];
  for (const seq of [...events.keys()].sort((a, b) => b - a)) {
    const entries = events.get(seq) as UndoEntry[];
    const ids = new Set(entries.flatMap(idsOf).filter((id) => u.at.has(id)));
    const positions = [...ids].map((id): [DrawnId, Point] => [
      id,
      u.at.get(id) as Point,
    ]);
    for (const [id, p] of undoEntries(positions, entries)) u.at.set(id, p);
    for (const [, , part] of entries)
      if (Array.isArray(part)) undone.push(...part);
      else if (u.rows !== null && index !== null)
        if (u.rows.vertical === part.vertical)
          undoRows(u.at, u.rows, part, index);
  }
  u.nudges = u.nudges.filter(([id]) => !keys.has(id));
  u.treeShifts = u.treeShifts.filter(([id]) => !keys.has(id));
  return undone;
}

// why: STORY-002-07 rule (a), lead decision D59 — the target glides home with the D21 test; a group
// node comes back at its home with no test (it was not drawn, so nothing moved it)
export function goHome(u: Undo, key: DrawnId | null, keys: Set<DrawnId>) {
  const home = u.homes.find(([id]) => id === key);
  u.homes = u.homes.filter(([id]) => !keys.has(id));
  if (key === null || home === undefined) return;
  const now = u.at.get(key);
  if (now !== undefined) {
    const [[, p]] = undoEntries([[key, now]], [[key, 0, [home]]]);
    u.at.set(key, p);
  } else if (u.after.frontier.nodes.some((node) => node.id === key))
    u.at.set(key, { x: home[1], y: home[2] });
}

// why: mockup `rebuild` keep (lib/topology.js line 2216) — a node that comes back in a collapse (it
// went into a group, or it is a group that an expand split) takes the position it had when it left
export function comeBack(u: Undo) {
  for (const node of u.after.frontier.nodes) {
    const kept = u.was.get(node.id);
    if (!u.at.has(node.id) && kept !== undefined) u.at.set(node.id, kept);
  }
}
