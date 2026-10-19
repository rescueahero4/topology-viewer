// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { DrawnId, Hex, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Camera,
  DragHandlers,
  Intent,
  RendererText,
  Report,
  Scene,
  SceneEdge,
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
const { edgePath } = await import("./edges");

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

const TEXT = { canvasName: "Topology canvas" } as RendererText;
const CAMERA: Camera = { k: 2, x: 400, y: 300 };

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
const EDGE: SceneEdge = {
  key: JSON.stringify(["e:a", "p", "e:b"]),
  subject: "e:a",
  object: "e:b",
  label: "p",
  colour: "#2e9d6a" as Hex,
  muted: false,
  structure: false,
  dashed: false,
  count: 1,
};
const SCENE: Scene = {
  nodes: [node("e:a", 0, 0), node("e:b", 100, 0)],
  edges: [EDGE],
  selection: { node: "e:a", edge: null },
  layout: "force",
};

type Positions = [DrawnId, Point][];
const stub = (
  frames: (i: number, p: Point) => Positions,
  steps: Positions[],
) => {
  const calls = { start: [] as string[], frame: [] as Point[], end: 0 };
  const handlers: DragHandlers = {
    start: (id) => (calls.start.push(id), true),
    frame: (p) => (calls.frame.push(p), frames(calls.frame.length, p)),
    end: () => (calls.end++, steps),
  };
  return { calls, handlers };
};

function mount(handlers: DragHandlers) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, {
    text: TEXT,
    camera: CAMERA,
    drag: handlers,
  });
  const intents: Intent[] = [];
  const reports: Report[] = [];
  const settles: Camera[] = [];
  renderer.onIntent((i) => intents.push(i));
  renderer.onReport((r) => reports.push(r));
  renderer.onSettle((c) => settles.push(c));
  renderer.draw(SCENE);
  return { div, renderer, intents, reports, settles };
}

const mouse = (type: string, x: number, y: number, buttons = 1) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons,
  });
  // why: QA round 2 (c) — `d3-drag` adds its listeners on `event.view`; the jsdom of Vitest refuses
  // the test `window` as `view` in the constructor, so the test gives it as an own property
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
const el = (div: HTMLElement, id: string) =>
  [...div.querySelectorAll("g.qt-node")].find(
    (g) => datum<SceneNode>(g).id === id,
  ) as Element;
const press = (div: HTMLElement, id = "e:a", x = 10, y = 10) =>
  el(div, id).dispatchEvent(mouse("mousedown", x, y));
const move = (x: number, y = 10, buttons = 1) =>
  window.dispatchEvent(mouse("mousemove", x, y, buttons));
const up = (x = 0, y = 10) => window.dispatchEvent(mouse("mouseup", x, y, 0));
const frames = (n = 1) => vi.advanceTimersByTime(16 * n);
const attr = (div: HTMLElement, sel: string, name: string) =>
  div.querySelector(sel)?.getAttribute(name) ?? null;
const translate = (p: Point) => `translate(${p.x},${p.y})`;

// why: S2 — every frame write: the node transforms, the edge `d`, the hit-path `d`, the halo and
// the pill follow the positions
function expectAt(div: HTMLElement, a: Point, b: Point) {
  expect(el(div, "e:a").getAttribute("transform")).toBe(translate(a));
  expect(el(div, "e:b").getAttribute("transform")).toBe(translate(b));
  const d = edgePath(
    EDGE,
    { ...SCENE.nodes[0], ...a },
    { ...SCENE.nodes[1], ...b },
    "force",
  );
  expect(attr(div, "path.qt-edge", "d")).toBe(d);
  expect(attr(div, "path.qt-ehit", "d")).toBe(d);
  expect(attr(div, "g.qt-focus", "transform")).toBe(translate(a));
  const mid = `translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2}) scale(0.5)`;
  expect(attr(div, "g.qt-elabel", "transform")).toBe(mid);
}

const A = (i: number): Point => ({ x: 30 + i, y: i });
const B = (i: number): Point => ({ x: 100 + 2 * i, y: -i });
const FRAMES = (i: number): Positions => [
  ["e:a", A(i)],
  ["e:b", B(i)],
];
const STEPS: Positions[] = [1, 2, 3, 4, 5].map((s) => FRAMES(100 + s));

afterEach(() => {
  vi.advanceTimersByTime(1000);
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

describe("S1 a press with no move is a click", () => {
  it("gives one select intent, no drag.start call and no position change", () => {
    const s = stub(FRAMES, STEPS);
    const m = mount(s.handlers);
    press(m.div);
    el(m.div, "e:a").dispatchEvent(mouse("mouseup", 10, 10, 0));
    el(m.div, "e:a").dispatchEvent(mouse("click", 10, 10, 0));
    frames(5);
    expect(m.intents).toEqual([{ kind: "select", node: "e:a" }]);
    expect(s.calls.start).toEqual([]);
    expect(s.calls.frame).toEqual([]);
    expect(el(m.div, "e:a").getAttribute("transform")).toBe("translate(0,0)");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("S2 frames, writes and the release playback", () => {
  it("one start at the first move, one frame call per frame, 5 steps one per frame, one settle", () => {
    const s = stub(FRAMES, STEPS);
    const m = mount(s.handlers);
    press(m.div);
    move(10);
    expect(s.calls.start).toEqual([]);
    move(30);
    expect(s.calls.start).toEqual(["e:a"]);
    move(50);
    move(70);
    expect(s.calls.frame).toEqual([]);
    for (let i = 1; i <= 11; i++) {
      frames();
      expect(s.calls.frame).toHaveLength(i);
      expectAt(m.div, A(i), B(i));
    }
    // why: QA round 3 (iv) — the pointer of each frame: start + last client move / k (k = 2)
    expect(s.calls.frame.every((p) => p.x === 0 + 60 / 2 && p.y === 0)).toBe(
      true,
    );
    expect(m.intents).toEqual([]);
    up(70);
    expect(s.calls.end).toBe(1);
    expect(m.settles).toHaveLength(1);
    for (let i = 1; i <= 5; i++) {
      const before = i === 1 ? 11 : 99 + i;
      expectAt(m.div, A(before), B(before));
      frames();
      expectAt(m.div, A(100 + i), B(100 + i));
      expect(m.settles).toHaveLength(i === 5 ? 2 : 1);
    }
    expect(s.calls.frame).toHaveLength(11);
    frames(3);
    expect(m.settles).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  const INSTANT: [string, () => void][] = [
    [
      "a hidden document",
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
  it.each(INSTANT)(
    "under %s the frames run and the steps play at once, before mouseup returns",
    (_n, set) => {
      const s = stub(FRAMES, STEPS);
      const m = mount(s.handlers);
      set();
      press(m.div);
      move(70);
      frames(3);
      expect(s.calls.frame).toHaveLength(3);
      expectAt(m.div, A(3), B(3));
      up(70);
      expectAt(m.div, A(105), B(105));
      expect(m.settles).toHaveLength(2);
      frames();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("other run: a position that is not finite is not written; the node keeps its last finite transform", () => {
    const bad = (i: number): Positions => [
      ["e:a", A(i)],
      [
        "e:b",
        i === 3 ? { x: NaN, y: 5 } : i === 4 ? { x: Infinity, y: 0 } : B(i),
      ],
    ];
    const s = stub(bad, STEPS);
    const m = mount(s.handlers);
    press(m.div);
    move(70);
    expect(() => frames(4)).not.toThrow();
    expectAt(m.div, A(4), B(2));
    const all = [...m.div.querySelectorAll("*")].flatMap((e) =>
      [...e.attributes].map((a) => a.value),
    );
    expect(all.some((v) => /NaN|Infinity/.test(v))).toBe(false);
    frames();
    expectAt(m.div, A(5), B(5));
    expect(m.reports).toEqual([]);
  });

  it("QA round 3 (i): a hidden document at step 2 of 5 jumps to step 5 at once with one settle", () => {
    const s = stub(FRAMES, STEPS);
    const m = mount(s.handlers);
    press(m.div);
    move(70);
    frames();
    up(70);
    frames(2);
    expectAt(m.div, A(102), B(102));
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expectAt(m.div, A(105), B(105));
    expect(m.settles).toHaveLength(2);
    frames(5);
    expect(m.settles).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("endDrag()", () => {
  it("ends a running drag with one drag.end call, writes the last step at once and gives no settle", () => {
    const s = stub(FRAMES, STEPS);
    const m = mount(s.handlers);
    press(m.div);
    move(70);
    frames(2);
    m.renderer.endDrag();
    expect(s.calls.end).toBe(1);
    expectAt(m.div, A(105), B(105));
    move(90);
    frames(3);
    up(90);
    m.renderer.endDrag();
    expect(s.calls.frame).toHaveLength(2);
    expect(s.calls.end).toBe(1);
    expect(m.settles).toHaveLength(1);
    frames();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("jumps a running playback to its end with no settle (TL-10)", () => {
    const s = stub(FRAMES, STEPS);
    const m = mount(s.handlers);
    press(m.div);
    move(70);
    frames();
    up(70);
    frames(2);
    m.renderer.endDrag();
    expectAt(m.div, A(105), B(105));
    frames(5);
    expect(m.settles).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a draw inside drag.end wins over the steps (Implementer round 2 (e))", () => {
    let m: ReturnType<typeof mount> | null = null;
    const moved = { ...SCENE, nodes: [node("e:a", 7, 7), node("e:b", 8, 8)] };
    const handlers: DragHandlers = {
      start: () => true,
      frame: (p) => [["e:a", p]],
      end: () => (m?.renderer.draw(moved), STEPS),
    };
    m = mount(handlers);
    press(m.div);
    move(70);
    frames();
    up(70);
    frames(6);
    expect(el(m.div, "e:a").getAttribute("transform")).toBe("translate(7,7)");
    expect(m.settles).toHaveLength(2);
  });
});
