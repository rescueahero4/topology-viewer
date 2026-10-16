import type {
  DrawnId,
  MoveItem,
  NudgeEntry,
  Point,
  ShiftEntry,
  TreeShift,
} from "../state/canvasState";

export type UndoEntry = NudgeEntry | ShiftEntry;

// why: STORY-002-07 rule (a), lead decision D21 — a coordinate that is still the one the event wrote
// gets its value from before the event back exactly; else the node moved after the event (a drag or
// a later event), and the offset is subtracted
function back(now: number, before: number, after: number): number {
  return now === after ? before : now - (after - before);
}

function undoItem(at: Map<DrawnId, Point>, item: MoveItem) {
  const [id, x0, y0, x1, y1] = item;
  const p = at.get(id);
  if (p === undefined) return;
  at.set(
    id,
    p.x === x1 && p.y === y1
      ? { x: x0, y: y0 }
      : { x: p.x - (x1 - x0), y: p.y - (y1 - y0) },
  );
}

function undoMoved(at: Map<DrawnId, Point>, shift: TreeShift) {
  for (const [id, a0, a1] of shift.moved) {
    const p = at.get(id);
    if (p === undefined) continue;
    at.set(
      id,
      shift.vertical
        ? { x: p.x, y: back(p.y, a0, a1) }
        : { x: back(p.x, a0, a1), y: p.y },
    );
  }
}

const isNudge = (entry: UndoEntry): entry is NudgeEntry =>
  Array.isArray(entry[2]);

// why: lead decisions D54, D65, D79, D83-D85 — the latest event first (descending `seq`); in one
// event its nudges, then its row shift (the reverse of the order in which it applied them). Only
// the given positions change: the caller gives the drawn ones (D61a); a row shift undoes its
// `moved` items on the axis of its `vertical` field
export function undoEntries(
  positions: [DrawnId, Point][],
  entries: UndoEntry[],
): [DrawnId, Point][] {
  const at = new Map(positions);
  const order = [...entries].sort(
    (a, b) => b[1] - a[1] || Number(!isNudge(a)) - Number(!isNudge(b)),
  );
  for (const entry of order)
    if (isNudge(entry)) for (const item of entry[2]) undoItem(at, item);
    else undoMoved(at, entry[2]);
  return positions.map(([id]): [DrawnId, Point] => [id, at.get(id) as Point]);
}

export type RowsAt = {
  vertical: boolean;
  keyOf: Map<DrawnId, number>;
  coord: Map<number, number>;
};

// why: STORY-002-07 rule (a), lead decisions D64, D84 — the nodes that joined a shifted row after the
// event follow the row back, with the same test; the row coordinates go back; an inserted row that
// no drawn node uses is deleted (mockup lines 1335-1340)
export function undoRows(
  at: Map<DrawnId, Point>,
  rows: RowsAt,
  shift: TreeShift,
  stay: DrawnId[],
) {
  const moved = new Set(shift.moved.map(([id]) => id));
  const byRow = new Map(shift.shiftOf.map(([key, c0, c1]) => [key, [c0, c1]]));
  for (const id of stay) {
    const key = rows.keyOf.get(id);
    const pair = key === undefined ? undefined : byRow.get(key);
    const p = at.get(id);
    if (moved.has(id) || pair === undefined || p === undefined) continue;
    const [c0, c1] = pair;
    at.set(
      id,
      rows.vertical
        ? { x: p.x, y: back(p.y, c0, c1) }
        : { x: back(p.x, c0, c1), y: p.y },
    );
  }
  for (const [key, c0, c1] of shift.shiftOf) {
    const c = rows.coord.get(key);
    if (c !== undefined) rows.coord.set(key, back(c, c0, c1));
  }
  const used = new Set(rows.keyOf.values());
  for (const key of shift.inserted) if (!used.has(key)) rows.coord.delete(key);
}
