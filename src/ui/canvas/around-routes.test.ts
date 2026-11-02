// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState, Hex, Point } from "#engine";
import type { Camera, Motion, Renderer, Scene } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent, CanvasModel } from "./index";

// why: build-time item (f) — Vitest cannot spy on a module namespace, so the engine entry is
// mocked with pass-through functions that record the name of each call that can change the state
const NAMES = [
  "transition",
  "place",
  "expandAround",
  "collapseAround",
  "groupAround",
  "setLayout",
  "hide",
  "exitAround",
] as const;
type Draw = { scene: Scene; motion: Motion; dom: Map<string, Point> };
const spy = vi.hoisted(() => ({
  calls: [] as string[],
  draws: [] as Draw[],
  fits: 0,
  spots(div: Element): Map<string, Point> {
    const out = new Map<string, Point>();
    for (const g of div.querySelectorAll("g.qt-node")) {
      const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
        g.getAttribute("transform") ?? "",
      );
      const id = (g as unknown as { __data__: { id: string } }).__data__.id;
      out.set(id, { x: Number(m?.[1]), y: Number(m?.[2]) });
    }
    return out;
  },
}));
vi.mock("#engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#engine")>();
  const out: Record<string, unknown> = { ...mod };
  for (const name of NAMES) {
    const fn = mod[name] as (...args: unknown[]) => unknown;
    out[name] = (...args: unknown[]) => (spy.calls.push(name), fn(...args));
  }
  return out;
});
vi.mock("#renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        draw: (scene, motion) => {
          spy.draws.push({
            scene,
            motion: motion as Motion,
            dom: spy.spots(args[0]),
          });
          r.draw(scene, motion);
        },
        fit: (options) => (spy.fits++, r.fit(options)),
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
const engine = await import("#engine");
const { profile } = await import("#contract");
const { loadFixture } = await import("#fixtures");
const { iconMetrics } = await import("#renderer");
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
  bubbleCount: (n: number) => ` · ${n}`,
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
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
const T = 3000;
async function open(key: string, div = document.createElement("div")) {
  const model = modelOf(key);
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
  vi.advanceTimersByTime(T);
  const state = () => log.settle[log.settle.length - 1].state;
  const cam = (): Camera => log.settle[log.settle.length - 1].camera;
  const view = (s: CanvasState) => engine.frontier(s, model.graph, model.vocab);
  return { model, div, canvas, log, state, cam, view };
}
type Open = Awaited<ReturnType<typeof open>>;

// why: "group around X" through the interface is `select(X)` then `groupAroundRoot(true)` (QA (b))
function group(o: Open, root: string): CanvasState {
  o.canvas.select(root);
  vi.advanceTimersByTime(T);
  const before = o.state();
  o.canvas.groupAroundRoot(true);
  vi.advanceTimersByTime(T);
  expect(o.state().around?.root).toBe(root);
  return before;
}

const exitOf = (o: Open, action: Parameters<typeof engine.exitAround>[1]) =>
  engine.exitAround(
    o.state(),
    action,
    o.view(o.state()),
    o.model.graph,
    o.model.vocab,
    iconMetrics,
  );

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.calls = [];
  spy.draws = [];
  spy.fits = 0;
  document.body.replaceChildren();
});

const ROOT = "e:t_FCT_REVENUE";

describe("S7 exit 11 and new data end in place", () => {
  it("setLayout(atomic): one step, no glide home, around null, one fit at the end", async () => {
    const o = await open("s-access");
    group(o, ROOT);
    const want = exitOf(o, { kind: "layout", name: "atomic" });
    spy.draws = [];
    spy.fits = 0;
    o.canvas.setLayout("atomic");
    vi.advanceTimersByTime(T);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual(["layout"]);
    expect(o.state()).toEqual(want.state);
    expect(o.state().around).toBeNull();
    expect(spy.fits).toBe(1);
  });

  it("new data: a new canvas on the same container takes the s-lineage first view; the old one is ended", async () => {
    const o = await open("s-access");
    group(o, ROOT);
    const old = o.canvas;
    const n = await open("s-lineage", o.div);
    const m = n.model;
    const first = engine.firstView(m.graph, m.vocab, m.payload, m.hash);
    const want = engine.setLayout(
      first,
      n.view(first),
      m.vocab,
      first.layout,
      iconMetrics,
    );
    expect(n.state()).toEqual(want);
    expect(spy.draws.at(-1)?.motion.kind).toBe("none");
    const html = o.div.innerHTML;
    const events = Object.values(o.log).flat().length;
    old.groupAroundRoot(false);
    old.select(null);
    vi.advanceTimersByTime(T);
    expect([o.div.innerHTML, Object.values(o.log).flat().length]).toEqual([
      html,
      events,
    ]);
  });
});

describe("S8, S9 explore and collapse of a shown neighbour while grouped", () => {
  it("expandAround, then collapseAround; the newcomers are not faded; off gives the positions before", async () => {
    const o = await open("s-access");
    const before = group(o, ROOT);
    spy.calls = [];
    o.canvas.expand("e:u_0");
    vi.advanceTimersByTime(T);
    expect(spy.calls).toEqual(["exitAround", "transition", "expandAround"]);
    const born = ["e:t_FCT_PIPELINE", "e:t_FCT_CHURN", "e:ug_de", "e:ug_mkt"];
    const scene = spy.draws.at(-1)?.scene as Scene;
    for (const id of born)
      expect(scene.nodes.find((n) => n.id === id)?.faded).toBe(false);
    expect(o.state().around?.root).toBe(ROOT);
    spy.calls = [];
    o.canvas.collapse("e:u_0");
    vi.advanceTimersByTime(T);
    expect(spy.calls).toEqual(["exitAround", "transition", "collapseAround"]);
    expect(o.view(o.state()).nodes.some((n) => n.id === ROOT)).toBe(true);
    o.canvas.groupAroundRoot(false);
    vi.advanceTimersByTime(T);
    const homes = new Map(before.positions);
    for (const [id, p] of spy.spots(o.div)) expect(p).toEqual(homes.get(id));
    expect(o.view(o.state()).nodes.map((n) => n.id)).toEqual(
      o.view(before).nodes.map((n) => n.id),
    );
  });

  it("S8 then off returns each node drawn before the grouping to its spot", async () => {
    const o = await open("s-access");
    const before = group(o, ROOT);
    o.canvas.expand("e:u_0");
    vi.advanceTimersByTime(T);
    o.canvas.groupAroundRoot(false);
    vi.advanceTimersByTime(T);
    const homes = new Map(before.positions);
    const dom = spy.spots(o.div);
    for (const n of o.view(before).nodes)
      expect(dom.get(n.id)).toEqual(homes.get(n.id));
  });
});

describe("S10 focus of an entity that is not drawn, while grouped", () => {
  it("the path with faded newcomers, the glide home, then the select of e:ds_snow", async () => {
    const o = await open("s-access");
    group(o, ROOT);
    spy.draws = [];
    o.canvas.focus("ds_snow");
    vi.advanceTimersByTime(T);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual([
      "local",
      "local",
      "none",
    ]);
    const faded = spy.draws[0].scene.nodes
      .filter((n) => n.faded)
      .map((n) => n.id);
    expect(faded).toEqual(
      expect.arrayContaining(["e:ds_snow", "e:ag_finance"]),
    );
    expect(spy.draws[1].scene.nodes.some((n) => n.faded)).toBe(false);
    expect(spy.draws[2].motion.focus).toBe("e:ds_snow");
    expect(o.state().around).toBeNull();
    expect(o.state().selection).toEqual({ node: "e:ds_snow" });
    expect(o.canvas.onCanvas("ds_snow")).toBe("drawn");
  });
});

describe("S11 budget and Reset end the grouping in place", () => {
  it.each([
    ["setBudget(10)", (c: Canvas) => c.setBudget(10)],
    ["resetView()", (c: Canvas) => c.resetView()],
  ])("%s: no glide, around null, setLayout ran, one fit", async (_n, call) => {
    const o = await open("s-access");
    group(o, ROOT);
    spy.draws = [];
    spy.calls = [];
    spy.fits = 0;
    call(o.canvas);
    vi.advanceTimersByTime(T);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual(["layout"]);
    expect(o.state().around).toBeNull();
    expect(spy.calls).toEqual(["exitAround", "transition", "setLayout"]);
    expect(spy.fits).toBe(1);
  });
});

// why: QA verification item 3 (plants Q02, Q03) — the longest chain is 3 steps (S10); a call during
// its first motion puts the last step, the select, in the DOM and leaves no waiting step
describe("S15 (b) on the 3-step chain of S10", () => {
  it("a call that draws nothing jumps to the select step; one settle, no timer", async () => {
    const o = await open("s-access");
    group(o, ROOT);
    spy.draws = [];
    const settles = o.log.settle.length;
    o.canvas.focus("ds_snow");
    vi.advanceTimersByTime(48);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual(["local"]);
    o.canvas.setFilters({ kind: "none" } as never);
    vi.advanceTimersByTime(T);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual(["local", "none"]);
    expect(spy.draws[1].scene.selection.node).toBe("e:ds_snow");
    expect(spy.draws[1].scene.nodes.some((n) => n.faded)).toBe(false);
    expect(o.log.settle.length - settles).toBe(1);
    expect(o.state().around).toBeNull();
    expect(o.state().selection).toEqual({ node: "e:ds_snow" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

// why: QA verification item 3 (plants Q08, Q09), Context "Routing while grouped" — the effect step
// takes the rule (3) motion kind and the `starts` and `retractTo` of `r.placed`, with no anchor
describe("the motion of the effect step of an exit", () => {
  it("exit 10 collapse: the glide home, then motion collapse with the retractTo of r.placed", async () => {
    const o = await open("s-access");
    o.canvas.expand("e:ug_fin_admin");
    vi.advanceTimersByTime(T);
    group(o, "e:t_FCT_PIPELINE");
    const r = exitOf(o, {
      kind: "action",
      action: { kind: "collapse", id: "ug_fin_admin" },
    });
    expect(r.steps).toHaveLength(2);
    expect(r.placed?.retractTo.length ?? 0).toBeGreaterThan(0);
    spy.draws = [];
    o.canvas.collapse("e:ug_fin_admin");
    vi.advanceTimersByTime(T);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual(["local", "collapse"]);
    expect(spy.draws[0].motion.retractTo).toEqual([]);
    expect(spy.draws[1].motion.retractTo).toEqual(r.placed?.retractTo);
    expect(spy.draws[1].motion.starts).toEqual(r.placed?.starts);
  });

  it("exit 10 explore (S42): the glide home, then motion local with the starts of r.placed", async () => {
    const o = await open("s-access");
    group(o, "e:ug_exec");
    const r = exitOf(o, {
      kind: "action",
      action: { kind: "explore", id: "u_12" },
    });
    expect(r.steps).toHaveLength(2);
    expect(r.placed?.starts.length ?? 0).toBeGreaterThan(0);
    spy.draws = [];
    o.canvas.expand("e:u_12");
    vi.advanceTimersByTime(T);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual(["local", "local"]);
    expect(spy.draws[0].motion.starts).toEqual([]);
    expect(spy.draws[1].motion.starts).toEqual(r.placed?.starts);
    expect(spy.draws[1].motion.anchor).toBeNull();
  });
});
