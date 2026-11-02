import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { generate } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import { place, type PlaceResult } from "../layout/place";
import type { Action, CanvasState, DrawnId, Point } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { exitAround } from "./exit";
import { collapseAround, expandAround, fadeSet, groupAround } from "./focus";
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
    ["tl", "a", "b", "c", "d", "e", "f"].map((t) => [t, LEAF]),
  ),
};
const SLOW = 60_000;

function world(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action): PlaceResult => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    const kind = action.kind;
    if (kind === "explore" || kind === "expandGroup")
      return expandAround(next, change, vocab, METRICS);
    if (kind === "collapse" || kind === "collapseGroup")
      return collapseAround(next, change, vocab, METRICS);
    return place(next, change, vocab, METRICS);
  };
  const group = (s: CanvasState, id: DrawnId) =>
    groupAround(s, view(s), id, METRICS);
  const off = (s: CanvasState) =>
    exitAround(s, { kind: "off" }, view(s), graph, vocab, METRICS).state;
  const exit = (s: CanvasState, action: Action) =>
    exitAround(s, { kind: "action", action }, view(s), graph, vocab, METRICS);
  const first = firstView(graph, vocab, payload, hash);
  return { vocab, view, act, group, off, exit, first };
}

const GRID = generate.grid(27, 45);
const G = 'g:["n607","relatedTo",">","tl"]';
const MEMBERS = ["e:l0", "e:l1", "e:l2"];

// why: STORY-002-07 S22 Given — the 27 × 45 grid at (80·(i − 13), 50·(j − 22)), three leaves of
// `n607` in the group node at (40, 25), Force, Grouping 2
function s22() {
  const leaves = [0, 1, 2].map((k) => ({ id: `l${k}`, type: "tl" }));
  const run = world({
    nodes: [...GRID.nodes, ...leaves],
    edges: leaves.map((l) => ({
      subject: "n607",
      predicate: "relatedTo",
      object: l.id,
    })),
    view: { budget: "all" },
  });
  const cells = GRID.cells.map(([id, i, j]): [DrawnId, Point] => [
    `e:${id}`,
    { x: 80 * (i - 13), y: 50 * (j - 22) },
  ]);
  const state: CanvasState = {
    ...run.first,
    grouping: 2,
    revealed: [...GRID.nodes.map((n) => n.id), "l0", "l1", "l2"],
    positions: [...cells, [G, { x: 40, y: 25 }]],
  };
  return { ...run, state };
}

const pos = (s: CanvasState) => new Map(s.positions);
const at = (s: CanvasState, id: string) => pos(s).get(id) as Point;
const near = (p: Point, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 2);
  expect(p.y).toBeCloseTo(y, 2);
};
const move = ([, x0, y0, x1, y1]: [string, number, number, number, number]) =>
  Math.hypot(x1 - x0, y1 - y0);
const others = (s: CanvasState, skip: string[]) =>
  s.positions.filter(([id]) => !skip.includes(id));

describe("S33 a group expand while grouped (question 6), off, then the group collapse", () => {
  it(
    "clusters G at (70, 0), nudges 6 nodes, and comes back exactly",
    () => {
      const run = s22();
      const S = run.state;
      const on = run.group(S, "e:n607");
      expect(at(on, "e:n607")).toEqual({ x: 0, y: 0 });
      expect(on.around?.shown).toEqual(["e:n607", G]);
      expect(at(on, G)).toEqual({ x: 70, y: 0 });
      expect(fadeSet(on, run.view(on))).toHaveLength(
        run.view(on).nodes.length - 2,
      );
      expect(others(on, [G])).toEqual(others(S, [G]));
      const open = run.act(on, { kind: "expandGroup", group: G });
      expect(open.crowded).toBe(true);
      expect(open.starts).toEqual(MEMBERS.map((id) => [id, { x: 70, y: 0 }]));
      near(at(open.state, "e:l0"), 162.98, -58.77);
      near(at(open.state, "e:l1"), 180, 0);
      near(at(open.state, "e:l2"), 162.98, 58.77);
      expect(open.state.homes).toEqual([[G, 70, 0, 70, 0]]);
      const [, , items] = open.state.nudges.find(([k]) => k === G) ?? [];
      expect(items?.map(([id]) => id)).toEqual(
        ["n555", "n582", "n609", "n610", "n636", "n663"].map((n) => `e:${n}`),
      );
      [8.74, 56.76, 56.91, 16.92, 56.76, 8.74].forEach((d, k) =>
        expect(move(items?.[k] ?? ["", 0, 0, 0, 0])).toBeCloseTo(d, 2),
      );
      expect(open.state.around?.events).toEqual([[G, true]]);
      const done = run.off(open.state);
      for (const [id, p] of S.positions)
        if (id !== G) expect(at(done, id)).toEqual(p);
      expect(done.homes).toEqual([[G, 40, 25, 40, 25]]);
      expect(done.nudges).toEqual([]);
      near(at(done, "e:l0"), 132.98, -33.77);
      near(at(done, "e:l1"), 150, 25);
      near(at(done, "e:l2"), 132.98, 83.77);
      const shut = run.act(done, { kind: "collapseGroup", group: G }).state;
      expect(pos(shut)).toEqual(pos(S));
      expect(shut.homes).toEqual([]);
      expect(shut.nudges).toEqual([]);
    },
    SLOW,
  );
});

function expanded() {
  const run = s22();
  const open = run.act(run.state, { kind: "expandGroup", group: G });
  expect(open.crowded).toBe(true);
  const [, , items] = open.state.nudges.find(([k]) => k === G) ?? [];
  expect(items?.map(([id]) => id)).toEqual(
    ["n609", "n635", "n636", "n662", "n663", "n689"].map((n) => `e:${n}`),
  );
  expect(Math.max(...(items ?? []).map(move))).toBeCloseTo(43.78, 2);
  expect(open.state.homes).toEqual([[G, 40, 25, 40, 25]]);
  near(at(open.state, "e:l0"), 150, 24.45);
  near(at(open.state, "e:l1"), 133.28, 83.3);
  near(at(open.state, "e:l2"), 87.7, 124.12);
  return { run, before: run.state, S: open.state };
}

describe("S38 a group expand before the grouping, collapsed while grouped", () => {
  it(
    "undoes the nudges on saved, shows G at (40, 25), and off returns every node",
    () => {
      const { run, before, S } = expanded();
      const on = run.group(S, "e:n607");
      expect(at(on, "e:l0")).toEqual({ x: 22, y: -42 });
      expect(at(on, "e:l1")).toEqual({ x: 118, y: -42 });
      expect(at(on, "e:l2")).toEqual({ x: 70, y: 42 });
      const shut = run.act(on, { kind: "collapseGroup", group: G }).state;
      expect(new Map(shut.around?.saved).get(G)).toEqual({ x: 40, y: 25 });
      expect(at(shut, G)).toEqual({ x: 40, y: 25 });
      expect(shut.around?.shown).toContain(G);
      for (const id of MEMBERS) expect(pos(shut).has(id)).toBe(false);
      for (const [id, p] of on.positions)
        if (id !== G && !MEMBERS.includes(id)) expect(at(shut, id)).toEqual(p);
      expect(shut.homes).toEqual([]);
      expect(shut.nudges).toEqual([]);
      expect(pos(run.off(shut))).toEqual(pos(before));
    },
    SLOW,
  );
});

describe("S39 a group expand and its collapse, both while grouped", () => {
  it(
    "puts G back at its cluster spot, and off at (40, 25)",
    () => {
      const run = s22();
      const S = run.state;
      const on = run.group(S, "e:n607");
      const open = run.act(on, { kind: "expandGroup", group: G }).state;
      expect(open.around?.events).toEqual([[G, true]]);
      const shut = run.act(open, { kind: "collapseGroup", group: G }).state;
      expect(shut.around?.events).toEqual([]);
      expect(at(shut, G)).toEqual({ x: 70, y: 0 });
      expect(new Map(shut.around?.saved).get(G)).toEqual({ x: 40, y: 25 });
      expect(shut.around?.shown).toContain(G);
      expect(pos(shut)).toEqual(pos(on));
      expect(shut.homes).toEqual([]);
      expect(shut.nudges).toEqual([]);
      const done = run.off(shut);
      expect(at(done, G)).toEqual({ x: 40, y: 25 });
      expect(pos(done)).toEqual(pos(S));
    },
    SLOW,
  );
});

describe("S40 the group node put back while grouped around n555 is faded", () => {
  it(
    "puts G at (40, 25), faded, and off returns every node",
    () => {
      const { run, before, S } = expanded();
      const on = run.group(S, "e:n555");
      expect(on.around?.shown).toEqual(["e:n555"]);
      expect(on.positions).toEqual(S.positions);
      const shut = run.act(on, { kind: "collapseGroup", group: G }).state;
      expect(at(shut, G)).toEqual({ x: 40, y: 25 });
      expect(new Map(shut.around?.saved).get(G)).toEqual({ x: 40, y: 25 });
      expect(shut.around?.shown).not.toContain(G);
      for (const [id, p] of on.positions)
        if (id !== G && !MEMBERS.includes(id)) expect(at(shut, id)).toEqual(p);
      expect(shut.homes).toEqual([]);
      expect(shut.nudges).toEqual([]);
      expect(pos(run.off(shut))).toEqual(pos(before));
    },
    SLOW,
  );
});

const rel = (subject: string, object: string) => ({
  subject,
  predicate: "relatedTo",
  object,
});

describe("S41 a tree shift made before the grouping, collapsed while grouped", () => {
  it("undoes the moved items on saved on the x axis", () => {
    const run = world({
      nodes: [
        { id: "X", type: "a" },
        { id: "P", type: "e" },
        { id: "Q", type: "f" },
        { id: "b1", type: "b" },
        { id: "c1", type: "c" },
        { id: "d1", type: "d" },
      ],
      edges: [
        rel("X", "P"),
        rel("P", "Q"),
        rel("X", "b1"),
        rel("X", "c1"),
        rel("X", "d1"),
      ],
      types: Object.fromEntries(
        ["a", "b", "c", "d", "e", "f"].map((t, k) => [t, { level: k + 1 }]),
      ),
    });
    const S: CanvasState = {
      ...run.first,
      grouping: "off",
      layout: "tree-h",
      revealed: ["X", "P", "Q"],
      positions: [
        ["e:X", { x: 0, y: 0 }],
        ["e:P", { x: 240, y: 0 }],
        ["e:Q", { x: 480, y: 100 }],
      ],
      treeRows: {
        vertical: false,
        rows: [
          ["e:X", 1],
          ["e:P", 5],
          ["e:Q", 6],
        ],
        keyCoord: [
          [1, 0],
          [5, 240],
          [6, 480],
        ],
      },
    };
    const x = run.act(S, { kind: "explore", id: "X" }).state;
    expect(x.treeShifts).toEqual([
      [
        "e:X",
        S.seq + 1,
        {
          vertical: false,
          shiftOf: [
            [5, 240, 340],
            [6, 480, 580],
          ],
          inserted: [2, 3, 4],
          moved: [
            ["e:P", 240, 340],
            ["e:Q", 480, 580],
          ],
        },
      ],
    ]);
    expect(at(x, "e:b1")).toEqual({ x: 85, y: 20 });
    expect(at(x, "e:c1")).toEqual({ x: 170, y: 0 });
    expect(at(x, "e:d1")).toEqual({ x: 255, y: 20 });
    expect(x.nudges).toEqual([]);
    const forced = setLayout(x, run.view(x), run.vocab, "force", METRICS);
    expect(forced.treeShifts).toEqual(x.treeShifts);
    expect(forced.treeRows).toBeNull();
    const back: CanvasState = { ...forced, positions: x.positions };
    const on = run.group(back, "e:P");
    expect(on.around?.shown).toEqual(["e:X", "e:P", "e:Q"]);
    const shut = run.act(on, { kind: "collapse", id: "X" }).state;
    expect(shut.treeRows).toBeNull();
    const saved = new Map(shut.around?.saved);
    expect(saved.get("e:P")).toEqual({ x: 240, y: 0 });
    expect(saved.get("e:Q")).toEqual({ x: 480, y: 100 });
    for (const id of ["e:b1", "e:c1", "e:d1"])
      expect(saved.has(id)).toBe(false);
    expect(shut.treeShifts).toEqual([]);
    const done = run.off(shut);
    expect(pos(done)).toEqual(pos(S));
    expect(done.homes).toEqual([]);
    expect(done.treeShifts).toEqual([]);
    expect(done.nudges).toEqual([]);
  });
});

type Run = ReturnType<typeof world>;

// why: D100 — the change is exit 10: `[home, effect]`, `home` is the state before the grouping, the
// effect is the change on it, and `expandAround` refuses the change
function rootLeaves(
  run: Run,
  before: CanvasState,
  root: DrawnId,
  action: Action,
) {
  const S = run.group(before, root);
  const r = run.exit(S, action);
  expect(r.steps).toHaveLength(2);
  expect(r.steps[0].positions).toEqual(before.positions);
  expect(r.steps[0].around).toBeNull();
  expect(r.steps[1]).toEqual(run.act(before, action).state);
  expect(run.view(r.state).nodes.some((n) => n.id === root)).toBe(false);
  expect(() => run.act(S, action)).toThrow("exitAround");
}

describe("S43 a change of a group root that takes it off the canvas (D100)", () => {
  it(
    "(c) a group expand of the root is exit 10",
    () => {
      const run = s22();
      rootLeaves(run, run.state, G, { kind: "expandGroup", group: G });
    },
    SLOW,
  );

  // why: D100 (b) — the explore of `B` brings `x`, which links `l0` and `l1`; they are no longer
  // leaves, so the group node of the root is not drawn
  it("(b) an explore that takes the members out of the root is exit 10", () => {
    const run = world({
      nodes: [
        { id: "A", type: "a" },
        { id: "B", type: "b" },
        { id: "l0", type: "tl" },
        { id: "l1", type: "tl" },
        { id: "x", type: "c" },
      ],
      edges: [
        rel("A", "l0"),
        rel("A", "l1"),
        rel("A", "B"),
        rel("B", "x"),
      ].concat([rel("x", "l0"), rel("x", "l1")]),
    });
    const root = 'g:["A","relatedTo",">","tl"]';
    const before: CanvasState = {
      ...run.first,
      grouping: 2,
      layout: "force",
      revealed: ["A", "B", "l0", "l1"],
      positions: [
        ["e:A", { x: 0, y: 0 }],
        ["e:B", { x: 200, y: 0 }],
        [root, { x: -200, y: 0 }],
      ],
    };
    expect(run.view(before).nodes.map((n) => n.id)).toEqual([
      "e:A",
      "e:B",
      root,
    ]);
    rootLeaves(run, before, root, { kind: "explore", id: "B" });
  });
});
