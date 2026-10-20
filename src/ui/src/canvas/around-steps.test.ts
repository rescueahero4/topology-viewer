// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState, Hex, Point } from "@qdic-topology/engine";
import type { Motion, Renderer, Scene } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through spy; each draw with its motion, its scene and the DOM positions right before it
type Draw = { scene: Scene; motion: Motion; dom: Map<string, Point> };
const spy = vi.hoisted(() => ({
  draws: [] as Draw[],
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
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        draw: (scene, motion) => {
          const dom = spy.spots(args[0]);
          spy.draws.push({ scene, motion: motion as Motion, dom });
          r.draw(scene, motion);
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
const { fitTransform, iconMetrics } = await import("@qdic-topology/renderer");
const { createCanvas } = await import("./index");

// why: jsdom has no ResizeObserver; this one keeps its callback so a test can send a resize
type Resize = (
  entries: { contentRect: { width: number; height: number } }[],
) => void;
const observers: Resize[] = [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    constructor(callback: Resize) {
      observers.push(callback);
    }
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

const T = 3000;
const frames = (n = 1) => vi.advanceTimersByTime(16 * n);
const ROOT = "e:t_FCT_REVENUE";
const OFF = { kind: "toggleType", type: "user_group", on: false } as const;

function modelOf(): CanvasModel {
  const r = engine.normalize(loadFixture("s-access").input, {
    now: "2026-10-19",
  });
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

// why: the S15 Given — S1 (the s-access first view grouped around its root), then the exit
// `toggleType` `user_group` off has 2 steps
async function grouped() {
  const model = modelOf();
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model });
  const settles: CanvasEvent["settle"][] = [];
  canvas.on("settle", (e) => settles.push(e));
  await Promise.resolve();
  const before = settles[settles.length - 1].state;
  canvas.groupAroundRoot(true);
  vi.advanceTimersByTime(T);
  const state = settles[settles.length - 1].state;
  const { graph, vocab } = model;
  const view = (s: CanvasState) => engine.frontier(s, graph, vocab);
  const exit = engine.exitAround(
    state,
    { kind: "action", action: OFF },
    view(state),
    graph,
    vocab,
    iconMetrics,
  );
  expect(exit.steps).toHaveLength(2);
  // why: after the toggle the users are one group node, the node that the select takes
  const kept = view(exit.state).nodes.find((n) => n.id !== ROOT)?.id as string;
  spy.draws = [];
  return { model, div, canvas, settles, before, exit, view, kept };
}

const datum = (el: Element) =>
  (el as unknown as { __data__: { id: string } }).__data__.id;
function dom(div: HTMLElement): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const g of div.querySelectorAll("g.qt-node")) {
    const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
      g.getAttribute("transform") ?? "",
    );
    out.set(datum(g), { x: Number(m?.[1]), y: Number(m?.[2]) });
  }
  return out;
}
const equal = (a: Map<string, Point>, b: Map<string, unknown>) =>
  [...a].every(([id, p]) => {
    const q = b.get(id) as Point | undefined;
    return q !== undefined && q.x === p.x && q.y === p.y;
  });
const drawnAt = (s: CanvasState, ids: Iterable<string>) => {
  const all = new Map(s.positions);
  return new Map([...ids].map((id) => [id, all.get(id)]));
};

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: Resize) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  Reflect.deleteProperty(document, "hidden");
  spy.draws = [];
  document.body.replaceChildren();
});

describe("S15 the step chain", () => {
  it("(a) the first motion ends on the steps[0] positions, then steps[1] plays; one settle after the last", async () => {
    const g = await grouped();
    const settles = g.settles.length;
    g.canvas.setFilters(OFF);
    expect(spy.draws).toHaveLength(1);
    const home = g.exit.steps[0];
    let moving = false;
    for (let ms = 0; ms < T && spy.draws.length === 1; ms += 16) {
      frames();
      const now = dom(g.div);
      if (spy.draws.length === 1 && !equal(now, drawnAt(home, now.keys())))
        moving = true;
    }
    expect(moving).toBe(true);
    expect(spy.draws).toHaveLength(2);
    const at = spy.draws[1].dom;
    expect(at).toEqual(drawnAt(home, at.keys()));
    expect(g.settles).toHaveLength(settles);
    vi.advanceTimersByTime(T);
    const end = dom(g.div);
    expect(end).toEqual(drawnAt(g.exit.state, end.keys()));
    expect(g.settles).toHaveLength(settles + 1);
    expect(g.settles.at(-1)?.state).toEqual(g.exit.state);
  });

  it("(b) a select during the glide jumps the waiting step to its end first, then selects", async () => {
    const g = await grouped();
    const settles = g.settles.length;
    g.canvas.setFilters(OFF);
    frames(6);
    g.canvas.select(g.kept);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual([
      "local",
      "none",
      "none",
    ]);
    const jump = spy.draws[1].scene.nodes.map((n) => [n.id, n.x, n.y]);
    const all = new Map(g.exit.state.positions);
    expect(jump).toEqual(
      g.view(g.exit.state).nodes.map((n) => {
        const p = all.get(n.id) as Point;
        return [n.id, p.x, p.y];
      }),
    );
    expect(spy.draws[2].scene.selection.node).toBe(g.kept);
    expect(g.settles.slice(settles).map((e) => e.state.selection)).toEqual([
      g.exit.state.selection,
      { node: g.kept },
    ]);
    frames();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(T);
    expect(spy.draws).toHaveLength(3);
    expect(g.settles).toHaveLength(settles + 2);
  });

  it.each(["hidden", "reduced motion"])(
    "(c) %s: the r.state positions before the method returns, no frame, one settle",
    async (how) => {
      const g = await grouped();
      if (how === "hidden")
        Object.defineProperty(document, "hidden", {
          value: true,
          configurable: true,
        });
      else vi.stubGlobal("matchMedia", () => ({ matches: true }));
      const settles = g.settles.length;
      g.canvas.setFilters(OFF);
      const now = dom(g.div);
      expect(now).toEqual(drawnAt(g.exit.state, now.keys()));
      expect(spy.draws).toHaveLength(2);
      expect(g.settles).toHaveLength(settles + 1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("(d) the canvas root leaves the page during the glide: the waiting step and its timer stop, no settle", async () => {
    const g = await grouped();
    const settles = g.settles.length;
    g.canvas.setFilters(OFF);
    frames(6);
    g.div.remove();
    frames();
    const html = g.div.innerHTML;
    frames();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(T);
    expect([g.div.innerHTML, spy.draws.length, g.settles.length]).toEqual([
      html,
      1,
      settles,
    ]);
  });

  it("a wheel gesture during the glide does not start steps[1] early (b2)", async () => {
    const g = await grouped();
    g.canvas.setFilters(OFF);
    frames(3);
    const svg = g.div.querySelector("svg") as SVGSVGElement;
    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, cancelable: true }),
    );
    vi.advanceTimersByTime(300);
    expect(spy.draws).toHaveLength(1);
    vi.advanceTimersByTime(T);
    expect(spy.draws).toHaveLength(2);
  });

  it("a drag start during the glide puts the last step in the DOM first", async () => {
    const g = await grouped();
    const ends: CanvasEvent["drag-end"][] = [];
    g.canvas.on("drag-end", (e) => ends.push(e));
    g.canvas.setFilters(OFF);
    frames(6);
    const mouse = (type: string, x: number, buttons: number) => {
      const e = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: 100,
        buttons,
      });
      Object.defineProperty(e, "view", { value: window });
      return e;
    };
    const el = [...g.div.querySelectorAll("g.qt-node")].find(
      (n) => datum(n) === ROOT,
    );
    el?.dispatchEvent(mouse("mousedown", 100, 1));
    window.dispatchEvent(mouse("mousemove", 130, 1));
    expect(spy.draws.map((d) => d.motion.kind)).toEqual(["local", "none"]);
    frames(3);
    window.dispatchEvent(mouse("mouseup", 130, 0));
    vi.advanceTimersByTime(T);
    expect(spy.draws).toHaveLength(2);
    expect(ends).toHaveLength(1);
    const moved = new Map(ends[0].state.positions).get(ROOT) as Point;
    const from = new Map(g.exit.state.positions).get(ROOT) as Point;
    expect(moved).not.toEqual(from);
    expect(ends[0].state.around).toBeNull();
  });
});

describe("S16 (a) fits while grouped take the shown nodes only", () => {
  it("fit() and a resize to 1,000 × 700 fit the shown boxes, e:ug_exec left out", async () => {
    const g = await grouped();
    const scene = () => {
      const s = new Map(g.settles.at(-1)?.state.positions);
      return [...g.div.querySelectorAll("g.qt-node")].map((el) => {
        const d = (el as unknown as { __data__: { id: string; r: number } })
          .__data__;
        const p = s.get(d.id) as Point;
        return { id: d.id, x: p.x, y: p.y, r: d.r };
      });
    };
    const shown = scene().filter((b) => b.id !== "e:ug_exec");
    expect(shown).toHaveLength(6);
    const all = scene();
    const cam = () => g.settles.at(-1)?.camera;
    for (const [w, h, send] of [
      [800, 600, () => g.canvas.fit()],
      [
        1000,
        700,
        () =>
          observers.at(-1)?.([{ contentRect: { width: 1000, height: 700 } }]),
      ],
    ] as const) {
      send();
      vi.advanceTimersByTime(T);
      const want = fitTransform(shown, w, h, 40, 0);
      const wrong = fitTransform(all, w, h, 40, 0);
      expect(cam()?.k).toBeCloseTo(want?.k ?? NaN, 9);
      expect(cam()?.x).toBeCloseTo(want?.x ?? NaN, 9);
      expect(cam()?.y).toBeCloseTo(want?.y ?? NaN, 9);
      expect([wrong?.k, wrong?.x, wrong?.y]).not.toEqual([
        want?.k,
        want?.x,
        want?.y,
      ]);
    }
  });
});
