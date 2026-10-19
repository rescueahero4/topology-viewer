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
  SceneEdge,
  SceneNode,
} from "./index";

// why: spies through pass-through mocks; production code has no test hook. `running` holds the
// timers that run, `frames` the frame callbacks; `failOut` plants a throw in one frame (S14 (d))
const spy = vi.hoisted(() => ({
  running: new Set<object>(),
  frames: [] as ((elapsed: number) => void)[],
  failOut: false,
}));
vi.mock("d3-timer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("d3-timer")>();
  return {
    ...mod,
    timer: (callback: (elapsed: number) => void) => {
      const t = mod.timer(callback);
      spy.running.add(t);
      spy.frames.push(callback);
      const stop = t.stop.bind(t);
      t.stop = () => {
        spy.running.delete(t);
        stop();
      };
      return t;
    },
  };
});
vi.mock("d3-ease", async (importOriginal) => {
  const mod = await importOriginal<typeof import("d3-ease")>();
  return {
    ...mod,
    easeCubicOut: (t: number) => {
      if (spy.failOut) {
        spy.failOut = false;
        throw new Error("planted");
      }
      return mod.easeCubicOut(t);
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
const edge = (subject: string, object: string): SceneEdge => ({
  key: JSON.stringify([subject, "p", object]),
  subject,
  object,
  label: "p",
  colour: "#2e9d6a" as Hex,
  muted: false,
  structure: false,
  dashed: false,
  count: 1,
});
const scene = (nodes: SceneNode[], edges: SceneEdge[] = []): Scene => ({
  nodes,
  edges,
  selection: { node: nodes[0]?.id ?? null, edge: null },
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
  return { div, renderer, reports, settles };
}

const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
function at(div: HTMLElement, id: string): Point {
  const el = [...div.querySelectorAll("g.qt-node")].find(
    (g) => datum<SceneNode>(g).id === id,
  );
  const match = /^translate\(([^,]+),([^)]+)\)$/.exec(
    el?.getAttribute("transform") ?? "",
  );
  if (match === null) throw new Error(`no node ${id}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}
const classes = (div: HTMLElement) =>
  [...div.querySelectorAll(".qt-born, .qt-emerge")].length;
const frame = () => spy.frames[spy.frames.length - 1];

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.failOut = false;
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", FakeObserver);
  Reflect.deleteProperty(document, "hidden");
  document.body.replaceChildren();
});

describe("S11 easing: 1,000 samples, no overshoot (SA §6 row 5)", () => {
  it("local: newcomers with trips of 0, 100 and 300 px", () => {
    const m = mount(scene([node("e:a", 0, 0)]));
    const origin: [string, Point][] = ["n0", "n1", "n2"].map((id) => [
      id,
      { x: 0, y: 0 },
    ]);
    const next = scene([
      node("e:a", 0, 0),
      node("n0", 0, 0),
      node("n1", 100, 0),
      node("n2", 300, 0),
    ]);
    m.renderer.draw(next, motion("local", { starts: origin }));
    expect(classes(m.div)).toBe(3);
    const total = 610 + 28;
    const tick = frame();
    for (let i = 0; i < 1000; i++) {
      tick((total * i) / 1000);
      expect(at(m.div, "n0")).toEqual({ x: 0, y: 0 });
      for (const [id, end] of [
        ["n1", 100],
        ["n2", 300],
      ] as const) {
        const p = at(m.div, id);
        expect(p.y).toBe(0);
        expect(p.x / end).toBeGreaterThanOrEqual(0);
        expect(p.x / end).toBeLessThanOrEqual(1);
      }
    }
    tick(total);
    expect(spy.running.size).toBe(0);
    expect(at(m.div, "n2")).toEqual({ x: 300, y: 0 });
    expect(classes(m.div)).toBe(0);
  });

  it("collapse: the leaving nodes glide to their entry in 280 ms", () => {
    const first = scene(
      [node("e:a", 0, 0), node("e:b", 100, 0), node("e:c", 0, -200)],
      [edge("e:a", "e:b"), edge("e:a", "e:c")],
    );
    const m = mount(first);
    const home: [string, Point][] = [
      ["e:b", { x: 0, y: 0 }],
      ["e:c", { x: 0, y: 0 }],
    ];
    m.renderer.draw(
      scene([node("e:a", 0, 0)]),
      motion("collapse", { retractTo: home }),
    );
    expect(m.div.querySelectorAll("g.qt-node.qt-born.qt-emerge")).toHaveLength(
      2,
    );
    const tick = frame();
    for (let i = 0; i < 1000; i++) {
      tick((280 * i) / 1000);
      const b = at(m.div, "e:b");
      const c = at(m.div, "e:c");
      expect(b.x / 100).toBeGreaterThanOrEqual(0);
      expect(b.x / 100).toBeLessThanOrEqual(1);
      expect(c.y / -200).toBeGreaterThanOrEqual(0);
      expect(c.y / -200).toBeLessThanOrEqual(1);
    }
    tick(280);
    expect(m.div.querySelectorAll("g.qt-node")).toHaveLength(1);
    expect(m.div.querySelectorAll("path.qt-edge")).toHaveLength(0);
    tick(800);
    expect(spy.running.size).toBe(0);
  });
});

const FIRST = () => scene([node("e:a", 0, 0), node("e:b", 100, 0)]);
const NEXT = scene([node("e:a", 50, 50), node("e:c", 0, -80)]);
const KINDS: Motion[] = [
  motion("local", { starts: [["e:c", { x: 0, y: 0 }]] }),
  motion("layout"),
  motion("collapse", {
    starts: [["e:c", { x: 0, y: 0 }]],
    retractTo: [["e:b", { x: 0, y: 0 }]],
  }),
  motion("none"),
];
const STILL: [string, () => void][] = [
  [
    "document.hidden",
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

describe("S13 hidden document and reduced motion (NF-8)", () => {
  for (const [name, stub] of STILL)
    it.each(KINDS)(`${name}: $kind ends before draw returns`, (m) => {
      Object.defineProperty(document, "hidden", {
        value: false,
        configurable: true,
      });
      const r = mount(FIRST());
      stub();
      const settles = r.settles.length;
      r.renderer.draw(NEXT, m);
      expect(at(r.div, "e:a")).toEqual({ x: 50, y: 50 });
      expect(at(r.div, "e:c")).toEqual({ x: 0, y: -80 });
      expect(r.div.querySelectorAll("g.qt-node")).toHaveLength(2);
      expect(classes(r.div)).toBe(0);
      expect([spy.running.size, vi.getTimerCount()]).toEqual([0, 0]);
      expect(r.settles.length).toBe(settles + 1);
    });
});

describe("S14 a local motion at 40 % (Security A6, A7)", () => {
  const start = () => {
    const m = mount(scene([node("e:a", 0, 0)]));
    m.renderer.draw(scene([node("e:a", 200, 0)]), motion("local"));
    vi.advanceTimersByTime(232);
    const p = at(m.div, "e:a");
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(200);
    return { ...m, settled: m.settles.length };
  };

  it("(a) a new draw jumps it to its end and starts from there", () => {
    const m = start();
    m.renderer.draw(scene([node("e:a", 400, 0)]), motion("local"));
    expect(at(m.div, "e:a")).toEqual({ x: 200, y: 0 });
    expect(m.settles.length).toBe(m.settled);
    expect(spy.running.size).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(at(m.div, "e:a")).toEqual({ x: 400, y: 0 });
    expect(m.settles.length).toBe(m.settled + 1);
  });

  it("(b) a visibilitychange to hidden jumps it to its end", () => {
    const m = start();
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(at(m.div, "e:a")).toEqual({ x: 200, y: 0 });
    expect(spy.running.size).toBe(0);
    expect(m.settles.length).toBe(m.settled + 1);
    vi.advanceTimersByTime(16);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("(c) 50 draws in a row keep at most one motion timer", () => {
    const m = start();
    for (let i = 0; i < 50; i++) {
      m.renderer.draw(scene([node("e:a", i * 10, 0)]), motion("local"));
      expect(spy.running.size).toBeLessThanOrEqual(1);
      vi.advanceTimersByTime(16);
    }
    vi.advanceTimersByTime(1000);
    expect([spy.running.size, vi.getTimerCount()]).toEqual([0, 0]);
    expect(at(m.div, "e:a")).toEqual({ x: 490, y: 0 });
  });

  it("(d) a throw in a frame stops the timer, sets the end and reports", () => {
    const m = start();
    spy.failOut = true;
    expect(() => vi.advanceTimersByTime(16)).not.toThrow();
    expect(spy.running.size).toBe(0);
    expect(at(m.div, "e:a")).toEqual({ x: 200, y: 0 });
    expect(m.reports).toEqual([{ kind: "error" }]);
    expect(m.settles.length).toBe(m.settled);
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Security build-time item 5 and QA item 6 (criterion 2)", () => {
  it("item 5, QA item 6: hostile drawn ids and starts that are not finite", () => {
    const ids = ['e:"]\\# x', 'g:["a b","p","<",null]', "e:#q .r", "e:]"];
    const m = mount(scene([node(ids[0], 0, 0), node(ids[1], 50, 0)]));
    const next = scene(
      [node(ids[0], 120, 0), node(ids[1], 50, 0), node(ids[2], 0, 90)],
      [edge(ids[0], ids[2]), edge(ids[1], ids[0])],
    );
    next.nodes.push(node(ids[3], -40, 0));
    const starts: [string, Point][] = [
      [ids[2], { x: NaN, y: 0 }],
      [ids[3], { x: 0, y: Infinity }],
    ];
    m.renderer.draw(next, motion("local", { starts }));
    const audit = () => {
      for (const el of m.div.querySelectorAll("*"))
        for (const a of el.attributes) {
          expect(a.value).not.toMatch(/NaN|Infinity/);
          for (const id of ids) expect(a.value).not.toContain(id);
        }
    };
    for (let i = 0; i < 40; i++) {
      audit();
      expect(at(m.div, ids[2])).toEqual({ x: 0, y: 90 });
      vi.advanceTimersByTime(16);
    }
    audit();
    expect(at(m.div, ids[0])).toEqual({ x: 120, y: 0 });
    expect(spy.running.size).toBe(0);
  });
});
