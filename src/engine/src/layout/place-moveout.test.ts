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
  ...Object.fromEntries(["t0", "tl", "t2", "tm", "tz"].map((t) => [t, LEAF])),
};
const GRID = generate.grid(27, 45);
const HOLE = ["n582", "n583", "n584", "n610", "n611", "n636", "n637", "n638"];
const G = 'g:["n607","relatedTo",">","tl"]';
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

const m1 = { nodes: [{ id: "m1", type: "tm" }], edges: linked("n609", ["m1"]) };

function s27(extra?: Extra) {
  return gridWorld(
    {
      nodes: [...leaves("tl", "l"), ...m1.nodes, ...(extra?.nodes ?? [])],
      edges: [
        ...linked("n607", ["l0", "l1", "l2"]),
        ...m1.edges,
        ...(extra?.edges ?? []),
      ],
      without: extra?.without ?? HOLE,
      away: ["m1", ...(extra?.away ?? [])],
    },
    [[G, { x: 40, y: 25 }]],
  );
}

function within(a: CanvasState, b: CanvasState, id: string, tol: number) {
  for (const [key, p] of a.positions) {
    const q = at(b, key);
    if (key === id) expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(tol);
    else expect(q).toEqual(p);
  }
}

describe("S27 a nudge of a target that moved out (QA case A)", () => {
  it(
    "returns n609 home in both collapse orders",
    () => {
      const run = s27();
      const out = run.act(run.state, { kind: "explore", id: "n609" });
      near(at(out.state, "e:n609"), 200, -0.01);
      near(at(out.state, "e:m1"), 310, -0.02);
      const [home] = out.state.homes;
      expect(home.slice(0, 3)).toEqual(["e:n609", 160, 0]);
      expect(out.state.nudges).toEqual([]);
      const open = run.act(out.state, { kind: "expandGroup", group: G });
      expect(open.crowded).toBe(true);
      const items = open.state.nudges[0][2];
      expect(items.map(([id]) => id)).toEqual([
        "e:n609",
        "e:n635",
        "e:n662",
        "e:n663",
        "e:n689",
      ]);
      near(at(open.state, "e:n609"), 212.96, -5.91);
      const a = run.act(
        run.act(open.state, { kind: "collapse", id: "n609" }).state,
        {
          kind: "collapseGroup",
          group: G,
        },
      );
      within(run.state, a.state, "e:n609", 1e-9);
      const b = run.act(
        run.act(open.state, { kind: "collapseGroup", group: G }).state,
        {
          kind: "collapse",
          id: "n609",
        },
      );
      expect(moved(run.state, b.state)).toEqual([]);
      for (const end of [a, b]) {
        expect(at(end.state, G)).toEqual({ x: 40, y: 25 });
        expect(end.state.homes).toEqual([]);
        expect(end.state.nudges).toEqual([]);
      }
    },
    SLOW,
  );
});

describe("S28 a moveOut of a node that a nudge moved (QA case B)", () => {
  it(
    "returns n609 home in both collapse orders",
    () => {
      const run = s27({ nodes: [], edges: [], without: [] });
      const open = run.act(run.state, { kind: "expandGroup", group: G });
      near(at(open.state, "e:n609"), 169.77, -23.87);
      const nudgedTo = at(open.state, "e:n609");
      const out = run.act(open.state, { kind: "explore", id: "n609" });
      near(at(out.state, "e:n609"), 1159.83, -164.53);
      near(at(out.state, "e:m1"), 1268.73, -180.0);
      const home = out.state.homes.find(([id]) => id === "e:n609");
      expect(home?.slice(0, 3)).toEqual(["e:n609", nudgedTo.x, nudgedTo.y]);
      expect(out.state.nudges.some(([key]) => key === "e:n609")).toBe(false);
      const a = run.act(
        run.act(out.state, { kind: "collapseGroup", group: G }).state,
        {
          kind: "collapse",
          id: "n609",
        },
      );
      within(run.state, a.state, "e:n609", 1e-9);
      const b = run.act(
        run.act(out.state, { kind: "collapse", id: "n609" }).state,
        {
          kind: "collapseGroup",
          group: G,
        },
      );
      expect(moved(run.state, b.state)).toEqual([]);
      for (const end of [a, b]) {
        expect(at(end.state, G)).toEqual({ x: 40, y: 25 });
        expect(end.state.homes).toEqual([]);
        expect(end.state.nudges).toEqual([]);
      }
    },
    SLOW,
  );
});

describe("S30 a move between two moveOut calls (D70)", () => {
  it(
    "undoes the move item and the nudge once each",
    () => {
      const run = s27({
        nodes: [{ id: "u", type: "tm" }],
        // why: memo item — with `n609 relatedTo u` Grouping 2 puts n0 and n609 into one group of
        // leaves of u after the first explore; the other direction gives two buckets of one
        edges: [...linked("n0", ["u"]), ...linked("u", ["n609"])],
        away: ["u"],
      });
      const s1 = run.act(run.state, { kind: "explore", id: "n0" });
      near(at(s1.state, "e:n0"), -1067.46, -1129.09);
      near(at(s1.state, "e:u"), -1142.97, -1209.08);
      const s2 = run.act(s1.state, { kind: "explore", id: "n609" });
      near(at(s2.state, "e:n609"), 200, 0.25);
      near(at(s2.state, "e:m1"), 310, 0.93);
      const s3 = run.act(s2.state, { kind: "expandGroup", group: G });
      expect(s3.state.nudges[0][2].map(([id]) => id)).toEqual([
        "e:n609",
        "e:n635",
        "e:n662",
        "e:n663",
        "e:n689",
      ]);
      const p = at(s3.state, "e:n609");
      near(p, 212.44, -5.57);
      const s4 = run.act(s3.state, { kind: "collapse", id: "n0" });
      expect(at(s4.state, "e:n0")).toEqual({ x: -1040, y: -1100 });
      const home = s4.state.homes.find(([id]) => id === "e:n609");
      const s5 = run.act(s4.state, { kind: "explore", id: "n609" });
      expect(s5.state.homes.find(([id]) => id === "e:n609")).toEqual(home);
      near(at(s5.state, "e:n609"), 1132.1, -30.42);
      near(at(s5.state, "e:u"), 1242.06, -33.4);
      const c2 = at(s5.state, "e:n609");
      expect(s5.state.nudges.at(-1)).toEqual([
        "e:n609",
        s5.state.seq,
        [["e:n609", p.x, p.y, c2.x, c2.y]],
      ]);
      const orders: Action[][] = [
        [
          { kind: "collapse", id: "n609" },
          { kind: "collapseGroup", group: G },
        ],
        [
          { kind: "collapseGroup", group: G },
          { kind: "collapse", id: "n609" },
        ],
      ];
      for (const order of orders) {
        const end = order.reduce(
          (s, action) => run.act(s, action).state,
          s5.state,
        );
        within(run.state, end, "e:n609", 1e-9);
        expect(end.homes).toEqual([]);
        expect(end.nudges).toEqual([]);
      }
    },
    SLOW,
  );
});

const Y = 'g:["n609","relatedTo",">","tm"]';

// why: S34 (QA F-8, rule (h)(9), D97) — after the explores of y0 and y1 no member of Y is a leaf,
// so only the rule (h)(9) test finds the group expand inside the removed set
describe("S34 a group expand whose members were explored (QA F-8)", () => {
  it.each(["force", "atomic"] as const)(
    "%s: the collapse of n609 undoes the group expand",
    (layout) => {
      const run = gridWorld(
        {
          nodes: [
            ...["y0", "y1"].map((id) => ({ id, type: "tm" })),
            ...["z0", "z1"].map((id) => ({ id, type: "tz" })),
          ],
          edges: [
            ...linked("n609", ["y0", "y1"]),
            ...linked("y0", ["z0"]),
            ...linked("y1", ["z1"]),
            ...linked("n606", ["n607"]),
          ],
          without: HOLE,
          away: ["y0", "y1", "z0", "z1"],
        },
        [],
      );
      const start: CanvasState = { ...run.state, layout };
      const ids = (s: CanvasState) => run.view(s).nodes.map((n) => n.id);
      const one = run.act(start, { kind: "explore", id: "n609" });
      expect(ids(one.state)).toContain(Y);
      const open = run.act(one.state, { kind: "expandGroup", group: Y });
      expect(open.crowded).toBe(true);
      const items = open.state.nudges.flatMap(([key, , list]) =>
        key === Y ? list : [],
      );
      expect(
        items.filter(([, x0, y0, x1, y1]) => x0 !== x1 || y0 !== y1),
      ).toHaveLength(5);
      const out = ["y0", "y1"].reduce(
        (s, id) => run.act(s, { kind: "explore", id }).state,
        open.state,
      );
      const end = run.act(out, { kind: "collapse", id: "n609" }).state;
      expect(ids(end)).toEqual(ids(start));
      for (const id of ids(start)) {
        const p = at(start, id);
        const q = at(end, id);
        expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThanOrEqual(1e-9);
      }
      expect(
        [...end.homes, ...end.nudges, ...end.treeShifts].map(([key]) => key),
      ).not.toContain(Y);
    },
    SLOW,
  );
});
