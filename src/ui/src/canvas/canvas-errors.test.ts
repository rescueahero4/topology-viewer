// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState, Hex } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent, CanvasModel } from "./index";

// why: a pass-through mock; `fail` plants a throw in the next call of one engine function (S17)
const spy = vi.hoisted(() => ({ fail: null as string | null }));
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  const planted =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A): R => {
      if (spy.fail === name) {
        spy.fail = null;
        throw new Error("planted");
      }
      return fn(...args);
    };
  return {
    ...mod,
    transition: planted("transition", mod.transition),
    place: planted("place", mod.place),
    hide: planted("hide", mod.hide),
    firstView: planted("firstView", mod.firstView),
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
};

function access(): CanvasModel {
  const r = engine.normalize(loadFixture("s-access").input, {
    now: "2026-10-19",
  });
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
async function open(model: CanvasModel = access()) {
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
  return { div, canvas, log, model };
}
type Open = Awaited<ReturnType<typeof open>>;

const snapshot = (div: HTMLElement) => div.innerHTML;
const nodeEl = (div: HTMLElement, id: string) =>
  [...div.querySelectorAll("g.qt-node")].find(
    (g) => (g as unknown as { __data__: { id: string } }).__data__.id === id,
  ) as Element;

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.fail = null;
  document.body.replaceChildren();
});

const CASES: [string, string, (o: Open) => void][] = [
  [
    "(a) a double-click intent",
    "transition",
    (o) =>
      nodeEl(o.div, "e:t_FCT_REVENUE").dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true }),
      ),
  ],
  [
    "(a) place after transition",
    "place",
    (o) => o.canvas.expand("e:t_FCT_REVENUE"),
  ],
  ["(a) the engine hide", "hide", (o) => o.canvas.hide(["e:u_0"])],
  ["(b) setBudget(10)", "transition", (o) => o.canvas.setBudget(10)],
];

describe("S17 an engine throw keeps everything and gives one notice (rule (c))", () => {
  it.each(CASES)("%s", async (_n, name, call) => {
    const o = await open();
    const before = snapshot(o.div);
    const boot = o.log.settle[0];
    const settles = o.log.settle.length;
    spy.fail = name;
    expect(() => call(o)).not.toThrow();
    expect(spy.fail).toBeNull();
    expect(o.log.notice).toEqual([{ kind: "error" }]);
    expect(Object.keys(o.log.notice[0])).toEqual(["kind"]);
    expect(o.log.settle).toHaveLength(settles);
    expect(vi.getTimerCount()).toBe(0);
    expect(snapshot(o.div)).toBe(before);
    o.canvas.setData(boot.frontier);
    expect(o.log.settle[settles].state).toEqual(boot.state);
    expect(o.log.settle[settles].camera).toEqual(boot.camera);
  });

  it("(c) a throw in the factory empties the container and goes to the caller", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    spy.fail = "firstView";
    expect(() => createCanvas(div, { text: TEXT, model: access() })).toThrow(
      "planted",
    );
    expect(div.childNodes).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Security build-time items 1 and 2: a saved state of the same hash with a bad position", () => {
  const broken: [string, (s: CanvasState) => CanvasState][] = [
    ["no position", (s) => ({ ...s, positions: s.positions.slice(1) })],
    [
      "a position that is not finite",
      (s) => ({
        ...s,
        positions: s.positions.map(([id, p], i) => [
          id,
          i === 0 ? { x: NaN, y: p.y } : p,
        ]),
      }),
    ],
  ];
  it.each(broken)(
    "%s: the factory throws, no timer, no event",
    async (_n, edit) => {
      const o = await open();
      const saved = edit(o.log.settle[0].state);
      const div = document.createElement("div");
      document.body.appendChild(div);
      let canvas: Canvas | null = null;
      expect(() => {
        canvas = createCanvas(div, {
          text: TEXT,
          model: o.model,
          state: saved,
        });
      }).toThrow();
      expect(canvas).toBeNull();
      expect(div.childNodes).toHaveLength(0);
      await Promise.resolve();
      vi.advanceTimersByTime(1000);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

describe("S18 handler throws (Security A5)", () => {
  it("the other handlers run, the motion ends and one notice comes", async () => {
    const o = await open();
    const second: CanvasEvent["settle"][] = [];
    o.canvas.on("settle", () => {
      throw new Error("settle handler");
    });
    o.canvas.on("settle", (e) => second.push(e));
    o.canvas.on("notice", () => {
      throw new Error("notice handler");
    });
    o.canvas.expand("e:t_FCT_REVENUE");
    vi.advanceTimersByTime(2000);
    expect(second).toHaveLength(1);
    expect(second[0].frontier.nodes).toHaveLength(16);
    expect(o.log.explore).toHaveLength(1);
    spy.fail = "transition";
    o.canvas.setBudget(10);
    expect(o.log.notice).toEqual([{ kind: "error" }]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
