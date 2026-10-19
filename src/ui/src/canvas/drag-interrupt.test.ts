// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type {
  CanvasState,
  DragCtx,
  DrawnId,
  Frontier,
  Hex,
  Point,
} from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent, CanvasModel } from "./index";

// why: pass-through mocks; production code has no test hook. They count the engine drag calls
const spy = vi.hoisted(() => ({ steps: 0, releases: 0 }));
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  return {
    ...mod,
    dragStep: (...args: Parameters<typeof mod.dragStep>) => {
      spy.steps++;
      return mod.dragStep(...args);
    },
    release: (...args: Parameters<typeof mod.release>) => {
      spy.releases++;
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
const { iconMetrics } = await import("@qdic-topology/renderer");
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
};
function modelOf(key: string): CanvasModel {
  const r = engine.normalize(loadFixture(key).input, { now: "2026-10-19" });
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
async function open(model: CanvasModel, state?: CanvasState) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model, state });
  const log: Log = {
    select: [],
    explore: [],
    "drag-end": [],
    settle: [],
    notice: [],
  };
  const states: CanvasState[] = [];
  for (const name of Object.keys(log) as (keyof CanvasEvent)[])
    canvas.on(name, (e) => {
      (log[name] as unknown[]).push(e);
      if ("state" in e) states.push(e.state);
    });
  await Promise.resolve();
  return { div, canvas, log, model, states };
}
type Open = Awaited<ReturnType<typeof open>>;
const last = <T>(list: T[]) => list[list.length - 1];
const now = (o: Open) => last(o.log.settle);
// why: the state of the newest event; a call that draws nothing gives no `settle`
const latest = (o: Open) => last(o.states);

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
const datumId = (g: Element) =>
  (g as unknown as { __data__: { id: string } }).__data__.id;
const el = (o: Open, id: string) =>
  [...o.div.querySelectorAll("g.qt-node")].find(
    (g) => datumId(g) === id,
  ) as Element;
const frames = (n = 1) => vi.advanceTimersByTime(16 * n);

// why: a press, one move of `dx` client px and 3 frames; the reference makes the same engine calls
function dragOn(o: Open, id: DrawnId, dx: number) {
  const { state, frontier, camera } = now(o);
  el(o, id).dispatchEvent(mouse("mousedown", 100, 1));
  window.dispatchEvent(mouse("mousemove", 100 + dx, 1));
  frames(3);
  return () => {
    const p0 = new Map(state.positions).get(id) as Point;
    const pointer = { x: p0.x + (100 + dx - 100) / camera.k, y: p0.y };
    let ctx = engine.beginDrag(state, frontier, id) as DragCtx;
    for (let i = 0; i < 3; i++) ctx = engine.dragStep(ctx, pointer).ctx;
    return engine.release(ctx);
  };
}
const counts = (o: Open) => ({
  steps: spy.steps,
  releases: spy.releases,
  events: Object.values(o.log).reduce((n, list) => n + list.length, 0),
});
// why: S6, S9 — the rest of the same gesture calls no handler and changes nothing
function rest(o: Open) {
  const before = counts(o);
  window.dispatchEvent(mouse("mousemove", 300, 1));
  frames(3);
  window.dispatchEvent(mouse("mouseup", 300, 0));
  frames(3);
  expect(counts(o)).toEqual(before);
}

afterEach(() => {
  vi.advanceTimersByTime(3000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

describe("S5 an expand during a drag", () => {
  it("ends the drag first, then explores on the released state", async () => {
    const o = await open(modelOf("s-access"));
    const reference = dragOn(o, "e:u_0", 100 * now(o).camera.k);
    o.canvas.expand("e:t_FCT_REVENUE");
    const r = reference();
    expect(o.log["drag-end"]).toHaveLength(1);
    expect(o.log["drag-end"][0].state).toEqual(r.state);
    const { graph, vocab } = o.model;
    const action = { kind: "explore", id: "t_FCT_REVENUE" } as const;
    const next = engine.transition(r.state, action, graph, vocab);
    const before = engine.frontier(r.state, graph, vocab);
    const after = engine.frontier(next, graph, vocab);
    const placed = engine.place(
      next,
      { action, before, after },
      vocab,
      iconMetrics,
    );
    expect(last(o.log.explore).state).toEqual(placed.state);
    vi.advanceTimersByTime(3000);
    expect(now(o).state).toEqual(placed.state);
    rest(o);
  });
});

type Call = [string, (c: Canvas, o: Open, keys: string[], f: Frontier) => void];
const click = (o: Open, id: string) =>
  el(o, id).dispatchEvent(new MouseEvent("click", { bubbles: true }));
const CALLS: Call[] = [
  ["select", (c) => c.select("e:ug_analytics")],
  [
    "setFilters",
    (c) => c.setFilters({ kind: "toggleType", type: "user", on: false }),
  ],
  ["setLayout", (c) => c.setLayout("atomic")],
  ["hide", (c) => c.hide(["e:ug_fin_admin"])],
  ["restore", (c, _o, keys) => c.restore(keys)],
  ["reveal", (c) => c.reveal(["ds_snow"])],
  ["focus", (c) => c.focus("sc_MARTS")],
  ["collapse", (c) => c.collapse("e:ug_exec")],
  ["setBudget", (c) => c.setBudget(10)],
  ["resetView", (c) => c.resetView()],
  ["setApproach", (c) => c.setApproach("passive")],
  ["fit", (c) => c.fit()],
  ["setData", (c, _o, _k, f) => c.setData(f)],
  ["an intent (a click)", (_c, o) => click(o, "e:ug_analytics")],
];

// why: S6 — an opened node (for `collapse`) and a hidden node (for `restore`) before the drag; the
// hidden node is not on the path to `e:ug_exec`, so the expanded node stays drawn
async function setup() {
  const o = await open(modelOf("s-access"));
  o.canvas.expand("e:ug_exec");
  vi.advanceTimersByTime(3000);
  o.canvas.hide(["e:u_7"]);
  vi.advanceTimersByTime(3000);
  const { state, frontier } = now(o);
  const opened = frontier.nodes.find((n) => n.id === "e:ug_exec");
  expect(
    opened !== undefined && "opened" in opened && opened.opened,
  ).toBeTruthy();
  expect(state.hidden).toHaveLength(1);
  return { o, keys: state.hidden.map((h) => h.key), f: frontier };
}
// why: the reference: the same call on a canvas made with the committed state (H7)
async function referenceOf(
  state: CanvasState,
  call: Call[1],
  keys: string[],
  f: Frontier,
) {
  const b = await open(modelOf("s-access"), state);
  const settles = b.log.settle.length;
  call(b.canvas, b, keys, f);
  vi.advanceTimersByTime(3000);
  return { state: latest(b), settles: b.log.settle.length - settles };
}
// why: `fit` and `setData` change no state; each other call has its own effect
const STILL = ["fit", "setData"];

describe("S6 every other call ends a drag or jumps a playback first", () => {
  it.each(CALLS)("%s during a drag", async (name, call) => {
    const { o, keys, f } = await setup();
    const reference = dragOn(o, "e:u_0", 60);
    call(o.canvas, o, keys, f);
    const r = reference();
    expect(o.log["drag-end"]).toHaveLength(1);
    expect(o.log["drag-end"][0].state).toEqual(r.state);
    vi.advanceTimersByTime(3000);
    const want = await referenceOf(r.state, call, keys, f);
    expect(latest(o)).toEqual(want.state);
    if (STILL.includes(name)) expect(want.state).toEqual(r.state);
    else expect(want.state).not.toEqual(r.state);
    rest(o);
    expect(o.log["drag-end"]).toHaveLength(1);
    expect(latest(o)).toEqual(want.state);
  });

  it.each(CALLS)(
    "%s during a release playback: no settle for the jumped playback (TL-10)",
    async (_n, call) => {
      const { o, keys, f } = await setup();
      dragOn(o, "e:u_0", 60);
      window.dispatchEvent(mouse("mouseup", 160, 0));
      frames(2);
      const ended = o.log["drag-end"][0].state;
      const settles = o.log.settle.length;
      call(o.canvas, o, keys, f);
      vi.advanceTimersByTime(3000);
      const want = await referenceOf(ended, call, keys, f);
      expect(latest(o)).toEqual(want.state);
      expect(o.log.settle.length - settles).toBe(want.settles);
      expect(o.log["drag-end"]).toHaveLength(1);
    },
  );

  it("onCanvas and on(event, handler) do not end a drag or a playback", async () => {
    const { o } = await setup();
    dragOn(o, "e:u_0", 60);
    expect(o.canvas.onCanvas("u_0")).toBe("drawn");
    o.canvas.on("settle", () => {});
    const steps = spy.steps;
    frames(2);
    expect(spy.steps).toBe(steps + 2);
    expect(o.log["drag-end"]).toHaveLength(0);
    window.dispatchEvent(mouse("mouseup", 160, 0));
    const settles = o.log.settle.length;
    frames();
    o.canvas.onCanvas("u_0");
    vi.advanceTimersByTime(3000);
    expect(o.log["drag-end"]).toHaveLength(1);
    expect(o.log.settle.length).toBe(settles + 1);
  });
});
