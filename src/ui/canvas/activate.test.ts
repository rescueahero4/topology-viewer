// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "#engine";
import type { DrawMotion, Motion, Renderer } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through spies; `draws` records each motion, `fits` the fit calls
const spy = vi.hoisted(() => ({
  draws: [] as (DrawMotion | undefined)[],
  fits: 0,
}));
vi.mock("#renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        draw: (scene, motion) => {
          spy.draws.push(motion);
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
const engine = await import("#engine");
const { profile } = await import("#contract");
const { loadFixture } = await import("#fixtures");
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
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
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
async function open(key: string) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model: modelOf(key) });
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
  const count = () => div.querySelectorAll("g.qt-node").length;
  const viewport = () =>
    div.querySelector("g.qt-viewport")?.getAttribute("transform");
  const element = (id: string) =>
    [...div.querySelectorAll("g.qt-node")].find(
      (g) => (g as unknown as { __data__: { id: string } }).__data__.id === id,
    ) as Element;
  const activate = (id: string, how: "dblclick" | "Space" = "dblclick") => {
    const event =
      how === "dblclick"
        ? new MouseEvent("dblclick", { bubbles: true })
        : new KeyboardEvent("keydown", { key: " ", bubbles: true });
    element(id).dispatchEvent(event);
    vi.advanceTimersByTime(3000);
  };
  return { div, canvas, log, state, count, viewport, activate };
}

const lastMotion = () => spy.draws[spy.draws.length - 1] as Motion;
const GROUP = 'g:["tag_pii","taggedWith","<","table"]';

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.draws = [];
  spy.fits = 0;
  document.body.replaceChildren();
});

describe("S5 s-star: a group, a member and a selected node", () => {
  it("expands the group, collapses it from a member, then selects nothing new", async () => {
    const o = await open("s-star");
    expect(o.count()).toBe(4);
    o.activate(GROUP);
    expect(lastMotion().kind).toBe("local");
    expect(o.count()).toBe(303);
    o.activate("e:t_0");
    const m = lastMotion();
    expect(m.kind).toBe("collapse");
    expect(o.count()).toBe(4);
    expect(m.retractTo).toHaveLength(300);
    expect(m.starts).toHaveLength(1);
    const spot = m.starts[0][1];
    for (const [, p] of m.retractTo) expect(p).toEqual(spot);
    expect(spot.x).toBeCloseTo(-35.674544016929566, 9);
    expect(spot.y).toBeCloseTo(-107.94376142333907, 9);
    expect(o.state().selection).toEqual({ node: "e:tag_pii" });
    const state = o.state();
    const selects = o.log.select.length;
    const view = o.viewport();
    o.activate("e:tag_pii");
    expect(o.state()).toEqual(state);
    expect(o.log.select).toHaveLength(selects);
    expect(o.viewport()).toBe(view);
    expect(spy.fits).toBe(0);
    expect(lastMotion()).toMatchObject({ kind: "none", anchor: null });
  });
});

describe("S6 s-access: more, then opened (NF-5 Space)", () => {
  it.each(["dblclick", "Space"] as const)(
    "%s: expand, then collapse",
    async (how) => {
      const o = await open("s-access");
      const home = o.state();
      o.activate("e:t_FCT_REVENUE", how);
      expect(lastMotion()).toMatchObject({
        kind: "local",
        anchor: "e:t_FCT_REVENUE",
      });
      expect(o.count()).toBe(16);
      const opened = o.log.settle[o.log.settle.length - 1].frontier.nodes.find(
        (n) => n.id === "e:t_FCT_REVENUE",
      );
      expect(opened?.opened).toBe(34);
      o.activate("e:t_FCT_REVENUE", how);
      expect(lastMotion().kind).toBe("collapse");
      expect(o.count()).toBe(7);
      const drawn = new Set(
        o.log.settle[o.log.settle.length - 1].frontier.nodes.map((n) => n.id),
      );
      const back = o.state().positions.filter(([id]) => drawn.has(id));
      expect(new Map(back)).toEqual(
        new Map(home.positions.filter(([id]) => drawn.has(id))),
      );
    },
  );
});

describe("S6 order (mockup toggleGroup): opened comes before more", () => {
  it("an opened node with one more neighbour collapses", async () => {
    const o = await open("s-access");
    o.activate("e:t_FCT_REVENUE");
    o.canvas.hide(["e:sc_MARTS"]);
    vi.advanceTimersByTime(3000);
    const root = o.log.settle[o.log.settle.length - 1].frontier.nodes.find(
      (n) => n.id === "e:t_FCT_REVENUE",
    );
    expect([root?.opened, root?.more]).toEqual([33, 1]);
    o.activate("e:t_FCT_REVENUE");
    expect(lastMotion().kind).toBe("collapse");
  });
});
