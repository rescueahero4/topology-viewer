// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState, Hex, Point } from "#engine";
import type { BubbleHandlers, Motion, Renderer } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through mocks; production code has no test hook. They count the layout runs, take
// the `bubble` handlers that the controller gives to `createRenderer` (S27, as
// `drag-fixtures.test.ts:27-39`), and record each draw with the DOM positions of the first `move`
const spy = vi.hoisted(() => ({
  layouts: 0,
  bubble: null as BubbleHandlers | null,
  moves: [] as Point[],
  ends: 0,
  firstMove: null as Map<string, string | null> | null,
  kinds: [] as string[],
  div: null as Element | null,
}));
vi.mock("#engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#engine")>();
  return {
    ...mod,
    setLayout: (...args: Parameters<typeof mod.setLayout>) => {
      spy.layouts++;
      return mod.setLayout(...args);
    },
  };
});
vi.mock("#renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const real = args[1].bubble as BubbleHandlers;
      spy.bubble = real;
      const bubble: BubbleHandlers = {
        start: (type) => real.start(type),
        move(type, v) {
          spy.firstMove ??= new Map(
            [...(spy.div?.querySelectorAll("g.qt-node") ?? [])].map((g) => [
              (g as unknown as { __data__: { id: string } }).__data__.id,
              g.getAttribute("transform"),
            ]),
          );
          spy.moves.push(v);
          return real.move(type, v);
        },
        end: () => {
          spy.ends++;
          real.end();
        },
      };
      const r = mod.createRenderer(args[0], { ...args[1], bubble });
      return {
        ...r,
        draw: (scene, motion) => {
          spy.kinds.push((motion as Motion | undefined)?.kind ?? "none");
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
const engine = await import("#engine");
const { profile } = await import("#contract");
const { loadFixture } = await import("#fixtures");
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

function modelOf(): CanvasModel {
  const r = engine.normalize(loadFixture("s-designed").input, {
    now: "2026-10-19",
  });
  if (!r.ok) throw new Error("fatal");
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, LIGHT);
  return { ...r, vocab, canvas: LIGHT };
}

type Log = { [K in keyof CanvasEvent]: CanvasEvent[K][] };
// why: S1 — `s-designed`, `setLayout("bubbles")` from the Force first view, run to its end
async function open() {
  const model = modelOf();
  const div = document.createElement("div");
  document.body.appendChild(div);
  spy.div = div;
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
  canvas.setLayout("bubbles");
  vi.advanceTimersByTime(3000);
  const last = () => log.settle[log.settle.length - 1];
  const k = last().camera.k;
  const front = () => engine.frontier(last().state, model.graph, model.vocab);
  spy.layouts = 0;
  spy.moves = [];
  spy.ends = 0;
  spy.firstMove = null;
  spy.kinds = [];
  return { div, canvas, model, log, last, k, front };
}
type Open = Awaited<ReturnType<typeof open>>;

const mouse = (type: string, x: number, buttons = 1) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 300,
    buttons,
  });
  // why: STORY-003-06a decisions item 1 — the test gives `view` as an own property
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
const pill = (o: Open, type: string) =>
  [...o.div.querySelectorAll("g.qt-blabel")].find(
    (g) => datum<{ type: string }>(g).type === type,
  ) as Element;
const nodeEl = (o: Open, id: string) =>
  [...o.div.querySelectorAll("g.qt-node")].find(
    (g) => datum<{ id: string }>(g).id === id,
  ) as Element;
const frame = () => vi.advanceTimersByTime(16);
const classes = (o: Open) => [
  o.div.firstElementChild?.classList.contains("qt-bdragging"),
  o.div.querySelectorAll(".qt-bdrag").length,
];

// why: S4 — `n` client moves of 10 · k px, one frame after each; the vectors in the renderer
// float form `D(c_n, t) − D(c_(n−1), t)` with `D = (c − c0) / t.k` (as drag-fixtures.test.ts:202)
function pillDrag(o: Open, type: string, n: number, x0 = 100): Point[] {
  const vectors: Point[] = [];
  const d = (c: number) => (c - x0) / o.k;
  pill(o, type).dispatchEvent(mouse("mousedown", x0));
  for (let i = 1; i <= n; i++) {
    const c = x0 + 10 * o.k * i;
    window.dispatchEvent(mouse("mousemove", c));
    frame();
    vectors.push({ x: d(c) - d(x0 + 10 * o.k * (i - 1)), y: 0 });
  }
  return vectors;
}
const chained = (o: Open, s: CanvasState, type: string, vs: Point[]) =>
  vs.reduce((state, v) => engine.dragBubble(state, o.front(), type, v), s);

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("S4 a supplier pill drag", () => {
  it("moves the 2 supplier members by (100, 0) and nothing else; one drag-end of 10 chained dragBubble", async () => {
    const o = await open();
    const s0 = o.last().state;
    const centre = () => {
      const c = o.div.querySelectorAll("g.qt-bubble circle")[1];
      return [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))];
    };
    const [cx, cy] = centre();
    const vectors = pillDrag(o, "supplier", 10);
    expect(classes(o)).toEqual([true, 1]);
    window.dispatchEvent(mouse("mouseup", 100 + 100 * o.k, 0));
    expect(classes(o)).toEqual([false, 0]);
    expect(spy.moves).toEqual(vectors);
    expect(o.log["drag-end"]).toHaveLength(1);
    const end = o.log["drag-end"][0].state;
    expect(end).toEqual(chained(o, s0, "supplier", vectors));
    const before = new Map(s0.positions);
    const supplier = o
      .front()
      .nodes.filter((n) => n.type === "supplier")
      .map((n) => n.id);
    expect(supplier).toHaveLength(2);
    for (const [id, p] of end.positions) {
      const b = before.get(id) as Point;
      if (supplier.includes(id)) {
        expect(Math.abs(p.x - b.x - 100)).toBeLessThan(1e-9);
        expect(p.y).toBe(b.y);
      } else expect(p).toEqual(b);
    }
    const [x, y] = centre();
    expect([Math.abs(x - cx - 100) < 1e-9, Math.abs(y - cy) < 1e-9]).toEqual([
      true,
      true,
    ]);
    expect(spy.layouts).toBe(0);
  });

  it("a press on the pill with no move: no move, no end, no drag-end, no select, no change", async () => {
    const o = await open();
    const dom = o.div.innerHTML;
    const selects = o.log.select.length;
    const p = pill(o, "supplier");
    p.dispatchEvent(mouse("mousedown", 100));
    p.dispatchEvent(mouse("mouseup", 100, 0));
    p.dispatchEvent(mouse("click", 100, 0));
    vi.advanceTimersByTime(100);
    expect([
      spy.moves.length,
      o.log["drag-end"].length,
      o.log.select.length,
    ]).toEqual([0, 0, selects]);
    expect(o.div.innerHTML).toBe(dom);
  });
});

describe("S14 (a) the renderer root leaves the page during a pill drag", () => {
  it("calls no move or end, no drag-end, 0 timers, no throw", async () => {
    const o = await open();
    pillDrag(o, "supplier", 3);
    const moves = spy.moves.length;
    o.div.remove();
    expect(() => {
      window.dispatchEvent(mouse("mousemove", 400));
      frame();
      window.dispatchEvent(mouse("mouseup", 400, 0));
    }).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(spy.moves).toHaveLength(moves);
    expect(spy.ends).toBe(0);
    expect(o.log["drag-end"]).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("S22 a pill drag start during an expand motion", () => {
  it("jumps the motion to its end and hides the tooltip before the first move", async () => {
    const o = await open();
    o.canvas.expand("e:sup_cell");
    const after = o.log.explore[0].state;
    vi.advanceTimersByTime(230);
    nodeEl(o, "e:sup_cell").dispatchEvent(
      new MouseEvent("mouseenter", { clientX: 10, clientY: 10 }),
    );
    expect(o.div.querySelector(".qt-tip")?.classList.contains("qt-on")).toBe(
      true,
    );
    const vectors = pillDrag(o, "supplier", 1);
    expect(o.div.querySelector(".qt-tip")?.classList.contains("qt-on")).toBe(
      false,
    );
    const end = new Map(after.positions);
    for (const [id, t] of spy.firstMove ?? []) {
      const p = end.get(id) as Point;
      expect(t).toBe(`translate(${p.x},${p.y})`);
    }
    window.dispatchEvent(mouse("mouseup", 100 + 10 * o.k, 0));
    expect(o.log["drag-end"]).toHaveLength(1);
    const view = engine.frontier(after, o.model.graph, o.model.vocab);
    expect(o.log["drag-end"][0].state).toEqual(
      engine.dragBubble(after, view, "supplier", vectors[0]),
    );
  });
});

const CALLS: [string, (o: Open) => void][] = [
  ["expand(e:sup_cell)", (o) => o.canvas.expand("e:sup_cell")],
  ['setLayout("force")', (o) => o.canvas.setLayout("force")],
  [
    "a click on e:reg_eu_battery",
    (o) => nodeEl(o, "e:reg_eu_battery").dispatchEvent(mouse("click", 0, 0)),
  ],
];

describe("S24 every call first ends a pill drag", () => {
  it.each(CALLS)(
    "%s: one drag-end of 3 chained dragBubble, then the call on that state",
    async (name, call) => {
      const o = await open();
      const s0 = o.last().state;
      const vectors = pillDrag(o, "supplier", 3);
      call(o);
      expect(o.log["drag-end"]).toHaveLength(1);
      const ended = o.log["drag-end"][0].state;
      expect(ended).toEqual(chained(o, s0, "supplier", vectors));
      vi.advanceTimersByTime(3000);
      const moves = spy.moves.length;
      window.dispatchEvent(mouse("mousemove", 600));
      frame();
      window.dispatchEvent(mouse("mouseup", 600, 0));
      expect(spy.moves).toHaveLength(moves);
      expect(o.log["drag-end"]).toHaveLength(1);
      if (name.startsWith("expand")) {
        const at = new Map(o.last().state.positions);
        for (const [id, p] of ended.positions) expect(at.get(id)).toEqual(p);
      }
      if (name.startsWith("a click"))
        expect(o.last().state.selection).toEqual({ node: "e:reg_eu_battery" });
    },
  );
});

describe("S27 the controller start of a pill drag", () => {
  it("(a) false for a type with no shown member, true for product; no drag-end", async () => {
    const o = await open();
    o.canvas.select("e:reg_eu_battery");
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    expect(spy.bubble?.start("supplier")).toBe(false);
    expect(spy.bubble?.start("product")).toBe(true);
    expect(o.log["drag-end"]).toHaveLength(0);
  });

  it("(b) a pill press during the glide of an exit puts the last step in the DOM first", async () => {
    const o = await open();
    o.canvas.select("e:reg_eu_battery");
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    spy.kinds = [];
    o.canvas.setFilters({ kind: "toggleType", type: "factory", on: false });
    for (let i = 0; i < 6; i++) frame();
    expect(spy.kinds).toEqual(["local"]);
    pillDrag(o, "product", 1);
    expect(spy.kinds).toEqual(["local", "none"]);
    expect(spy.moves).toHaveLength(1);
    window.dispatchEvent(mouse("mouseup", 100 + 10 * o.k, 0));
  });
});
