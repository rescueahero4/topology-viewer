// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState, Hex, Point } from "@qdic-topology/engine";
import type { DrawMotion, Renderer, Scene } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through spies; `draws` records each scene and motion, `fits` the fit calls and `places`
// the actions of the engine `place`
const spy = vi.hoisted(() => ({
  draws: [] as { scene: Scene; motion: DrawMotion | undefined }[],
  fits: 0,
  places: [] as string[],
}));
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  return {
    ...mod,
    place: (...args: Parameters<typeof mod.place>) => {
      spy.places.push(args[1].action.kind);
      return mod.place(...args);
    },
  };
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
          spy.draws.push({ scene, motion });
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

type Log = { [K in keyof CanvasEvent]: CanvasEvent[K][] };
async function open(input: unknown) {
  const model = modelOf(input);
  const div = document.createElement("div");
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
  const state = () => log.settle[log.settle.length - 1].state;
  const settled = (call: () => void) => {
    call();
    vi.advanceTimersByTime(3000);
    return state();
  };
  return { model, div, canvas, log, state, settled };
}

const datum = (el: Element) =>
  (el as unknown as { __data__: { id: string } }).__data__.id;
function spots(div: HTMLElement): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const g of div.querySelectorAll("g.qt-node")) {
    const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
      g.getAttribute("transform") ?? "",
    );
    out.set(datum(g), { x: Number(m?.[1]), y: Number(m?.[2]) });
  }
  return out;
}
afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.draws = [];
  spy.fits = 0;
  spy.places = [];
  document.body.replaceChildren();
});

const ACCESS = () => loadFixture("s-access").input;

const RECORDS = ["homes", "nudges", "treeShifts"];
function keyScan(value: unknown, path: string[] = []): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) =>
    RECORDS.includes(k) ? [[...path, k].join(".")] : keyScan(v, [...path, k]),
  );
}

describe("S16 the motion reads no engine record (hand-off items 13, 15, D77, D96 (1))", () => {
  const LISTS: [string, string[][], (s: CanvasState) => void][] = [
    [
      "list A",
      [
        ["expand", "e:ug_analytics"],
        ["expand", 'g:["ug_analytics","memberOf","<","user"]'],
        ["expand", "e:u_15"],
        ["expand", "e:ag_c360"],
        ["hide", "e:ds_snow"],
        ["expand", "e:ag_c360"],
      ],
      (s) => {
        const items = s.nudges.flatMap(([, , list]) => list);
        const big = items.find(
          ([id, x0, y0, x1, y1]) =>
            id === "e:ag_c360" &&
            Math.abs(Math.hypot(x1 - x0, y1 - y0) - 200) < 1e-3,
        );
        expect(big).toBeDefined();
      },
    ],
    [
      "list B",
      [
        ["hide", "e:ug_fin_admin"],
        ["expand", "e:u_0"],
        ["hide", "e:ug_fin_admin"],
        ["expand", "e:u_7"],
      ],
      (s) => {
        const items = s.nudges.flatMap(([, , list]) => list);
        for (const name of ["e:t_FCT_PIPELINE", "e:t_FCT_CHURN"])
          expect(
            items.some(
              ([id, x0, y0, x1, y1]) => id === name && x0 === x1 && y0 === y1,
            ),
          ).toBe(true);
      },
    ],
  ];
  it.each(LISTS)("%s", async (_n, steps, check) => {
    const o = await open(ACCESS());
    for (const [kind, id] of steps.slice(0, -1))
      o.settled(() =>
        kind === "hide" ? o.canvas.hide([id]) : o.canvas.expand(id),
      );
    const drawn = spots(o.div);
    const [kind, id] = steps[steps.length - 1];
    if (kind === "hide") o.canvas.hide([id]);
    else o.canvas.expand(id);
    const { scene, motion } = spy.draws[spy.draws.length - 1];
    const frame0 = spots(o.div);
    for (const [key, p] of frame0)
      if (drawn.has(key)) expect(p).toEqual(drawn.get(key));
    vi.advanceTimersByTime(3000);
    check(o.state());
    for (const n of scene.nodes)
      expect(spots(o.div).get(n.id)).toEqual({ x: n.x, y: n.y });
    expect(keyScan(scene)).toEqual([]);
    expect(keyScan(motion)).toEqual([]);
  });

  // why: the records of an earlier event hold start points that are no longer drawn positions
  it("list A, then one more explore: the motion starts from the drawn positions", async () => {
    const o = await open(ACCESS());
    for (const [kind, id] of LISTS[0][1])
      o.settled(() =>
        kind === "hide" ? o.canvas.hide([id]) : o.canvas.expand(id),
      );
    const drawn = spots(o.div);
    const stale = o
      .state()
      .nudges.flatMap(([, , list]) => list)
      .filter(([id, x0, y0]) => {
        const p = drawn.get(id);
        return p !== undefined && (p.x !== x0 || p.y !== y0);
      });
    expect(stale.length).toBeGreaterThan(0);
    const frontier = o.log.settle[o.log.settle.length - 1].frontier;
    const more = frontier.nodes.find((n) => "entity" in n && n.more > 0);
    expect(more).toBeDefined();
    const draws = spy.draws.length;
    o.canvas.expand(more?.id ?? "");
    expect(spy.draws.length).toBe(draws + 1);
    for (const [key, p] of spots(o.div))
      if (drawn.has(key)) expect(p).toEqual(drawn.get(key));
  });
});
