import { describe, expect, it } from "vitest";
import type { MoveItem, Point } from "../state/canvasState";
import type { Newcomer } from "./arcs";
import type { Placed } from "./clear";
import type { Laid } from "./drawn";
import { nudge as engineNudge } from "./nudge";
import { inRows, shiftRows } from "./rows";

// why: reference tree searches and the reference nudge, written apart from the engine from the
// STORY-002-07 text and the cited mockup lines (1371-1408, 1461-1487): plain loops over all nodes,
// no grid, no resume, the mockup nudge loop with its global flag; the same spots, counts and flags
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
type Rows = { v: boolean; key: Map<string, number>; kc: Map<number, number> };

const ell = (a: Point, b: Point) => Math.hypot((a.x - b.x) * 0.65, a.y - b.y);
const ok = (p: Point, n: Laid, q: B) => {
  const lw = Math.max(q.chars * 7.6, 60) + 6;
  const top = q.p.y + q.h / 2 + 2;
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

// why: the fallback ring of rule (e), mockup lines 1302-1310 and 1297-1300
function fallback(list: N[], all: B[], c: Point, v: boolean) {
  const groups = new Map<string, N[]>();
  for (const n of list) {
    const k = `${Math.round(n.o.x)},${Math.round(n.o.y)}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  for (const g of groups.values()) {
    const o = g[0].o;
    const ux = v ? 0 : Math.sign(o.x - c.x) || 1;
    const uy = v ? Math.sign(o.y - c.y) || 1 : 0;
    const dir = Math.atan2(uy, ux);
    const out: Point[] = [];
    for (let ring = 0; out.length < g.length; ring++) {
      const R = 110 + ring * 64;
      const cap = Math.max(1, Math.floor((Math.PI * 1.4 * R) / 62) + 1);
      const m = Math.min(cap, g.length - out.length);
      const spread = m === 1 ? 0 : Math.min(Math.PI * 1.4, (62 * (m - 1)) / R);
      for (let j = 0; j < m; j++) {
        const a = dir + (m === 1 ? 0 : (j / (m - 1) - 0.5) * spread);
        out.push({ x: o.x + Math.cos(a) * R, y: o.y + Math.sin(a) * R });
      }
    }
    g.forEach((n, i) => {
      n.at = out[i];
      n.crowded = true;
      all.push({ ...n.node, p: out[i] });
    });
  }
}

function insert(rows: Rows, keys: number[], room: number) {
  const step = rows.v ? 150 : 240;
  const orig = new Map(rows.kc);
  const known = [...orig.keys()].sort((a, b) => a - b);
  const within = (lo?: number, hi?: number) =>
    keys.filter(
      (k) => (lo === undefined || k > lo) && (hi === undefined || k < hi),
    );
  const first = known.length
    ? (orig.get(known[0]) as number)
    : step * keys.length;
  within(undefined, known[0])
    .reverse()
    .forEach((k, j) => rows.kc.set(k, first - step * (j + 1)));
  const shiftOf = new Map<number, number>();
  let shift = 0;
  known.forEach((k, j) => {
    const c = (orig.get(k) as number) + shift;
    const next = known[j + 1];
    const ins = within(k, next);
    rows.kc.set(k, c);
    if (shift) shiftOf.set(k, shift);
    if (!ins.length) return;
    if (next === undefined)
      return ins.forEach((nk, m) => rows.kc.set(nk, c + step * (m + 1)));
    let gap = (orig.get(next) as number) + shift - c;
    if (gap / (ins.length + 1) < step / 2) {
      const need = (step / 2) * (ins.length + 1) - gap;
      const add = Math.max(0, Math.min(need, room - shift));
      shift += add;
      gap += add;
    }
    ins.forEach((nk, m) =>
      rows.kc.set(nk, c + (gap / (ins.length + 1)) * (m + 1)),
    );
  });
  return shiftOf;
}

function slots(rows: Rows, list: N[], all: B[], c: Point) {
  const size = (n: Laid) =>
    rows.v ? Math.max(n.w + 24, n.chars * 7.6 + 20) : n.h + 36;
  const groups = new Map<string, N[]>();
  for (const n of list) {
    const k = `${Math.round(n.o.x)},${Math.round(n.o.y)}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  for (const g of groups.values()) {
    const failed: N[] = [];
    for (const n of g) {
      const axis = rows.kc.get(rows.key.get(n.id) as number) as number;
      const want = rows.v ? n.o.x : n.o.y;
      for (let j = 0; j < 400 && !n.at; j++) {
        const c = want + Math.ceil(j / 2) * 20 * (j % 2 ? 1 : -1);
        const p = rows.v ? { x: c, y: axis } : { x: axis, y: c };
        n.tries++;
        const row = all.filter(
          (b) => Math.abs((rows.v ? b.p.y : b.p.x) - axis) < 30,
        );
        const spaced = row.every(
          (b) =>
            Math.abs((rows.v ? b.p.x : b.p.y) - c) >=
            (size(b) + size(n.node)) / 2,
        );
        if (spaced && all.every((q) => ok(p, n.node, q))) {
          n.at = p;
          all.push({ ...n.node, p });
        }
      }
      if (!n.at) failed.push(n);
    }
    fallback(failed, all, c, rows.v);
  }
}

// why: mockup `nudge` (lib/topology.js lines 1461-1487) as written: all movers in each round, a
// global flag; only the newcomers push (D55), and the limit is 100 px minus the row shift
function nudge(
  at: Map<string, Point>,
  fixed: Point[],
  room: (id: string) => number,
) {
  const movers = [...at.keys()];
  const home = new Map(movers.map((id) => [id, at.get(id) as Point]));
  for (const limit of [20, 100])
    for (let it = 0; it < 8; it++) {
      let moved = false;
      for (const id of movers) {
        const q = at.get(id) as Point;
        const h = home.get(id) as Point;
        const lim = Math.min(limit, room(id));
        if (!fixed.some((o) => ell(q, o) < 50)) continue;
        let px = 0;
        let py = 0;
        for (const o of fixed) {
          const dx = q.x - o.x;
          const dy = q.y - o.y;
          const d = ell(q, o);
          if (d >= 50) continue;
          const L = Math.hypot(dx, dy) || 1;
          px += (dx / L) * (50 - d);
          py += (dy / L) * (50 - d);
        }
        let nx = q.x + px;
        let ny = q.y + py;
        const off = Math.hypot(nx - h.x, ny - h.y);
        if (off > lim) {
          nx = h.x + ((nx - h.x) / off) * lim;
          ny = h.y + ((ny - h.y) / off) * lim;
        }
        if (nx !== q.x || ny !== q.y) {
          at.set(id, { x: nx, y: ny });
          moved = true;
        }
      }
      if (!moved) break;
    }
  return movers.flatMap((id): MoveItem[] => {
    const a = home.get(id) as Point;
    const b = at.get(id) as Point;
    return a.x === b.x && a.y === b.y ? [] : [[id, a.x, a.y, b.x, b.y]];
  });
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
  const pick = <T>(l: T[]) => l[int(l.length)];
  return { int, pick, real: (a: number) => (next() * 2 - 1) * a };
}
type Rnd = ReturnType<typeof random>;

function laid(r: Rnd, id: string): Laid {
  const w = r.pick([20, 24, 27, 38, 56]);
  const h = r.pick([20, 24, 36, 56]);
  const len = r.int(26);
  const chars = Math.min(len, 22);
  const named = r.int(2) === 0;
  const type = r.pick(["a", "b", null]);
  return { id, type, label: "x".repeat(len), chars, w, h, r: w / 2, named };
}

// why: random rows from sparse to full; one node in five sits off the rows
function scene(seed: number, v: boolean) {
  const r = random(seed);
  const size = r.pick([150, 500, 1500]);
  const keyOf = new Map<string, number>();
  const spot = (id: string) => {
    if (r.int(5) === 0) return { x: r.real(size), y: r.real(size) };
    const key = r.int(4);
    keyOf.set(id, key);
    const c = key * (v ? 150 : 240);
    return v ? { x: r.real(size), y: c } : { x: c, y: r.real(size) };
  };
  const placed: Placed[] = Array.from({ length: 1 + r.int(80) }, (_, i) => ({
    node: laid(r, `p${i}`),
    at: spot(`p${i}`),
  }));
  const origins = [placed[0].at, { x: r.real(size), y: r.real(size) }];
  const comers = Array.from({ length: 1 + r.int(12) }, (_, i) => ({
    node: laid(r, `n${i}`),
    o: r.pick(origins),
  }));
  for (const c of comers) keyOf.set(c.node.id, r.int(4));
  const E = comers.map((c): Newcomer => ({
    id: c.node.id,
    node: c.node,
    origin: c.o,
    spot: null,
    tries: 0,
    crowded: false,
  }));
  const M = comers.map((c): N => ({
    id: c.node.id,
    node: c.node,
    o: c.o,
    tries: 0,
    crowded: false,
  }));
  const all = placed.map((p): B => ({ ...p.node, p: p.at }));
  const at = placed.map((p) => p.at);
  const centre = {
    x: at.reduce((s, p) => s + p.x, 0) / at.length,
    y: at.reduce((s, p) => s + p.y, 0) / at.length,
  };
  return { r, placed, E, M, all, keyOf, centre };
}

// why: the engine row insert runs inside `shiftRows`; with no drawn node it only inserts
function engineInsert(coord: Map<number, number>, keys: number[], v: boolean) {
  const r = random(7);
  const keyOf = new Map(keys.map((k): [string, number] => [`k${k}`, k]));
  const list = keys.map((k): Newcomer => ({
    id: `k${k}`,
    node: laid(r, `k${k}`),
    origin: { x: 0, y: 0 },
    spot: null,
    tries: 0,
    crowded: false,
  }));
  const rows = { vertical: v, keyOf, coord };
  return (
    shiftRows(rows, list, new Map(), [], v ? 100 : 0)?.shiftOf ?? new Map()
  );
}

describe("the engine tree search and nudge give the reference result", () => {
  it(
    "tree slots and row inserts on 400 random rooms",
    () => {
      for (let seed = 0; seed < 400; seed++) {
        const v = seed % 2 === 0;
        const s = scene(3000 + seed, v);
        const step = v ? 150 : 240;
        const coord = new Map(
          [0, 1, 2, 3].map((k): [number, number] => [k, k * step]),
        );
        inRows({ vertical: v, keyOf: s.keyOf, coord }, s.E, s.placed);
        slots({ v, key: s.keyOf, kc: new Map(coord) }, s.M, s.all, s.centre);
        expect(s.E.map((e) => [e.spot, e.tries, e.crowded])).toEqual(
          s.M.map((m) => [m.at, m.tries, m.crowded]),
        );
        const keys = [...new Set([s.r.int(9) - 2, s.r.int(9) - 2, 1.5])]
          .sort((a, b) => a - b)
          .filter((k) => !coord.has(k));
        const known = new Map([...coord].filter(() => s.r.int(3) > 0));
        const model = { v, key: s.keyOf, kc: new Map(known) };
        expect(insert(model, keys, v ? 100 : 0)).toEqual(
          engineInsert(known, keys, v),
        );
        expect(known).toEqual(model.kc);
      }
    },
    SLOW,
  );

  // why: a dense room gives a mover three hits or more, where the sum order of the pushes can change
  // the last bits; the engine adds them in the order of the newcomers, as the mockup does
  it(
    "the nudge on 800 random rooms, sparse and dense",
    () => {
      for (let seed = 0; seed < 800; seed++) {
        const r = random(4000 + seed);
        const size = seed % 2 === 0 ? 150 : 30;
        const movers = Array.from({ length: 1 + r.int(40) }, (_, i) => ({
          id: `p${i}`,
          at: { x: r.real(size), y: r.real(size) },
          room: r.pick([100, 100, 60, 7, 0]),
        }));
        const push = Array.from({ length: 1 + r.int(12) }, () => ({
          x: r.real(size),
          y: r.real(size),
        }));
        const at = new Map(movers.map((m) => [m.id, m.at]));
        const rooms = new Map(movers.map((m) => [m.id, m.room]));
        expect(engineNudge(movers, push)).toEqual(
          nudge(at, push, (id) => rooms.get(id) as number),
        );
      }
    },
    SLOW,
  );
});
