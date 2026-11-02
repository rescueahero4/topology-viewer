import { packEnclose } from "d3-hierarchy";
import { describe, expect, it } from "vitest";
import type { LayoutName, Point } from "../state/canvasState";
import {
  centroid,
  moveOut as engineOut,
  placeArcs,
  placeInBubbles,
  type Newcomer,
} from "./arcs";
import { bubbleRoom } from "./bubbles";
import { bodyOf, roomOf, type Placed } from "./clear";
import type { Laid } from "./drawn";

// why: reference searches written apart from the engine from the STORY-002-07 text and the cited
// mockup lines (1282-1322, 1433-1458, 1862-1884): plain loops over all nodes, no grid, no resume.
// The engine searches must give the same spots, counts and flags on random inputs
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const TURNS = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2, Math.PI];
const SLOW = 120_000;
type B = Laid & { p: Point };
type N = {
  id: string;
  node: Laid;
  o: Point;
  at?: Point;
  tries: number;
  crowded: boolean;
};

const ell = (a: Point, b: Point) => Math.hypot((a.x - b.x) * 0.65, a.y - b.y);
const ok = (p: Point, n: Laid, q: B) => {
  const lw = Math.max(q.chars * 7.6, 60) + 6,
    top = q.p.y + q.h / 2 + 2;
  const hit = (x0: number, x1: number, y0: number, y1: number) =>
    p.x - n.w / 2 < x1 &&
    p.x + n.w / 2 > x0 &&
    p.y - n.h / 2 < y1 &&
    p.y + n.h / 2 > y0;
  return (
    ell(p, q.p) > 58 &&
    !hit(q.p.x - q.w / 2, q.p.x + q.w / 2, q.p.y - q.h / 2, q.p.y + q.h / 2) &&
    !hit(q.p.x - lw / 2, q.p.x + lw / 2, top, top + 30)
  );
};
const free = (p: Point, n: Laid, all: B[]) => all.every((q) => ok(p, n, q));
function rings(c: Point, r0: number, dir: number, k: number) {
  const out: Point[] = [];
  for (let ring = 0; out.length < k; ring++) {
    const R = r0 + ring * 64,
      m = Math.min(
        Math.max(1, Math.floor((Math.PI * 1.4 * R) / 62) + 1),
        k - out.length,
      );
    const spread = m === 1 ? 0 : Math.min(Math.PI * 1.4, (62 * (m - 1)) / R);
    for (let j = 0; j < m; j++) {
      const a = dir + (m === 1 ? 0 : (j / (m - 1) - 0.5) * spread);
      out.push({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R });
    }
  }
  return out;
}
const mean = (ps: Point[]) =>
  ps.length === 0
    ? { x: 0, y: 0 }
    : {
        x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
        y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
      };
function base(o: Point, c: Point, layout: LayoutName) {
  let ux = o.x - c.x,
    uy = o.y - c.y;
  if (layout === "tree-h") [ux, uy] = [Math.sign(ux) || 1, 0];
  if (layout === "tree-v") [ux, uy] = [0, Math.sign(uy) || 1];
  return Math.hypot(ux, uy) < 1 ? -Math.PI / 2 : Math.atan2(uy, ux);
}
function origins(list: N[]) {
  const m = new Map<string, N[]>();
  for (const n of list) {
    const k = `${Math.round(n.o.x)},${Math.round(n.o.y)}`;
    m.set(k, [...(m.get(k) ?? []), n]);
  }
  return [...m.values()];
}
function arcs(list: N[], all: B[], layout: LayoutName, c: Point, fill = true) {
  for (const g of origins(list)) {
    const dir = base(g[0].o, c, layout);
    let pts: Point[] | null = null;
    for (let r0 = 110; fill && r0 <= 530 && !pts; r0 += 35)
      for (const t of TURNS) {
        const q = rings(g[0].o, r0, dir + t, g.length);
        g.forEach((n) => n.tries++);
        if (q.every((p, i) => free(p, g[i].node, all))) {
          pts = q;
          break;
        }
      }
    if (!pts) {
      pts = rings(g[0].o, 110, dir, g.length);
      g.forEach((n) => (n.crowded = true));
    }
    g.forEach((n, i) => {
      n.at = pts[i];
      all.push({ ...n.node, p: pts[i] });
    });
  }
}
function moveOut(t: B, list: N[], all: B[], layout: LayoutName): Point | null {
  const others = all.filter((b) => b.id !== t.id),
    dir0 = base(t.p, mean(others.map((b) => b.p)), layout);
  const turns = layout.startsWith("tree")
    ? [0]
    : [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05];
  for (let d = 0; d <= 3000; d += 40)
    for (const tt of d ? turns : [0]) {
      const dir = dir0 + tt,
        C = { x: t.p.x + Math.cos(dir) * d, y: t.p.y + Math.sin(dir) * d };
      list.forEach((n) => n.tries++);
      if (!free(C, t, others)) continue;
      const q = rings(C, 110, dir, list.length);
      if (
        q.every((p, i) => free(p, list[i].node, [...others, { ...t, p: C }]))
      ) {
        list.forEach((n, i) => {
          n.at = q[i];
          all.push({ ...n.node, p: q[i] });
        });
        return C;
      }
    }
  arcs(list, all, layout, mean(all.map((b) => b.p)));
  return null;
}
function bubbles(list: N[], all: B[], c: Point) {
  const old = [...all];
  for (const g of origins(list)) {
    const home: N[] = [];
    for (const n of g) {
      const ms = old.filter((b) => b.type === n.node.type);
      if (ms.length === 0) {
        home.push(n);
        continue;
      }
      const e = packEnclose(
        ms.map((b) => ({ x: b.p.x, y: b.p.y, r: bubbleRoom(b) })),
      );
      const a0 = Math.atan2(n.o.y - e.y, n.o.x - e.x);
      search: for (let R = 0; R <= e.r + 400; R += 24) {
        const steps = Math.max(1, Math.round((2 * Math.PI * R) / 30));
        for (let j = 0; j < steps; j++) {
          const a =
            a0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * ((2 * Math.PI) / steps);
          const q = { x: e.x + Math.cos(a) * R, y: e.y + Math.sin(a) * R };
          n.tries++;
          if (free(q, n.node, all)) {
            n.at = q;
            all.push({ ...n.node, p: q });
            break search;
          }
        }
      }
      if (!n.at) home.push(n);
    }
    arcs(home, all, "bubbles", c);
  }
}
function random(seed: number) {
  let s = seed;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    int,
    pick: <T>(l: T[]) => l[int(l.length)],
    real: (a: number) => (next() * 2 - 1) * a,
  };
}
type Rnd = ReturnType<typeof random>;

function laid(r: Rnd, id: string): Laid {
  const w = r.pick([20, 24, 27, 38, 56]),
    h = r.pick([20, 24, 36, 56]),
    len = r.int(26);
  const label = "x".repeat(len);
  return {
    id,
    type: r.pick(["a", "b", null]),
    label,
    chars: Math.min(len, 22),
    w,
    h,
    r: Math.max(w, h) / 2,
    named: r.int(2) === 0,
  };
}

// why: random rooms from sparse to full, newcomers from a few origins (some on a drawn node)
function scene(seed: number, cap: number) {
  const r = random(seed),
    size = r.pick([150, 500, 1500]);
  const placed: Placed[] = Array.from({ length: 1 + r.int(cap) }, (_, i) => ({
    node: laid(r, `p${i}`),
    at: { x: r.real(size), y: r.real(size) },
  }));
  const origins = [
    ...placed.slice(0, 2).map((p) => p.at),
    { x: r.real(size), y: r.real(size) },
  ];
  const comers = Array.from({ length: 1 + r.int(12) }, (_, i) => ({
    node: laid(r, `n${i}`),
    o: r.pick(origins),
  }));
  const E: Newcomer[] = comers.map((c) => ({
    id: c.node.id,
    node: c.node,
    origin: c.o,
    spot: null,
    tries: 0,
    crowded: false,
  }));
  const M: N[] = comers.map((c) => ({
    id: c.node.id,
    node: c.node,
    o: c.o,
    tries: 0,
    crowded: false,
  }));
  const all = placed.map((p): B => ({ ...p.node, p: p.at }));
  return {
    placed,
    E,
    M,
    all,
    centre: mean(placed.map((p) => p.at)),
    layout: r.pick(LAYOUTS),
  };
}

const same = (E: Newcomer[], M: N[]) =>
  expect(E.map((e) => [e.spot, e.tries, e.crowded])).toEqual(
    M.map((m) => [m.at, m.tries, m.crowded]),
  );

describe("the engine searches give the reference result", () => {
  it(
    "placeNewcomers on 400 random rooms",
    () => {
      for (let seed = 0; seed < 400; seed++) {
        const s = scene(seed, 120);
        placeArcs(
          s.E,
          roomOf(s.placed),
          centroid(s.placed.map((p) => p.at)),
          s.layout,
        );
        arcs(s.M, s.all, s.layout, s.centre);
        same(s.E, s.M);
      }
    },
    SLOW,
  );

  it(
    "moveOut and its fallback on 300 random rooms",
    () => {
      for (let seed = 0; seed < 300; seed++) {
        const s = scene(1000 + seed, 50);
        const [target, ...others] = s.placed;
        const room = roomOf(others);
        const spot = engineOut(
          target,
          s.E,
          room,
          centroid(others.map((p) => p.at)),
          s.layout,
        );
        if (spot === null) {
          room.add(bodyOf(target.node, target.at));
          placeArcs(s.E, room, centroid(s.placed.map((p) => p.at)), s.layout);
        }
        expect(spot).toEqual(moveOut(s.all[0], s.M, s.all, s.layout));
        same(s.E, s.M);
      }
    },
    SLOW,
  );

  it(
    "Bubbles on 300 random rooms",
    () => {
      for (let seed = 0; seed < 300; seed++) {
        const s = scene(2000 + seed, 80);
        placeInBubbles(
          s.E,
          roomOf(s.placed),
          s.placed,
          centroid(s.placed.map((p) => p.at)),
        );
        bubbles(s.M, s.all, s.centre);
        same(s.E, s.M);
      }
    },
    SLOW,
  );
});
