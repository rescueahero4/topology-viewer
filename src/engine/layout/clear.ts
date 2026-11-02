import type { Point } from "../state/canvasState";
import type { Laid } from "./drawn";

// why: mockup lines 1294, 1430 — labels are wider than tall, so the clear test is an ellipse, about
// 90 px across and 58 px down
const SQUASH = 0.65;
const CLEAR = 58;
// why: mockup lines 1922-1925 at the "full" label level — 7.6 px for each character, a 60 px floor,
// 6 px of pad, 30 px high, 2 px under the node (STORY-002-07 Clearance, question 2)
const CHAR = 7.6;
const LABEL_MIN = 60;
const LABEL_PAD = 6;
const LABEL_H = 30;
const LABEL_GAP = 2;
// why: STORY-002-07 rule (f), epic C9 — a uniform grid of 58 px cells; a query visits every cell
// that can hold a node that fails a test, so the result is the same as a test against all nodes
const CELL = 58;
const SLACK = 1;

type Size = { w: number; h: number };

export type Body = Size & { x: number; y: number; label: number };

export function bodyOf(node: Laid, p: Point): Body {
  const label = Math.max(node.chars * CHAR, LABEL_MIN) + LABEL_PAD;
  return { x: p.x, y: p.y, w: node.w, h: node.h, label };
}

export function ellipse(a: Point, b: Point): number {
  return Math.hypot((a.x - b.x) * SQUASH, a.y - b.y);
}

// why: STORY-002-07 Clearance — the ellipse, then the node box of the newcomer against the node
// box and the label box of the other node; boxes that only touch do not meet (mockup line 1911)
export function apart(p: Point, size: Size, q: Body): boolean {
  if (ellipse(p, q) <= CLEAR) return false;
  const left = p.x - size.w / 2;
  const right = p.x + size.w / 2;
  const top = p.y - size.h / 2;
  const bottom = p.y + size.h / 2;
  if (
    left < q.x + q.w / 2 &&
    right > q.x - q.w / 2 &&
    top < q.y + q.h / 2 &&
    bottom > q.y - q.h / 2
  )
    return false;
  const labelTop = q.y + q.h / 2 + LABEL_GAP;
  return !(
    left < q.x + q.label / 2 &&
    right > q.x - q.label / 2 &&
    top < labelTop + LABEL_H &&
    bottom > labelTop
  );
}

export type Grid<T extends Point> = {
  add(item: T): void;
  scan(p: Point, rx: number, ry: number, stop: (item: T) => boolean): boolean;
};

// why: the key only has to put each cell into one bucket; two cells that share a bucket give extra
// items, and every item is tested exactly
function keyOf(gx: number, gy: number): number {
  return gx * 65536 + gy;
}

export function grid<T extends Point>(): Grid<T> {
  const cells = new Map<number, T[]>();
  const cell = (v: number) => Math.floor(v / CELL);
  return {
    add(item) {
      const key = keyOf(cell(item.x), cell(item.y));
      const list = cells.get(key);
      if (list === undefined) cells.set(key, [item]);
      else list.push(item);
    },
    // why: the cell of `p` first, because a blocked candidate meets its blocker there most often;
    // the order of the visits changes no result (a test of all items, or hits that the caller sorts)
    scan(p, rx, ry, stop) {
      const cx = cell(p.x);
      const cy = cell(p.y);
      const visit = (gx: number, gy: number) => {
        const list = cells.get(keyOf(gx, gy));
        return list !== undefined && list.some(stop);
      };
      if (visit(cx, cy)) return true;
      for (let gx = cell(p.x - rx); gx <= cell(p.x + rx); gx++)
        for (let gy = cell(p.y - ry); gy <= cell(p.y + ry); gy++)
          if ((gx !== cx || gy !== cy) && visit(gx, gy)) return true;
      return false;
    },
  };
}

export type Field = {
  add(body: Body): void;
  clear(p: Point, size: Size): boolean;
};

// why: STORY-002-07 rule (c) "Other nodes" — no distance filter; the reach of a query grows with the
// widest box and label added, so the grid skips only nodes that pass both tests
function field(): Field {
  const bodies = grid<Body>();
  let wide = 0;
  let tall = 0;
  return {
    add(body) {
      bodies.add(body);
      wide = Math.max(wide, body.w / 2, body.label / 2);
      tall = Math.max(tall, body.h / 2 + LABEL_GAP + LABEL_H);
    },
    clear(p, size) {
      const rx = Math.max(CLEAR / SQUASH, wide + size.w / 2) + SLACK;
      const ry = Math.max(CLEAR, tall + size.h / 2) + SLACK;
      return !bodies.scan(p, rx, ry, (q) => !apart(p, size, q));
    },
  };
}

export type Placed = { node: Laid; at: Point };

export function roomOf(placed: Placed[]): Field {
  const room = field();
  for (const { node, at } of placed) room.add(bodyOf(node, at));
  return room;
}
