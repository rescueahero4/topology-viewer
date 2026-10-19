// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
import type { ZoomBehavior } from "d3-zoom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Camera, RendererText, Report, Scene, SceneNode } from "./index";

// why: spies through pass-through mocks; production code has no test hook. `running` holds the
// camera timers that run; `failEase` plants a throw in one frame (S12)
const spy = vi.hoisted(() => ({
  running: new Set<object>(),
  failEase: false,
  zooms: [] as ZoomBehavior<SVGSVGElement, unknown>[],
}));
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
vi.mock("d3-ease", async (importOriginal) => {
  const mod = await importOriginal<typeof import("d3-ease")>();
  return {
    ...mod,
    easeCubicInOut: (t: number) => {
      if (spy.failEase) {
        spy.failEase = false;
        throw new Error("planted");
      }
      return mod.easeCubicInOut(t);
    },
  };
});
vi.mock("d3-zoom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("d3-zoom")>();
  return {
    ...mod,
    zoom: () => {
      const z = mod.zoom<SVGSVGElement, unknown>();
      spy.zooms.push(z);
      return z;
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
const { createRenderer } = await import("./index");
const { select } = await import("d3-selection");
const { zoomIdentity, zoomTransform } = await import("d3-zoom");

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
type Mounted = ReturnType<typeof mount>;

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

describe("S12 one camera timer, stopped by a new move, a gesture or a throw", () => {
  const far = () => mount(FIRST, { k: 0.5, x: 10, y: 20 });

  it("a second fit() at 100 ms replaces the first", () => {
    const m = far();
    m.renderer.fit();
    expect(spy.running.size).toBe(1);
    vi.advanceTimersByTime(100);
    m.renderer.fit();
    expect(spy.running.size).toBe(1);
    for (let i = 0; i < 40; i++) {
      vi.advanceTimersByTime(16);
      expect(spy.running.size).toBeLessThanOrEqual(1);
    }
    expect([spy.running.size, vi.getTimerCount()]).toEqual([0, 0]);
    expectNear(m.renderer.transform(), S1);
  });

  it("a wheel gesture at 100 ms stops the tween", () => {
    const m = far();
    m.renderer.fit();
    vi.advanceTimersByTime(100);
    m.svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, cancelable: true }),
    );
    expect(spy.running.size).toBe(0);
    const after = m.renderer.transform();
    vi.advanceTimersByTime(500);
    expect(m.renderer.transform()).toEqual(after);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a throw in a frame stops the timer and sets the end transform", () => {
    const m = far();
    m.renderer.fit();
    vi.advanceTimersByTime(50);
    spy.failEase = true;
    expect(() => vi.advanceTimersByTime(16)).toThrow("planted");
    expect(spy.running.size).toBe(0);
    expectNear(m.renderer.transform(), S1);
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(0);
  });
});

// why: jsdom does not take its own window as the `view` of a MouseEvent; d3-zoom reads `view`
const mouse = (type: string) => {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, "view", { value: window });
  return event;
};

const KINDS: [string, (m: Mounted) => void][] = [
  ["a resize callback", (m) => m.resize(1000, 700)],
  [
    "a zoom event",
    (m) =>
      spy.zooms[spy.zooms.length - 1].transform(select(m.svg), zoomIdentity),
  ],
  ["a camera frame", () => vi.advanceTimersByTime(16)],
];

describe("S13 the end when the root leaves the document", () => {
  it.each(KINDS)(
    "%s first: one ended report, nothing moves after",
    (_n, first) => {
      const m = mount(FIRST, { k: 0.5, x: 10, y: 20 });
      m.renderer.fit();
      vi.advanceTimersByTime(48);
      m.svg.dispatchEvent(mouse("mousedown"));
      m.renderer.fit();
      expect(spy.running.size).toBe(1);
      const zoomed = select(m.svg);
      expect(zoomed.on("wheel.zoom")).toBeTypeOf("function");
      const t = m.renderer.transform();
      const viewport = m.svg.querySelector("g.qt-viewport");
      const attr = viewport?.getAttribute("transform");
      m.div.remove();
      expect(() => {
        first(m);
        for (const [, kind] of KINDS) kind(m);
        window.dispatchEvent(mouse("mouseup"));
      }).not.toThrow();
      expect(m.reports).toEqual([{ kind: "ended" }]);
      expect(spy.running.size).toBe(0);
      expect(m.renderer.transform()).toEqual(t);
      expect(viewport?.getAttribute("transform")).toBe(attr);
      expect(zoomed.on(".zoom")).toBeUndefined();
      for (const type of ["wheel", "mousedown", "dblclick", "touchstart"])
        expect(zoomed.on(`${type}.zoom`)).toBeUndefined();
      expect(observers[observers.length - 1].off).toBe(true);
      vi.advanceTimersByTime(500);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  const ALONE: [string, (m: Mounted) => void][] = [
    ["the resize callback", (m) => m.resize(1000, 700)],
    ["the camera frame", () => vi.advanceTimersByTime(16)],
  ];
  it.each(ALONE)(
    "%s after the removal ends the renderer before it moves the d3-zoom state",
    (_n, first) => {
      const m = mount(FIRST, { k: 0.5, x: 10, y: 20 });
      m.renderer.fit();
      vi.advanceTimersByTime(48);
      const state = zoomTransform(m.svg);
      const settles = m.settles.length;
      m.div.remove();
      first(m);
      expect(m.reports).toEqual([{ kind: "ended" }]);
      expect(zoomTransform(m.svg)).toEqual(state);
      expect(m.settles.length).toBe(settles);
    },
  );
});
