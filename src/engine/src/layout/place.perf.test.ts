import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { profile } from "@qdic-topology/contract";
import { generate } from "@qdic-topology/fixtures";
import { packEnclose } from "d3-hierarchy";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type {
  Action,
  CanvasState,
  DrawnId,
  LayoutName,
  Point,
} from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { setLayout } from "./layout";
import { place, type PlaceChange } from "./place";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const LEAF = { w: 24, h: 24, tier: "leaf" } as const;
const METRICS: IconMetrics = {
  ...(JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "icon-metrics.test.json"),
      "utf8",
    ),
  ) as IconMetrics),
  ...Object.fromEntries(["t0", "t1", "t2", "t3", "t4"].map((t) => [t, LEAF])),
};
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
// why: a smoke guard for a search that grows too fast; rule (f) asks the 25 ms target to be printed,
// not gated, and PRD NF-1 is measured in EPIC-005 under the 4× throttle
const GUARD = 250;
const SLOW = 120_000;

type Graphish = { nodes: object[]; edges: object[] };

function world(input: Graphish) {
  const result = normalize(
    { ...input, view: { budget: "all" } },
    { now: "2026-10-14" },
  );
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping: "off",
  };
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const change = (s: CanvasState, action: Action) => {
    const next = transition(s, action, graph, vocab);
    return { next, change: { action, before: view(s), after: view(next) } };
  };
  const lay = (s: CanvasState, name: LayoutName) =>
    setLayout(s, view(s), vocab, name, METRICS);
  return { graph, vocab, first, view, change, lay };
}

type World = ReturnType<typeof world>;

// why: STORY-002-07 rule (f) — one event is one `place` call; one warm-up call is not counted, then
// the median of 5 calls
function timed(run: World, next: CanvasState, change: PlaceChange, n = 5) {
  place(next, change, run.vocab, METRICS);
  const times = Array.from({ length: n }, () => {
    const t0 = performance.now();
    place(next, change, run.vocab, METRICS);
    return performance.now() - t0;
  }).sort((a, b) => a - b);
  return times[Math.floor(n / 2)];
}

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;

function s10() {
  const base = generate.random(1950, 3950, 42);
  const leaves = Array.from({ length: 50 }, (_, k) => `m${k}`);
  const run = world({
    nodes: [
      ...base.nodes,
      ...leaves.map((id) => ({ id, type: "t0", label: id })),
    ],
    edges: [
      ...base.edges,
      ...leaves.map((object) => ({
        subject: "n0",
        predicate: "relatedTo",
        object,
      })),
    ],
  });
  const drawn = { ...run.first, revealed: base.nodes.map((n) => n.id) };
  return { run, state: run.lay(drawn, "bubbles"), leaves };
}

describe("S10 Bubbles at the caps: 50 newcomers next to 1,950 drawn nodes", () => {
  it(
    "stays within the geometry bound and moves no drawn node",
    () => {
      const { run, state, leaves } = s10();
      const { next, change } = run.change(state, { kind: "explore", id: "n0" });
      const out = place(next, change, run.vocab, METRICS);
      expect(out.candidates.map(([id]) => id)).toEqual(
        leaves.map((id) => `e:${id}`),
      );
      const members = run.view(state).nodes.filter((n) => n.type === "t0");
      expect(members).toHaveLength(390);
      const e = packEnclose(
        members.map((n) => ({ ...at(state, n.id), r: 24 })),
      );
      const K = Math.floor((e.r + 400) / 24);
      let B = 1;
      for (let k = 1; k <= K; k++) B += Math.round((2 * Math.PI * 24 * k) / 30);
      for (const [, tries] of out.candidates)
        expect(tries).toBeLessThanOrEqual(B + 130);
      for (const [id, p] of state.positions)
        expect(at(out.state, id)).toEqual(p);
      const most = Math.max(...out.candidates.map(([, n]) => n));
      const ms = timed(run, next, change);
      console.log(
        `S10: r ${e.r.toFixed(1)}, B ${B}, most ${most}, over B ${out.candidates.filter(([, n]) => n > B).length}, median ${ms.toFixed(2)} ms`,
      );
      expect(ms).toBeLessThan(GUARD);
    },
    SLOW,
  );
});

describe("S11 a 500-leaf star from its centre (Force)", () => {
  it(
    "gives 500 distinct clear positions",
    () => {
      const run = world(generate.star(500));
      const state: CanvasState = {
        ...run.first,
        layout: "force",
        revealed: ["n0"],
        positions: [["e:n0", { x: 0, y: 0 }]],
      };
      const { next, change } = run.change(state, { kind: "explore", id: "n0" });
      const out = place(next, change, run.vocab, METRICS);
      const spots = out.state.positions.filter(([id]) => id !== "e:n0");
      expect(spots).toHaveLength(500);
      expect(new Set(spots.map(([, p]) => `${p.x} ${p.y}`)).size).toBe(500);
      const centre = at(out.state, "e:n0");
      const clear = spots.every(
        ([, p]) => Math.hypot(0.65 * (p.x - centre.x), p.y - centre.y) > 58,
      );
      expect(out.crowded).toBe(!clear);
      expect(out.crowded).toBe(false);
      const counts = out.candidates.map(([, n]) => n);
      const ms = timed(run, next, change);
      console.log(
        `S11: most ${Math.max(...counts)}, sum ${counts.reduce((a, b) => a + b, 0)}, median ${ms.toFixed(2)} ms`,
      );
      expect(ms).toBeLessThan(GUARD);
    },
    SLOW,
  );
});

function busiest(run: World, s: CanvasState) {
  return run
    .view(s)
    .nodes.reduce((best, n) =>
      "entity" in n && n.more > ("entity" in best ? best.more : -1) ? n : best,
    );
}

// why: the user asks for each `place` near-linear at the caps (2,000 nodes, 4,000 edges) in every
// layout; the actions are those of FR-CANVAS-8, on the generated random graph
describe("place at the caps in every layout", () => {
  it.each(LAYOUTS)(
    "%s stays under the guard",
    (name) => {
      const base = generate.random(2000, 4000, 42);
      const run = world(base);
      const drawn = {
        ...run.first,
        revealed: base.nodes.slice(0, 1500).map((n) => n.id),
      };
      const state = run.lay(drawn, name);
      const hub = busiest(run, state);
      const id = "entity" in hub ? hub.entity : "";
      const rows: [string, number][] = [];
      const time = (label: string, s: CanvasState, action: Action) => {
        const { next, change } = run.change(s, action);
        rows.push([label, timed(run, next, change)]);
        return place(next, change, run.vocab, METRICS).state;
      };
      const open = time("explore", state, { kind: "explore", id });
      time("collapse", open, { kind: "collapse", id });
      const hid = time("hide", state, { kind: "hide", node: hub.id });
      time("restore", hid, { kind: "restore", keys: [hub.id] });
      time("bulk Show 200", state, {
        kind: "showMany",
        ids: base.nodes.slice(1500, 1700).map((n) => n.id),
      });
      const off = time("type off", state, {
        kind: "toggleType",
        type: "t1",
        on: false,
      });
      time("type on", off, { kind: "toggleType", type: "t1", on: true });
      time("Grouping 2", state, { kind: "grouping", grouping: 2 });
      console.log(
        `${name}: ${rows.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")} ms`,
      );
      for (const [, ms] of rows) expect(ms).toBeLessThan(GUARD);
    },
    SLOW,
  );
});

// why: the rare forms — a full canvas, many newcomers at once, a group expand of 2,000 minus the
// anchor, newcomers next to a node at the border of the chart
describe("place in the heavy rare forms", () => {
  it(
    "bounds a 1,000-leaf explore inside a full grid canvas",
    () => {
      const grid = generate.grid(40, 25);
      const leaves = Array.from({ length: 999 }, (_, k) => ({
        id: `x${k}`,
        type: "t1",
        label: `x${k}`,
      }));
      const run = world({
        nodes: [...grid.nodes, ...leaves],
        edges: leaves.map((n) => ({
          subject: "n500",
          predicate: "relatedTo",
          object: n.id,
        })),
      });
      const spots = grid.cells.map(([cell, i, j]): [DrawnId, Point] => [
        `e:${cell}`,
        { x: 80 * (i - 20), y: 50 * (j - 12) },
      ]);
      const state: CanvasState = {
        ...run.first,
        layout: "force",
        revealed: grid.nodes.map((n) => n.id),
        positions: spots,
      };
      const { next, change } = run.change(state, {
        kind: "explore",
        id: "n500",
      });
      const out = place(next, change, run.vocab, METRICS);
      expect(out.starts).toHaveLength(999);
      const ms = timed(run, next, change);
      console.log(
        `full grid, 999 newcomers: crowded ${out.crowded}, median ${ms.toFixed(2)} ms`,
      );
      expect(ms).toBeLessThan(4 * GUARD);
    },
    SLOW,
  );

  it(
    "bounds a group expand of 1,999 members",
    () => {
      const run = world(generate.star(1999));
      const state: CanvasState = { ...run.first, grouping: 2, layout: "force" };
      const group = run.view(state).nodes.find((n) => "members" in n);
      if (group === undefined) throw new Error("no group");
      const placed = {
        ...state,
        positions: run
          .view(state)
          .nodes.map((n, k): [DrawnId, Point] => [n.id, { x: 1000 * k, y: 0 }]),
      };
      const { next, change } = run.change(placed, {
        kind: "expandGroup",
        group: group.id,
      });
      const out = place(next, change, run.vocab, METRICS);
      expect(out.starts).toHaveLength(1999);
      const ms = timed(run, next, change);
      console.log(
        `group expand of 1,999: crowded ${out.crowded}, median ${ms.toFixed(2)} ms`,
      );
      expect(ms).toBeLessThan(GUARD);
    },
    SLOW,
  );
});

// why: S33 (QA F-4, rule (h)(7)) — `h` holds G anchors with 2 leaves each, so Grouping 2 draws G
// groups; every group is open and has its `homes` record. The anchors form a chain, so they are
// not leaves and stay apart when their leaves leave
function groupWorld(count: number) {
  const nodes = [
    { id: "h", type: "a", label: "h" },
    { id: "x", type: "x", label: "x" },
  ];
  const edges = [{ subject: "a0", predicate: "r", object: "x" }];
  for (let i = 0; i < count; i++) {
    nodes.push({ id: `a${i}`, type: "a", label: `a${i}` });
    edges.push({ subject: "h", predicate: "p", object: `a${i}` });
    if (i > 0)
      edges.push({ subject: `a${i - 1}`, predicate: "s", object: `a${i}` });
    for (const k of [0, 1]) {
      const id = `l${i}_${k}`;
      nodes.push({ id, type: "l", label: id });
      edges.push({ subject: `a${i}`, predicate: "q", object: id });
    }
  }
  const run = world({ nodes, edges });
  const grouped: CanvasState = {
    ...run.first,
    grouping: 2,
    revealed: nodes.map((n) => n.id).filter((id) => id !== "x"),
  };
  const groups = run.view(grouped).nodes.filter((n) => "members" in n);
  const state: CanvasState = {
    ...grouped,
    expandedGroups: groups.map((n) => n.id.slice(2)),
    homes: groups.map((n) => [n.id, 0, 0, 0, 0]),
  };
  return { run, state, nodes, groups };
}

// why: the collapse of `a0` reads every record and undoes none
function records(count: number) {
  const { run, state, nodes, groups } = groupWorld(count);
  const open = run.lay(state, "force");
  const { next, change } = run.change(open, { kind: "explore", id: "a0" });
  const out = place(next, change, run.vocab, METRICS).state;
  const collapse = run.change(out, { kind: "collapse", id: "a0" });
  const kept = place(collapse.next, collapse.change, run.vocab, METRICS);
  expect(kept.state.homes).toHaveLength(count);
  return { run, ...collapse, nodes: nodes.length, groups: groups.length };
}

// why: QA P25 — in tree-h `h` brought every leaf, and every group expand has a row-shift record, so
// the collapse of `h` undoes all the group events while `h` and the anchors stay; one row index
// for the collapse, not one for each event
function rowRecords(count: number) {
  const { run, state, nodes, groups } = groupWorld(count);
  const leaves = nodes.filter((n) => n.type === "l");
  const shifted = run.lay(
    {
      ...state,
      seq: count,
      origins: leaves.map((n): [string, string] => [n.id, "h"]),
      treeShifts: groups.map((n, i) => [
        n.id,
        i + 1,
        { vertical: false, shiftOf: [], inserted: [], moved: [] },
      ]),
    },
    "tree-h",
  );
  const collapse = run.change(shifted, { kind: "collapse", id: "h" });
  const undone = place(collapse.next, collapse.change, run.vocab, METRICS);
  expect([undone.state.homes, undone.state.treeShifts]).toEqual([[], []]);
  return { run, ...collapse, nodes: nodes.length, groups: groups.length };
}

describe("S33 a collapse with many group-expand records", () => {
  it.each([
    ["force, the records stay", records],
    ["tree-h, the group events are undone", rowRecords],
  ])(
    "%s: near-linear and ≤ 25 ms at 650 records",
    (name, build) => {
      const ms = [200, 400, 650].map((count) => {
        const { run, next, change, nodes, groups } = build(count);
        expect(groups).toBe(count);
        const time = timed(run, next, change, 21);
        console.log(
          `S33 ${name}: ${count} records, ${nodes} nodes, median ${time.toFixed(2)} ms`,
        );
        return time;
      });
      expect(ms[2]).toBeLessThanOrEqual(25);
      // why: D96 (2) — linear work gives about 3.25 × (the node ratio), the old quadratic code 10.5 ×
      expect(ms[2]).toBeLessThanOrEqual(6 * ms[0]);
    },
    SLOW,
  );
});
