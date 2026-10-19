// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Camera,
  Motion,
  RendererText,
  Report,
  Scene,
  SceneNode,
} from "./index";

// why: a pass-through mock of `d3-timer`: `running` holds the timers that run (STORY-003-04 QA (d))
const spy = vi.hoisted(() => ({ running: new Set<object>() }));
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

// why: STORY-003-04 "Fake clock" and build-time item B11 — the clear functions are faked too
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
const { createRenderer, revealPlan } = await import("./index");

const observers: ResizeObserverCallback[] = [];
// why: jsdom has no ResizeObserver and gives each element 0 × 0; the test drives both
class FakeObserver {
  constructor(cb: ResizeObserverCallback) {
    observers.push(cb);
  }
  observe() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", FakeObserver);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const TEXT = { canvasName: "Topology canvas" } as RendererText;
const CAMERA: Camera = { k: 1, x: 400, y: 300 };

const node = (id: string, x: number, y: number): SceneNode => ({
  id,
  kind: "entity",
  type: "table",
  label: "n",
  fullLabel: "n",
  typeLabel: "Table",
  sub: "Table",
  visual: { icon: "table" },
  colour: "#864627" as Hex,
  w: 20,
  h: 20,
  r: 10,
  tier: "asset",
  count: 0,
  more: 0,
  opened: 0,
  group: null,
  x,
  y,
});
const scene = (nodes: SceneNode[]): Scene => ({
  nodes,
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
});
const motion = (kind: Motion["kind"], more: Partial<Motion> = {}): Motion => ({
  kind,
  starts: [],
  retractTo: [],
  anchor: null,
  focus: null,
  ...more,
});

function mount(first: Scene) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, { text: TEXT, camera: CAMERA });
  const reports: Report[] = [];
  const settles: Camera[] = [];
  renderer.onReport((r) => reports.push(r));
  renderer.onSettle((c) => settles.push(c));
  renderer.draw(first);
  const svg = div.querySelector("svg") as SVGSVGElement;
  return { div, renderer, reports, settles, svg };
}

function at(div: HTMLElement, id: string): Point {
  const el = [...div.querySelectorAll("g.qt-node")].find(
    (g) => (g as unknown as { __data__: SceneNode }).__data__.id === id,
  );
  const match = /^translate\(([^,]+),([^)]+)\)$/.exec(
    el?.getAttribute("transform") ?? "",
  );
  if (match === null) throw new Error(`no node ${id}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", FakeObserver);
  document.body.replaceChildren();
});

const box = (n: SceneNode) => ({ x: n.x, y: n.y, r: n.r });
const EXPLORE = [node("e:a", 200, 0), node("e:n", 200, 400)];
const START: [string, Point][] = [["e:n", { x: 0, y: 0 }]];

describe("TL-4 with the motion clock (SA §6 row 6)", () => {
  it("keeps the anchor at its screen point in every frame and only zooms out", () => {
    const m = mount(scene([node("e:a", 0, 0)]));
    const plan = revealPlan(
      CAMERA,
      800,
      600,
      { s: { x: 400, y: 300 }, p: { x: 200, y: 0 } },
      EXPLORE.map(box),
      [],
    ) as Camera;
    expect(plan.k).toBeLessThan(1);
    m.renderer.draw(
      scene(EXPLORE),
      motion("local", { starts: START, anchor: "e:a" }),
    );
    let k = CAMERA.k;
    for (let i = 0; i < 60; i++) {
      const t = m.renderer.transform();
      const a = at(m.div, "e:a");
      expect(Math.abs(t.x + t.k * a.x - 400)).toBeLessThan(1e-9);
      expect(Math.abs(t.y + t.k * a.y - 300)).toBeLessThan(1e-9);
      expect(t.k).toBeLessThanOrEqual(k);
      k = t.k;
      vi.advanceTimersByTime(16);
    }
    expect(m.renderer.transform()).toEqual(plan);
    expect(spy.running.size).toBe(0);
  });

  it("a gesture during the motion stops only the camera part (Implementer round 2 (f))", () => {
    const m = mount(scene([node("e:a", 0, 0)]));
    m.renderer.draw(
      scene(EXPLORE),
      motion("local", { starts: START, anchor: "e:a" }),
    );
    vi.advanceTimersByTime(160);
    m.svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, cancelable: true }),
    );
    const after = m.renderer.transform();
    const settles = m.settles.length;
    vi.advanceTimersByTime(1000);
    expect(m.renderer.transform()).toEqual(after);
    expect(at(m.div, "e:a")).toEqual({ x: 200, y: 0 });
    expect(at(m.div, "e:n")).toEqual({ x: 200, y: 400 });
    expect(m.settles.length).toBe(settles + 1);
  });
});

describe("S14 (a) a new draw jumps the camera part to its end", () => {
  it("the next draw starts from the end camera of the jumped motion", () => {
    const m = mount(scene([node("e:a", 0, 0)]));
    const plan = revealPlan(
      CAMERA,
      800,
      600,
      { s: { x: 400, y: 300 }, p: { x: 200, y: 0 } },
      EXPLORE.map(box),
      [],
    );
    m.renderer.draw(
      scene(EXPLORE),
      motion("local", { starts: START, anchor: "e:a" }),
    );
    vi.advanceTimersByTime(240);
    expect(m.renderer.transform()).not.toEqual(plan);
    m.renderer.draw(scene(EXPLORE), motion("none"));
    expect(m.renderer.transform()).toEqual(plan);
  });
});

describe("B13 the anchor context takes only the nodes on screen", () => {
  it("a previous node off screen does not make the camera zoom out", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const m = mount(scene([node("e:a", 0, 0), node("e:far", 430, 0)]));
    m.renderer.draw(
      scene([node("e:a", 0, 0), node("e:far", 430, 0), node("e:n", 0, 50)]),
      motion("local", { starts: [["e:n", { x: 0, y: 0 }]], anchor: "e:a" }),
    );
    const all = revealPlan(
      CAMERA,
      800,
      600,
      { s: { x: 400, y: 300 }, p: { x: 0, y: 0 } },
      [node("e:a", 0, 0), node("e:n", 0, 50)].map(box),
      [node("e:far", 430, 0)].map(box),
    );
    expect(all?.k).toBeCloseTo(0.8, 9);
    expect(m.renderer.transform()).toEqual(CAMERA);
  });
});

describe("the end during a motion (build-time item B15, Security item 3)", () => {
  it("B15: no timer runs directly after an end from a resize callback", () => {
    const m = mount(scene([node("e:a", 0, 0)]));
    m.renderer.draw(scene([node("e:a", 200, 0)]), motion("local"));
    vi.advanceTimersByTime(48);
    m.renderer.fit();
    expect(spy.running.size).toBe(2);
    m.div.remove();
    const entry = { contentRect: { width: 900, height: 600 } };
    observers[observers.length - 1](
      [entry as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    expect(spy.running.size).toBe(0);
    expect(m.reports).toEqual([{ kind: "ended" }]);
    expect(m.renderer.ended()).toBe(true);
    vi.advanceTimersByTime(16);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("item 3: a removal during a motion gives no settle and no event after ended", () => {
    const m = mount(scene([node("e:a", 0, 0)]));
    const settles = m.settles.length;
    m.renderer.draw(scene([node("e:a", 200, 0)]), motion("local"));
    vi.advanceTimersByTime(48);
    m.div.remove();
    vi.advanceTimersByTime(16);
    expect([spy.running.size, vi.getTimerCount()]).toEqual([0, 0]);
    vi.advanceTimersByTime(1000);
    expect(m.settles.length).toBe(settles);
    expect(m.reports).toEqual([{ kind: "ended" }]);
  });
});
