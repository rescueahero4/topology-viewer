import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { beginDrag, dragStep, release, type DragCtx } from "../interact/drag";
import type { IconMetrics } from "../layout/drawn";
import { place, type PlaceResult } from "../layout/place";
import type {
  Action,
  CanvasState,
  DrawnId,
  MoveItem,
  Point,
} from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { exitAround } from "./exit";
import { collapseAround, expandAround, groupAround } from "./focus";
import { frontier } from "./frontier";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const LEAF = { w: 24, h: 24, tier: "leaf" } as const;
const METRICS: IconMetrics = {
  ...(JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
      "utf8",
    ),
  ) as IconMetrics),
  ...Object.fromEntries(
    ["t0", "r", "p", "q", "l", "m", "a", "al"].map((t) => [t, LEAF]),
  ),
};
const SLOW = 60_000;
const hundred = (prefix: string, type: string) =>
  Array.from({ length: 100 }, (_, k) => ({ id: `${prefix}${k}`, type }));
const rel = (subject: string, object: string) => ({
  subject,
  predicate: "relatedTo",
  object,
});

// why: S34 and S36 Given — synthetic ids (S-C4): the lattice at (300·(i − 12), 300·(j − 12))
// without g12_12, R, T, Y drawn, Force, Grouping Off, no labels
function lattice(withA: boolean) {
  const grid: { id: string; type: string; at: Point }[] = [];
  for (let i = 0; i <= 24; i++)
    for (let j = 0; j <= 24; j++)
      if (i !== 12 || j !== 12)
        grid.push({
          id: `g${i}_${j}`,
          type: "t0",
          at: { x: 300 * (i - 12), y: 300 * (j - 12) },
        });
  const drawnAt: [string, Point][] = [
    ...grid.map((g): [string, Point] => [g.id, g.at]),
    ["R", { x: -150, y: 0 }],
    ["T", { x: 0, y: 0 }],
    ["Y", { x: -150, y: 150 }],
  ];
  const nodes = [
    ...grid.map(({ id, type }) => ({ id, type })),
    { id: "R", type: "r" },
    { id: "T", type: "p" },
    { id: "Y", type: "p" },
    { id: "u", type: "q" },
    ...(withA ? [{ id: "A", type: "a" }] : []),
    ...hundred("l", "l"),
    ...hundred("m", "m"),
    ...(withA ? hundred("a", "al") : []),
  ];
  const edges = [
    rel("R", "T"),
    rel("R", "Y"),
    rel("Y", "u"),
    rel("T", "u"),
    ...hundred("l", "l").map((l) => rel("T", l.id)),
    ...hundred("m", "m").map((m) => rel("Y", m.id)),
    ...(withA
      ? [
          rel("T", "A"),
          rel("R", "A"),
          ...hundred("a", "al").map((a) => rel("A", a.id)),
        ]
      : []),
  ];
  return worldOf({ nodes, edges }, drawnAt);
}

function worldOf(input: object, drawnAt: [string, Point][]) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action): PlaceResult => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    if (action.kind === "explore")
      return expandAround(next, change, vocab, METRICS);
    if (action.kind === "collapse")
      return collapseAround(next, change, vocab, METRICS);
    return place(next, change, vocab, METRICS);
  };
  const group = (s: CanvasState, id: DrawnId) =>
    groupAround(s, view(s), id, METRICS);
  const off = (s: CanvasState) =>
    exitAround(s, { kind: "off" }, view(s), graph, vocab, METRICS).state;
  const state: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping: "off",
    layout: "force",
    revealed: drawnAt.map(([id]) => id),
    positions: drawnAt.map(([id, p]) => [`e:${id}`, p]),
  };
  return { view, act, group, off, state };
}

const pos = (s: CanvasState) => new Map(s.positions);
const at = (s: CanvasState, id: string) => pos(s).get(id) as Point;
const near = (p: Point, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 2);
  expect(p.y).toBeCloseTo(y, 2);
};
const itemOf = (s: CanvasState, key: string, id: string) =>
  s.nudges
    .find(([k]) => k === key)?.[2]
    .find(([item]) => item === id) as MoveItem;
const nudge = (item: MoveItem, a: Point, b: Point) => {
  near({ x: item[1], y: item[2] }, a.x, a.y);
  near({ x: item[3], y: item[4] }, b.x, b.y);
};
const itemsOf = (s: CanvasState, key: string) =>
  s.nudges.find(([k]) => k === key)?.[2] ?? [];

// why: S34 When up to the second explore of T, with the Then of each step
function s34() {
  const run = lattice(false);
  const S = run.state;
  const y = run.act(S, { kind: "explore", id: "Y" });
  expect(y.crowded).toBe(true);
  expect(at(y.state, "e:Y")).toEqual({ x: -150, y: 150 });
  near(at(y.state, "e:u"), -47.96, 191.07);
  expect(itemsOf(y.state, "e:Y")).toHaveLength(7);
  nudge(
    itemOf(y.state, "e:Y", "e:R"),
    { x: -150, y: 0 },
    { x: -127.96, y: 11.57 },
  );
  nudge(
    itemOf(y.state, "e:Y", "e:g12_13"),
    { x: 0, y: 300 },
    { x: 4.74, y: 283.2 },
  );
  const t = run.act(y.state, { kind: "explore", id: "T" });
  expect(t.crowded).toBe(true);
  expect(at(t.state, "e:T")).toEqual({ x: 0, y: 0 });
  expect(t.state.homes).toEqual([]);
  expect(itemsOf(t.state, "e:T")).toHaveLength(30);
  nudge(
    itemOf(t.state, "e:T", "e:g12_11"),
    { x: 0, y: -300 },
    { x: -28.55, y: -273.11 },
  );
  nudge(
    itemOf(t.state, "e:T", "e:g12_13"),
    { x: 4.74, y: 283.2 },
    { x: -12.67, y: 279.13 },
  );
  const on = run.group(t.state, "e:R");
  near(at(on, "e:R"), -127.96, 11.57);
  near(at(on, "e:T"), -105.96, 11.57);
  near(at(on, "e:Y"), -9.96, 11.57);
  expect(on.around?.seq0).toBe(t.state.seq);
  const shut = run.act(on, { kind: "collapse", id: "Y" }).state;
  const saved = new Map(shut.around?.saved);
  for (const id of [
    "e:u",
    ...Array.from({ length: 100 }, (_, k) => `e:m${k}`),
  ]) {
    expect(pos(shut).has(id)).toBe(false);
    expect(saved.has(id)).toBe(false);
  }
  expect(saved.get("e:R")).toEqual({ x: -150, y: 0 });
  near(saved.get("e:g12_13") as Point, -17.41, 295.94);
  for (const [id] of itemsOf(y.state, "e:Y"))
    if (id !== "e:R" && id !== "e:g12_13")
      expect(saved.get(id)).toEqual(at(S, id));
  for (const id of ["e:R", "e:T", "e:Y"])
    expect(at(shut, id)).toEqual(at(on, id));
  const again = run.act(shut, { kind: "explore", id: "T" }).state;
  near(at(again, "e:T"), -155.53, 74.36);
  near(at(again, "e:u"), -223.7, 160.69);
  const home = again.homes.find(([k]) => k === "e:T") as MoveItem;
  expect(home.slice(0, 3)).toEqual(["e:T", at(on, "e:T").x, at(on, "e:T").y]);
  expect(home.slice(3)).toEqual([at(again, "e:T").x, at(again, "e:T").y]);
  expect(again.around?.events).toEqual([["e:T", true]]);
  expect(again.nudges).toEqual(shut.nudges);
  return { run, S, on, again };
}

describe("S34 a crowded explore before the grouping and a collapse while grouped", () => {
  it(
    "keeps the earlier entry of T and returns every node",
    () => {
      const { run, S, again } = s34();
      const ctx = beginDrag(again, run.view(again), "e:T") as DragCtx;
      const p = at(again, "e:T");
      const dragged = release(
        dragStep(ctx, { x: p.x + 100, y: p.y }).ctx,
      ).state;
      const done = run.off(dragged);
      expect(at(done, "e:T")).toEqual({ x: 0, y: 0 });
      expect(at(done, "e:R")).toEqual({ x: -150, y: 0 });
      expect(at(done, "e:Y")).toEqual({ x: -150, y: 150 });
      expect(done.homes.some(([k]) => k === "e:T")).toBe(false);
      expect(itemsOf(done, "e:T")).toHaveLength(30);
      const back = run.act(done, { kind: "collapse", id: "T" }).state;
      expect(pos(back)).toEqual(pos(S));
      expect(back.homes).toEqual([]);
      expect(back.nudges).toEqual([]);
    },
    SLOW,
  );
});

describe("S37 the collapse of T while grouped after its second explore", () => {
  it(
    "writes the home of T on positions and the earlier entry on saved",
    () => {
      const { run, S, on, again } = s34();
      const shut = run.act(again, { kind: "collapse", id: "T" }).state;
      expect(shut.around?.events).toEqual([]);
      near(at(shut, "e:T"), -105.96, 11.57);
      expect(at(shut, "e:T")).toEqual(at(on, "e:T"));
      for (const id of ["e:u", "e:l0", "e:l99"])
        expect(pos(shut).has(id)).toBe(false);
      expect(shut.homes).toEqual([]);
      expect(shut.nudges).toEqual([]);
      const done = run.off(shut);
      expect(pos(done)).toEqual(pos(S));
      expect(at(done, "e:T")).toEqual({ x: 0, y: 0 });
    },
    SLOW,
  );
});

describe("S36 case M: a crowded explore while grouped inside an earlier expansion", () => {
  it(
    "undoes each entry in its own frame and returns every node",
    () => {
      const run = lattice(true);
      const S = run.state;
      const t = run.act(S, { kind: "explore", id: "T" });
      expect(t.crowded).toBe(true);
      expect(at(t.state, "e:T")).toEqual({ x: 0, y: 0 });
      expect(t.state.homes).toEqual([]);
      near(at(t.state, "e:A"), -108.56, -17.71);
      near(at(t.state, "e:u"), -101.23, 43.03);
      expect(itemsOf(t.state, "e:T")).toHaveLength(7);
      nudge(
        itemOf(t.state, "e:T", "e:R"),
        { x: -150, y: 0 },
        { x: -138.41, y: 10.36 },
      );
      nudge(
        itemOf(t.state, "e:T", "e:g11_11"),
        { x: -300, y: -300 },
        { x: -254.76, y: -304.31 },
      );
      const on = run.group(t.state, "e:R");
      near(at(on, "e:T"), -121.01, -45.44);
      near(at(on, "e:Y"), -25.01, -45.44);
      near(at(on, "e:A"), -224.55, 103.63);
      expect(on.around?.seq0).toBe(t.state.seq);
      const a = run.act(on, { kind: "explore", id: "A" });
      expect(a.crowded).toBe(true);
      expect(a.state.homes).toEqual([]);
      expect(a.state.around?.events).toEqual([["e:A", false]]);
      const saved = new Map(on.around?.saved);
      const items = itemsOf(a.state, "e:A");
      expect(items).toHaveLength(34);
      expect(items.every(([id]) => saved.has(id))).toBe(true);
      const grid = items.filter(([id]) => id.startsWith("e:g"));
      expect(grid).toHaveLength(6);
      const size = ([, x0, y0, x1, y1]: MoveItem) =>
        Math.hypot(x1 - x0, y1 - y0);
      const most = grid.reduce((a, b) => (size(b) > size(a) ? b : a));
      expect(most[0]).toBe("e:g12_13");
      expect(size(most)).toBeCloseTo(56.92, 2);
      const shut = run.act(a.state, { kind: "collapse", id: "T" }).state;
      expect(shut.around?.events).toEqual([]);
      for (const id of ["e:u", "e:A", "e:l0", "e:a0"])
        expect(pos(shut).has(id)).toBe(false);
      const done = run.off(shut);
      expect(pos(done)).toEqual(pos(S));
      expect(done.homes).toEqual([]);
      expect(done.nudges).toEqual([]);
    },
    SLOW,
  );
});

// why: S45 Given (QA probe E): R in the middle, T, Y, z0, z1 on a 400 px ring, a leaf v0 that T
// and Y share, 4 own leaves each; Force, Grouping Off
function ring() {
  const own = (hub: string, p: string) =>
    [0, 1, 2, 3].map((k) => ({ id: `${p}${k}`, type: p, hub }));
  const leaves = [...own("T", "l"), ...own("Y", "m")];
  const spokes = ["T", "Y", "z0", "z1"];
  const input = {
    nodes: [
      { id: "R", type: "r" },
      ...spokes.map((id) => ({ id, type: "p" })),
      { id: "v0", type: "q" },
      ...leaves.map(({ id, type }) => ({ id, type })),
    ],
    edges: [
      ...spokes.map((id) => rel("R", id)),
      rel("Y", "v0"),
      rel("T", "v0"),
      ...leaves.map(({ id, hub }) => rel(hub, id)),
    ],
  };
  const turn = (k: number) => (2 * Math.PI * k) / spokes.length;
  return worldOf(input, [
    ["R", { x: 0, y: 0 }],
    ...spokes.map((id, k): [string, Point] => [
      id,
      { x: 400 * Math.cos(turn(k)), y: 400 * Math.sin(turn(k)) },
    ]),
  ]);
}

describe("S45 the undo of a non-zero D70 move item made while grouped (QA T-1)", () => {
  it("puts T back at its grouped spot and deletes the item", () => {
    const run = ring();
    const S0 = run.state;
    const y = run.act(S0, { kind: "explore", id: "Y" }).state;
    const t = run.act(y, { kind: "explore", id: "T" }).state;
    expect(t.homes.some(([k]) => k === "e:T")).toBe(true);
    const on = run.group(t, "e:R");
    const seq0 = on.around?.seq0 ?? 0;
    const c = run.act(on, { kind: "collapse", id: "Y" }).state;
    const g = at(c, "e:T");
    const again = run.act(c, { kind: "explore", id: "T" }).state;
    expect(again.around?.events).toEqual([["e:T", false]]);
    const late = again.nudges.filter(([k, q]) => k === "e:T" && q > seq0);
    const item = late.flatMap(([, , it]) => it).find(([id]) => id === "e:T");
    if (item === undefined) throw new Error("no D70 move item");
    near({ x: item[1], y: item[2] }, 22, -42);
    near({ x: item[3], y: item[4] }, -14.06, -59.31);
    const shut = run.act(again, { kind: "collapse", id: "T" }).state;
    const p = at(shut, "e:T");
    expect(Math.hypot(p.x - g.x, p.y - g.y)).toBeLessThanOrEqual(1e-9);
    expect(shut.nudges.some(([k, q]) => k === "e:T" && q > seq0)).toBe(false);
    const done = run.off(shut);
    for (const [id, q] of S0.positions) expect(at(done, id)).toEqual(q);
    expect(run.view(done).nodes.map((n) => n.id)).toEqual(
      run.view(S0).nodes.map((n) => n.id),
    );
  });
});
