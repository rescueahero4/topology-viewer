// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex, Point } from "@qdic-topology/engine";
import type { Camera, DrawMotion, Renderer } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent, CanvasModel } from "./index";

// why: pass-through spies; `anchors` records the anchor of each draw, `fits` the fit calls
const spy = vi.hoisted(() => ({ anchors: [] as (string | null)[], fits: 0 }));
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        draw: (scene, motion?: DrawMotion) => {
          spy.anchors.push(motion?.anchor ?? null);
          r.draw(scene, motion);
        },
        fit: (options) => {
          spy.fits++;
          r.fit(options);
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
const engine = await import("@qdic-topology/engine");
const { profile } = await import("@qdic-topology/contract");
const { loadFixture } = await import("@qdic-topology/fixtures");
const { createCanvas } = await import("./index");

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

function modelOf(input: unknown): CanvasModel {
  const r = engine.normalize(input, { now: "2026-10-19" });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, LIGHT);
  return {
    graph: r.graph,
    payload: r.payload,
    hash: r.hash,
    vocab,
    canvas: LIGHT,
  };
}

async function open(input: unknown, camera?: Camera) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, {
    text: TEXT,
    model: modelOf(input),
    camera,
  });
  const settles: CanvasEvent["settle"][] = [];
  canvas.on("settle", (e) => settles.push(e));
  await Promise.resolve();
  const last = () => settles[settles.length - 1];
  return { div, canvas, last };
}

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.anchors = [];
  spy.fits = 0;
  document.body.replaceChildren();
});

type Call = [string, (c: Canvas) => void, string | null];
const STAR = 'g:["tag_pii","taggedWith","<","table"]';
const EDGE = '["e:t_FCT_REVENUE","ownedBy","e:u_0"]';
const ACCESS_CALLS: Call[] = [
  ["expand entity", (c) => c.expand("e:t_FCT_REVENUE"), "e:t_FCT_REVENUE"],
  ["collapse", (c) => c.collapse("e:t_FCT_REVENUE"), null],
  ["hide", (c) => c.hide(["e:u_0"]), null],
  ["restore", (c) => c.restore(["e:u_0"]), null],
  ["reveal", (c) => c.reveal(["ds_snow"]), null],
  ["focus drawn", (c) => c.focus("u_7"), null],
  ["focus undrawn", (c) => c.focus("u_15"), null],
  ["select node", (c) => c.select("e:u_7"), null],
  ["select edge", (c) => c.select(EDGE), null],
  ["select null", (c) => c.select(null), null],
  [
    "toggleType",
    (c) => c.setFilters({ kind: "toggleType", type: "user", on: false }),
    null,
  ],
  ["showAllTypes", (c) => c.setFilters({ kind: "showAllTypes" }), null],
  [
    "toggleFamily",
    (c) =>
      c.setFilters({
        kind: "toggleFamily",
        family: "Ownership & Access",
        on: false,
      }),
    null,
  ],
  [
    "togglePredicate",
    (c) =>
      c.setFilters({
        kind: "togglePredicate",
        predicate: "ownedBy",
        on: false,
      }),
    null,
  ],
  [
    "grouping",
    (c) => c.setFilters({ kind: "grouping", grouping: "off" }),
    null,
  ],
  ["setApproach", (c) => c.setApproach("passive"), null],
];
const STAR_CALLS: Call[] = [
  ["expand group", (c) => c.expand(STAR), STAR],
  ["collapse group", (c) => c.collapse(STAR), null],
  ["focus grouped", (c) => c.focus("t_5"), null],
];
const LAYOUT_CALLS: [string, (c: Canvas) => void][] = [
  ["setLayout", (c) => c.setLayout("atomic")],
  ["setBudget", (c) => c.setBudget(10)],
  ["resetView", (c) => c.resetView()],
  ["fit", (c) => c.fit()],
];

describe("S19 camera calls (SA §6 row 6, guardrail 5, TL-5)", () => {
  it.each([
    ["s-access", ACCESS_CALLS],
    ["s-star", STAR_CALLS],
  ] as const)(
    "%s: no fit, and an anchor only for expand",
    async (key, calls) => {
      const o = await open(loadFixture(key).input);
      for (const [name, call, anchor] of calls) {
        const draws = spy.anchors.length;
        call(o.canvas);
        vi.advanceTimersByTime(3000);
        expect(spy.anchors.length, name).toBe(draws + 1);
        expect(spy.anchors[draws], name).toBe(anchor);
        expect(spy.fits, name).toBe(0);
      }
      const draws = spy.anchors.length;
      o.canvas.setData(o.last().frontier);
      expect([spy.anchors.length, spy.anchors[draws], spy.fits]).toEqual([
        draws + 1,
        null,
        0,
      ]);
    },
  );

  it.each(LAYOUT_CALLS)("%s: one fit at the end", async (_n, call) => {
    const o = await open(loadFixture("s-access").input);
    call(o.canvas);
    vi.advanceTimersByTime(3000);
    expect(spy.fits).toBe(1);
  });
});

const screen = (c: Camera, p: Point) => ({
  x: c.x + c.k * p.x,
  y: c.y + c.k * p.y,
});
function inside(c: Camera, p: Point, r: number) {
  const a = screen(c, { x: p.x - r, y: p.y - r });
  const b = screen(c, { x: p.x + r, y: p.y + r });
  return a.x >= 0 && a.y >= 0 && b.x <= 800 && b.y <= 600;
}

describe("B5 focus on a target that is not fully in the viewport (epic question 19)", () => {
  const SHIFTED: Camera = { k: 2, x: 0, y: 0 };

  it("a drawn target off screen: pan and zoom out only, never a fit", async () => {
    const o = await open(loadFixture("s-access").input, SHIFTED);
    const start = o.last().camera;
    expect(start).toEqual(SHIFTED);
    const spot = new Map(o.last().state.positions).get(
      "e:t_FCT_REVENUE",
    ) as Point;
    expect(inside(start, spot, 12)).toBe(false);
    o.canvas.focus("t_FCT_REVENUE");
    vi.advanceTimersByTime(3000);
    const end = o.last().camera;
    expect(end).not.toEqual(start);
    expect(end.k).toBeLessThanOrEqual(start.k);
    expect(inside(end, spot, 12)).toBe(true);
    expect(spy.fits).toBe(0);
    o.canvas.fit();
    vi.advanceTimersByTime(3000);
    expect(o.last().camera.k).not.toBeCloseTo(end.k, 6);
  });

  it("a visible target: no camera move", async () => {
    const o = await open(loadFixture("s-access").input, SHIFTED);
    const spot = new Map(o.last().state.positions).get("e:ug_exec") as Point;
    expect(inside(SHIFTED, spot, 19)).toBe(true);
    o.canvas.focus("ug_exec");
    vi.advanceTimersByTime(3000);
    expect(o.last().camera).toEqual(SHIFTED);
  });

  it("an undrawn target that the path draws off screen: the camera follows the motion", async () => {
    const chain = loadFixture("s-chain").input as { view?: object };
    const input = { ...chain, view: { ...chain.view, budget: 10 } };
    const o = await open(input, { k: 1, x: -2000, y: -2000 });
    o.canvas.focus("t13");
    vi.advanceTimersByTime(3000);
    const end = o.last().camera;
    const spot = new Map(o.last().state.positions).get("e:t13") as Point;
    expect(end.k).toBeLessThanOrEqual(1);
    expect(inside(end, spot, 10)).toBe(true);
    expect(spy.fits).toBe(0);
  });
});
