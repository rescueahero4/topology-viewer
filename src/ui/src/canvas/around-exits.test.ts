// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState, Hex, Point } from "@qdic-topology/engine";
import type { Camera, Motion, Renderer, Scene } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent, CanvasModel } from "./index";

// why: build-time item (f) — Vitest cannot spy on a module namespace, so the engine entry is
// mocked with pass-through functions that record the name of each call that can change the state
const NAMES = [
  "transition",
  "place",
  "expandAround",
  "collapseAround",
  "groupAround",
  "setLayout",
  "hide",
  "exitAround",
] as const;
type Draw = { scene: Scene; motion: Motion; dom: Map<string, Point> };
const spy = vi.hoisted(() => ({
  calls: [] as string[],
  draws: [] as Draw[],
  fits: 0,
  spots(div: Element): Map<string, Point> {
    const out = new Map<string, Point>();
    for (const g of div.querySelectorAll("g.qt-node")) {
      const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
        g.getAttribute("transform") ?? "",
      );
      const id = (g as unknown as { __data__: { id: string } }).__data__.id;
      out.set(id, { x: Number(m?.[1]), y: Number(m?.[2]) });
    }
    return out;
  },
}));
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  const out: Record<string, unknown> = { ...mod };
  for (const name of NAMES) {
    const fn = mod[name] as (...args: unknown[]) => unknown;
    out[name] = (...args: unknown[]) => (spy.calls.push(name), fn(...args));
  }
  return out;
});
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        draw: (scene, motion) => {
          spy.draws.push({
            scene,
            motion: motion as Motion,
            dom: spy.spots(args[0]),
          });
          r.draw(scene, motion);
        },
        fit: (options) => (spy.fits++, r.fit(options)),
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
const { iconMetrics } = await import("@qdic-topology/renderer");
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

function modelOf(key: string): CanvasModel {
  const r = engine.normalize(loadFixture(key).input, { now: "2026-10-19" });
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

type Log = { [K in keyof CanvasEvent]: CanvasEvent[K][] };
const T = 3000;
async function open(key: string, div = document.createElement("div")) {
  const model = modelOf(key);
  document.body.appendChild(div);
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
  vi.advanceTimersByTime(T);
  const state = () => log.settle[log.settle.length - 1].state;
  const cam = (): Camera => log.settle[log.settle.length - 1].camera;
  const view = (s: CanvasState) => engine.frontier(s, model.graph, model.vocab);
  return { model, div, canvas, log, state, cam, view };
}
type Open = Awaited<ReturnType<typeof open>>;

// why: "group around X" through the interface is `select(X)` then `groupAroundRoot(true)` (QA (b))
function group(o: Open, root: string): CanvasState {
  o.canvas.select(root);
  vi.advanceTimersByTime(T);
  const before = o.state();
  o.canvas.groupAroundRoot(true);
  vi.advanceTimersByTime(T);
  expect(o.state().around?.root).toBe(root);
  return before;
}

// why: SA §6 row 10 — the glide home first: the DOM at the draw of the effect step holds every
// drawn position from before the grouping; the last step is the engine result
function played(
  o: Open,
  call: () => void,
  before: CanvasState,
  want: CanvasState,
) {
  const grouped = o.state();
  const drawn = new Set(o.view(grouped).nodes.map((n) => n.id));
  spy.draws = [];
  call();
  vi.advanceTimersByTime(T);
  expect(spy.draws.length).toBeGreaterThanOrEqual(2);
  expect(spy.draws[0].motion).toMatchObject({ kind: "local", anchor: null });
  const homes = new Map(before.positions);
  for (const [id, p] of spy.draws[1].dom)
    if (drawn.has(id)) expect(p).toEqual(homes.get(id));
  expect(o.state()).toEqual(want);
  expect(spy.draws[1].scene.nodes.some((n) => n.faded)).toBe(false);
  expect(spy.draws.at(-1)?.scene.nodes.map((n) => [n.id, n.x, n.y])).toEqual(
    engine.frontier(want, o.model.graph, o.model.vocab).nodes.map((n) => {
      const p = new Map(want.positions).get(n.id) as Point;
      return [n.id, p.x, p.y];
    }),
  );
}

const exitOf = (o: Open, action: Parameters<typeof engine.exitAround>[1]) =>
  engine.exitAround(
    o.state(),
    action,
    o.view(o.state()),
    o.model.graph,
    o.model.vocab,
    iconMetrics,
  );

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.calls = [];
  spy.draws = [];
  spy.fits = 0;
  document.body.replaceChildren();
});

const ROOT = "e:t_FCT_REVENUE";
type Row = [string, (o: Open) => void, (c: Canvas) => void, object];
const action = (a: object) => ({ kind: "action", action: a });
const ROWS: Row[] = [
  [
    "exit 4 toggleType",
    () => {},
    (c) => c.setFilters({ kind: "toggleType", type: "user_group", on: false }),
    action({ kind: "toggleType", type: "user_group", on: false }),
  ],
  [
    "exit 5 showAllTypes",
    (o) => o.canvas.setFilters({ kind: "toggleType", type: "user", on: false }),
    (c) => c.setFilters({ kind: "showAllTypes" }),
    action({ kind: "showAllTypes" }),
  ],
  [
    "exit 6 grouping",
    () => {},
    (c) => c.setFilters({ kind: "grouping", grouping: 5 }),
    action({ kind: "grouping", grouping: 5 }),
  ],
  [
    "exit 7 restore",
    (o) => o.canvas.hide(["e:u_7"]),
    (c) => c.restore(["e:u_7"]),
    action({ kind: "restore", keys: ["e:u_7"] }),
  ],
  [
    "exit 8 reveal",
    () => {},
    (c) => c.reveal(["ds_snow"]),
    action({ kind: "showMany", ids: ["ds_snow"] }),
  ],
  [
    "exit 3 select",
    () => {},
    (c) => c.select("e:ug_exec"),
    { kind: "focus", id: "e:ug_exec" },
  ],
  [
    "exit 3 focus",
    () => {},
    (c) => c.focus("ug_exec"),
    { kind: "focus", id: "e:ug_exec" },
  ],
  [
    "exit 9 hide the root",
    () => {},
    (c) => c.hide([ROOT]),
    action({ kind: "hide", node: ROOT }),
  ],
];

describe("S5 exits 3-9 glide home first, then the effect", () => {
  it.each(ROWS)("%s", async (_n, given, call, exit) => {
    const o = await open("s-access");
    given(o);
    vi.advanceTimersByTime(T);
    const before = group(o, ROOT);
    const want = exitOf(o, exit as Parameters<typeof engine.exitAround>[1]);
    expect(want.steps).toHaveLength(2);
    const camera = o.cam();
    spy.calls = [];
    spy.fits = 0;
    played(o, () => call(o.canvas), before, want.state);
    expect(spy.calls.filter((c) => c !== "exitAround")).toEqual([]);
    expect(spy.calls).toContain("exitAround");
    expect(spy.fits).toBe(0);
    expect(o.state().around).toBeNull();
    expect(o.cam()).toEqual(camera);
  });

  it("exit 3 focus of an off-screen faded node pans and zooms out after the last step", async () => {
    const a = await open("s-access");
    group(a, ROOT);
    const div = document.createElement("div");
    document.body.appendChild(div);
    // why: H7 — a saved grouped state and a camera that puts e:ug_exec off screen
    const cam = { k: 1.1, x: -600, y: 300 };
    const c = createCanvas(div, {
      text: TEXT,
      model: a.model,
      state: a.state(),
      camera: cam,
    });
    const settles: CanvasEvent["settle"][] = [];
    c.on("settle", (e) => settles.push(e));
    await Promise.resolve();
    vi.advanceTimersByTime(T);
    expect(settles.at(-1)?.camera).toEqual(cam);
    spy.draws = [];
    c.focus("ug_exec");
    vi.advanceTimersByTime(T);
    expect(spy.draws.map((d) => d.motion.kind)).toEqual(["local", "none"]);
    expect(spy.draws[1].motion.focus).toBe("e:ug_exec");
    const end = settles.at(-1) as CanvasEvent["settle"];
    expect(end.camera.k).toBeLessThanOrEqual(cam.k);
    const node = spy.draws[1].scene.nodes.find((n) => n.id === "e:ug_exec");
    const n = node as { x: number; y: number; r: number };
    const t = end.camera;
    for (const [v, s] of [
      [t.x + t.k * (n.x - n.r), 800],
      [t.x + t.k * (n.x + n.r), 800],
      [t.y + t.k * (n.y - n.r), 600],
      [t.y + t.k * (n.y + n.r), 600],
    ])
      expect(v >= -1e-9 && v <= s + 1e-9).toBe(true);
  });
});

type Ten = [string, string, string, (o: Open) => void, (c: Canvas) => void];
const STAR = 'g:["tag_pii","taggedWith","<","table"]';
const TENS: Ten[] = [
  [
    "S17 collapse ug_fin_admin",
    "s-access",
    "e:t_FCT_PIPELINE",
    (o) => o.canvas.expand("e:ug_fin_admin"),
    (c) => c.collapse("e:ug_fin_admin"),
  ],
  ...(["force", "atomic", "bubbles"] as const).map((layout): Ten => [
    `S42 expand e:u_12 (${layout})`,
    "s-access",
    "e:ug_exec",
    (o) => o.canvas.setLayout(layout),
    (c) => c.expand("e:u_12"),
  ]),
  [
    "D100 (c) expand the group",
    "s-star",
    STAR,
    () => {},
    (c) => c.expand(STAR),
  ],
  ["D101 L-9 focus t_0", "s-star", STAR, () => {}, (c) => c.focus("t_0")],
];

describe("S6 exit 10: the root leaves the canvas", () => {
  it.each(TENS)("%s", async (name, key, root, given, call) => {
    const o = await open(key);
    given(o);
    vi.advanceTimersByTime(T);
    const before = group(o, root);
    const { graph, vocab } = o.model;
    const kind = name.includes("collapse")
      ? { kind: "collapse", id: "ug_fin_admin" }
      : name.includes("u_12")
        ? { kind: "explore", id: "u_12" }
        : { kind: "expandGroup", group: STAR };
    const r = exitOf(
      o,
      action(kind) as Parameters<typeof engine.exitAround>[1],
    );
    expect(r.steps).toHaveLength(2);
    const want = name.includes("t_0")
      ? engine.transition(
          r.state,
          { kind: "select", entity: "t_0" },
          graph,
          vocab,
        )
      : r.state;
    played(o, () => call(o.canvas), before, want);
    expect(spy.draws).toHaveLength(2);
  });
});
