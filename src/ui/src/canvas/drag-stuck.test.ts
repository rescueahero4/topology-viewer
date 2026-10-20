// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { DragCtx, DrawnId, Hex, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through mocks; production code has no test hook. They count the engine drag calls and
// plant a throw in `dragStep` (the `drag.frame` of the controller) or in `release` (`drag.end`)
const spy = vi.hoisted(() => ({
  steps: 0,
  releases: 0,
  failStep: false,
  failRelease: false,
}));
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  return {
    ...mod,
    dragStep: (...args: Parameters<typeof mod.dragStep>) => {
      spy.steps++;
      if (spy.failStep) throw new Error("planted");
      return mod.dragStep(...args);
    },
    release: (...args: Parameters<typeof mod.release>) => {
      spy.releases++;
      if (spy.failRelease) throw new Error("planted");
      return mod.release(...args);
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
const { createCanvas } = await import("./index");

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
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
};
function model(): CanvasModel {
  const r = engine.normalize(loadFixture("s-access").input, {
    now: "2026-10-19",
  });
  if (!r.ok) throw new Error("fatal");
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
async function open(div = document.createElement("div")) {
  if (!div.isConnected) document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model: model() });
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
  return { div, canvas, log };
}
type Open = Awaited<ReturnType<typeof open>>;
const last = <T>(list: T[]) => list[list.length - 1];

const mouse = (type: string, x: number, buttons: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 100,
    buttons,
  });
  // why: QA round 2 (c) — `d3-drag` adds its listeners on `event.view` (see `drag-fixtures.test.ts`)
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const touch = (type: string, x: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  // why: jsdom has no `Touch` constructor (T1 memo); `d3-drag` reads only these fields
  Object.defineProperty(event, "changedTouches", {
    value: [{ identifier: 3, clientX: x, clientY: 100 }],
  });
  return event;
};
const datumId = (g: Element) =>
  (g as unknown as { __data__: { id: string } }).__data__.id;
const el = (o: Open, id: string) =>
  [...o.div.querySelectorAll("g.qt-node")].find(
    (g) => datumId(g) === id,
  ) as Element;
const frames = (n = 1) => vi.advanceTimersByTime(16 * n);

// why: a press, one move of 60 client px and 3 frames; the reference makes the same engine calls
function dragOn(o: Open, id: DrawnId = "e:u_0") {
  const { state, frontier, camera } = last(o.log.settle);
  el(o, id).dispatchEvent(mouse("mousedown", 100, 1));
  window.dispatchEvent(mouse("mousemove", 160, 1));
  frames(3);
  return () => {
    const p0 = new Map(state.positions).get(id) as Point;
    let ctx = engine.beginDrag(state, frontier, id) as DragCtx;
    for (let i = 0; i < 3; i++)
      ctx = engine.dragStep(ctx, {
        x: p0.x + (160 - 100) / camera.k,
        y: p0.y,
      }).ctx;
    return engine.release(ctx);
  };
}
const counts = (o: Open) => ({
  steps: spy.steps,
  releases: spy.releases,
  events: Object.values(o.log).reduce((n, list) => n + list.length, 0),
});
// why: S9, S10 — the rest of the same gesture calls no handler and changes nothing
function rest(o: Open) {
  const before = counts(o);
  expect(() => {
    window.dispatchEvent(mouse("mousemove", 300, 1));
    frames(3);
    window.dispatchEvent(mouse("mouseup", 300, 0));
    frames(3);
  }).not.toThrow();
  expect(counts(o)).toEqual(before);
}
// why: Security build items 1 (round 2 and 3) — our listeners on `window` and `document`
function listeners() {
  const spies = [window, document].flatMap((target) => [
    vi.spyOn(target, "addEventListener"),
    vi.spyOn(target, "removeEventListener"),
  ]);
  return (types: string[]) => {
    let net = 0;
    spies.forEach((s, i) => {
      for (const [type] of s.mock.calls)
        if (types.includes(type)) net += i % 2 === 0 ? 1 : -1;
    });
    return net;
  };
}
const OURS = ["blur", "visibilitychange"];
// why: d3-selection keeps the listeners of an element in `__on`; S10 checks the `.drag` names
const dragListeners = (nodes: Element[]) =>
  nodes.flatMap((g) =>
    ((g as unknown as { __on?: { name: string }[] }).__on ?? []).filter(
      (on) => on.name === "drag",
    ),
  );

afterEach(() => {
  vi.advanceTimersByTime(3000);
  spy.failStep = false;
  spy.failRelease = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  Reflect.deleteProperty(document, "hidden");
  document.body.replaceChildren();
});

const STUCK: [string, (o: Open) => void][] = [
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
    () => window.dispatchEvent(mouse("mousemove", 170, 0)),
  ],
];

describe("S9 stuck drags end at once (controller)", () => {
  it.each(STUCK)(
    "%s: one drag-end with the release state, then settle; the rest calls nothing",
    async (_n, end) => {
      const o = await open();
      const reference = dragOn(o);
      end(o);
      const r = reference();
      expect(o.log["drag-end"]).toHaveLength(1);
      expect(o.log["drag-end"][0].state).toEqual(r.state);
      expect(last(o.log.settle).state).toEqual(r.state);
      rest(o);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("a touchcancel: one drag-end, the release at once; the rest calls nothing", async () => {
    const o = await open();
    const steps = spy.steps;
    el(o, "e:u_0").dispatchEvent(touch("touchstart", 100));
    el(o, "e:u_0").dispatchEvent(touch("touchmove", 160));
    frames(3);
    expect(spy.steps - steps).toBe(3);
    el(o, "e:u_0").dispatchEvent(touch("touchcancel", 160));
    expect(o.log["drag-end"]).toHaveLength(1);
    expect(last(o.log.settle).state).toEqual(o.log["drag-end"][0].state);
    el(o, "e:u_0").dispatchEvent(touch("touchmove", 200));
    vi.advanceTimersByTime(500);
    rest(o);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("20 press-move-release cycles leave 0 of our listeners and 0 timers", async () => {
    const o = await open();
    const net = listeners();
    for (let i = 0; i < 20; i++) {
      dragOn(o, i % 2 === 0 ? "e:u_0" : "e:u_7");
      window.dispatchEvent(mouse("mouseup", 160, 0));
      vi.advanceTimersByTime(1000);
    }
    expect(o.log["drag-end"]).toHaveLength(20);
    expect(net(OURS)).toBe(0);
    expect(net(["mousemove", "mouseup", "dragstart", "click"])).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a drag.frame throw: the timer stops, one drag-end, one error notice", async () => {
    const o = await open();
    spy.failStep = true;
    dragOn(o);
    expect(o.log.notice).toEqual([{ kind: "error" }]);
    expect(o.log["drag-end"]).toHaveLength(1);
    expect(spy.releases).toBeGreaterThan(0);
    rest(o);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a drag.end throw: no second release call, 0 timers, one error notice", async () => {
    const o = await open();
    dragOn(o);
    spy.failRelease = true;
    const releases = spy.releases;
    window.dispatchEvent(mouse("mouseup", 160, 0));
    expect(spy.releases - releases).toBe(1);
    expect(o.log.notice).toEqual([{ kind: "error" }]);
    expect(o.log["drag-end"]).toHaveLength(0);
    frames(5);
    expect(spy.releases - releases).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("S10 the end of the renderer drops a drag (H8)", () => {
  // why: the third value is the count of listeners that the end adds: a new canvas adds its own
  // `visibilitychange` listener for the pulse and the motion (STORY-003-05)
  const ENDS: [string, (o: Open) => void, number][] = [
    ["the root leaves the page", (o) => o.div.remove(), 0],
    ["a new canvas on the same container", (o) => void open(o.div), 1],
  ];

  it.each(ENDS)(
    "%s during a drag: no handler call, no drag-end, 0 timers, no .drag listener",
    async (_n, end, added) => {
      const o = await open();
      const net = listeners();
      dragOn(o);
      expect(net(OURS)).toBe(2);
      const nodes = [...o.div.querySelectorAll("g.qt-node")];
      end(o);
      const before = { steps: spy.steps, releases: spy.releases };
      rest(o);
      expect({ steps: spy.steps, releases: spy.releases }).toEqual(before);
      expect(o.log["drag-end"]).toHaveLength(0);
      expect(net(["blur"])).toBe(0);
      expect(net(OURS)).toBe(added);
      expect(dragListeners(nodes)).toEqual([]);
      vi.advanceTimersByTime(1000);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("the root leaves the page during a playback: no settle, 0 timers, no throw", async () => {
    const o = await open();
    expect(
      dragListeners([...o.div.querySelectorAll("g.qt-node")]).length,
    ).toBeGreaterThan(0);
    dragOn(o);
    window.dispatchEvent(mouse("mouseup", 160, 0));
    frames(2);
    const settles = o.log.settle.length;
    const nodes = [...o.div.querySelectorAll("g.qt-node")];
    o.div.remove();
    expect(() => frames(10)).not.toThrow();
    expect(o.log.settle).toHaveLength(settles);
    expect(o.log["drag-end"]).toHaveLength(1);
    expect(dragListeners(nodes)).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
