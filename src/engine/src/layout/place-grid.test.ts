import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { generate } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState, DrawnId, Point } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { place, type PlaceResult } from "./place";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const LEAF = { w: 24, h: 24, tier: "leaf" } as const;
const METRICS: IconMetrics = {
  ...(JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "icon-metrics.test.json"),
      "utf8",
    ),
  ) as IconMetrics),
  ...Object.fromEntries(["t0", "tl", "t2", "tm"].map((t) => [t, LEAF])),
};
const GRID = generate.grid(27, 45);
const G = 'g:["n607","relatedTo",">","tl"]';
const Y = 'g:["n607","relatedTo",">","t2"]';
const SLOW = 60_000;

type Extra = {
  nodes: { id: string; type: string }[];
  edges: { subject: string; predicate: string; object: string }[];
  away?: string[];
  without?: string[];
};

const leaves = (type: string, prefix: string) =>
  [0, 1, 2].map((k) => ({ id: `${prefix}${k}`, type }));
const linked = (from: string, ids: string[]) =>
  ids.map((object) => ({ subject: from, predicate: "relatedTo", object }));

// why: S12, S22 Given — the 27 × 45 grid at (80·(i − 13), 50·(j − 22)); every point is within
// ellipse value 36.1 of a grid node
function gridWorld(extra: Extra, spots: [DrawnId, Point][]) {
  const without = new Set(extra.without ?? []);
  const input = {
    nodes: [...GRID.nodes.filter((n) => !without.has(n.id)), ...extra.nodes],
    edges: extra.edges,
    view: { budget: "all" },
  };
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const away = new Set(extra.away ?? []);
  const cells = GRID.cells
    .filter(([id]) => !without.has(id))
    .map(([id, i, j]): [DrawnId, Point] => [
      `e:${id}`,
      { x: 80 * (i - 13), y: 50 * (j - 22) },
    ]);
  const state: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping: 2,
    revealed: graph.entities.map((e) => e.id).filter((id) => !away.has(id)),
    positions: [...cells, ...spots],
  };
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action): PlaceResult => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return place(next, change, vocab, METRICS);
  };
  return { state, view, act };
}

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;

function moved(a: CanvasState, b: CanvasState) {
  const now = new Map(b.positions);
  return a.positions.filter(([id, p]) => {
    const q = now.get(id);
    return q === undefined || q.x !== p.x || q.y !== p.y;
  });
}

const near = (p: Point, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 2);
  expect(p.y).toBeCloseTo(y, 2);
};

describe("S12 restore into a full canvas", () => {
  it(
    "puts the 4 newcomers on the fallback ring and moves no drawn node",
    () => {
      const run = gridWorld(
        {
          // why: three types, so Grouping 2 makes no group of the strands
          nodes: [
            { id: "H", type: "th" },
            ...["s0", "s1", "s2"].map((id) => ({ id, type: `t${id}` })),
          ],
          // why: memo item — a second link keeps (0, 0) drawn when H is hidden (strand rule)
          edges: [
            ...linked("n606", ["n607"]),
            ...linked("n607", ["H"]),
            ...linked("H", ["s0", "s1", "s2"]),
          ],
        },
        [],
      );
      const hid = run.act(run.state, { kind: "hide", node: "e:H" });
      expect(hid.state.hidden[0].stranded).toEqual(["s0", "s1", "s2"]);
      const back = run.act(hid.state, { kind: "restore", keys: ["e:H"] });
      expect(back.crowded).toBe(true);
      const ring = [-0.5, -1 / 6, 1 / 6, 0.5].map((f) => {
        const a = -Math.PI / 2 + f * Math.min(Math.PI * 1.4, (62 * 3) / 110);
        return { x: Math.cos(a) * 110, y: Math.sin(a) * 110 };
      });
      expect(back.starts.map(([, p]) => p)).toEqual(
        Array(4).fill({ x: 0, y: 0 }),
      );
      ["e:H", "e:s0", "e:s1", "e:s2"].forEach((id, k) =>
        near(at(back.state, id), ring[k].x, ring[k].y),
      );
      const kept = new Map(back.state.positions);
      for (const [id, p] of hid.state.positions)
        if (id.startsWith("e:n")) expect(kept.get(id)).toEqual(p);
    },
    SLOW,
  );
});

function s22() {
  return gridWorld(
    { nodes: leaves("tl", "l"), edges: linked("n607", ["l0", "l1", "l2"]) },
    [[G, { x: 40, y: 25 }]],
  );
}

describe("S22 a crowded group expand nudges and collapses back", () => {
  it(
    "saves the nudges and the home, and the collapse writes them back",
    () => {
      const run = s22();
      expect(run.view(run.state).nodes.some((n) => n.id === G)).toBe(true);
      const open = run.act(run.state, { kind: "expandGroup", group: G });
      expect(open.crowded).toBe(true);
      expect(open.starts).toEqual(
        ["e:l0", "e:l1", "e:l2"].map((id) => [id, { x: 40, y: 25 }]),
      );
      expect(open.state.nudges).toHaveLength(1);
      const [key, seq, items] = open.state.nudges[0];
      expect([key, seq]).toEqual([G, run.state.seq + 1]);
      expect(items.length).toBeGreaterThan(0);
      const before = new Map(run.state.positions);
      const inEntry = new Set(items.map(([id]) => id));
      for (const [id, x0, y0, x1, y1] of items) {
        expect(at(open.state, id)).toEqual({ x: x1, y: y1 });
        expect(before.get(id)).toEqual({ x: x0, y: y0 });
        expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThanOrEqual(100);
      }
      for (const [id, p] of run.state.positions)
        if (id !== G && !inEntry.has(id)) expect(at(open.state, id)).toEqual(p);
      expect(open.state.homes).toEqual([[G, 40, 25, 40, 25]]);
      const shut = run.act(open.state, { kind: "collapseGroup", group: G });
      expect(moved(run.state, shut.state)).toEqual([]);
      expect(at(shut.state, G)).toEqual({ x: 40, y: 25 });
      expect(shut.state.homes).toEqual([]);
      expect(shut.state.nudges).toEqual([]);
    },
    SLOW,
  );
});

describe("S23 two crowded group expands, both collapse orders", () => {
  it(
    "is exact in event order and within 1e-9 px out of order",
    () => {
      const run = gridWorld(
        {
          nodes: [...leaves("tl", "l"), ...leaves("t2", "k")],
          edges: [
            ...linked("n607", ["l0", "l1", "l2"]),
            ...linked("n607", ["k0", "k1", "k2"]),
          ],
        },
        [
          [G, { x: 40, y: 25 }],
          [Y, { x: 40, y: -25 }],
        ],
      );
      const one = run.act(run.state, { kind: "expandGroup", group: G });
      const two = run.act(one.state, { kind: "expandGroup", group: Y });
      expect(one.crowded && two.crowded).toBe(true);
      const ids = (r: PlaceResult) =>
        new Set(r.state.nudges.at(-1)?.[2].map(([id]) => id));
      const both = [...ids(one)].filter((id) => ids(two).has(id));
      expect(both.length).toBeGreaterThan(0);
      const outOfOrder = run.act(
        run.act(two.state, { kind: "collapseGroup", group: G }).state,
        { kind: "collapseGroup", group: Y },
      );
      for (const [id, p] of run.state.positions) {
        const q = at(outOfOrder.state, id);
        if (both.includes(id))
          expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(1e-9);
        else expect(q).toEqual(p);
      }
      const inOrder = run.act(
        run.act(two.state, { kind: "collapseGroup", group: Y }).state,
        { kind: "collapseGroup", group: G },
      );
      expect(moved(run.state, inOrder.state)).toEqual([]);
      for (const end of [outOfOrder, inOrder]) {
        expect(at(end.state, G)).toEqual({ x: 40, y: 25 });
        expect(at(end.state, Y)).toEqual({ x: 40, y: -25 });
        expect(end.state.homes).toEqual([]);
        expect(end.state.nudges).toEqual([]);
      }
    },
    SLOW,
  );
});
