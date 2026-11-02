import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { datasets, loadFixture } from "#fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { atomicLayout } from "./atomic";
import { bubbleLayout } from "./bubbles";
import type { IconMetrics } from "./drawn";
import { forceLayout } from "./force";
import { layout, recenter, setLayout } from "./layout";
import { place, type PlaceResult } from "./place";
import { treeLayout } from "./tree";

vi.mock("./force", async (load) => {
  const mod = await load<typeof import("./force")>();
  return { ...mod, forceLayout: vi.fn(mod.forceLayout) };
});
vi.mock("./atomic", async (load) => {
  const mod = await load<typeof import("./atomic")>();
  return { ...mod, atomicLayout: vi.fn(mod.atomicLayout) };
});
vi.mock("./bubbles", async (load) => {
  const mod = await load<typeof import("./bubbles")>();
  return { ...mod, bubbleLayout: vi.fn(mod.bubbleLayout) };
});
vi.mock("./tree", async (load) => {
  const mod = await load<typeof import("./tree")>();
  return { ...mod, treeLayout: vi.fn(mod.treeLayout) };
});
vi.mock("./layout", async (load) => {
  const mod = await load<typeof import("./layout")>();
  return {
    ...mod,
    layout: vi.fn(mod.layout),
    setLayout: vi.fn(mod.setLayout),
    recenter: vi.fn(mod.recenter),
  };
});

const SPIES = [
  forceLayout,
  atomicLayout,
  bubbleLayout,
  treeLayout,
  layout,
  setLayout,
  recenter,
].map((fn) => vi.mocked(fn));
const spyCalls = () =>
  SPIES.reduce((sum, spy) => sum + spy.mock.calls.length, 0);

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const SLOW = 60_000;

function world(input: unknown, name: LayoutName) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const first = firstView(graph, vocab, payload, hash);
  const state = setLayout(first, view(first), vocab, name, METRICS);
  const act = (s: CanvasState, action: Action): PlaceResult => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return place(next, change, vocab, METRICS);
  };
  return { graph, vocab, state, view, act };
}

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;
const drawnIds = (run: ReturnType<typeof world>, s: CanvasState) =>
  run.view(s).nodes.map((node) => node.id);

function unmoved(before: CanvasState, after: CanvasState, ids: string[]) {
  for (const id of ids) expect(at(after, id)).toEqual(at(before, id));
}

beforeEach(() => vi.clearAllMocks());

describe("S4 explore in the middle of the chart (Force, Atomic)", () => {
  it.each(["force", "atomic"] as const)("%s moves the target out", (name) => {
    const run = world(loadFixture("s-access").input, name);
    const nodes = run.view(run.state).nodes;
    const spots = nodes.map((n) => at(run.state, n.id));
    const cx = spots.reduce((s, p) => s + p.x, 0) / spots.length;
    const cy = spots.reduce((s, p) => s + p.y, 0) / spots.length;
    const far = (p: Point) => Math.hypot(p.x - cx, p.y - cy);
    const middle = nodes
      .filter((n) => "entity" in n && n.more > 0)
      .sort((a, b) => far(at(run.state, a.id)) - far(at(run.state, b.id)))[0];
    const out = run.act(run.state, { kind: "explore", id: middle.id.slice(2) });
    const from = at(run.state, middle.id);
    const to = at(out.state, middle.id);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeLessThanOrEqual(3000);
    expect(far(to)).toBeGreaterThanOrEqual(far(from) - 1e-9);
    expect(out.state.homes).toEqual([[middle.id, from.x, from.y, to.x, to.y]]);
    for (const [id] of out.starts) {
      const r = Math.hypot(
        at(out.state, id).x - to.x,
        at(out.state, id).y - to.y,
      );
      expect(
        Math.abs((r - 110) / 64 - Math.round((r - 110) / 64)),
      ).toBeLessThan(1e-9);
    }
    const others = nodes.filter((n) => n.id !== middle.id);
    const calm = others.filter((n) => {
      const a = at(run.state, n.id);
      const b = at(out.state, n.id);
      return Math.hypot(a.x - b.x, a.y - b.y) <= 20;
    });
    console.log(
      `S4 ${name}: ${calm.length} of ${others.length} other nodes moved ≤ 20 px`,
    );
    expect(calm.length).toBe(others.length);
  });
});

describe("S5 origins of an explore and of its collapse (Force)", () => {
  it("starts every newcomer on t_FCT_REVENUE and retracts them to it", () => {
    const run = world(loadFixture("s-access").input, "force");
    const out = run.act(run.state, { kind: "explore", id: "t_FCT_REVENUE" });
    const root = at(run.state, "e:t_FCT_REVENUE");
    expect(out.starts.length).toBeGreaterThan(0);
    for (const [, p] of out.starts) expect(p).toEqual(root);
    const target = at(out.state, "e:t_FCT_REVENUE");
    const back = run.act(out.state, { kind: "collapse", id: "t_FCT_REVENUE" });
    const removed = drawnIds(run, out.state).filter(
      (id) => !drawnIds(run, back.state).includes(id),
    );
    expect(back.retractTo).toEqual(removed.map((id) => [id, target]));
  });
});

describe("S8 the group of 300 in s-star", () => {
  it.each(LAYOUTS)(
    "%s expands from the group spot and collapses back",
    (name) => {
      const run = world(loadFixture("s-star").input, name);
      const group = run
        .view(run.state)
        .nodes.find((n) => "count" in n && n.count === 300);
      if (group === undefined) throw new Error("no group of 300");
      const spot = at(run.state, group.id);
      const open = run.act(run.state, { kind: "expandGroup", group: group.id });
      expect(open.starts).toHaveLength(300);
      for (const [, p] of open.starts) expect(p).toEqual(spot);
      for (const [id, p] of run.state.positions) {
        if (id === group.id) continue;
        const q = at(open.state, id);
        expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThanOrEqual(
          100 + 1e-9,
        );
      }
      expect(open.state.homes).toEqual([
        [group.id, spot.x, spot.y, spot.x, spot.y],
      ]);
      const shut = run.act(open.state, {
        kind: "collapseGroup",
        group: group.id,
      });
      expect(shut.state.positions).toEqual(run.state.positions);
      expect(shut.retractTo).toHaveLength(300);
      for (const [, p] of shut.retractTo) expect(p).toEqual(spot);
      expect(shut.state.homes.some(([id]) => id === group.id)).toBe(false);
    },
    SLOW,
  );
});

describe("S13 path to the canvas over 4 hops (s-chain, budget 10)", () => {
  it.each(LAYOUTS)(
    "%s starts t10…t13 on t9 and moves no drawn node",
    (name) => {
      const input = loadFixture("s-chain").input as object;
      const run = world({ ...input, view: { budget: 10 } }, name);
      const before = drawnIds(run, run.state);
      expect(before.includes("e:t9") && !before.includes("e:t10")).toBe(true);
      const out = run.act(run.state, { kind: "path", id: "t13" });
      expect(out.starts.map(([id]) => id)).toEqual([
        "e:t10",
        "e:t11",
        "e:t12",
        "e:t13",
      ]);
      for (const [, p] of out.starts) expect(p).toEqual(at(run.state, "e:t9"));
      unmoved(run.state, out.state, before);
    },
  );
});

// why: memo item — every catalog entity is within 4 hops of the first view, so this test draws a
// smaller view; the 4 ids then hold every case of the Given
const SMALL = {
  ...datasets.catalog.graph,
  view: {
    root: "t_SF_ACCOUNT",
    reveal: ["sc_SALESFORCE", "c_SF_ACCOUNT.ID", "c_SF_ACCOUNT.NAME"],
  },
};

function hops(run: ReturnType<typeof world>, from: string[]) {
  const dist = new Map(from.map((id) => [id, 0]));
  let ring = from;
  for (let k = 1; ring.length > 0; k++) {
    const next: string[] = [];
    for (const t of run.graph.triples)
      for (const [a, b] of [
        [t.subject, t.object],
        [t.object, t.subject],
      ])
        if (ring.includes(a) && !dist.has(b)) {
          dist.set(b, k);
          next.push(b);
        }
    ring = next;
  }
  return dist;
}

describe("S14 bulk Show of hidden, near and far entities (catalog)", () => {
  it.each(LAYOUTS)(
    "%s starts each on its origin and moves no drawn node",
    (name) => {
      const run = world(SMALL, name);
      const hidden = ["c_SF_ACCOUNT.ID", "c_SF_ACCOUNT.NAME"];
      const hid = run.act(run.state, { kind: "hideMany", ids: hidden }).state;
      const dist = hops(run, hid.revealed ?? []);
      const ids = run.graph.entities.map((e) => e.id);
      const near = ids.find((id) => dist.get(id) === 2) as string;
      const far = ids.find((id) => (dist.get(id) ?? Infinity) > 4) as string;
      const out = run.act(hid, {
        kind: "showMany",
        ids: [...hidden, far, near],
      });
      const drawn = drawnIds(run, hid);
      unmoved(hid, out.state, drawn);
      const starts = new Map(out.starts);
      const pairs = new Map(out.state.origins);
      const holder = (id: string) =>
        run
          .view(out.state)
          .nodes.find((n) =>
            ("members" in n ? n.members : [n.entity]).includes(id),
          )?.id as string;
      for (const id of hidden)
        expect(starts.get(holder(id))).toEqual(at(hid, `e:${pairs.get(id)}`));
      const via = pairs.get(pairs.get(near) as string) as string;
      expect(drawn).toContain(`e:${via}`);
      expect(starts.get(`e:${near}`)).toEqual(at(hid, `e:${via}`));
      const i = drawn.length;
      const r = 14 * Math.sqrt(i + 1);
      expect(starts.get(`e:${far}`)).toEqual({
        x: r * Math.cos(i * 2.39996),
        y: r * Math.sin(i * 2.39996),
      });
    },
  );
});

describe("S15 no action runs a STORY-002-05 layout", () => {
  it.each(LAYOUTS)(
    "%s gives 0 layout calls for each action",
    (name) => {
      const run = world(loadFixture("s-access").input, name);
      const star = world(loadFixture("s-star").input, name);
      const group = star.view(star.state).nodes.find((n) => "count" in n) as {
        id: string;
      };
      vi.clearAllMocks();
      const a = run.act(run.state, {
        kind: "explore",
        id: "ug_fin_admin",
      }).state;
      const b = run.act(a, { kind: "collapse", id: "ug_fin_admin" }).state;
      const c = run.act(b, { kind: "hide", node: "e:u_7" }).state;
      const d = run.act(c, { kind: "restore", keys: ["e:u_7"] }).state;
      const e = run.act(d, {
        kind: "toggleType",
        type: "user",
        on: false,
      }).state;
      const f = run.act(e, { kind: "showAllTypes" }).state;
      const g = run.act(f, { kind: "grouping", grouping: "off" }).state;
      const h = run.act(g, { kind: "hideMany", ids: ["u_0"] }).state;
      run.act(h, { kind: "showMany", ids: ["u_0", "t_FCT_PIPELINE"] });
      run.act(b, { kind: "path", id: "t_FCT_PIPELINE" });
      const open = star.act(star.state, {
        kind: "expandGroup",
        group: group.id,
      }).state;
      star.act(open, { kind: "collapseGroup", group: group.id });
      expect(spyCalls()).toBe(0);
      setLayout(b, run.view(b), run.vocab, name, METRICS);
      expect(spyCalls()).toBeGreaterThan(1);
    },
    SLOW,
  );
});

describe("S16 explore, collapse, explore again (Force)", () => {
  it("forgets the removed ids and gives the same positions again", () => {
    const run = world(loadFixture("s-access").input, "force");
    const one = run.act(run.state, { kind: "explore", id: "ug_fin_admin" });
    const back = run.act(one.state, { kind: "collapse", id: "ug_fin_admin" });
    const removed = drawnIds(run, one.state).filter(
      (id) => !drawnIds(run, back.state).includes(id),
    );
    expect(removed.length).toBeGreaterThan(0);
    const kept = new Map(back.state.positions);
    for (const id of removed) expect(kept.has(id)).toBe(false);
    const two = run.act(back.state, { kind: "explore", id: "ug_fin_admin" });
    expect(two.state.positions).toEqual(one.state.positions);
  });
});

const SEQUENCE: Action[] = [
  { kind: "explore", id: "ug_fin_admin" },
  { kind: "explore", id: "t_FCT_PIPELINE" },
  { kind: "explore", id: "ug_analytics" },
  { kind: "collapse", id: "t_FCT_PIPELINE" },
  { kind: "explore", id: "u_0" },
  { kind: "explore", id: "ug_exec" },
  { kind: "collapse", id: "ug_analytics" },
  { kind: "explore", id: "u_12" },
  { kind: "collapse", id: "ug_fin_admin" },
];

describe("S17 the same 6 expands and 3 collapses twice (NF-3)", () => {
  it.each(LAYOUTS)("%s gives equal positions", (name) => {
    const play = () => {
      const run = world(loadFixture("s-access").input, name);
      return SEQUENCE.reduce(
        (s, action) => run.act(s, action).state,
        run.state,
      );
    };
    const one = play();
    expect(one.positions.length).toBeGreaterThan(7);
    expect(play()).toStrictEqual(one);
  });
});
