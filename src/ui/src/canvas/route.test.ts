// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Action, CanvasState, Hex, Point } from "@qdic-topology/engine";
import type {
  DrawMotion,
  Motion,
  Renderer,
  Scene,
} from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through spies; `draws` records each scene and motion, `fits` the fit calls and `places`
// the actions of the engine `place`
const spy = vi.hoisted(() => ({
  draws: [] as { scene: Scene; motion: DrawMotion | undefined }[],
  fits: 0,
  places: [] as string[],
}));
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  return {
    ...mod,
    place: (...args: Parameters<typeof mod.place>) => {
      spy.places.push(args[1].action.kind);
      return mod.place(...args);
    },
  };
});
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        draw: (scene, motion) => {
          spy.draws.push({ scene, motion });
          r.draw(scene, motion);
        },
        fit: (options) => {
          spy.fits++;
          r.fit(options);
        },
      } satisfies Renderer;
    },
  };
});

// why: STORY-003-04 "Fake clock", build-time item B11 — the clock comes before `d3-timer` loads
vi.useFakeTimers({
  toFake: [
    "performance",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "Date",
  ],
});
vi.resetModules();
const engine = await import("@qdic-topology/engine");
const { profile } = await import("@qdic-topology/contract");
const { loadFixture } = await import("@qdic-topology/fixtures");
const { iconMetrics } = await import("@qdic-topology/renderer");
const { createCanvas } = await import("./index");

// why: jsdom has no ResizeObserver and gives each element 0 × 0
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const LIGHT = engine.canvasColor("#F4F4F5") as Hex;
const TEXT = {
  groupLabel: (typeLabel: string, count: number) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  tipGroup: (count: number, typeLabel: string) => `${count} × ${typeLabel}`,
  tipOpened: (sub: string) => sub,
  tipMore: (sub: string) => sub,
  tipMember: (sub: string) => sub,
  tipEdge: (subject: string, object: string) => `${subject} → ${object}`,
  tipEdgeAction: (label: string) => label,
};

function modelOf(input: unknown): CanvasModel {
  const r = engine.normalize(input, { now: "2026-10-19" });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, LIGHT);
  return {
    graph: r.graph,
    payload: r.payload,
    hash: r.hash,
    vocab,
    canvas: LIGHT,
  };
}

type Log = { [K in keyof CanvasEvent]: CanvasEvent[K][] };
async function open(input: unknown) {
  const model = modelOf(input);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model });
  const log: Log = {
    select: [],
    explore: [],
    "drag-end": [],
    settle: [],
    notice: [],
  };
  for (const name of Object.keys(log) as (keyof CanvasEvent)[])
    canvas.on(name, (e) => (log[name] as unknown[]).push(e));
  await Promise.resolve();
  const state = () => log.settle[log.settle.length - 1].state;
  const settled = (call: () => void) => {
    call();
    vi.advanceTimersByTime(3000);
    return state();
  };
  return { model, div, canvas, log, state, settled };
}

const datum = (el: Element) =>
  (el as unknown as { __data__: { id: string } }).__data__.id;
function spots(div: HTMLElement): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const g of div.querySelectorAll("g.qt-node")) {
    const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
      g.getAttribute("transform") ?? "",
    );
    out.set(datum(g), { x: Number(m?.[1]), y: Number(m?.[2]) });
  }
  return out;
}
function camera(div: HTMLElement) {
  const t = div.querySelector("g.qt-viewport")?.getAttribute("transform") ?? "";
  const m = /^translate\(([^,]+),([^)]+)\) scale\(([^)]+)\)$/.exec(t);
  return { x: Number(m?.[1]), y: Number(m?.[2]), k: Number(m?.[3]) };
}
const lastMotion = () => spy.draws[spy.draws.length - 1].motion as Motion;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// why: the engine result of one routed action (rule (3)), for the comparisons
function placed(model: CanvasModel, state: CanvasState, action: Action) {
  const { graph, vocab } = model;
  const next = engine.transition(state, action, graph, vocab);
  const before = engine.frontier(state, graph, vocab);
  const after = engine.frontier(next, graph, vocab);
  return engine.place(next, { action, before, after }, vocab, iconMetrics);
}

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.draws = [];
  spy.fits = 0;
  spy.places = [];
  document.body.replaceChildren();
});

const ROOT = { x: -48.590028148380426, y: -38.70905611789809 };
const ACCESS = () => loadFixture("s-access").input;

describe("S3, S4 explore and collapse of e:t_FCT_REVENUE", () => {
  it("S3: the engine result, the newcomer starts, the timing and the anchor", async () => {
    const o = await open(ACCESS());
    const first = o.state();
    const before = spots(o.div);
    const want = placed(o.model, first, {
      kind: "explore",
      id: "t_FCT_REVENUE",
    });
    const t0 = camera(o.div);
    const s = { x: t0.x + t0.k * ROOT.x, y: t0.y + t0.k * ROOT.y };
    o.canvas.expand("e:t_FCT_REVENUE");
    expect(o.log.explore).toHaveLength(1);
    const now = spots(o.div);
    expect(now.size).toBe(16);
    const fresh = [...now.keys()].filter((id) => !before.has(id));
    expect(fresh).toHaveLength(9);
    for (const id of fresh) expect(now.get(id)).toEqual(ROOT);
    const end = new Map(want.state.positions);
    const trips = [...now.keys()].map((id) =>
      dist(now.get(id) as Point, end.get(id) as Point),
    );
    expect(Math.round(Math.max(...trips))).toBe(374);
    expect(dist(ROOT, end.get("e:t_FCT_REVENUE") as Point)).toBeCloseTo(200, 6);
    for (let ms = 0; ms < 736; ms += 16) {
      const c = camera(o.div);
      const a = spots(o.div).get("e:t_FCT_REVENUE") as Point;
      expect(Math.abs(c.x + c.k * a.x - s.x)).toBeLessThan(1e-9);
      expect(Math.abs(c.y + c.k * a.y - s.y)).toBeLessThan(1e-9);
      expect(c.k).toBeLessThanOrEqual(t0.k);
      vi.advanceTimersByTime(16);
    }
    expect(o.log.settle).toHaveLength(1);
    vi.advanceTimersByTime(24);
    expect(o.log.settle).toHaveLength(2);
    expect(o.state()).toEqual(want.state);
  });

  it("S4: collapse returns every node home with the same drawn set", async () => {
    const o = await open(ACCESS());
    const home = spots(o.div);
    o.settled(() => o.canvas.expand("e:t_FCT_REVENUE"));
    const settles = o.log.settle.length;
    o.canvas.collapse("e:t_FCT_REVENUE");
    const m = lastMotion();
    expect(m.kind).toBe("collapse");
    expect(m.retractTo).toHaveLength(9);
    const spot = { x: -166.43279251041227, y: -200.30448577949042 };
    for (const [, p] of m.retractTo) expect(p).toEqual(spot);
    vi.advanceTimersByTime(288);
    for (const [id] of m.retractTo) expect(spots(o.div).has(id)).toBe(false);
    vi.advanceTimersByTime(560);
    expect(o.log.settle).toHaveLength(settles);
    vi.advanceTimersByTime(16);
    expect(o.log.settle).toHaveLength(settles + 1);
    expect(spots(o.div)).toEqual(home);
    const kept = o.state().positions.filter(([id]) => home.has(id));
    expect(new Map(kept)).toEqual(home);
  });
});

describe("S7 focus of a node that is not drawn", () => {
  it("draws the path from the t9 spot and selects e:t13", async () => {
    const chain = loadFixture("s-chain").input as { view?: object };
    const o = await open({ ...chain, view: { ...chain.view, budget: 10 } });
    const t9 = spots(o.div).get("e:t9") as Point;
    o.canvas.focus("t13");
    expect(spy.places).toEqual(["path"]);
    const m = lastMotion();
    expect([m.kind, m.anchor]).toEqual(["local", null]);
    expect(m.starts.map(([id]) => id).sort()).toEqual([
      "e:t10",
      "e:t11",
      "e:t12",
      "e:t13",
    ]);
    for (const [, p] of m.starts) expect(p).toEqual(t9);
    vi.advanceTimersByTime(3000);
    expect(o.state().selection).toEqual({ node: "e:t13" });
    expect(spy.fits).toBe(0);
  });
});

describe("S8 family filters and an edge pick move nothing (SA §6 row 3)", () => {
  it("no place, no move, one select for the edge", async () => {
    const o = await open(ACCESS());
    const home = spots(o.div);
    const family = "Ownership & Access";
    o.canvas.setFilters({ kind: "toggleFamily", family, on: false });
    o.canvas.setFilters({ kind: "toggleFamily", family, on: true });
    const edge = '["e:t_FCT_REVENUE","ownedBy","e:u_0"]';
    o.canvas.select(edge);
    vi.advanceTimersByTime(1000);
    expect(spy.places).toEqual([]);
    expect(spots(o.div)).toEqual(home);
    expect(o.log.select.map((e) => e.selection)).toEqual([
      { node: "e:t_FCT_REVENUE" },
      { edge, anchor: "e:t_FCT_REVENUE" },
    ]);
    expect(o.log.explore).toEqual([]);
  });
});

describe("S9 budget and Reset run the layout again (rule (2))", () => {
  it("setBudget(10), then resetView()", async () => {
    const o = await open(ACCESS());
    o.settled(() => o.canvas.expand("e:t_FCT_REVENUE"));
    o.settled(() => o.canvas.expand("e:ug_analytics"));
    const hidden = o.settled(() => o.canvas.hide(["e:u_0"]));
    expect(spots(o.div).size).toBe(21);
    expect(hidden.hidden).toHaveLength(1);
    const { graph, vocab } = o.model;
    const lay = (s: CanvasState, a: Action) => {
      const next = engine.transition(s, a, graph, vocab);
      const f = engine.frontier(next, graph, vocab);
      return engine.setLayout(next, f, vocab, next.layout, iconMetrics);
    };
    const was = new Set(spots(o.div).keys());
    o.canvas.setBudget(10);
    const now = spots(o.div);
    expect(now.size).toBe(10);
    expect([...was].filter((id) => !now.has(id))).toHaveLength(11);
    expect([...now.keys()].filter((id) => !was.has(id))).toHaveLength(0);
    vi.advanceTimersByTime(448);
    expect(spy.fits).toBe(0);
    vi.advanceTimersByTime(16);
    expect(spy.fits).toBe(1);
    vi.advanceTimersByTime(1000);
    const budget = o.state();
    expect(budget).toEqual(lay(hidden, { kind: "budget", budget: 10 }));
    expect(budget.hidden).toEqual([]);
    expect(budget.selection).toEqual({ node: "e:t_FCT_REVENUE" });
    const reset = o.settled(() => o.canvas.resetView());
    expect(spots(o.div).size).toBe(7);
    expect(reset).toEqual(lay(budget, { kind: "reset" }));
    expect([reset.budget, reset.selection]).toEqual([
      10,
      { node: "e:t_FCT_REVENUE" },
    ]);
    expect(spy.fits).toBe(2);
  });
});

describe("S10 restore and reveal (SA §6 row 8)", () => {
  it("restored nodes grow out of the root; reveal draws along the path", async () => {
    const o = await open(ACCESS());
    o.settled(() => o.canvas.hide(["e:u_0"]));
    const five = o.settled(() => o.canvas.hide(["e:u_7"]));
    const drawn = spots(o.div);
    expect(drawn.size).toBe(5);
    o.canvas.restore(["e:u_0", "e:u_7"]);
    const m = lastMotion();
    expect(new Map(m.starts)).toEqual(
      new Map([
        ["e:u_0", ROOT],
        ["e:u_7", ROOT],
      ]),
    );
    vi.advanceTimersByTime(3000);
    const after = spots(o.div);
    expect(after.size).toBe(7);
    for (const [id, p] of drawn) expect(after.get(id)).toEqual(p);
    const root = o.log.settle[o.log.settle.length - 1].frontier.nodes.find(
      (n) => n.id === "e:t_FCT_REVENUE",
    );
    expect(root?.opened).toBe(2);
    expect(o.state()).toEqual(
      placed(o.model, five, { kind: "restore", keys: ["e:u_0", "e:u_7"] })
        .state,
    );
    const seven = o.state();
    o.canvas.reveal(["ds_snow"]);
    const r = lastMotion();
    expect(new Map(r.starts)).toEqual(
      new Map([
        ["e:ds_snow", ROOT],
        ["e:ag_finance", ROOT],
      ]),
    );
    vi.advanceTimersByTime(3000);
    expect(spots(o.div).size).toBe(9);
    expect(o.state()).toEqual(
      placed(o.model, seven, { kind: "showMany", ids: ["ds_snow"] }).state,
    );
  });
});
