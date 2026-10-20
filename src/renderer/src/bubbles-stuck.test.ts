// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { DrawnId, Hex, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BubbleHandlers,
  Camera,
  DragHandlers,
  RendererText,
  Report,
  Scene,
  SceneNode,
} from "./index";

// why: S14 (c) — a pass-through mock of the motion player; `jump` throws one time when armed
const spy = vi.hoisted(() => ({ jumpThrows: false }));
vi.mock("./motion", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./motion")>();
  return {
    ...mod,
    createPlayer: (host: Parameters<typeof mod.createPlayer>[0]) => {
      const player = mod.createPlayer(host);
      return {
        ...player,
        jump(settle: boolean) {
          if (spy.jumpThrows) {
            spy.jumpThrows = false;
            throw new Error("planted");
          }
          player.jump(settle);
        },
      };
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
const scene = (c = "#5b6b8c"): Scene => ({
  nodes: [node("e:a", 0, "t"), node("e:b", 60, "t"), node("e:n", 300, "u")],
  edges: [],
  selection: { node: null, edge: null },
  layout: "bubbles",
  types: [
    ["t", { label: "T", colour: c as Hex }],
    ["u", { label: "U", colour: "#3f7a5a" as Hex }],
  ],
});

type Positions = [DrawnId, Point][];
type Plant = {
  moveThrowAt?: number;
  getterAt?: number;
  endThrows?: boolean;
  startThrows?: boolean;
  refuse?: boolean;
};
function mount(plant: Plant = {}, s: Scene = scene()) {
  const calls = {
    start: [] as (string | null)[],
    move: [] as Point[],
    end: 0,
  };
  let at: Positions = [
    ["e:a", { x: 0, y: 0 }],
    ["e:b", { x: 60, y: 0 }],
  ];
  const bubble: BubbleHandlers = {
    start(type) {
      calls.start.push(type);
      if (plant.startThrows === true) {
        plant.startThrows = false;
        throw new Error("planted");
      }
      return plant.refuse !== true;
    },
    move(_type, v) {
      calls.move.push(v);
      if (plant.moveThrowAt === calls.move.length) throw new Error("planted");
      at = at.map(([id, p]) => [id, { x: p.x + v.x, y: p.y + v.y }]);
      if (plant.getterAt === calls.move.length) {
        const bad = {
          get x(): number {
            throw new Error("planted");
          },
          y: 0,
        };
        return [["e:a", bad]];
      }
      return at;
    },
    end() {
      calls.end++;
      if (plant.endThrows === true) {
        plant.endThrows = false;
        throw new Error("planted");
      }
    },
  };
  const drag: DragHandlers = {
    start: () => true,
    frame: () => [],
    end: () => [],
  };
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, {
    text: TEXT,
    camera: CAMERA,
    drag,
    bubble,
  });
  const reports: Report[] = [];
  const settles: Camera[] = [];
  renderer.onReport((r) => reports.push(r));
  renderer.onSettle((c) => settles.push(c));
  renderer.draw(s);
  return { div, renderer, calls, reports, settles };
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
const frames = (n = 1) => vi.advanceTimersByTime(16 * n);
const move = (x: number, buttons = 1) =>
  window.dispatchEvent(mouse("mousemove", x, buttons));
const up = (x: number) => window.dispatchEvent(mouse("mouseup", x, 0));
const root = (m: Mounted) => m.div.firstElementChild as Element;
const dragging = (m: Mounted) => [
  root(m).classList.contains("qt-bdragging"),
  m.div.querySelectorAll(".qt-bdrag").length,
];

// why: a pill drag of `n` frames of (10, 0) (camera identity, so 10 client px each)
function pillDrag(m: Mounted, n: number, x0 = 400) {
  pill(m).dispatchEvent(mouse("mousedown", x0));
  for (let i = 1; i <= n; i++) {
    move(x0 + 10 * i);
    frames();
  }
}
// why: S14 — after an early end, the rest of the gesture calls no handler; a new press and move
// on the pill then gives one more `bubble.start` call (the press reset)
function rest(m: Mounted) {
  const before = { move: m.calls.move.length, end: m.calls.end };
  move(470);
  frames(2);
  up(470);
  frames(2);
  expect({ move: m.calls.move.length, end: m.calls.end }).toEqual(before);
  const starts = m.calls.start.length;
  pill(m).dispatchEvent(mouse("mousedown", 400));
  move(410);
  frames();
  expect(m.calls.start).toHaveLength(starts + 1);
  up(410);
  frames(2);
}
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

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "hidden");
  document.body.replaceChildren();
  // why: H8 — a renderer ends at its next listener call after its root left the page; this ends
  // the renderer of the test, so its end does not count in the listener spies of the next test
  document.dispatchEvent(new Event("visibilitychange"));
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
      Reflect.deleteProperty(document, "hidden");
    },
  ],
  ["a mousemove with buttons 0", () => move(440, 0)],
];

describe("S14 (b) stuck pill drags end at once", () => {
  it.each(STUCK)("%s: one end(), classes off, 0 timers", (_n, stuck) => {
    const m = mount();
    const net = listeners();
    pillDrag(m, 3);
    expect([m.calls.move.length, ...dragging(m)]).toEqual([3, true, 1]);
    stuck(m);
    expect(m.calls.end).toBe(1);
    expect(dragging(m)).toEqual([false, 0]);
    frames();
    expect(vi.getTimerCount()).toBe(0);
    expect(net(["blur", "visibilitychange"])).toBe(0);
    rest(m);
  });

  it("a touchcancel of a touch pill drag: one end() at once, classes off, 0 timers", () => {
    const m = mount();
    pill(m).dispatchEvent(touch("touchstart", 7, 400));
    for (const x of [410, 420, 430]) {
      pill(m).dispatchEvent(touch("touchmove", 7, x));
      frames();
    }
    expect(m.calls.move).toHaveLength(3);
    pill(m).dispatchEvent(touch("touchcancel", 7, 430));
    expect([m.calls.end, ...dragging(m)]).toEqual([1, false, 0]);
    pill(m).dispatchEvent(touch("touchmove", 7, 450));
    frames(2);
    expect(m.calls.move).toHaveLength(3);
    vi.advanceTimersByTime(500);
    expect(vi.getTimerCount()).toBe(0);
    rest(m);
  });

  it("20 press-move-release cycles leave 0 drag listeners on window and 0 timers", () => {
    const m = mount();
    const net = listeners();
    for (let i = 0; i < 20; i++) {
      pillDrag(m, 1);
      up(410);
      vi.advanceTimersByTime(1000);
    }
    expect(m.calls.end).toBe(20);
    expect(net(["blur", "visibilitychange"])).toBe(0);
    expect(net(["mousemove", "mouseup", "dragstart", "click"])).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

const THROWS: [string, Plant, "move" | "end" | "start"][] = [
  ["bubble.move throws in frame 2", { moveThrowAt: 2 }, "move"],
  ["a returned x getter throws in frame 2", { getterAt: 2 }, "move"],
  ["bubble.end throws (one time)", { endThrows: true }, "end"],
  ["bubble.start throws", { startThrows: true }, "start"],
  ["the motion jump throws", {}, "start"],
];

describe("S14 (c) throws in a pill drag", () => {
  it.each(THROWS)("%s", (name, plant, kind) => {
    const m = mount(plant);
    spy.jumpThrows = name.startsWith("the motion");
    pillDrag(m, 3);
    if (kind === "end") up(430);
    expect(m.reports).toEqual([{ kind: "error" }]);
    expect(dragging(m)).toEqual([false, 0]);
    expect(m.calls.end).toBe(kind === "start" ? 0 : 1);
    expect(m.calls.move).toHaveLength(
      kind === "start" ? 0 : kind === "move" ? 2 : 3,
    );
    frames();
    expect(vi.getTimerCount()).toBe(0);
    rest(m);
    expect(m.reports).toEqual([{ kind: "error" }]);
  });
});

describe("S23 endDrag() during a pill drag", () => {
  it("gives one end(), removes the classes, 0 timers; later events call no handler", () => {
    const m = mount();
    pillDrag(m, 2);
    m.renderer.endDrag();
    expect([m.calls.end, ...dragging(m)]).toEqual([1, false, 0]);
    frames();
    expect(vi.getTimerCount()).toBe(0);
    rest(m);
  });
});

describe("S25 colours that are not #rrggbb", () => {
  it.each(["red", "#12345g"])(
    "%s: the circle and the pill are drawn with no colour attribute",
    (c) => {
      const m = mount({}, scene(c));
      const g = [...m.div.querySelectorAll("g.qt-bubble")].find(
        (b) => datum<{ type: string }>(b).type === "t",
      ) as Element;
      const circle = g.querySelector("circle") as Element;
      expect([
        circle.hasAttribute("fill"),
        circle.hasAttribute("stroke"),
      ]).toEqual([false, false]);
      const p = pill(m);
      expect(p.querySelector("rect")?.hasAttribute("stroke")).toBe(false);
      expect(p.querySelector("text")?.hasAttribute("fill")).toBe(false);
      expect(m.reports).toEqual([]);
    },
  );
});

describe("S27 a start handler that gives false (B17 form)", () => {
  it("one start call; no timer, no move, no end, no class change, no settle", () => {
    const m = mount({ refuse: true });
    const settles = m.settles.length;
    frames(2);
    pillDrag(m, 3);
    expect(vi.getTimerCount()).toBe(0);
    up(430);
    frames(5);
    expect(m.calls.start).toEqual(["t"]);
    expect([m.calls.move.length, m.calls.end, ...dragging(m)]).toEqual([
      0,
      0,
      false,
      0,
    ]);
    expect(m.settles).toHaveLength(settles);
  });
});
