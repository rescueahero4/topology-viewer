import {
  entityDrawnId,
  entityOfDrawnId,
  groupDrawnId,
  groupKey,
  type DrawnId,
  type MoveItem,
  type NudgeEntry,
  type Point,
  type ShiftEntry,
} from "../state/canvasState";
import type { DrawnEdge } from "../view/frontier";
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

// why: STORY-002-04 Context "Grouping" (mockup `bucketize`, lib/topology.js lines 615-632) — a leaf
// has one drawn link, to an entity anchor; its bucket is the group key of the anchor, the
// predicate, the direction and its type. One pass over the edges and the nodes (rule (h)(7))
function buckets(frame: Frame): Map<DrawnId, string[]> {
  const degree = new Map<DrawnId, number>();
  const sole = new Map<DrawnId, DrawnEdge>();
  for (const edge of frame.frontier.edges)
    for (const end of [edge.subject, edge.object]) {
      degree.set(end, (degree.get(end) ?? 0) + 1);
      sole.set(end, edge);
    }
  const out = new Map<DrawnId, string[]>();
  for (const node of frame.frontier.nodes) {
    const edge = sole.get(node.id);
    if (!("entity" in node) || edge === undefined) continue;
    if (degree.get(node.id) !== 1) continue;
    const out1 = edge.subject === node.id;
    const anchor = entityOfDrawnId(out1 ? edge.object : edge.subject);
    if (anchor === null) continue;
    const id = groupDrawnId(
      groupKey(anchor, edge.predicate, out1 ? "<" : ">", node.type),
    );
    out.set(id, [...(out.get(id) ?? []), node.entity]);
  }
  return out;
}

// why: STORY-002-07 rule (a), lead decision D54 — the events of the target and of every expansion
// inside the set that the collapse removes: an explore of a node that leaves, or a group expand whose
// members all leave the drawn set
export function undoKeys(u: Undo, key: DrawnId | null, leaving: DrawnId[]) {
  const keys = new Set<DrawnId>(leaving);
  if (key !== null) keys.add(key);
  const members = buckets(u.before);
  const gone = (entity: string) => !u.after.holder.has(entity);
  for (const [id] of [...u.homes, ...u.nudges, ...u.treeShifts]) {
    const list = members.get(id);
    if (!keys.has(id) && list !== undefined && list.every(gone)) keys.add(id);
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
