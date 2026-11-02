import type {
  CanvasState,
  DrawnId,
  Point,
  TreeShift,
} from "../state/canvasState";
import type { Frontier } from "../view/frontier";
import type { Vocab } from "../vocab/resolve";
import { byOrigin, centroid, crowd, type Newcomer } from "./arcs";
import { bodyOf, grid, roomOf, type Field, type Placed } from "./clear";
import type { Laid } from "./drawn";
import { treeRowKeys } from "./tree";
import type { RowsAt } from "./undo";

// why: mockup `rowPositions` (lib/topology.js line 1644) and line 1367 — the row step on the row axis
const rowStep = (vertical: boolean) => (vertical ? 150 : 240);
// why: STORY-002-07 rule (c), mockup lines 1402-1405 — a node within 30 px of the row axis is in the
// row; slots 20 px apart, at most 400 of them
const IN_ROW = 30;
const SLOT = 20;
const SLOTS = 400;
const SLACK = 1;

// why: STORY-002-07 rule (g) — a node drawn before keeps its row key; a newcomer takes the key that
// `treeRowKeys` gives it (D46, D62); rows only when `treeRows` has the axis of the tree layout
// (mockup line 1366)
export function rowsOf(
  state: CanvasState,
  after: Frontier,
  vocab: Vocab,
  drawn: Set<DrawnId>,
): RowsAt | null {
  const tree = state.treeRows;
  const vertical = state.layout === "tree-v";
  if (tree === null || tree.vertical !== vertical) return null;
  if (!vertical && state.layout !== "tree-h") return null;
  const kept = new Map(tree.rows);
  const keyOf = new Map(
    treeRowKeys(after, vocab).map(([id, key]): [DrawnId, number] => [
      id,
      drawn.has(id) ? (kept.get(id) ?? key) : key,
    ]),
  );
  return { vertical, keyOf, coord: new Map(tree.keyCoord) };
}

// why: mockup line 1398 — the room of a node along its row
function rowSize(node: Laid, vertical: boolean): number {
  return vertical ? Math.max(node.w + 24, node.chars * 7.6 + 20) : node.h + 36;
}

// why: mockup lines 1371-1388 — a new row goes into the gap where its key belongs, at least half a
// step from its neighbours; when the gap is too tight, the rows past it shift out by the shortfall,
// at most `room` px in total (100 for an expansion, rule (b); 0 for the rule (d) actions), and
// beyond that the new rows squeeze. Returns the shift of each known row that moved
function insertRows(
  coord: Map<number, number>,
  keys: number[],
  vertical: boolean,
  room: number,
): Map<number, number> {
  const step = rowStep(vertical);
  const orig = new Map(coord);
  const known = [...orig.keys()].sort((a, b) => a - b);
  const min = step / 2;
  const within = (lo?: number, hi?: number) =>
    keys.filter(
      (k) => (lo === undefined || k > lo) && (hi === undefined || k < hi),
    );
  const first =
    known.length > 0 ? (orig.get(known[0]) as number) : step * keys.length;
  within(undefined, known[0])
    .reverse()
    .forEach((k, j) => coord.set(k, first - step * (j + 1)));
  const shiftOf = new Map<number, number>();
  let shift = 0;
  known.forEach((k, j) => {
    const c = (orig.get(k) as number) + shift;
    coord.set(k, c);
    if (shift) shiftOf.set(k, shift);
    const next = known[j + 1];
    const ins = within(k, next);
    if (ins.length === 0) return;
    if (next === undefined) {
      ins.forEach((nk, m) => coord.set(nk, c + step * (m + 1)));
      return;
    }
    let gap = (orig.get(next) as number) + shift - c;
    if (gap / (ins.length + 1) < min) {
      const add = Math.max(
        0,
        Math.min(min * (ins.length + 1) - gap, room - shift),
      );
      shift += add;
      gap += add;
    }
    ins.forEach((nk, m) =>
      coord.set(nk, c + (gap / (ins.length + 1)) * (m + 1)),
    );
  });
  return shiftOf;
}

// why: STORY-002-07 rules (a), (b), (d) — the rows that the newcomers need; an expansion shifts the
// rows past them and the nodes on those rows, and keeps the shift (D85: with its axis)
export function shiftRows(
  rows: RowsAt,
  list: Newcomer[],
  at: Map<DrawnId, Point>,
  stay: DrawnId[],
  room: number,
) {
  const keys = [...new Set(list.map((item) => rows.keyOf.get(item.id)))]
    .filter((key): key is number => key !== undefined && !rows.coord.has(key))
    .sort((a, b) => a - b);
  if (keys.length === 0) return null;
  const orig = new Map(rows.coord);
  const shiftOf = insertRows(rows.coord, keys, rows.vertical, room);
  const moved: [DrawnId, number, number][] = [];
  for (const id of stay) {
    const shift = shiftOf.get(rows.keyOf.get(id) as number);
    const p = at.get(id) as Point;
    if (shift === undefined) continue;
    const a0 = rows.vertical ? p.y : p.x;
    const a1 = a0 + shift;
    at.set(id, rows.vertical ? { x: p.x, y: a1 } : { x: a1, y: p.y });
    moved.push([id, a0, a1]);
  }
  const entry: TreeShift = {
    vertical: rows.vertical,
    shiftOf: [...shiftOf].map(([key]) => [
      key,
      orig.get(key) as number,
      rows.coord.get(key) as number,
    ]),
    inserted: keys,
    moved,
  };
  return { shiftOf, entry };
}

type Slotted = Point & { s: number };

type RowRoom = {
  add(p: Point, node: Laid): void;
  free(p: Point, node: Laid): boolean;
};

// why: mockup lines 1402-1403 — each node of the row keeps the distance (s_q + s) / 2 along the row
function rowRoom(placed: Placed[], vertical: boolean): RowRoom {
  const cells = grid<Slotted>();
  let widest = 0;
  const add = (p: Point, node: Laid) => {
    const s = rowSize(node, vertical);
    cells.add({ x: p.x, y: p.y, s });
    widest = Math.max(widest, s);
  };
  for (const { node, at } of placed) add(at, node);
  return {
    add,
    free(p, node) {
      const s = rowSize(node, vertical);
      const reach = (widest + s) / 2 + SLACK;
      const rx = vertical ? reach : IN_ROW + SLACK;
      const ry = vertical ? IN_ROW + SLACK : reach;
      return !cells.scan(p, rx, ry, (q) => {
        const a = vertical ? q.y - p.y : q.x - p.x;
        const c = vertical ? q.x - p.x : q.y - p.y;
        return Math.abs(a) < IN_ROW && Math.abs(c) < (q.s + s) / 2;
      });
    },
  };
}

type Slot = { item: Newcomer; axis: number; want: number; vertical: boolean };

function slotAt({ axis, want, vertical }: Slot, j: number): Point {
  const c = want + Math.ceil(j / 2) * SLOT * (j % 2 ? 1 : -1);
  return vertical ? { x: c, y: axis } : { x: axis, y: c };
}

// why: STORY-002-07 rule (c) — the origin coordinate along the row, then ±20 px steps; a slot must
// pass the row test and both clearance tests (question 5, D22). Returns the index of the free slot,
// or SLOTS when none is free
function slotIn(slot: Slot, slots: RowRoom, room: Field, from: number) {
  for (let j = from; j < SLOTS; j++) {
    const p = slotAt(slot, j);
    if (slots.free(p, slot.item.node) && room.clear(p, slot.item.node))
      return j;
  }
  return SLOTS;
}

// why: mockup `placeInRows` (lib/topology.js lines 1397-1408) — each newcomer at the free slot of
// its row nearest its origin, in canonical order; no free slot gives the fallback ring (rule (e)).
// Newcomers with the same row, origin, row size and box test the same slots and the rows only gain
// nodes, so the next search starts after the last slot found; `tries` counts as the full scan does
export function inRows(rows: RowsAt, list: Newcomer[], placed: Placed[]) {
  const room = roomOf(placed);
  const slots = rowRoom(placed, rows.vertical);
  const centre = centroid(placed.map((p) => p.at));
  const { vertical } = rows;
  const resume = new Map<string, number>();
  for (const group of byOrigin(list)) {
    const failed: Newcomer[] = [];
    for (const item of group) {
      const axis = rows.coord.get(rows.keyOf.get(item.id) as number) as number;
      const want = vertical ? item.origin.x : item.origin.y;
      const { w, h } = item.node;
      const key = JSON.stringify([
        axis,
        want,
        rowSize(item.node, vertical),
        w,
        h,
      ]);
      const slot = { item, axis, want, vertical };
      const j = slotIn(slot, slots, room, resume.get(key) ?? 0);
      const next = j === SLOTS ? SLOTS : j + 1;
      item.tries += next;
      resume.set(key, next);
      if (j === SLOTS) {
        failed.push(item);
        continue;
      }
      item.spot = slotAt(slot, j);
      room.add(bodyOf(item.node, item.spot));
      slots.add(item.spot, item.node);
    }
    crowd(failed, room, centre, vertical ? "tree-v" : "tree-h");
    for (const item of failed) slots.add(item.spot as Point, item.node);
  }
}
