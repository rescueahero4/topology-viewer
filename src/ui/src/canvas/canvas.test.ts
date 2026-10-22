// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState, Hex, Payload } from "@qdic-topology/engine";
import type { Renderer, Report } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent, CanvasModel } from "./index";

// why: pass-through mocks; production code has no test hook. `fail` plants a throw in the next
// call of one engine function (S17); `reports` records the renderer reports (S2, S24 (f))
const spy = vi.hoisted(() => ({
  fail: null as string | null,
  reports: [] as Report[][],
}));
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  const planted =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A): R => {
      if (spy.fail === name) {
        spy.fail = null;
        throw new Error("planted");
      }
      return fn(...args);
    };
  return {
    ...mod,
    transition: planted("transition", mod.transition),
    place: planted("place", mod.place),
    hide: planted("hide", mod.hide),
    firstView: planted("firstView", mod.firstView),
  };
});
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      const list: Report[] = [];
      spy.reports.push(list);
      const onReport = r.onReport.bind(r);
      return {
        ...r,
        onReport: (h: (report: Report) => void) =>
          onReport((report) => {
            list.push(report);
            h(report);
          }),
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
const { fixtures, loadFixture } = await import("@qdic-topology/fixtures");
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

const NOW = "2026-10-19";
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

function modelOf(input: unknown, canvas: Hex = LIGHT): CanvasModel {
  const r = engine.normalize(input, { now: NOW });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, canvas);
  return { graph: r.graph, payload: r.payload, hash: r.hash, vocab, canvas };
}
const fixture = (key: string) => modelOf(loadFixture(key).input);

type Log = { [K in keyof CanvasEvent]: CanvasEvent[K][] };
function open(model: CanvasModel, more: { state?: CanvasState } = {}) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model, ...more });
  const log: Log = {
    select: [],
    explore: [],
    "drag-end": [],
    settle: [],
    notice: [],
  };
  for (const name of Object.keys(log) as (keyof CanvasEvent)[])
    canvas.on(name, (e) => (log[name] as unknown[]).push(e));
  return { div, canvas, log };
}
const tick = () => Promise.resolve();
const last = <T>(list: T[]) => list[list.length - 1];
const nodeIds = (div: HTMLElement) =>
  [...div.querySelectorAll("g.qt-node")].map(
    (g) => (g as unknown as { __data__: { id: string } }).__data__.id,
  );
function transforms(div: HTMLElement) {
  const out = new Map<string, string | null>();
  for (const g of div.querySelectorAll("g.qt-node"))
    out.set(
      (g as unknown as { __data__: { id: string } }).__data__.id,
      g.getAttribute("transform"),
    );
  return out;
}
// why: `positions` also keeps the spots of nodes that are not drawn (the position cache)
function at(state: CanvasState, ids: readonly string[]) {
  const spots = new Map(state.positions);
  return new Map(
    ids.map((id) => {
      const p = spots.get(id);
      return [id, p === undefined ? null : `translate(${p.x},${p.y})`];
    }),
  );
}

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.fail = null;
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Reflect.deleteProperty(document, "hidden");
  document.body.replaceChildren();
});

const NOT_DRAWN = ["s-invalid", "s-not-graph", "s-noid-all", "s-stress"];
const DRAWING = Object.keys(fixtures)
  .filter((key) => !NOT_DRAWN.includes(key))
  .sort();

describe("S1 the first paint of the 34 drawing fixtures", () => {
  it("has 34 fixtures, 16 of them Active", () => {
    expect(DRAWING).toHaveLength(34);
    const active = DRAWING.filter(
      (key) => fixtures[key].expect.firstPaint.approach === "active",
    );
    expect(active).toHaveLength(16);
  });

  it.each(DRAWING)("%s", async (key) => {
    const model = fixture(key);
    const { graph, vocab, payload, hash } = model;
    const first = engine.firstView(graph, vocab, payload, hash);
    const view = engine.frontier(first, graph, vocab);
    const laid = engine.setLayout(
      first,
      view,
      vocab,
      first.layout,
      iconMetrics,
    );
    const { div, log } = open(model);
    expect(nodeIds(div)).toEqual(view.nodes.map((n) => n.id));
    expect(transforms(div)).toEqual(
      at(
        laid,
        view.nodes.map((n) => n.id),
      ),
    );
    expect(log.settle).toHaveLength(0);
    await tick();
    const paint = fixtures[key].expect.firstPaint;
    const selected =
      paint.selected === null
        ? null
        : engine.drawnIdOf(first, graph, vocab, paint.selected);
    expect(log.settle).toHaveLength(1);
    const { state, camera } = log.settle[0];
    expect(state.selection).toEqual(
      selected === null ? null : { node: selected },
    );
    expect(log.select).toHaveLength(selected === null ? 0 : 1);
    if (view.nodes.length === 0) {
      expect(div.querySelectorAll("g.qt-node")).toHaveLength(0);
      expect(camera).toEqual({ k: 1, x: 0, y: 0 });
    }
  });
});

describe("S2 every new canvas takes the firstView layout (epic question 9)", () => {
  const lineage = loadFixture("s-lineage").input as { view?: object };
  it.each([
    [
      "s-lineage tree-h",
      { ...lineage, view: { ...lineage.view, layout: "tree-h" } },
      "tree-h",
      "force",
    ],
    ["s-access", loadFixture("s-access").input, "force", "atomic"],
  ] as const)("%s", async (_n, input, first, next) => {
    const model = modelOf(input);
    const a = open(model);
    await tick();
    expect(last(a.log.settle).state.layout).toBe(first);
    a.canvas.setLayout(next);
    vi.advanceTimersByTime(1000);
    expect(last(a.log.settle).state.layout).toBe(next);
    const reports = spy.reports[spy.reports.length - 1];
    const b = createCanvas(a.div, { text: TEXT, model });
    const settles: CanvasEvent["settle"][] = [];
    b.on("settle", (e) => settles.push(e));
    await tick();
    expect(settles[0].state.layout).toBe(first);
    a.canvas.resetView();
    expect(reports).toEqual([{ kind: "ended" }]);
  });
});

const ACTIONS: [string, (c: Canvas) => void][] = [
  ["expand", (c) => c.expand("e:t_FCT_REVENUE")],
  ["collapse", (c) => c.collapse("e:t_FCT_REVENUE")],
  ["hide", (c) => c.hide(["e:u_0"])],
  ["restore", (c) => c.restore(["e:u_0"])],
  ["setLayout atomic", (c) => c.setLayout("atomic")],
  ["setBudget 10", (c) => c.setBudget(10)],
];
const STILL: [string, () => void][] = [
  [
    "document.hidden",
    () =>
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
      }),
  ],
  [
    "reduced motion",
    () => vi.stubGlobal("matchMedia", () => ({ matches: true })),
  ],
];

describe("S13 the controller under a hidden document and reduced motion (NF-8)", () => {
  it.each(STILL)(
    "%s: each change is final before the method returns",
    async (_n, stub) => {
      const { div, canvas, log } = open(fixture("s-access"));
      await tick();
      stub();
      for (const [name, call] of ACTIONS) {
        const settles = log.settle.length;
        call(canvas);
        expect(log.settle.length, name).toBeGreaterThan(settles);
        const { state, frontier } = last(log.settle);
        const ids = frontier.nodes.map((n) => n.id);
        expect(transforms(div), name).toEqual(at(state, ids));
        expect(div.querySelectorAll(".qt-born, .qt-emerge"), name).toHaveLength(
          0,
        );
        expect(vi.getTimerCount(), name).toBe(0);
      }
    },
  );
});

describe("S15 the controller reads only payload.view (hand-off item 4)", () => {
  it("does not walk, copy or serialise a 10,000-level payload", async () => {
    let deep: object = {};
    for (let i = 0; i < 10000; i++) deep = { a: deep };
    const input = {
      ...(loadFixture("s-access").input as object),
      vocabulary: deep,
    };
    const model = modelOf(input);
    expect(() => JSON.stringify(model.payload)).toThrow(RangeError);
    const reads: string[] = [];
    const note = (what: string, key: string | symbol) =>
      reads.push(`${what} ${String(key)}`);
    const payload: Payload = new Proxy(model.payload, {
      get: (t, k, r): unknown => (note("get", k), Reflect.get(t, k, r)),
      has: (t, k) => (note("has", k), Reflect.has(t, k)),
      ownKeys: (t) => (note("ownKeys", ""), Reflect.ownKeys(t)),
      getOwnPropertyDescriptor: (t, k) => (
        note("descriptor", k),
        Reflect.getOwnPropertyDescriptor(t, k)
      ),
    });
    const clone = vi.spyOn(globalThis, "structuredClone");
    const { canvas, log } = open({ ...model, payload });
    await tick();
    canvas.expand("e:t_FCT_REVENUE");
    vi.advanceTimersByTime(2000);
    expect(reads).toEqual(["get view"]);
    expect(clone).not.toHaveBeenCalled();
    const keys = {
      select: ["selection", "state"],
      explore: ["action", "state"],
      settle: ["camera", "frontier", "state"],
    } as const;
    for (const [name, list] of Object.entries(keys))
      for (const event of log[name as keyof typeof keys])
        expect(Object.keys(event).sort()).toEqual(list);
    expect(log.explore).toHaveLength(1);
  });
});
