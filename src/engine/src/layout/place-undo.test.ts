import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type {
  Action,
  CanvasState,
  NudgeEntry,
  Point,
  ShiftEntry,
} from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { place, type PlaceResult } from "./place";
import { rowIndex, undoEntries, undoRows } from "./undo";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS: IconMetrics = {
  ...(JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "icon-metrics.test.json"),
      "utf8",
    ),
  ) as IconMetrics),
  t: { w: 24, h: 24, tier: "leaf" },
};

function s29() {
  const input = {
    nodes: ["X", "Y", "u", "a"].map((id) => ({ id, type: "t" })),
    edges: [
      ["Y", "u"],
      ["X", "u"],
      ["X", "a"],
    ].map(([subject, object]) => ({ subject, predicate: "relatedTo", object })),
  };
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const state: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping: "off",
    layout: "force",
    revealed: ["X", "Y"],
    positions: [
      ["e:X", { x: 0, y: 0 }],
      ["e:Y", { x: 300, y: 0 }],
    ],
  };
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action): PlaceResult => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return place(next, change, vocab, METRICS);
  };
  return { state, act };
}

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;

const near = (p: Point, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 2);
  expect(p.y).toBeCloseTo(y, 2);
};

describe("S29 a second moveOut of a target with a home (D70)", () => {
  it("keeps the home, stores a move item and collapses to (0, 0)", () => {
    const { state, act } = s29();
    const y = act(state, { kind: "explore", id: "Y" });
    expect(at(y.state, "e:Y")).toEqual({ x: 300, y: 0 });
    near(at(y.state, "e:u"), 410, 0);
    expect(y.state.homes).toEqual([["e:Y", 300, 0, 300, 0]]);
    const x = act(y.state, { kind: "explore", id: "X" });
    expect(at(x.state, "e:X")).toEqual({ x: 0, y: 0 });
    near(at(x.state, "e:a"), -110, 0);
    expect(x.state.homes).toEqual([
      ["e:Y", 300, 0, 300, 0],
      ["e:X", 0, 0, 0, 0],
    ]);
    const cy = act(x.state, { kind: "collapse", id: "Y" });
    expect(new Map(cy.state.positions).has("e:u")).toBe(false);
    expect(at(cy.state, "e:Y")).toEqual({ x: 300, y: 0 });
    expect(cy.state.homes).toEqual([["e:X", 0, 0, 0, 0]]);
    const again = act(cy.state, { kind: "explore", id: "X" });
    const c2 = at(again.state, "e:X");
    near(c2, -19.9, -34.7);
    near(at(again.state, "e:u"), -74.64, -130.11);
    expect(again.state.homes).toEqual([["e:X", 0, 0, 0, 0]]);
    expect(again.state.nudges).toEqual([
      ["e:X", again.state.seq, [["e:X", 0, 0, c2.x, c2.y]]],
    ]);
    const end = act(again.state, { kind: "collapse", id: "X" });
    expect(end.state.positions).toEqual([
      ["e:X", { x: 0, y: 0 }],
      ["e:Y", { x: 300, y: 0 }],
    ]);
    expect(end.state.homes).toEqual([]);
    expect(end.state.nudges).toEqual([]);
  });
});

describe("a collapse undoes the events of its removed set from the latest (D54, D65)", () => {
  // why: two events (seq 1 of X, seq 2 of Y, which X brought) moved `a`; only the order "Y, then X"
  // finds `a` at each coordinate the event wrote and gives 0.1 back exactly (the other order: 0.09…98)
  it("writes back the coordinate before the earliest event", () => {
    const { state, act } = s29();
    const a1 = 0.1 + 0.2;
    const both: CanvasState = {
      ...state,
      seq: 2,
      revealed: ["X", "Y", "u", "a"],
      origins: [["Y", "X"]],
      positions: [
        ...state.positions,
        ["e:u", { x: 410, y: 0 }],
        ["e:a", { x: 0.7, y: 500 }],
      ],
      nudges: [
        ["e:X", 1, [["e:a", 0.1, 500, a1, 500]]],
        ["e:Y", 2, [["e:a", a1, 500, 0.7, 500]]],
      ],
    };
    const end = act(both, { kind: "collapse", id: "X" });
    expect(at(end.state, "e:a")).toEqual({ x: 0.1, y: 500 });
    expect(end.state.nudges).toEqual([]);
  });
});

const shift = (vertical: boolean, seq: number): ShiftEntry => [
  "e:k",
  seq,
  { vertical, shiftOf: [[1, 0, 40]], inserted: [], moved: [["e:a", 10, 50]] },
];

describe("undoEntries (rule (a), D79, D83-D85)", () => {
  it("writes back a coordinate the event wrote and subtracts an offset else", () => {
    const entry: NudgeEntry = [
      "e:k",
      3,
      [
        ["e:a", 0, 0, 5, 5],
        ["e:b", 1, 1, 2, 3],
      ],
    ];
    const out = undoEntries(
      [
        ["e:b", { x: 12, y: 13 }],
        ["e:a", { x: 5, y: 5 }],
        ["e:c", { x: 7, y: 7 }],
      ],
      [entry],
    );
    expect(out).toEqual([
      ["e:b", { x: 11, y: 11 }],
      ["e:a", { x: 0, y: 0 }],
      ["e:c", { x: 7, y: 7 }],
    ]);
  });

  it("skips the items of nodes that are not given", () => {
    const entry: NudgeEntry = ["e:k", 1, [["e:gone", 0, 0, 9, 9]]];
    expect(undoEntries([["e:a", { x: 1, y: 2 }]], [entry])).toEqual([
      ["e:a", { x: 1, y: 2 }],
    ]);
  });

  it("undoes the `moved` items on the axis of `vertical` (D85)", () => {
    const start: [string, Point][] = [["e:a", { x: 50, y: 50 }]];
    expect(undoEntries(start, [shift(false, 1)])).toEqual([
      ["e:a", { x: 10, y: 50 }],
    ]);
    expect(undoEntries(start, [shift(true, 1)])).toEqual([
      ["e:a", { x: 50, y: 10 }],
    ]);
  });

  it("undoes by descending seq, and in one event the nudges first", () => {
    // why: QA T-1 — with 0.1 → 0.1 + 0.2 → 0.7 only the descending order gives 0.1 exactly (the
    // ascending order subtracts twice and gives 0.09999999999999998); integers hide the order
    const a1 = 0.1 + 0.2;
    const later: NudgeEntry = ["e:k", 2, [["e:a", a1, 0, 0.7, 0]]];
    const earlier: NudgeEntry = ["e:j", 1, [["e:a", 0.1, 0, a1, 0]]];
    const start: [string, Point][] = [["e:a", { x: 0.7, y: 0 }]];
    for (const entries of [
      [earlier, later],
      [later, earlier],
    ])
      expect(undoEntries(start, entries)).toEqual([["e:a", { x: 0.1, y: 0 }]]);
    // why: only the order nudges, then row shift gives 0.1 back exactly; the other order subtracts
    // twice and gives 0.09999999999999998
    const rows: ShiftEntry = [
      "e:k",
      1,
      { vertical: false, shiftOf: [], inserted: [], moved: [["e:a", 0.1, a1]] },
    ];
    const together: NudgeEntry = ["e:k", 1, [["e:a", a1, 0, 0.7, 0]]];
    expect(undoEntries([["e:a", { x: 0.7, y: 0 }]], [rows, together])).toEqual([
      ["e:a", { x: 0.1, y: 0 }],
    ]);
  });

  // why: 100.1 - (100.1 - 0.1) is 0.09999999999999432, so only the write-back gives 0.1 exactly
  it("writes back a row coordinate, a joined node and a row key (D21, D64)", () => {
    const moved: ShiftEntry = [
      "e:k",
      1,
      {
        vertical: true,
        shiftOf: [[5, 0.1, 100.1]],
        inserted: [7],
        moved: [["e:a", 0.1, 100.1]],
      },
    ];
    expect(undoEntries([["e:a", { x: 3, y: 100.1 }]], [moved])).toEqual([
      ["e:a", { x: 3, y: 0.1 }],
    ]);
    const at = new Map([["e:b", { x: 9, y: 100.1 }]]);
    const rows = {
      vertical: true,
      keyOf: new Map([["e:b", 5]]),
      coord: new Map([
        [5, 100.1],
        [7, 50],
      ]),
    };
    undoRows(at, rows, moved[2], rowIndex(rows, ["e:b"]));
    expect(at.get("e:b")).toEqual({ x: 9, y: 0.1 });
    expect([...rows.coord]).toEqual([[5, 0.1]]);
  });
});
