import {
  entityDrawnId,
  groupKeyOf,
  type DrawnId,
  type MoveItem,
  type NudgeEntry,
  type Point,
  type ShiftEntry,
} from "../state/canvasState";
import type { DrawnEdge } from "../view/frontier";
import type { Frame } from "./origins";
import { undoEntries, undoRows, type RowsAt } from "./undo";

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

// why: STORY-002-04 decision (a) — a collapse takes an entity id or a record id; `place` has no
// graph (D68), so a record id is found as the node that lost its opened count (only the target
// loses one: every node that a collapse takes out had the target up its chain of origins). The key
// is the drawn id of the entity (its explore events have it), the spot that of the node drawing it
export function collapseTarget(u: Undo, id: string) {
  const at = u.before.holder.get(id);
  const after = new Map(u.after.frontier.nodes.map((node) => [node.id, node]));
  const node =
    at === undefined
      ? u.before.frontier.nodes.find((item) => {
          if (!("entity" in item) || item.opened === 0) return false;
          const next = after.get(item.id);
          return (
            next === undefined ||
            !("entity" in next) ||
            next.opened < item.opened
          );
        })
      : u.before.frontier.nodes[at];
  if (node === undefined) return null;
  const key = at === undefined ? node.id : entityDrawnId(id);
  return { key, spot: u.was.get(node.id) };
}

function ends(edges: DrawnEdge[]) {
  const degree = new Map<DrawnId, number>();
  const sole = new Map<DrawnId, DrawnEdge>();
  for (const edge of edges)
    for (const end of [edge.subject, edge.object]) {
      degree.set(end, (degree.get(end) ?? 0) + 1);
      sole.set(end, edge);
    }
  return { degree, sole };
}

// why: STORY-002-04 Context "Grouping" (mockup `bucketize`, lib/topology.js lines 615-632) — the
// members of an expanded group are the leaves that its key names: one drawn link, to the anchor,
// with the predicate and the direction of the key
function bucketMembers(u: Undo, key: string, links: ReturnType<typeof ends>) {
  const [anchor, predicate, direction, type] = JSON.parse(key) as [
    string,
    string,
    ">" | "<",
    string | null,
  ];
  const hub = entityDrawnId(anchor);
  return u.before.frontier.nodes.flatMap((node) => {
    if (!("entity" in node) || node.type !== type) return [];
    const edge = links.sole.get(node.id);
    if (links.degree.get(node.id) !== 1 || edge === undefined) return [];
    const [from, to] = direction === ">" ? [hub, node.id] : [node.id, hub];
    const leaf =
      edge.predicate === predicate &&
      edge.subject === from &&
      edge.object === to;
    return leaf ? [node.entity] : [];
  });
}

// why: STORY-002-07 rule (a), lead decision D54 — the events of the target and of every expansion
// inside the set that the collapse removes: an explore of a node that leaves, or a group expand whose
// members all leave the drawn set
export function undoKeys(u: Undo, key: DrawnId | null, leaving: DrawnId[]) {
  const keys = new Set<DrawnId>(leaving);
  if (key !== null) keys.add(key);
  const gone = (entity: string) => !u.after.holder.has(entity);
  const links = ends(u.before.frontier.edges);
  const groups = new Set(
    [...u.homes, ...u.nudges, ...u.treeShifts].map(([id]) => id),
  );
  for (const id of groups) {
    const group = groupKeyOf(id);
    if (group === null || keys.has(id)) continue;
    const members = bucketMembers(u, group, links);
    if (members.length > 0 && members.every(gone)) keys.add(id);
  }
  return keys;
}

function bySeq<T extends NudgeEntry | ShiftEntry>(
  list: T[],
  keys: Set<DrawnId>,
) {
  const out = new Map<number, T[]>();
  for (const entry of list)
    if (keys.has(entry[0]))
      out.set(entry[1], [...(out.get(entry[1]) ?? []), entry]);
  return out;
}

// why: STORY-002-07 rule (a), lead decisions D54, D65, D84, D87 — event by event, from the latest:
// `undoEntries` on the drawn positions, then the rows of that event when `treeRows` has the axis of
// the entry (no `treeRows`, no row step)
export function undoEvents(u: Undo, keys: Set<DrawnId>) {
  const nudges = bySeq(u.nudges, keys);
  const shifts = bySeq(u.treeShifts, keys);
  const seqs = [...new Set([...nudges.keys(), ...shifts.keys()])].sort(
    (a, b) => b - a,
  );
  for (const seq of seqs) {
    const rows = shifts.get(seq) ?? [];
    const positions = u.stay.map((id): [DrawnId, Point] => [
      id,
      u.at.get(id) as Point,
    ]);
    for (const [id, p] of undoEntries(positions, [
      ...(nudges.get(seq) ?? []),
      ...rows,
    ]))
      u.at.set(id, p);
    for (const [, , shift] of rows)
      if (u.rows !== null && u.rows.vertical === shift.vertical)
        undoRows(u.at, u.rows, shift, u.stay);
  }
  u.nudges = u.nudges.filter(([id]) => !keys.has(id));
  u.treeShifts = u.treeShifts.filter(([id]) => !keys.has(id));
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
