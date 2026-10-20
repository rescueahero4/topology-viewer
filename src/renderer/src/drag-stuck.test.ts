// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { DrawnId, Hex, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Camera,
  DragHandlers,
  RendererText,
  Report,
  Scene,
  SceneNode,
} from "./index";

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
const { createRenderer } = await import("./index");

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const TEXT = { canvasName: "Topology canvas" } as RendererText;
const node = (id: string, x: number): SceneNode => ({
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
  faded: false,
  group: null,
  x,
  y: 0,
  room: 0,
});
const SCENE: Scene = {
  nodes: [node("e:a", 0), node("e:b", 100)],
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
  types: [],
};
type Positions = [DrawnId, Point][];
const LAST: Positions = [
  ["e:a", { x: 50, y: 5 }],
  ["e:b", { x: 120, y: 5 }],
];

// why: `refuse` — the start handler gives `false` (B17); `redraw` — it draws a scene first, as the
// controller does with the last waiting step of a step chain (STORY-003-07)
type Plant = {
  frame?: boolean;
  end?: boolean;
  refuse?: boolean;
  redraw?: Scene;
};
function mount(plant: Plant = {}) {
  const calls = { start: [] as string[], frame: [] as Point[], end: 0 };
  const handlers: DragHandlers = {
    start(id) {
      calls.start.push(id);
      if (plant.redraw !== undefined) renderer.draw(plant.redraw);
      return plant.refuse !== true;
    },
    frame(p) {
      calls.frame.push(p);
      if (plant.frame === true) throw new Error("planted");
      return [["e:a", p]];
    },
    end() {
      calls.end++;
      if (plant.end === true) throw new Error("planted");
      return [[["e:a", { x: 40, y: 5 }]], LAST];
    },
  };
  const div = document.createElement("div");
  document.body.appendChild(div);
  const camera: Camera = { k: 1, x: 400, y: 300 };
  const renderer = createRenderer(div, { text: TEXT, camera, drag: handlers });
  const reports: Report[] = [];
  const settles: Camera[] = [];
  renderer.onReport((r) => reports.push(r));
  renderer.onSettle((c) => settles.push(c));
  renderer.draw(SCENE);
  return { div, renderer, calls, reports, settles };
}
type Mounted = ReturnType<typeof mount>;

const mouse = (type: string, x: number, buttons = 1) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 10,
    buttons,
  });
  // why: QA round 2 (c) — `d3-drag` adds its listeners on `event.view` (see `drag.test.ts`)
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const touch = (type: string, x: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  // why: jsdom has no `Touch` constructor (T1); `d3-drag` reads only these fields
  const changedTouches = [{ identifier: 7, clientX: x, clientY: 10 }];
  Object.defineProperty(event, "changedTouches", { value: changedTouches });
  return event;
};
const el = (m: Mounted, id: string) =>
  [...m.div.querySelectorAll("g.qt-node")].find(
    (g) => (g as unknown as { __data__: SceneNode }).__data__.id === id,
  ) as Element;
const frames = (n = 1) => vi.advanceTimersByTime(16 * n);
const at = (m: Mounted, id: string) => el(m, id).getAttribute("transform");

function start(m: Mounted, id = "e:a") {
  el(m, id).dispatchEvent(mouse("mousedown", 10));
  window.dispatchEvent(mouse("mousemove", 30));
  frames();
}
// why: S9 — after an early end, the rest of the same gesture calls no handler
function rest(m: Mounted) {
  const before = { frame: m.calls.frame.length, end: m.calls.end };
  window.dispatchEvent(mouse("mousemove", 60));
  frames(2);
  window.dispatchEvent(mouse("mouseup", 60, 0));
  frames(2);
  expect({ frame: m.calls.frame.length, end: m.calls.end }).toEqual(before);
}

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "hidden");
  document.body.replaceChildren();
});

const STUCK: [string, (m: Mounted) => void][] = [
  ["a window blur", () => window.dispatchEvent(new Event("blur"))],
  [
    "a visibilitychange to hidden",
    () => {
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    },
  ],
  [
    "a mousemove with buttons 0",
    () => window.dispatchEvent(mouse("mousemove", 40, 0)),
  ],
];

describe("S9 stuck drags end at once (renderer)", () => {
  it.each(STUCK)(
    "%s ends the drag with one drag.end and the release at once",
    (_n, end) => {
      const m = mount();
      start(m);
      expect(m.calls.frame).toHaveLength(1);
      end(m);
      expect(m.calls.end).toBe(1);
      expect(at(m, "e:a")).toBe("translate(50,5)");
      expect(at(m, "e:b")).toBe("translate(120,5)");
      expect(m.settles).toHaveLength(2);
      rest(m);
      expect(m.settles).toHaveLength(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("a touchcancel comes as the d3 end and ends the drag at once", () => {
    const m = mount();
    el(m, "e:a").dispatchEvent(touch("touchstart", 10));
    el(m, "e:a").dispatchEvent(touch("touchmove", 30));
    frames();
    expect(m.calls.start).toEqual(["e:a"]);
    expect(m.calls.frame).toEqual([{ x: 20, y: 0 }]);
    el(m, "e:a").dispatchEvent(touch("touchcancel", 30));
    expect(m.calls.end).toBe(1);
    expect(at(m, "e:a")).toBe("translate(50,5)");
    el(m, "e:a").dispatchEvent(touch("touchmove", 50));
    el(m, "e:a").dispatchEvent(touch("touchend", 50));
    vi.advanceTimersByTime(500);
    rest(m);
    expect(m.settles).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("20 press-move-release cycles leave 0 of our listeners on window and document and 0 timers", () => {
    const m = mount();
    const spies = [window, document].flatMap((target) => [
      vi.spyOn(target, "addEventListener"),
      vi.spyOn(target, "removeEventListener"),
    ]);
    for (let i = 0; i < 20; i++) {
      start(m);
      window.dispatchEvent(mouse("mouseup", 30, 0));
      frames(3);
    }
    const net = new Map<string, number>();
    spies.forEach((spy, i) => {
      for (const [type] of spy.mock.calls)
        net.set(type, (net.get(type) ?? 0) + (i % 2 === 0 ? 1 : -1));
    });
    expect(spies[0].mock.calls.filter(([t]) => t === "blur")).toHaveLength(20);
    expect(
      spies[2].mock.calls.filter(([t]) => t === "visibilitychange"),
    ).toHaveLength(20);
    expect([...net.values()].every((n) => n === 0)).toBe(true);
    expect(m.calls.end).toBe(20);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a drag.frame throw stops the timer after 1 frame, gives one drag.end and one error report", () => {
    const m = mount({ frame: true });
    start(m);
    expect(m.calls.frame).toHaveLength(1);
    expect(m.calls.end).toBe(1);
    expect(m.reports).toEqual([{ kind: "error" }]);
    expect(at(m, "e:a")).toBe("translate(50,5)");
    rest(m);
    expect(m.settles).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a drag.end throw gives no second drag.end call, 0 timers and one error report", () => {
    const m = mount({ end: true });
    start(m);
    window.dispatchEvent(mouse("mouseup", 30, 0));
    expect(m.calls.end).toBe(1);
    expect(m.reports).toEqual([{ kind: "error" }]);
    frames(5);
    expect(m.calls.frame).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Security round 3 item 4: a frame throw and then an end throw give one drag.end and two reports", () => {
    const m = mount({ frame: true, end: true });
    start(m);
    rest(m);
    expect(m.calls.end).toBe(1);
    expect(m.reports).toEqual([{ kind: "error" }, { kind: "error" }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a second press during a drag is ignored: no second start, one drag.end at the mouseup", () => {
    const m = mount();
    start(m);
    el(m, "e:b").dispatchEvent(mouse("mousedown", 40));
    window.dispatchEvent(mouse("mousemove", 50));
    frames();
    window.dispatchEvent(mouse("mouseup", 50, 0));
    expect(m.calls.start).toEqual(["e:a"]);
    expect(m.calls.frame.at(-1)).toEqual({ x: 40, y: 0 });
    expect(m.calls.end).toBe(1);
  });

  it("a wheel gesture during a drag gives no settle before the end of the release", () => {
    const m = mount();
    start(m);
    const svg = m.div.querySelector("svg") as SVGSVGElement;
    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, cancelable: true }),
    );
    frames(20);
    expect(m.settles).toHaveLength(1);
    expect(m.calls.frame).toHaveLength(21);
    window.dispatchEvent(mouse("mouseup", 30, 0));
    frames(2);
    expect(m.settles).toHaveLength(2);
  });
});

describe("B17 a start handler that gives false", () => {
  it("starts no frame timer, calls no frame and no end, and gives no settle", () => {
    const m = mount({ refuse: true });
    const settles = m.settles.length;
    frames(2);
    expect(vi.getTimerCount()).toBe(0);
    el(m, "e:a").dispatchEvent(mouse("mousedown", 10));
    window.dispatchEvent(mouse("mousemove", 30));
    frames(5);
    expect(m.calls.start).toEqual(["e:a"]);
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(mouse("mousemove", 50));
    frames(5);
    window.dispatchEvent(mouse("mouseup", 50, 0));
    frames(5);
    expect([m.calls.frame.length, m.calls.end]).toEqual([0, 0]);
    expect(m.settles).toHaveLength(settles);
    expect(at(m, "e:a")).toBe("translate(0,0)");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("STORY-003-07 a start handler that draws first", () => {
  it("reads the origin of the drag after the handler", () => {
    const moved = { ...SCENE, nodes: [node("e:a", 70), node("e:b", 100)] };
    const m = mount({ redraw: moved });
    start(m);
    expect(m.calls.frame[0]).toEqual({ x: 90, y: 0 });
  });
});
