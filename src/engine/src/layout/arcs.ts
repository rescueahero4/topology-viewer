import { packEnclose } from "d3-hierarchy";
import type { DrawnId, LayoutName, Point } from "../state/canvasState";
import { bubbleRoom } from "./bubbles";
import { apart, bodyOf, type Field, type Placed } from "./clear";
import type { Laid } from "./drawn";

export type Newcomer = {
  id: DrawnId;
  node: Laid;
  origin: Point;
  spot: Point | null;
  tries: number;
  crowded: boolean;
};

// why: mockup lines 1302-1310 and 1421-1429 — an arc of up to 1.4π with 62 px between points, and
// one more ring 64 px further out when the arc is full
const ARC = Math.PI * 1.4;
const ALONG = 62;
const OUTWARD = 64;
// why: STORY-002-07 rule (c), mockup lines 1311-1319 — R0 = 110…530 px in steps of 35 with 10
// turns; else the ring at 110 px with overlap allowed (`crowded`)
const R0_FIRST = 110;
const R0_LAST = 530;
const R0_STEP = 35;
const TURNS = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2, Math.PI];
// why: STORY-002-07 rule (c), mockup lines 1444-1446 — d = 0…3000 px in steps of 40
const OUT_LAST = 3000;
const OUT_STEP = 40;
const OUT_TURNS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05];
// why: STORY-002-07 rule (c), mockup lines 1871-1874 — R = 0…r + 400 px in steps of 24, a candidate
// every 30 px of arc
const BUBBLE_MARGIN = 400;
const BUBBLE_STEP = 24;
const BUBBLE_ARC = 30;

const isTree = (layout: LayoutName) =>
  layout === "tree-h" || layout === "tree-v";

function ring(c: Point, r0: number, dir: number, k: number): Point[] {
  const pts: Point[] = [];
  for (let band = 0, i = 0; i < k; band++) {
    const R = r0 + band * OUTWARD;
    const cap = Math.max(1, Math.floor((ARC * R) / ALONG) + 1);
    const m = Math.min(cap, k - i);
    const spread = m === 1 ? 0 : Math.min(ARC, (ALONG * (m - 1)) / R);
    for (let j = 0; j < m; j++, i++) {
      const a = dir + (m === 1 ? 0 : (j / (m - 1) - 0.5) * spread);
      pts.push({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R });
    }
  }
  return pts;
}

export function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

// why: mockup lines 1297-1300 and 1438-1441 — away from the rest of the chart; a tree turns along
// its row axis only
function facing(o: Point, centre: Point, layout: LayoutName): number {
  let ux = o.x - centre.x;
  let uy = o.y - centre.y;
  if (layout === "tree-h") {
    ux = Math.sign(ux) || 1;
    uy = 0;
  } else if (layout === "tree-v") {
    ux = 0;
    uy = Math.sign(uy) || 1;
  }
  return Math.hypot(ux, uy) < 1 ? -Math.PI / 2 : Math.atan2(uy, ux);
}

function settle(list: Newcomer[], pts: Point[], room: Field) {
  list.forEach((item, i) => {
    item.spot = pts[i];
    room.add(bodyOf(item.node, pts[i]));
  });
}

// why: mockup lines 1287-1292 — one ring set for each origin spot, in the canonical order of its
// first newcomer (epic C4); every search takes the origins in this order, so the newcomers of an
// earlier origin, also on a fallback ring, are in place before the next origin searches (rule (c))
export function byOrigin(list: Newcomer[]): Newcomer[][] {
  const groups = new Map<string, Newcomer[]>();
  for (const item of list) {
    const key = `${Math.round(item.origin.x)},${Math.round(item.origin.y)}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return [...groups.values()];
}

// why: STORY-002-07 rule (e) — the only outcome when no spot is free
export function crowd(
  list: Newcomer[],
  room: Field,
  centre: Point,
  layout: LayoutName,
) {
  for (const group of byOrigin(list)) {
    const o = group[0].origin;
    settle(
      group,
      ring(o, R0_FIRST, facing(o, centre, layout), group.length),
      room,
    );
    for (const item of group) item.crowded = true;
  }
}

function arcSearch(group: Newcomer[], room: Field, base: number) {
  const o = group[0].origin;
  for (let r0 = R0_FIRST; r0 <= R0_LAST; r0 += R0_STEP)
    for (const turn of TURNS) {
      const pts = ring(o, r0, base + turn, group.length);
      for (const item of group) item.tries++;
      if (pts.every((q, i) => room.clear(q, group[i].node))) return pts;
    }
  return null;
}

// why: mockup `placeNewcomers` (lib/topology.js lines 1282-1322); the 900 px `near` filter is not
// ported (STORY-002-07 rule (c), Solutions Architect question 2)
export function placeArcs(
  list: Newcomer[],
  room: Field,
  centre: Point,
  layout: LayoutName,
) {
  for (const group of byOrigin(list)) {
    const base = facing(group[0].origin, centre, layout);
    const pts = arcSearch(group, room, base);
    if (pts === null) crowd(group, room, centre, layout);
    else settle(group, pts, room);
  }
}

// why: mockup `moveOut` (lib/topology.js lines 1433-1458) — the target walks away from the chart to
// the nearest spot where it and its newcomers are clear; the rings are also tested against the
// target at that spot (STORY-002-07 rule (c), lead decision D45)
export function moveOut(
  target: Placed,
  list: Newcomer[],
  room: Field,
  centre: Point,
  layout: LayoutName,
): Point | null {
  const base = facing(target.at, centre, layout);
  const turns = isTree(layout) ? [0] : OUT_TURNS;
  for (let d = 0; d <= OUT_LAST; d += OUT_STEP)
    for (const turn of d === 0 ? [0] : turns) {
      const dir = base + turn;
      const c = {
        x: target.at.x + Math.cos(dir) * d,
        y: target.at.y + Math.sin(dir) * d,
      };
      for (const item of list) item.tries++;
      if (!room.clear(c, target.node)) continue;
      const here = bodyOf(target.node, c);
      const pts = ring(c, R0_FIRST, dir, list.length);
      const fits = (q: Point, i: number) =>
        room.clear(q, list[i].node) && apart(q, list[i].node, here);
      if (!pts.every(fits)) continue;
      settle(list, pts, room);
      return c;
    }
  return null;
}

function enclosures(placed: Placed[]) {
  const byType = new Map<string | null, Placed[]>();
  for (const item of placed) {
    const list = byType.get(item.node.type);
    if (list === undefined) byType.set(item.node.type, [item]);
    else list.push(item);
  }
  return new Map(
    [...byType].map(([type, list]) => [
      type,
      packEnclose(
        list.map(({ node, at }) => ({ x: at.x, y: at.y, r: bubbleRoom(node) })),
      ),
    ]),
  );
}

// why: candidates in the mockup order (R outward, then ±j along the ring); `from` skips the ones
// that an earlier newcomer with the same candidates found blocked. Returns the index of the free
// candidate, or the count of all candidates when none is free
function bubbleSpot(
  item: Newcomer,
  room: Field,
  e: Point & { r: number },
  from: number,
) {
  const a0 = Math.atan2(item.origin.y - e.y, item.origin.x - e.x);
  let index = 0;
  for (let R = 0; R <= e.r + BUBBLE_MARGIN; R += BUBBLE_STEP) {
    const steps = Math.max(1, Math.round((2 * Math.PI * R) / BUBBLE_ARC));
    for (let j = Math.max(0, from - index); j < steps; j++) {
      const a =
        a0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * ((2 * Math.PI) / steps);
      const q = { x: e.x + Math.cos(a) * R, y: e.y + Math.sin(a) * R };
      if (room.clear(q, item.node)) return { at: index + j, spot: q };
    }
    index += steps;
  }
  return { at: index, spot: null };
}

// why: mockup `placeInBubbles` (lib/topology.js lines 1862-1884) — a newcomer joins the bubble of
// its type at the free spot nearest the centre; a type new to the canvas starts next to its origin.
// Newcomers of one type, box and origin test the same candidates and the room only gains bodies,
// so a candidate that was blocked stays blocked: the next search starts after the last spot found,
// and `tries` counts as the full scan does (epic C9: the same result in near-linear time)
export function placeInBubbles(
  list: Newcomer[],
  room: Field,
  placed: Placed[],
  centre: Point,
) {
  const bubbles = enclosures(placed);
  const resume = new Map<string, number>();
  for (const group of byOrigin(list)) {
    const homeless: Newcomer[] = [];
    for (const item of group) {
      const e = bubbles.get(item.node.type);
      if (e === undefined) {
        homeless.push(item);
        continue;
      }
      const { type, w, h } = item.node;
      const key = JSON.stringify([type, w, h, item.origin.x, item.origin.y]);
      const found = bubbleSpot(item, room, e, resume.get(key) ?? 0);
      item.tries += found.spot === null ? found.at : found.at + 1;
      resume.set(key, found.spot === null ? found.at : found.at + 1);
      if (found.spot === null) homeless.push(item);
      else settle([item], [found.spot], room);
    }
    placeArcs(homeless, room, centre, "bubbles");
  }
}
