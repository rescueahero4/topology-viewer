// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { DrawnId, Hex, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BubbleHandlers,
  Camera,
  DragHandlers,
  RendererText,
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

// why: the setup of `bubbles-stuck.test.ts` with the two plants of S26 and S29 (`bad`, `steps`)
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
type Plant = { bad?: Point; steps?: Positions[] };
function mount(plant: Plant = {}) {
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
      return plant.bad === undefined ? at : [["e:a", plant.bad], at[1]];
    },
    end: () => void calls.end++,
  };
  const drag: DragHandlers = {
    start: () => (calls.dstart++, true),
    frame: (p) => (calls.dframe++, [["e:n", p]]),
    end: () => (calls.dend++, plant.steps ?? []),
  };
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, {
    text: TEXT,
    camera: CAMERA,
    drag,
    bubble,
  });
  renderer.draw(SCENE);
  return { div, renderer, calls };
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
});

const NAN_EVENT = (x: number) => {
  const event = mouse("mousemove", 0);
  Object.defineProperty(event, "clientX", { value: x });
  return event;
};

describe("S26 points and transforms that are not finite", () => {
  it("drops the non-finite moves: 2 move calls (10, 0) and (20, 0); no NaN attribute", () => {
    const m = mount();
    pill(m).dispatchEvent(mouse("mousedown", 400));
    for (const event of [
      mouse("mousemove", 410),
      NAN_EVENT(NaN),
      NAN_EVENT(Infinity),
      mouse("mousemove", 430),
    ]) {
      window.dispatchEvent(event);
      frames();
    }
    expect(m.calls.move).toEqual([
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const all = [...m.div.querySelectorAll("*")].flatMap((e) =>
      [...e.attributes].map((a) => a.value),
    );
    expect(all.some((v) => /NaN|Infinity/.test(v))).toBe(false);
    up(430);
  });

  it.each([NaN, Infinity])(
    "a returned point %s: the member keeps its last finite transform",
    (x) => {
      const m = mount({ bad: { x, y: 0 } });
      pillDrag(m, 2);
      expect(nodeEl(m, "e:a").getAttribute("transform")).toBe("translate(0,0)");
      expect(nodeEl(m, "e:b").getAttribute("transform")).toBe(
        "translate(80,0)",
      );
      up(420);
    },
  );

  const nanWheel = (m: Mounted) => {
    const event = new WheelEvent("wheel", { cancelable: true, bubbles: true });
    // why: jsdom `WheelEventInit.deltaY` is a WebIDL double and refuses `NaN` (closing check (1))
    Object.defineProperty(event, "deltaY", { value: NaN });
    m.div.querySelector("svg")?.dispatchEvent(event);
  };
  it("a NaN wheel during a pill drag: no move call after it", () => {
    const m = mount();
    pillDrag(m, 1);
    nanWheel(m);
    move(430);
    frames();
    expect(m.calls.move).toHaveLength(1);
    up(430);
  });
  it("a NaN wheel during a node drag: no frame call after it", () => {
    const m = mount();
    nodeEl(m, "e:n").dispatchEvent(mouse("mousedown", 400));
    move(410);
    frames();
    expect(m.calls.dframe).toBe(1);
    nanWheel(m);
    move(430);
    frames();
    expect(m.calls.dframe).toBe(1);
    up(430);
  });
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
    "%s is ignored; the first drag goes on; the camera does not move",
    (_n, first, press, kind) => {
      const m = mount();
      first(m);
      // why: one running `d3-timer` is 2 fake timers (its frame and its poke interval)
      const one = vi.getTimerCount();
      expect(one).toBeGreaterThan(0);
      const t = viewport(m);
      const calls = () =>
        kind === "pill" ? m.calls.move.length : m.calls.dframe;
      const before = calls();
      press(m);
      expect(viewport(m)).toBe(t);
      move(440);
      frames();
      expect(vi.getTimerCount()).toBe(one);
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
    },
  );

  it("(d) a pill press during a release playback jumps it to its end, then the pill drag runs", () => {
    const steps: Positions[] = [1, 2, 3].map((i) => [
      ["e:n", { x: 300 + i, y: i }],
    ]);
    const m = mount({ steps });
    nodeEl(m, "e:n").dispatchEvent(mouse("mousedown", 400));
    move(410);
    frames();
    up(410);
    frames();
    pill(m).dispatchEvent(mouse("mousedown", 500));
    move(510);
    expect(nodeEl(m, "e:n").getAttribute("transform")).toBe("translate(303,3)");
    expect(m.calls.move).toHaveLength(0);
    frames();
    move(520);
    frames();
    expect(m.calls.start).toEqual(["t"]);
    expect(m.calls.move).toHaveLength(2);
    up(520);
  });

  it("(e) two touches before a move: one drag.start, no bubble.start, 1 timer, one drag.end", () => {
    vi.stubGlobal("navigator", { ...navigator, maxTouchPoints: 1 });
    const m = mount();
    nodeEl(m, "e:n").dispatchEvent(touch("touchstart", 1, 400));
    pill(m).dispatchEvent(touch("touchstart", 2, 600));
    nodeEl(m, "e:n").dispatchEvent(touch("touchmove", 1, 410));
    frames();
    const one = vi.getTimerCount();
    pill(m).dispatchEvent(touch("touchmove", 2, 610));
    frames();
    expect(vi.getTimerCount()).toBe(one);
    nodeEl(m, "e:n").dispatchEvent(touch("touchend", 1, 410));
    pill(m).dispatchEvent(touch("touchend", 2, 610));
    expect([m.calls.dstart, m.calls.start.length, m.calls.dend]).toEqual([
      1, 0, 1,
    ]);
  });
});
