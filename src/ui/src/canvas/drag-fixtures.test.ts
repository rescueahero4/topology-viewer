// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type {
  CanvasState,
  DrawnId,
  Frontier,
  Hex,
  Point,
} from "@qdic-topology/engine";
import type { Renderer } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through mocks; production code has no test hook. They count the layout runs and the
// fit calls (S4: a drag runs no layout and moves no camera)
const spy = vi.hoisted(() => ({ layouts: 0, fits: 0 }));
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  return {
    ...mod,
    setLayout: (...args: Parameters<typeof mod.setLayout>) => {
      spy.layouts++;
      return mod.setLayout(...args);
    },
  };
});
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      const fit = r.fit.bind(r);
      return {
        ...r,
        fit: (o?: { animate?: boolean }) => (spy.fits++, fit(o)),
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
const engine = await import("@qdic-topology/engine");
const { profile } = await import("@qdic-topology/contract");
const { loadFixture } = await import("@qdic-topology/fixtures");
const { createCanvas } = await import("./index");

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
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

function chain(): CanvasModel {
  const r = engine.normalize(loadFixture("s-chain").input, {
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
async function open(doc: Document = document) {
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model: chain() });
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

const mouse = (type: string, x: number, y: number, buttons: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons,
  });
  // why: QA round 2 (c) — `d3-drag` adds its listeners on `event.view`; the jsdom of Vitest refuses
  // the test `window` as `view` in the constructor
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const datumId = (g: Element) =>
  (g as unknown as { __data__: { id: string } }).__data__.id;
function dom(div: HTMLElement): Map<DrawnId, Point> {
  return new Map(
    [...div.querySelectorAll("g.qt-node")].map((g) => {
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

function hopsOf(f: Frontier, from: DrawnId): Map<DrawnId, number> {
  const hops = new Map([[from, 0]]);
  for (let h = 1, ring = [from]; h <= 3; h++) {
    const near = new Set(ring);
    ring = [];
    for (const e of f.edges)
      for (const [a, b] of [
        [e.subject, e.object],
        [e.object, e.subject],
      ])
        if (near.has(a) && !hops.has(b)) {
          hops.set(b, h);
          ring.push(b);
        }
  }
  return hops;
}

type Run = {
  most: number[];
  rest: number[];
  steps: number;
  end: CanvasState;
  release: CanvasState;
};
// why: the drag path of the test plan — a press at the screen point of the node, one move of D · k
// screen px along +x, 10 frames with no move, then `mouseup`; the reference makes the same engine
// calls with the pointer expression of the renderer (QA round 2 (a))
function drag(o: Open, id: DrawnId, D: number, instant = false): Run {
  const { state, frontier, camera: c } = last(o.log.settle);
  const home = drawnOf(state.positions, frontier);
  const hops = hopsOf(frontier, id);
  const p0 = home.get(id) as Point;
  const sx = c.x + c.k * p0.x;
  const sy = c.y + c.k * p0.y;
  const g = [...o.div.querySelectorAll("g.qt-node")].find(
    (n) => datumId(n) === id,
  ) as Element;
  const most = [0, 0, 0, 0];
  const check = (positions: [DrawnId, Point][]) => {
    const want = drawnOf(positions, frontier);
    expect(dom(o.div)).toEqual(want);
    for (const [n, p] of want) {
      const h = Math.min(hops.get(n) ?? 4, 4);
      const q = home.get(n) as Point;
      if (h > 0)
        most[h - 1] = Math.max(most[h - 1], Math.hypot(p.x - q.x, p.y - q.y));
    }
  };
  let ctx = engine.beginDrag(state, frontier, id);
  if (ctx === null) throw new Error("no drag");
  const pointer = {
    x: p0.x + (sx + D * c.k - sx) / c.k,
    y: p0.y + (sy - sy) / c.k,
  };
  g.dispatchEvent(mouse("mousedown", sx, sy, 1));
  window.dispatchEvent(mouse("mousemove", sx + D * c.k, sy, 1));
  for (let i = 0; i < 11; i++) {
    const step = engine.dragStep(ctx, pointer);
    ctx = step.ctx;
    vi.advanceTimersByTime(16);
    check(step.positions);
  }
  const settles = o.log.settle.length;
  const r = engine.release(ctx);
  window.dispatchEvent(mouse("mouseup", sx + D * c.k, sy, 0));
  expect(o.log["drag-end"]).toHaveLength(1);
  // why: NF-8 — in a hidden document (S12) the steps play at once, before `mouseup` returns
  if (instant) check(last(r.steps));
  else
    for (const step of r.steps) {
      expect(o.log.settle).toHaveLength(settles);
      vi.advanceTimersByTime(16);
      check(step);
    }
  expect(o.log.settle).toHaveLength(settles + 1);
  vi.advanceTimersByTime(100);
  expect(o.log.settle).toHaveLength(settles + 1);
  const end = drawnOf(r.state.positions, frontier);
  const rest = [1, 2, 3].map((h) =>
    Math.max(
      ...[...end]
        .filter(([n]) => hops.get(n) === h)
        .map(([n, p]) => {
          const q = home.get(n) as Point;
          return Math.hypot(p.x - q.x, p.y - q.y);
        }),
    ),
  );
  return {
    most,
    rest,
    steps: r.steps.length,
    end: last(o.log["drag-end"]).state,
    release: r.state,
  };
}

const close = (got: number[], want: number[]) =>
  got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(1e-3));

afterEach(() => {
  vi.advanceTimersByTime(2000);
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  document.body.replaceChildren();
});

const FORCE: [number, number[], number[], number][] = [
  [100, [15.621, 4.625, 1.433], [13.722, 4.625, 1.433], 24],
  [500, [44.698, 15.31, 4.673], [38.961, 13.826, 4.673], 34],
  [900, [48, 17, 5.475], [45.712, 16.182, 5.475], 26],
];

describe("S3 s-chain in Force: the DOM is the engine in every frame", () => {
  it.each(FORCE)("D %d", async (D, most, rest, steps) => {
    const o = await open();
    expect(last(o.log.settle).frontier.nodes).toHaveLength(14);
    expect(last(o.log.settle).state.layout).toBe("force");
    const run = drag(o, "e:t0", D);
    close(run.most.slice(0, 3), most);
    close(run.rest, rest);
    expect(run.most[3]).toBe(0);
    expect(run.steps).toBe(steps);
    expect(run.end).toEqual(run.release);
    expect(last(o.log.settle).state).toEqual(run.release);
  });
});

const OTHER: [number, number[], number][] = [
  [100, [13.361, 4.483, 1.376], 39],
  [500, [38.647, 13.333, 4.473], 68],
  [900, [45.341, 15.672, 5.297], 73],
];
const LAYOUTS = ["atomic", "bubbles", "tree-h", "tree-v"] as const;
const CASES = LAYOUTS.flatMap((l) =>
  OTHER.map(([D, v, n]) => [l, D, v, n] as const),
);

describe("S4 the other layouts: a lag, no spring, no layout run, no camera move", () => {
  it.each(CASES)("%s, D %d", async (layout, D, values, steps) => {
    const o = await open();
    o.canvas.setLayout(layout);
    vi.advanceTimersByTime(3000);
    expect(last(o.log.settle).state.layout).toBe(layout);
    const counts = { layouts: spy.layouts, fits: spy.fits };
    const viewport = o.div.querySelector("g.qt-viewport");
    const camera = viewport?.getAttribute("transform");
    const run = drag(o, "e:t0", D);
    close(run.most.slice(0, 3), values);
    close(run.rest, values);
    expect(run.most[3]).toBe(0);
    expect(run.steps).toBe(steps);
    expect(run.end).toEqual(run.release);
    expect({ layouts: spy.layouts, fits: spy.fits }).toEqual(counts);
    expect(viewport?.getAttribute("transform")).toBe(camera);
  });
});

describe("S12 determinism (NF-3)", () => {
  it("the same drag in two jsdom documents serialises to the same SVG bytes", async () => {
    const svgOf = async () => {
      const doc = document.implementation.createHTMLDocument("t");
      const o = await open(doc);
      drag(o, "e:t0", 500, true);
      return new XMLSerializer().serializeToString(
        o.div.querySelector("svg") as Element,
      );
    };
    const one = await svgOf();
    expect(one).toBe(await svgOf());
    expect(one).toContain('id="qt1-');
  });
});
