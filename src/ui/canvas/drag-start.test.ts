// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type {
  CanvasState,
  DragCtx,
  DrawnId,
  Frontier,
  Hex,
  Point,
} from "#engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through mocks; production code has no test hook. They record the `beginDrag` calls and
// let a test read the DOM at the call (S7)
const spy = vi.hoisted(() => ({
  begin: [] as unknown[][],
  onBegin: null as (() => void) | null,
}));
vi.mock("#engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#engine")>();
  return {
    ...mod,
    beginDrag: (...args: Parameters<typeof mod.beginDrag>) => {
      spy.begin.push(args);
      spy.onBegin?.();
      return mod.beginDrag(...args);
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
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
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
  for (const name of Object.keys(log) as (keyof CanvasEvent)[])
    canvas.on(name, (e) => (log[name] as unknown[]).push(e));
  await Promise.resolve();
  return { div, canvas, log, model };
}
type Open = Awaited<ReturnType<typeof open>>;
const last = <T>(list: T[]) => list[list.length - 1];
const now = (o: Open) => last(o.log.settle);

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
function dom(o: Open): Map<DrawnId, Point> {
  return new Map(
    [...o.div.querySelectorAll("g.qt-node")].map((g) => {
      const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
        g.getAttribute("transform") ?? "",
      );
      return [datumId(g), { x: Number(m?.[1]), y: Number(m?.[2]) }];
    }),
  );
}
const drawnOf = (positions: [DrawnId, Point][], f: Frontier) => {
  const all = new Map(positions);
  return new Map(f.nodes.map((n) => [n.id, all.get(n.id) as Point]));
};
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

afterEach(() => {
  vi.advanceTimersByTime(3000);
  spy.begin = [];
  spy.onBegin = null;
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

describe("S7 a drag start jumps a motion or a playback to its end first", () => {
  it("a local motion at about 40 %: beginDrag gets the committed state, the DOM has its positions", async () => {
    const o = await open(modelOf("s-access"));
    o.canvas.expand("e:t_FCT_REVENUE");
    const committed = last(o.log.explore).state;
    const want = drawnOf(
      committed.positions,
      engine.frontier(committed, o.model.graph, o.model.vocab),
    );
    vi.advanceTimersByTime(300);
    expect(dom(o)).not.toEqual(want);
    let seen: Map<DrawnId, Point> | null = null;
    spy.onBegin = () => (seen = dom(o));
    dragOn(o, "e:u_7", 50);
    expect(spy.begin[0][0]).toEqual(committed);
    expect(seen).toEqual(want);
    expect(o.log.settle).toHaveLength(1);
  });

  it("other run: a playback at step 3 of 24: the DOM has step 24, no settle for it, then the new drag runs", async () => {
    const o = await open(modelOf("s-chain"));
    const { camera, frontier } = now(o);
    dragOn(o, "e:t0", 100 * camera.k);
    window.dispatchEvent(mouse("mouseup", 100, 0));
    const ended = o.log["drag-end"][0].state;
    frames(3);
    let seen: Map<DrawnId, Point> | null = null;
    spy.onBegin = () => (seen = dom(o));
    el(o, "e:t9").dispatchEvent(mouse("mousedown", 400, 1));
    window.dispatchEvent(mouse("mousemove", 420, 1));
    expect(seen).toEqual(drawnOf(ended.positions, frontier));
    expect(last(spy.begin)[0]).toEqual(ended);
    let ctx = engine.beginDrag(ended, frontier, "e:t9") as DragCtx;
    const p0 = new Map(ended.positions).get("e:t9") as Point;
    for (let i = 0; i < 4; i++) {
      const step = engine.dragStep(ctx, {
        x: p0.x + (420 - 400) / camera.k,
        y: p0.y,
      });
      ctx = step.ctx;
      frames();
      expect(dom(o)).toEqual(drawnOf(step.positions, frontier));
    }
    expect(o.log.settle).toHaveLength(1);
  });
});

describe("S8 faded node, second press, group node", () => {
  it("a faded node gives no drag and no drag-end", async () => {
    const model = modelOf("s-access");
    const plain = await open(model);
    const { state, frontier } = now(plain);
    const grouped = engine.groupAround(
      state,
      frontier,
      "e:t_FCT_REVENUE",
      iconMetrics,
    );
    expect(engine.fadeSet(grouped, frontier).map((f) => f.id)).toEqual([
      "e:ug_exec",
    ]);
    const o = await open(model, grouped);
    const before = dom(o);
    const calls = spy.begin.length;
    dragOn(o, "e:ug_exec", 80);
    window.dispatchEvent(mouse("mouseup", 180, 0));
    frames(3);
    expect(spy.begin).toHaveLength(calls);
    expect(o.log["drag-end"]).toHaveLength(0);
    expect(dom(o)).toEqual(before);
  });

  it("a second press during a drag is ignored", async () => {
    const o = await open(modelOf("s-access"));
    dragOn(o, "e:u_0", 60);
    el(o, "e:u_7").dispatchEvent(mouse("mousedown", 200, 1));
    window.dispatchEvent(mouse("mousemove", 230, 1));
    frames(2);
    window.dispatchEvent(mouse("mouseup", 230, 0));
    expect(spy.begin.map((args) => args[2])).toEqual(["e:u_0"]);
    expect(o.log["drag-end"]).toHaveLength(1);
  });

  it("a group node of s-star is dragged with the engine positions", async () => {
    const o = await open(modelOf("s-star"));
    const id = 'g:["tag_pii","taggedWith","<","table"]';
    const { state, frontier, camera } = now(o);
    const reference = dragOn(o, id, 40);
    expect(spy.begin.map((args) => args[2])).toEqual([id]);
    let ctx = engine.beginDrag(state, frontier, id) as DragCtx;
    const p0 = new Map(state.positions).get(id) as Point;
    const pointer = { x: p0.x + 40 / camera.k, y: p0.y };
    let positions = state.positions;
    for (let i = 0; i < 3; i++)
      ({ ctx, positions } = engine.dragStep(ctx, pointer));
    expect(dom(o)).toEqual(drawnOf(positions, frontier));
    window.dispatchEvent(mouse("mouseup", 140, 0));
    expect(o.log["drag-end"][0].state).toEqual(reference().state);
  });
});
