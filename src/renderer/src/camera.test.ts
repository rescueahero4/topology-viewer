// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Camera, RendererText, Report, Scene, SceneNode } from "./index";

// why: spies through pass-through mocks; production code has no test hook. `running` holds the
// camera timers that run
const spy = vi.hoisted(() => ({
  cull: 0,
  hits: 0,
  running: new Set<object>(),
}));
vi.mock("./cull", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./cull")>();
  return {
    cullLabels: (...a: Parameters<typeof mod.cullLabels>) => {
      spy.cull++;
      mod.cullLabels(...a);
    },
  };
});
vi.mock("./hits", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./hits")>();
  return {
    ...mod,
    drawHits: (...a: Parameters<typeof mod.drawHits>) => {
      spy.hits++;
      mod.drawHits(...a);
    },
  };
});
vi.mock("d3-timer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("d3-timer")>();
  return {
    ...mod,
    timer: (callback: (elapsed: number) => void) => {
      const t = mod.timer(callback);
      spy.running.add(t);
      const stop = t.stop.bind(t);
      t.stop = () => {
        spy.running.delete(t);
        stop();
      };
      return t;
    },
  };
});

// why: STORY-003-04 "Fake clock" — `d3-timer` binds `performance` and `requestAnimationFrame` when
// it loads, so the fake clock comes first and the entry is imported after it. The clear functions
// are faked too, else the real `clearInterval` keeps the `poke` interval of `d3-timer` (memo)
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
const { createRenderer, fitTransform, revealPlan } = await import("./index");
const { easeCubicInOut } = await import("d3-ease");

type Observer = { cb: ResizeObserverCallback; off: boolean };
const observers: Observer[] = [];
// why: jsdom has no ResizeObserver and gives each element 0 × 0; the test drives both
class FakeObserver {
  o: Observer;
  constructor(cb: ResizeObserverCallback) {
    this.o = { cb, off: false };
    observers.push(this.o);
  }
  observe() {}
  disconnect() {
    this.o.off = true;
  }
}
vi.stubGlobal("ResizeObserver", FakeObserver);
let size = { w: 800, h: 600 };
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: size.w, height: size.h }) as DOMRect;

// The camera draws no tooltip in these tests, so only the canvas name is read.
const TEXT = { canvasName: "Topology canvas" } as RendererText;

const node = (id: string, x: number, y: number, r: number): SceneNode => ({
  id,
  kind: "entity",
  type: "table",
  label: id,
  fullLabel: id,
  typeLabel: "Table",
  sub: "Table",
  visual: { icon: "table" },
  colour: "#864627" as Hex,
  w: 2 * r,
  h: 2 * r,
  r,
  tier: "asset",
  count: 0,
  more: 0,
  opened: 0,
  faded: false,
  group: null,
  x,
  y,
});

// The s-access first view of the story test plan.
const ACCESS = [
  node("e:t_FCT_REVENUE", -48.590028148380426, -38.70905611789809, 12),
  node("e:ug_analytics", -56.11842596815778, 84.51946977642233, 19),
  node("e:ug_fin_admin", -1.292443038387929, -141.97237624849413, 19),
  node("e:ug_exec", 153.96759045969137, 122.89474754067382, 19),
  node("e:u_0", -151.9682659935887, -54.226699423306556, 10),
  node("e:u_7", 82.52211957710705, -26.327277612904272, 10),
  node("e:u_12", 47.36711968161223, 28.30413223054887, 10),
];
const scene = (nodes: SceneNode[]): Scene => ({
  nodes,
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
});
const FIRST = scene(ACCESS);
const S1 = {
  k: 1.476959788076312,
  x: 391.8772200337812,
  y: 303.74972671011625,
};

function mount(first: Scene | null = FIRST, camera?: Camera) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, { text: TEXT, camera });
  const reports: Report[] = [];
  const settles: Camera[] = [];
  renderer.onReport((r) => reports.push(r));
  renderer.onSettle((c) => settles.push(c));
  if (first !== null) renderer.draw(first);
  const observer = observers[observers.length - 1];
  return {
    div,
    renderer,
    reports,
    settles,
    svg: div.querySelector("svg") as SVGSVGElement,
    observer,
    resize(w: number, h: number) {
      size = { w, h };
      const entry = { contentRect: { width: w, height: h } };
      observer.cb([entry as ResizeObserverEntry], {} as ResizeObserver);
    },
  };
}

const expectNear = (a: Camera, b: Camera | null, eps = 1e-9) => {
  expect(b).not.toBeNull();
  for (const key of ["k", "x", "y"] as const)
    expect(Math.abs(a[key] - (b as Camera)[key])).toBeLessThan(eps);
};

afterEach(() => {
  vi.runOnlyPendingTimers();
  size = { w: 800, h: 600 };
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", FakeObserver);
  document.body.replaceChildren();
});

const ANCHOR = "e:t_FCT_REVENUE";
const MOVED = { x: ACCESS[0].x + 200, y: ACCESS[0].y };
// The anchor moves 200 px; 9 newcomers sit on a ring of 300 units around it.
const SECOND = scene([
  node(ANCHOR, MOVED.x, MOVED.y, 12),
  ...ACCESS.slice(1),
  ...Array.from({ length: 9 }, (_, i) =>
    node(
      `e:n${i}`,
      MOVED.x + 300 * Math.cos((2 * Math.PI * i) / 9),
      MOVED.y + 300 * Math.sin((2 * Math.PI * i) / 9),
      10,
    ),
  ),
]);
const boxes = (s: Scene) => s.nodes.map(({ x, y, r }) => ({ x, y, r }));

describe("S4 revealInView keeps the anchor at its screen point in every frame", () => {
  it("follows the eased zoom and ends on the plan with one end work", () => {
    vi.advanceTimersByTime(15 - (performance.now() % 16));
    const m = mount();
    const t = m.renderer.transform();
    const s = { x: t.x + t.k * ACCESS[0].x, y: t.y + t.k * ACCESS[0].y };
    const context = ACCESS.slice(1).map(({ x, y, r }) => ({ x, y, r }));
    const must = boxes(SECOND).filter((_, i) => i === 0 || i >= 7);
    const plan = revealPlan(t, 800, 600, { s, p: MOVED }, must, context);
    expect(plan).not.toBeNull();
    const k1 = (plan as Camera).k;
    expect(k1).toBeLessThan(t.k);
    const p0 = performance.now();
    m.renderer.draw(SECOND, { anchor: ANCHOR });
    [spy.cull, spy.hits] = [0, 0];
    const settles = m.settles.length;
    let midpoint = false;
    vi.advanceTimersByTime(1);
    for (;;) {
      const c = m.renderer.transform();
      expect(Math.abs(c.x + c.k * MOVED.x - s.x)).toBeLessThan(1e-9);
      expect(Math.abs(c.y + c.k * MOVED.y - s.y)).toBeLessThan(1e-9);
      const tau = (performance.now() - p0) / 450;
      if (spy.running.size === 0) break;
      expect(spy.cull + spy.hits).toBe(0);
      const k = t.k + (k1 - t.k) * easeCubicInOut(tau);
      expect(Math.abs(c.k - k)).toBeLessThan(1e-9);
      if (performance.now() - p0 === 225) {
        expect(Math.abs(c.k - (t.k + k1) / 2)).toBeLessThan(1e-9);
        midpoint = true;
      }
      vi.advanceTimersByTime(16);
    }
    expect(midpoint).toBe(true);
    expect(performance.now() - p0).toBeGreaterThanOrEqual(450);
    expect(m.renderer.transform()).toEqual(plan);
    expect([spy.cull, spy.hits, m.settles.length - settles]).toEqual([1, 1, 1]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("S5 first visibility and resize", () => {
  it("reports zero-size once and fits only at a change to a non-zero size", () => {
    size = { w: 0, h: 0 };
    const m = mount();
    expect(m.reports).toEqual([{ kind: "zero-size" }]);
    expect(m.renderer.transform()).toEqual({ k: 1, x: 0, y: 0 });
    const fits: Camera[] = [];
    for (const [w, h] of [
      [0, 0],
      [800, 600],
      [800, 600],
      [1000, 700],
      [0, 0],
      [1000, 700],
    ]) {
      const before = m.settles.length;
      m.resize(w, h);
      const c = m.renderer.transform();
      for (const v of [c.k, c.x, c.y]) expect(Number.isFinite(v)).toBe(true);
      if (m.settles.length > before) {
        expect(c).toEqual(fitTransform(boxes(FIRST), w, h, 40, 0));
        fits.push(c);
      }
    }
    expect(fits.map((c) => c.k)).toEqual([
      fitTransform(boxes(FIRST), 800, 600, 40, 0)?.k,
      fitTransform(boxes(FIRST), 1000, 700, 40, 0)?.k,
      fitTransform(boxes(FIRST), 1000, 700, 40, 0)?.k,
    ]);
    expect(m.reports).toEqual([{ kind: "zero-size" }]);
  });
});

describe("S6 the camera option", () => {
  it("keeps a valid camera at the first draw and at the first callback", () => {
    const m = mount(FIRST, { k: 0.5, x: 10, y: 20 });
    expect(m.renderer.transform()).toEqual({ k: 0.5, x: 10, y: 20 });
    const settles = m.settles.length;
    m.resize(800, 600);
    expect(m.renderer.transform()).toEqual({ k: 0.5, x: 10, y: 20 });
    expect(m.settles.length).toBe(settles);
  });

  it.each([
    { k: NaN, x: 0, y: 0 },
    { k: 10, x: 0, y: 0 },
    { k: 0.01, x: 0, y: 0 },
    { k: 0.5, x: Infinity, y: 0 },
  ])("ignores %o and fits as S1", (camera) => {
    expectNear(mount(FIRST, camera).renderer.transform(), S1);
  });
});

describe("S11 hidden document and reduced motion", () => {
  it("fit() sets the end transform before it returns, with no timer, under document.hidden", () => {
    const m = mount(FIRST, { k: 0.5, x: 10, y: 20 });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    const settles = m.settles.length;
    m.renderer.fit();
    expectNear(m.renderer.transform(), S1);
    expect([vi.getTimerCount(), spy.running.size]).toEqual([0, 0]);
    expect(m.settles.length - settles).toBe(1);
    Reflect.deleteProperty(document, "hidden");
  });

  it("a draw with an anchor jumps to the plan under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
    }));
    const m = mount();
    const settles = m.settles.length;
    m.renderer.draw(SECOND, { anchor: ANCHOR });
    expect(m.renderer.transform().k).toBeLessThan(S1.k);
    expect([vi.getTimerCount(), spy.running.size]).toEqual([0, 0]);
    expect(m.settles.length - settles).toBe(1);
  });
});

// why: QA verification item 3 (plant Q46), STORY-003-07 — the fit takes its own boxes, pad and
// lowest zoom (the Group around root frame)
describe("fit options", () => {
  it("boxes 10,000 units apart with minK 0.8 give k 0.8; with no options the zoom goes below", () => {
    const far = scene([node("A", -5000, 0, 12), node("B", 5000, 0, 12)]);
    const m = mount(far, { k: 1, x: 400, y: 300 });
    const boxes = [
      { x: -5000, y: 0, r: 12 },
      { x: 5000, y: 0, r: 12 },
    ];
    m.renderer.fit({ boxes, pad: 60, minK: 0.8, animate: false });
    expect(m.renderer.transform().k).toBeCloseTo(0.8, 9);
    m.renderer.fit({ animate: false });
    expect(m.renderer.transform().k).toBeLessThan(0.8);
  });
});
