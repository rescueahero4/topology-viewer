import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { datasets } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type {
  Action,
  CanvasState,
  LayoutName,
  Point,
} from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { setLayout } from "./layout";
import { place, type PlaceResult } from "./place";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const LEAF = { w: 24, h: 24, tier: "leaf" } as const;
const BASE = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const METRICS: IconMetrics = {
  ...BASE,
  ...Object.fromEntries(
    ["t", "a", "b", "c", "d", "e", "f"].map((t) => [t, LEAF]),
  ),
};

function world(input: object) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action): PlaceResult => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return place(next, change, vocab, METRICS);
  };
  const lay = (s: CanvasState, name: LayoutName) =>
    setLayout(s, view(s), vocab, name, METRICS);
  return { first, view, act, lay };
}

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;
const rel = (subject: string, object: string) => ({
  subject,
  predicate: "relatedTo",
  object,
});

describe("S25 a tree slot clear of a node with a 1-character label", () => {
  it("puts N at (140, 0) after 14 slots and nudges nothing", () => {
    const run = world({
      nodes: ["T", "A", "B", "N"].map((id) => ({ id, type: "t" })),
      edges: ["A", "B", "N"].map((id) => rel("T", id)),
    });
    const state: CanvasState = {
      ...run.first,
      grouping: "off",
      layout: "tree-v",
      revealed: ["T", "A", "B"],
      positions: [
        ["e:T", { x: 0, y: 0 }],
        ["e:A", { x: 50, y: 0 }],
        ["e:B", { x: -50, y: 0 }],
      ],
      treeRows: {
        vertical: true,
        rows: [
          ["e:T", 0],
          ["e:A", 0],
          ["e:B", 0],
        ],
        keyCoord: [[0, 0]],
      },
    };
    const out = run.act(state, { kind: "explore", id: "T" });
    expect(at(out.state, "e:N")).toEqual({ x: 140, y: 0 });
    expect(out.candidates).toEqual([["e:N", 14]]);
    expect(out.crowded).toBe(false);
    for (const [id, p] of state.positions) expect(at(out.state, id)).toEqual(p);
    expect(out.state.nudges).toEqual([]);
    expect(out.state.treeRows).toEqual({
      vertical: true,
      rows: [
        ["e:T", 0],
        ["e:A", 0],
        ["e:B", 0],
        ["e:N", 0],
      ],
      keyCoord: [[0, 0]],
    });
    expect(out.state.treeShifts).toEqual([]);
  });
});

function s26() {
  const run = world({
    nodes: [
      { id: "X", type: "a" },
      { id: "P", type: "e" },
      { id: "M", type: "e" },
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
      rel("P", "M"),
    ],
    types: Object.fromEntries(
      ["a", "b", "c", "d", "e", "f"].map((t, k) => [t, { level: k + 1 }]),
    ),
  });
  const state: CanvasState = {
    ...run.first,
    grouping: "off",
    layout: "tree-v",
    revealed: ["X", "P", "Q"],
    positions: [
      ["e:X", { x: 0, y: 0 }],
      ["e:P", { x: 0, y: 150 }],
      ["e:Q", { x: 100, y: 300 }],
    ],
    treeRows: {
      vertical: true,
      rows: [
        ["e:X", 1],
        ["e:P", 5],
        ["e:Q", 6],
      ],
      keyCoord: [
        [1, 0],
        [5, 150],
        [6, 300],
      ],
    },
  };
  return { run, state };
}

describe("S26 a row that a later node joins shifts back with it (D64)", () => {
  it("shifts rows 5 and 6 by 100 px and writes them back out of event order", () => {
    const { run, state } = s26();
    const x = run.act(state, { kind: "explore", id: "X" });
    expect(x.state.treeShifts).toEqual([
      [
        "e:X",
        state.seq + 1,
        {
          vertical: true,
          shiftOf: [
            [5, 150, 250],
            [6, 300, 400],
          ],
          inserted: [2, 3, 4],
          moved: [
            ["e:P", 150, 250],
            ["e:Q", 300, 400],
          ],
        },
      ],
    ]);
    expect(at(x.state, "e:b1")).toEqual({ x: 0, y: 62.5 });
    expect(at(x.state, "e:c1")).toEqual({ x: 0, y: 125 });
    expect(at(x.state, "e:d1")).toEqual({ x: 0, y: 187.5 });
    const p = run.act(x.state, { kind: "explore", id: "P" });
    expect(at(p.state, "e:M")).toEqual({ x: 100, y: 250 });
    expect(p.candidates).toEqual([["e:M", 10]]);
    expect(p.state.treeShifts).toEqual(x.state.treeShifts);
    expect(p.state.nudges).toEqual([]);
    const cx = run.act(p.state, { kind: "collapse", id: "X" });
    expect(at(cx.state, "e:M")).toEqual({ x: 100, y: 150 });
    expect(at(cx.state, "e:P")).toEqual({ x: 0, y: 150 });
    expect(at(cx.state, "e:Q")).toEqual({ x: 100, y: 300 });
    expect(cx.state.treeRows?.keyCoord).toEqual([
      [1, 0],
      [5, 150],
      [6, 300],
    ]);
    const cp = run.act(cx.state, { kind: "collapse", id: "P" });
    expect(cp.state.positions).toEqual(state.positions);
    expect(cp.state.treeShifts).toEqual([]);
    expect(cp.state.nudges).toEqual([]);
  });

  // why: rule (d) — a bulk Show inserts its rows with shift 0 (the rows squeeze) and keeps no shift
  it("gives the same three rows shift 0 for a bulk Show", () => {
    const { run, state } = s26();
    const out = run.act(state, { kind: "showMany", ids: ["b1", "c1", "d1"] });
    for (const [id, p] of state.positions) expect(at(out.state, id)).toEqual(p);
    expect(out.state.treeRows?.keyCoord).toEqual([
      [1, 0],
      [2, 37.5],
      [3, 75],
      [4, 112.5],
      [5, 150],
      [6, 300],
    ]);
    expect(out.state.treeShifts).toEqual([]);
    expect(out.state.nudges).toEqual([]);
  });
});

// why: memo item — the catalog first view draws columns, so the view of this test draws the table
// and its neighbours that are not columns; then its columns need row 4 between rows 3 and 101
const ROOTED = {
  ...datasets.catalog.graph,
  view: { root: "t_FCT_REVENUE", reveal: ["sc_MARTS", "u_aiko", "ag_finance"] },
};

describe("S6 catalog: a table whose columns need a row that did not exist", () => {
  it.each(["tree-h", "tree-v"] as const)(
    "%s slots the row in, shifts ≤ 100 px and shifts back exactly",
    (name) => {
      const run = world(ROOTED);
      const state = run.lay(run.first, name);
      const was = new Map(state.treeRows?.keyCoord);
      expect([...was.keys()]).toEqual([2, 3, 101]);
      const out = run.act(state, { kind: "explore", id: "t_FCT_REVENUE" });
      const [key, , entry] = out.state.treeShifts[0];
      expect(key).toBe("e:t_FCT_REVENUE");
      expect(entry.vertical).toBe(name === "tree-v");
      expect(entry.inserted).toEqual([4]);
      const coord = new Map(out.state.treeRows?.keyCoord);
      const row = coord.get(4) as number;
      expect(row).toBeGreaterThan(coord.get(3) as number);
      expect(row).toBeLessThan(coord.get(101) as number);
      for (const [, c0, c1] of entry.shiftOf)
        expect(c1 - c0).toBeLessThanOrEqual(100);
      const back = run.act(out.state, {
        kind: "collapse",
        id: "t_FCT_REVENUE",
      });
      expect(back.state.positions).toEqual(state.positions);
      expect(back.state.treeRows).toEqual(state.treeRows);
      expect(back.state.treeShifts).toEqual([]);
    },
  );
});
