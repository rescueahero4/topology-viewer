import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { generate, loadFixture } from "@qdic-topology/fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalize } from "../data/normalize";
import { atomicLayout } from "../layout/atomic";
import { bubbleLayout } from "../layout/bubbles";
import type { IconMetrics } from "../layout/drawn";
import { forceLayout } from "../layout/force";
import { layout, setLayout } from "../layout/layout";
import { place } from "../layout/place";
import { treeLayout } from "../layout/tree";
import type {
  Action,
  CanvasState,
  DrawnId,
  LayoutName,
  Point,
} from "../state/canvasState";
import { groupAround } from "../view/focus";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { beginDrag, dragBubble, dragStep, release, type DragCtx } from "./drag";

vi.mock("../layout/force", async (load) => {
  const mod = await load<typeof import("../layout/force")>();
  return { ...mod, forceLayout: vi.fn(mod.forceLayout) };
});
vi.mock("../layout/atomic", async (load) => {
  const mod = await load<typeof import("../layout/atomic")>();
  return { ...mod, atomicLayout: vi.fn(mod.atomicLayout) };
});
vi.mock("../layout/bubbles", async (load) => {
  const mod = await load<typeof import("../layout/bubbles")>();
  return { ...mod, bubbleLayout: vi.fn(mod.bubbleLayout) };
});
vi.mock("../layout/tree", async (load) => {
  const mod = await load<typeof import("../layout/tree")>();
  return { ...mod, treeLayout: vi.fn(mod.treeLayout) };
});
vi.mock("../layout/layout", async (load) => {
  const mod = await load<typeof import("../layout/layout")>();
  return { ...mod, layout: vi.fn(mod.layout), setLayout: vi.fn(mod.setLayout) };
});

const SPIES = [
  forceLayout,
  atomicLayout,
  bubbleLayout,
  treeLayout,
  layout,
  setLayout,
].map((fn) => vi.mocked(fn));
const spyCalls = () =>
  SPIES.reduce((sum, spy) => sum + spy.mock.calls.length, 0);

const LIGHT = canvasColor("#F4F4F5") as Hex;
const LEAF = { w: 24, h: 24, tier: "leaf" } as const;
const METRICS: IconMetrics = {
  ...(JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
      "utf8",
    ),
  ) as IconMetrics),
  ...Object.fromEntries(["t0", "tl"].map((t) => [t, LEAF])),
};
const SLOW = 60_000;

function loaded(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action) => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return place(next, change, vocab, METRICS).state;
  };
  return { graph, vocab, payload, hash, view, act };
}

function world(key: string, name: LayoutName) {
  const run = loaded(loadFixture(key).input);
  const first = firstView(run.graph, run.vocab, run.payload, run.hash);
  const state = setLayout(first, run.view(first), run.vocab, name, METRICS);
  return { ...run, state };
}

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;
const far = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pull = (h: number, D: number) =>
  48 * Math.pow(0.35, h - 1) * (1 - Math.exp(-D / 300));
const away = (p: Point, d: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });
const CHAIN = Array.from({ length: 14 }, (_, i) => `e:t${i}`);

// why: S3, S3b "record every step" — the release loop of `release`, step by step, so that the test
// also reads the velocity of each step
function settle(ctx: DragCtx) {
  const steps: { positions: [DrawnId, Point][]; ctx: DragCtx }[] = [];
  let now = ctx;
  for (let i = 0; i < 240; i++) {
    const step = dragStep(now, now.pointer);
    steps.push(step);
    now = step.ctx;
    if (!step.moving) break;
  }
  return steps;
}

function chainDrag(name: LayoutName, D: number) {
  const run = world("s-chain", name);
  const ctx = beginDrag(run.state, run.view(run.state), "e:t0") as DragCtx;
  const start = at(run.state, "e:t0");
  const first = dragStep(ctx, away(start, { x: D, y: 0 }));
  return { run, first, done: release(first.ctx) };
}

beforeEach(() => vi.clearAllMocks());

describe("S1 a 500 px drag along the chain in Atomic, Bubbles and the trees", () => {
  it.each(["atomic", "bubbles", "tree-h", "tree-v"] as const)(
    "%s: rest moves by hop, no follower passes its target",
    (name) => {
      const { run, first, done } = chainDrag(name, 500);
      expect(done.steps.length).toBeLessThanOrEqual(240);
      const rest = done.steps[done.steps.length - 1];
      expect(done.state.positions).toEqual(rest);
      const moved = (id: string) =>
        far(new Map(rest).get(id) as Point, at(run.state, id));
      expect(Math.abs(moved("e:t1") - 38.9)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(moved("e:t2") - 13.6)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(moved("e:t3") - 4.8)).toBeLessThanOrEqual(0.5);
      for (const id of CHAIN.slice(4)) expect(moved(id)).toBe(0);
      for (const positions of [first.positions, ...done.steps]) {
        const p = new Map(positions);
        for (const h of [1, 2, 3])
          expect(
            far(p.get(CHAIN[h]) as Point, at(run.state, CHAIN[h])),
          ).toBeLessThanOrEqual(pull(h, 500) + 1e-9);
      }
    },
  );
});

describe("S2 a 100 px drag in Atomic", () => {
  it("moves t1 13.6 px at rest", () => {
    const { run, done } = chainDrag("atomic", 100);
    expect(
      Math.abs(far(at(done.state, "e:t1"), at(run.state, "e:t1")) - 13.6),
    ).toBeLessThanOrEqual(0.5);
  });
});

function forceSteps(D: number) {
  const run = world("s-chain", "force");
  const ctx = beginDrag(run.state, run.view(run.state), "e:t0") as DragCtx;
  const first = dragStep(ctx, away(at(run.state, "e:t0"), { x: D, y: 0 }));
  const steps = [first, ...settle(first.ctx)];
  const move = (s: { positions: [DrawnId, Point][] }, h: number) =>
    far(new Map(s.positions).get(CHAIN[h]) as Point, at(run.state, CHAIN[h]));
  // why: SA §6 row 4 at every step — 48, 17, 6 px, and 0 px beyond 3 hops
  const bounded = () => {
    for (const s of steps)
      CHAIN.forEach((_, h) => {
        if (h > 0) expect(move(s, h)).toBeLessThanOrEqual(BOUND[h] + 1e-9);
      });
  };
  return { run, first, steps, move, bounded };
}

const BOUND = [0, 48, 17, 6, ...Array<number>(10).fill(0)];

describe("S3 a 500 px drag in Force", () => {
  it("swings t1 past its target, rests at 38.9 px and keeps every bound", () => {
    const { run, first, steps, move, bounded } = forceSteps(500);
    expect(steps.some((s) => move(s, 1) > pull(1, 500))).toBe(true);
    const done = release(first.ctx);
    expect(done.steps).toEqual(steps.slice(1).map((s) => s.positions));
    expect(
      Math.abs(far(at(done.state, "e:t1"), at(run.state, "e:t1")) - 38.9),
    ).toBeLessThanOrEqual(0.5);
    bounded();
  });
});

describe("S3b a 900 px drag in Force reaches the clamp", () => {
  it("puts t1 on 48 px with no velocity at some step", () => {
    const { steps, move, bounded } = forceSteps(900);
    const clamped = steps.filter((s) => Math.abs(move(s, 1) - 48) < 1e-9);
    expect(clamped.length).toBeGreaterThan(0);
    for (const s of clamped) {
      const f = s.ctx.followers.find((item) => item.id === "e:t1");
      expect(f?.v).toEqual({ x: 0, y: 0 });
    }
    bounded();
  });
});

describe("S4 a 0 px drag, a node with no neighbour, an unknown id", () => {
  it("changes nothing, moves only c1, and gives no drag", () => {
    const chain = world("s-chain", "atomic");
    const S = chain.state;
    const ctx = beginDrag(S, chain.view(S), "e:t0") as DragCtx;
    const still = release(dragStep(ctx, at(S, "e:t0")).ctx);
    expect(still.state.positions).toEqual(S.positions);
    const islands = world("s-islands", "force");
    const I = islands.state;
    const c1 = beginDrag(I, islands.view(I), "e:c1") as DragCtx;
    expect(c1.followers).toEqual([]);
    const target = away(at(I, "e:c1"), { x: 200, y: 0 });
    const done = release(dragStep(c1, target).ctx);
    for (const [id, p] of I.positions)
      expect(at(done.state, id)).toEqual(id === "e:c1" ? target : p);
    expect(beginDrag(S, chain.view(S), "e:nope")).toBeNull();
  });
});

describe("S5 a drag of the table group of s-star in Force", () => {
  it("pulls tag_pii by pull(1, 200) and the 2-hop nodes ≤ 16.8 px", () => {
    const run = world("s-star", "force");
    const nodes = run.view(run.state).nodes;
    const group = nodes.find((n) => "members" in n && n.type === "table") as {
      id: DrawnId;
    };
    const columns = nodes.find(
      (n) => "members" in n && n.type === "column",
    ) as { id: DrawnId };
    const ctx = beginDrag(run.state, run.view(run.state), group.id) as DragCtx;
    const target = away(at(run.state, group.id), { x: 0, y: 200 });
    const done = release(dragStep(ctx, target).ctx);
    expect(at(done.state, group.id)).toEqual(target);
    const moved = (id: string) => far(at(done.state, id), at(run.state, id));
    expect(Math.abs(moved("e:tag_pii") - pull(1, 200))).toBeLessThanOrEqual(
      0.5,
    );
    expect(moved("e:tg_class")).toBeLessThanOrEqual(16.8);
    expect(moved(columns.id)).toBeLessThanOrEqual(16.8);
  });
});

function hops(run: ReturnType<typeof world>, s: CanvasState, from: DrawnId) {
  const edges = run.view(s).edges;
  const hop = new Map([[from, 0]]);
  for (let h = 1; h <= 3; h++)
    for (const e of edges)
      for (const [a, b] of [
        [e.subject, e.object],
        [e.object, e.subject],
      ])
        if (hop.get(a) === h - 1 && !hop.has(b)) hop.set(b, h);
  return hop;
}

describe("S6 a drag while grouped around t_FCT_REVENUE", () => {
  it("moves the followers over the drawn adjacency and keeps the grouping", () => {
    const run = world("s-access", "force");
    const grouped = groupAround(
      run.state,
      run.view(run.state),
      "e:t_FCT_REVENUE",
      METRICS,
    );
    const ctx = beginDrag(grouped, run.view(grouped), "e:u_12") as DragCtx;
    const target = away(at(grouped, "e:u_12"), { x: 300, y: 0 });
    const done = release(dragStep(ctx, target).ctx);
    expect(done.state.around).toEqual(grouped.around);
    const hop = hops(run, grouped, "e:u_12");
    expect(hop.get("e:ug_exec")).toBe(1);
    for (const [id, p] of grouped.positions) {
      const h = hop.get(id);
      const moved = far(at(done.state, id), p);
      if (id === "e:u_12") expect(at(done.state, id)).toEqual(target);
      else if (h === undefined) expect(moved).toBe(0);
      else expect(Math.abs(moved - pull(h, 300))).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("S7 the release commits at once with no layout", () => {
  it("returns the rest positions as the cache", () => {
    const run = world("s-chain", "atomic");
    vi.clearAllMocks();
    const ctx = beginDrag(run.state, run.view(run.state), "e:t0") as DragCtx;
    const pointer = away(at(run.state, "e:t0"), { x: 500, y: 0 });
    const done = release(dragStep(ctx, pointer).ctx);
    expect(done.state.positions).toEqual(done.steps[done.steps.length - 1]);
    expect(done.state).toEqual({
      ...run.state,
      positions: done.state.positions,
    });
    expect(spyCalls()).toBe(0);
  });
});

describe("S8 a bubble drag of product in s-designed", () => {
  it("moves only the shown members, by exactly the vector", () => {
    const run = world("s-designed", "bubbles");
    const vector = { x: 40, y: -25 };
    const grouped = groupAround(
      run.state,
      run.view(run.state),
      "e:fac_osaka",
      METRICS,
    );
    expect(grouped.around?.shown).toEqual(
      expect.arrayContaining(["e:sup_cell", "e:fac_brno", "e:prd_cell"]),
    );
    const hid = run.act(run.state, { kind: "hide", node: "e:prd_bike" });
    vi.clearAllMocks();
    const cases: [CanvasState, string[]][] = [
      [run.state, ["e:prd_cell", "e:prd_pack", "e:prd_bike"]],
      [grouped, ["e:prd_cell"]],
      [hid, ["e:prd_cell", "e:prd_pack"]],
    ];
    for (const [s, members] of cases) {
      const done = dragBubble(s, run.view(s), "product", vector);
      for (const [id, p] of s.positions) {
        const q = at(done, id);
        expect(q).toEqual(
          members.includes(id) ? { x: p.x + 40, y: p.y - 25 } : p,
        );
      }
    }
    expect(at(hid, "e:prd_bike")).toEqual(at(run.state, "e:prd_bike"));
    expect(spyCalls()).toBe(0);
  });
});

const GRID = generate.grid(27, 45);
const G = 'g:["n607","relatedTo",">","tl"]';

// why: STORY-002-07 S22 Given — the 27 × 45 grid at (80·(i − 13), 50·(j − 22)), three leaves of
// `n607` in the group node at (40, 25)
function s22() {
  const leaves = [0, 1, 2].map((k) => ({ id: `l${k}`, type: "tl" }));
  const run = loaded({
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
    ...firstView(run.graph, run.vocab, run.payload, run.hash),
    grouping: 2,
    revealed: run.graph.entities.map((e) => e.id),
    positions: [...cells, [G, { x: 40, y: 25 }]],
  };
  return { ...run, state };
}

describe("S28 a drag between a group expand and its collapse", () => {
  it(
    "subtracts the nudge of the dragged node and writes the others back",
    () => {
      const run = s22();
      const open = run.act(run.state, { kind: "expandGroup", group: G });
      const entry = open.nudges.find(([key]) => key === G);
      expect(entry?.[2].length).toBeGreaterThan(0);
      const items = entry?.[2] ?? [];
      const item = items.find(([, x0, y0, x1, y1]) => x0 !== x1 || y0 !== y1);
      if (item === undefined) throw new Error("no nudge item");
      const [id, x0, y0, x1, y1] = item;
      const ctx = beginDrag(open, run.view(open), id) as DragCtx;
      expect(ctx.followers).toEqual([]);
      const dropped = release(
        dragStep(ctx, away(at(open, id), { x: 100, y: 0 })).ctx,
      ).state;
      const r = at(dropped, id);
      const shut = run.act(dropped, { kind: "collapseGroup", group: G });
      expect(at(shut, G)).toEqual({ x: 40, y: 25 });
      expect(at(shut, id)).toEqual({ x: r.x - (x1 - x0), y: r.y - (y1 - y0) });
      const others = new Set(items.map(([k]) => k));
      for (const [k, a0, b0] of items)
        if (k !== id) expect(at(shut, k)).toEqual({ x: a0, y: b0 });
      for (const [k, p] of run.state.positions)
        if (k !== G && !others.has(k)) expect(at(shut, k)).toEqual(p);
    },
    SLOW,
  );
});
