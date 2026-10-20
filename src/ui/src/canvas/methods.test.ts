// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
import type { DrawMotion, Motion, Renderer } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent, CanvasModel } from "./index";

// why: pass-through spies; `draws` records each motion, `fits` the fit calls
const spy = vi.hoisted(() => ({
  draws: [] as (DrawMotion | undefined)[],
  fits: 0,
}));
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        draw: (scene, motion) => {
          spy.draws.push(motion);
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
let size = 800;
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: size, height: size }) as DOMRect;

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
  bubbleCount: (n: number) => ` · ${n}`,
};

function modelOf(key: string): CanvasModel {
  const r = engine.normalize(loadFixture(key).input, { now: "2026-10-19" });
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
async function open(key: string) {
  const model = modelOf(key);
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
  const settle = () => log.settle[log.settle.length - 1];
  const run = (call: (c: Canvas) => void) => {
    call(canvas);
    vi.advanceTimersByTime(3000);
    return settle().state;
  };
  const count = () => div.querySelectorAll("g.qt-node").length;
  const clear = () => {
    for (const list of Object.values(log)) list.length = 0;
  };
  return { model, div, canvas, log, settle, run, count, clear };
}
const lastMotion = () => spy.draws[spy.draws.length - 1] as Motion;

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.draws = [];
  spy.fits = 0;
  size = 800;
  document.body.replaceChildren();
});

// why: S20 — wrong types on purpose
const bad = <T>(value: unknown) => value as T;
const CASES: [string, (c: Canvas) => void][] = [
  ["expand __proto__", (c) => c.expand("e:__proto__")],
  ["expand quote", (c) => c.expand('e:a"]<x')],
  ["expand g:nope", (c) => c.expand("g:nope")],
  ["expand no prefix", (c) => c.expand("u_0")],
  ["collapse constructor", (c) => c.collapse("e:constructor")],
  ["select __proto__", (c) => c.select("e:__proto__")],
  ["select edge not drawn", (c) => c.select('["e:x","p","e:y"]')],
  ["hide []", (c) => c.hide([])],
  ["restore []", (c) => c.restore([])],
  ["restore e:nope", (c) => c.restore(["e:nope"])],
  ["reveal []", (c) => c.reveal([])],
  ["reveal __proto__", (c) => c.reveal(["__proto__"])],
  ["focus __proto__", (c) => c.focus("__proto__")],
  ...[7, 0, -1, 1.5, NaN, "x"].map((n): [string, (c: Canvas) => void] => [
    `setBudget ${n}`,
    (c) => c.setBudget(bad(n)),
  ]),
  ["grouping 3", (c) => c.setFilters(bad({ kind: "grouping", grouping: 3 }))],
  [
    "toggleType __proto__",
    (c) => c.setFilters({ kind: "toggleType", type: "__proto__", on: false }),
  ],
  ["setLayout grid", (c) => c.setLayout(bad("grid"))],
  ["setApproach x", (c) => c.setApproach(bad("x"))],
  ["hide a string", (c) => c.hide(bad("e:u_0"))],
  ["select 1", (c) => c.select(bad(1))],
  ["setFilters null", (c) => c.setFilters(bad(null))],
];

describe("S20 arguments that the rule (b) refuses", () => {
  it("give no change, no event and no throw", async () => {
    const o = await open("s-access");
    const boot = o.settle();
    const html = o.div.innerHTML;
    o.clear();
    for (const [name, call] of CASES) {
      expect(() => call(o.canvas), name).not.toThrow();
      vi.advanceTimersByTime(1000);
      expect(Object.values(o.log).flat(), name).toEqual([]);
      expect(o.div.innerHTML, name).toBe(html);
    }
    o.canvas.setData(boot.frontier);
    expect(o.settle().state).toEqual(boot.state);
  });
});

describe("S21 method branches", () => {
  it("(a) focus of a grouped node expands its group", async () => {
    const o = await open("s-star");
    o.canvas.focus("t_5");
    expect(lastMotion().kind).toBe("local");
    vi.advanceTimersByTime(3000);
    expect(o.count()).toBe(303);
    expect(o.settle().state.selection).toEqual({ node: "e:t_5" });
  });

  it("(b) focus of a hidden node draws it again; (g) onCanvas", async () => {
    const o = await open("s-access");
    o.run((c) => c.hide(["e:u_0"]));
    expect(o.canvas.onCanvas("u_0")).toBe("hidden");
    const state = o.run((c) => c.focus("u_0"));
    expect(lastMotion().starts).toHaveLength(1);
    expect(state.hidden).toEqual([]);
    expect(o.canvas.onCanvas("u_0")).toBe("drawn");
    expect(o.canvas.onCanvas("__proto__")).toBe("not-drawn");
  });

  it("(c) focus of a node of a type that is off: no change; (g)", async () => {
    const o = await open("s-access");
    o.run((c) => c.setFilters({ kind: "toggleType", type: "user", on: false }));
    expect(o.canvas.onCanvas("u_0")).toBe("not-drawn");
    const draws = spy.draws.length;
    o.clear();
    o.canvas.focus("u_0");
    expect(spy.draws).toHaveLength(draws);
    expect(Object.values(o.log).flat()).toEqual([]);
  });

  it("(d) an edge pick with no node selected takes the subject; (e) select(null)", async () => {
    const o = await open("s-access");
    o.clear();
    o.run((c) => c.select(null));
    expect(o.log.select.map((e) => e.selection)).toEqual([null]);
    const edge = '["e:u_0","memberOf","e:ug_fin_admin"]';
    const state = o.run((c) => c.select(edge));
    expect(state.selection).toEqual({ edge, anchor: "e:u_0" });
    o.run((c) => c.select("e:ug_fin_admin"));
    const pick = o.run((c) => c.select(edge));
    expect(pick.selection).toEqual({ edge, anchor: "e:ug_fin_admin" });
  });

  it("(f) setLayout of the same name and of another: motion layout and one fit", async () => {
    const o = await open("s-access");
    const { graph, vocab } = o.model;
    for (const name of ["force", "atomic"] as const) {
      const before = o.settle().state;
      const fits = spy.fits;
      const state = o.run((c) => c.setLayout(name));
      expect(lastMotion().kind).toBe("layout");
      const want = engine.setLayout(
        before,
        engine.frontier(before, graph, vocab),
        vocab,
        name,
        iconMetrics,
      );
      expect(state.positions).toEqual(want.positions);
      expect(spy.fits).toBe(fits + 1);
    }
  });

  it("(h) a 0 × 0 container gives one zero-size notice", async () => {
    size = 0;
    const o = await open("s-access");
    expect(o.log.notice).toEqual([{ kind: "zero-size" }]);
  });

  it("(i) a hide of the selected root gives one select event with null", async () => {
    const o = await open("s-access");
    o.clear();
    o.run((c) => c.hide(["e:t_FCT_REVENUE"]));
    expect(o.log.select.map((e) => e.selection)).toEqual([null]);
  });

  it("(j) a bulk hide keeps one node; then the last one is refused", async () => {
    const o = await open("s-access");
    const ids = o.settle().frontier.nodes.map((n) => n.id);
    expect(ids[0]).toBe("e:t_FCT_REVENUE");
    o.clear();
    o.run((c) => c.hide(ids));
    expect(o.count()).toBe(1);
    const off = ids.slice(1).map((id) => o.canvas.onCanvas(id.slice(2)));
    expect(off).toEqual(Array(6).fill("hidden"));
    expect(o.log.notice).toEqual([]);
    const state = o.settle().state;
    const draws = spy.draws.length;
    o.canvas.hide(["e:t_FCT_REVENUE"]);
    expect(o.log.notice).toEqual([{ kind: "last-drawn" }]);
    expect(spy.draws).toHaveLength(draws);
    o.canvas.setData(o.settle().frontier);
    expect(o.settle().state).toEqual(state);
  });
});

describe("S22 Center here (FR-INSPECT-1)", () => {
  it("setLayout('atomic') in Atomic with a selection equals the engine recenter", async () => {
    const o = await open("s-access");
    o.run((c) => c.setLayout("atomic"));
    const before = o.run((c) => c.select("e:u_0"));
    const fits = spy.fits;
    const state = o.run((c) => c.setLayout("atomic"));
    const { graph, vocab } = o.model;
    const view = engine.frontier(before, graph, vocab);
    const want = engine.recenter(
      before,
      view,
      graph,
      vocab,
      iconMetrics,
      "u_0",
    );
    expect(state.positions).toEqual(want.positions);
    expect(state.positions).not.toEqual(before.positions);
    expect(lastMotion().kind).toBe("layout");
    expect(spy.fits).toBe(fits + 1);
  });
});

describe("S23 setApproach (gap G1, FR-CANVAS-13)", () => {
  it("s-access: Passive, Reset, Active", async () => {
    const o = await open("s-access");
    const first = o.settle();
    const passive = o.run((c) => c.setApproach("passive"));
    expect([passive.approach, passive.selection]).toEqual(["passive", null]);
    expect(passive.positions).toEqual(first.state.positions);
    expect(o.settle().camera).toEqual(first.camera);
    expect(lastMotion()).toMatchObject({ kind: "none", anchor: null });
    expect(o.run((c) => c.resetView()).selection).toBeNull();
    const active = o.run((c) => c.setApproach("active"));
    expect(active.selection).toEqual({ node: "e:t_FCT_REVENUE" });
  });

  it("s-chain: Active selects the most connected drawn node", async () => {
    const o = await open("s-chain");
    expect(o.run((c) => c.setApproach("active")).selection).toEqual({
      node: "e:t1",
    });
  });
});
