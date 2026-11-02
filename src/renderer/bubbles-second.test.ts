// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { DrawnId, Hex, Point } from "#engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BubbleHandlers,
  Camera,
  DragHandlers,
  RendererText,
  Scene,
  SceneNode,
} from "./index";

// why: QA R2 — `d3-timer` runs all its timers on one shared frame and one poke interval, so the
// fake-timer count is 2 for one running timer and for more; a pass-through mock counts the
// running timers (`timer()` calls less `stop()` calls)
const spy = vi.hoisted(() => ({ running: 0 }));
vi.mock("d3-timer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("d3-timer")>();
  return {
    ...mod,
    timer: (...args: Parameters<typeof mod.timer>) => {
      const t = mod.timer(...args);
      const stop = t.stop.bind(t);
      let on = true;
      spy.running++;
      t.stop = () => {
        if (on) spy.running--;
        on = false;
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
const { createRenderer } = await import("./index");

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

// why: the setup of `bubbles-press.test.ts` with the release steps of S29 (d) and the settles
const TEXT = {
  canvasName: "Topology canvas",
  bubbleCount: (n: number) => ` · ${n}`,
} as RendererText;
const CAMERA: Camera = { k: 1, x: 0, y: 0 };
const node = (id: string, x: number, type: string): SceneNode => ({
  id,
  kind: "entity",
  type,
  label: "n",
  fullLabel: "n",
  typeLabel: "T",
  sub: "T",
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
  lost: false,
  group: null,
  room: 30,
  x,
  y: 0,
});
const SCENE: Scene = {
  nodes: [node("e:a", 0, "t"), node("e:b", 60, "t"), node("e:n", 300, "u")],
  edges: [],
  selection: { node: null, edge: null },
  layout: "bubbles",
  types: [
    ["t", { label: "T", colour: "#5b6b8c" as Hex }],
    ["u", { label: "U", colour: "#3f7a5a" as Hex }],
  ],
};

type Positions = [DrawnId, Point][];
function mount(steps: Positions[] = []) {
  const calls = {
    start: [] as (string | null)[],
    move: [] as Point[],
    end: 0,
    dstart: 0,
    dframe: 0,
    dend: 0,
  };
  let at: Positions = [
    ["e:a", { x: 0, y: 0 }],
    ["e:b", { x: 60, y: 0 }],
  ];
  const bubble: BubbleHandlers = {
    start: (type) => (calls.start.push(type), true),
    move(_type, v) {
      calls.move.push(v);
      at = at.map(([id, p]) => [id, { x: p.x + v.x, y: p.y + v.y }]);
      return at;
    },
    end: () => void calls.end++,
  };
  const drag: DragHandlers = {
    start: () => (calls.dstart++, true),
    frame: (p) => (calls.dframe++, [["e:n", p]]),
    end: () => (calls.dend++, steps),
  };
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, {
    text: TEXT,
    camera: CAMERA,
    drag,
    bubble,
  });
  const settles: Camera[] = [];
  renderer.onSettle((c) => settles.push(c));
  renderer.draw(SCENE);
  return { div, renderer, calls, settles };
}
type Mounted = ReturnType<typeof mount>;

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
const touch = (type: string, id: number, x: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  // why: jsdom has no `Touch` constructor; `d3-drag` reads only these fields
  const changedTouches = [{ identifier: id, clientX: x, clientY: 300 }];
  Object.defineProperty(event, "changedTouches", { value: changedTouches });
  return event;
};
const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
const pill = (m: Mounted, type = "t") =>
  [...m.div.querySelectorAll("g.qt-blabel")].find(
    (g) => datum<{ type: string }>(g).type === type,
  ) as Element;
const nodeEl = (m: Mounted, id: string) =>
  [...m.div.querySelectorAll("g.qt-node")].find(
    (g) => datum<SceneNode>(g).id === id,
  ) as Element;
const frames = (n = 1) => vi.advanceTimersByTime(16 * n);
const move = (x: number, buttons = 1) =>
  window.dispatchEvent(mouse("mousemove", x, buttons));
const up = (x: number) => window.dispatchEvent(mouse("mouseup", x, 0));
const viewport = (m: Mounted) =>
  m.div.querySelector("g.qt-viewport")?.getAttribute("transform");

// why: a pill drag of `n` frames of (10, 0) (camera identity, so 10 client px each)
function pillDrag(m: Mounted, n: number, x0 = 400) {
  pill(m).dispatchEvent(mouse("mousedown", x0));
  for (let i = 1; i <= n; i++) {
    move(x0 + 10 * i);
    frames();
  }
}

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
  // why: H8 — this ends the renderer of the test at once (its next listener call)
  document.dispatchEvent(new Event("visibilitychange"));
  spy.running = 0;
});

describe("S29 a second press during a running drag", () => {
  const second: [
    string,
    (m: Mounted) => void,
    (m: Mounted) => void,
    "pill" | "node",
  ][] = [
    [
      "(a) a node press during a pill drag",
      (m) => pillDrag(m, 2),
      (m) => nodeEl(m, "e:n").dispatchEvent(mouse("mousedown", 500)),
      "pill",
    ],
    [
      "(b) a pill press during a node drag",
      (m) => {
        nodeEl(m, "e:n").dispatchEvent(mouse("mousedown", 400));
        for (const x of [410, 420]) {
          move(x);
          frames();
        }
      },
      (m) => pill(m).dispatchEvent(mouse("mousedown", 500)),
      "node",
    ],
    [
      "(c) a second press on the same pill",
      (m) => pillDrag(m, 2),
      (m) => pill(m).dispatchEvent(mouse("mousedown", 500)),
      "pill",
    ],
  ];
  it.each(second)(
    "%s is ignored; the first drag goes on with 1 running timer; the camera does not move",
    (_n, first, press, kind) => {
      const m = mount();
      first(m);
      expect(spy.running).toBe(1);
      const t = viewport(m);
      const calls = () =>
        kind === "pill" ? m.calls.move.length : m.calls.dframe;
      const before = calls();
      press(m);
      expect(viewport(m)).toBe(t);
      move(440);
      frames();
      expect(spy.running).toBe(1);
      move(450);
      frames();
      expect(calls()).toBe(before + 2);
      up(450);
      expect(viewport(m)).toBe(t);
      move(500, 0);
      expect(viewport(m)).toBe(t);
      expect([m.calls.start.length, m.calls.dstart]).toEqual(
        kind === "pill" ? [1, 0] : [0, 1],
      );
      expect([m.calls.end, m.calls.dend]).toEqual(
        kind === "pill" ? [1, 0] : [0, 1],
      );
      expect(spy.running).toBe(0);
    },
  );

  it("(d) a pill press during a release playback jumps it to its end, then the pill drag runs", () => {
    const steps: Positions[] = [1, 2, 3].map((i) => [
      ["e:n", { x: 300 + i, y: i }],
    ]);
    const m = mount(steps);
    nodeEl(m, "e:n").dispatchEvent(mouse("mousedown", 400));
    move(410);
    frames();
    up(410);
    frames();
    pill(m).dispatchEvent(mouse("mousedown", 500));
    move(510);
    expect(nodeEl(m, "e:n").getAttribute("transform")).toBe("translate(303,3)");
    expect(m.calls.move).toHaveLength(0);
    expect(spy.running).toBe(1);
    frames();
    move(520);
    frames();
    expect(m.calls.start).toEqual(["t"]);
    expect(m.calls.move).toHaveLength(2);
    up(520);
    expect(spy.running).toBe(0);
  });

  // why: closing-check note (3) — the timers are read before the `touchend`, each `touchend` goes
  // on its own element, `maxTouchPoints` is stubbed before the mount
  const TOUCHES: [string, "node" | "pill", [number, number, number, number]][] =
    [
      ["(e) the node touch moves first", "node", [1, 0, 0, 1]],
      ["(e2, QA R1) the pill touch moves first", "pill", [0, 1, 1, 0]],
    ];
  it.each(TOUCHES)(
    "%s: only that drag starts, 1 running timer, one end",
    (_n, first, want) => {
      vi.stubGlobal("navigator", { ...navigator, maxTouchPoints: 1 });
      const m = mount();
      const n = nodeEl(m, "e:n");
      const p = pill(m);
      n.dispatchEvent(touch("touchstart", 1, 400));
      p.dispatchEvent(touch("touchstart", 2, 600));
      const moves: [Element, number, number][] = [
        [n, 1, 410],
        [p, 2, 610],
      ];
      if (first === "pill") moves.reverse();
      for (const [el, id, x] of moves) {
        el.dispatchEvent(touch("touchmove", id, x));
        frames();
        expect(spy.running).toBe(1);
      }
      n.dispatchEvent(touch("touchend", 1, 410));
      p.dispatchEvent(touch("touchend", 2, 610));
      expect([
        m.calls.dstart,
        m.calls.start.length,
        m.calls.end,
        m.calls.dend,
      ]).toEqual(want);
    },
  );
});

describe("QA R4: a running pill drag blocks the settle (story line 51)", () => {
  it("a wheel gesture that ends during a pill drag gives no settle before the mouseup", () => {
    const m = mount();
    const settles = m.settles.length;
    pillDrag(m, 2);
    m.div
      .querySelector("svg")
      ?.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -100, cancelable: true }),
      );
    frames(20);
    expect(m.calls.move.length).toBeGreaterThan(2);
    expect(m.settles).toHaveLength(settles);
    up(420);
    expect(m.settles).toHaveLength(settles + 1);
  });
});
