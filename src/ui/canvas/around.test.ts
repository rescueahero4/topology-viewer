// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Hex, Point } from "#engine";
import type { DrawMotion, FitOptions, Renderer } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through spies; `draws` records the motion of each draw, `fits` the fit options
const spy = vi.hoisted(() => ({
  draws: [] as (DrawMotion | undefined)[],
  fits: [] as (FitOptions | undefined)[],
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
          spy.fits.push(options);
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
const { fitTransform, iconMetrics } = await import("#renderer");
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
async function open(key: string) {
  const model = modelOf(loadFixture(key).input);
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
  vi.advanceTimersByTime(3000);
  const state = () => log.settle[log.settle.length - 1].state;
  const events = () => Object.values(log).reduce((n, l) => n + l.length, 0);
  return { model, div, canvas, log, state, events };
}

const datum = (el: Element) =>
  (el as unknown as { __data__: { id?: string; key?: string } }).__data__;
function spots(div: HTMLElement): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const g of div.querySelectorAll("g.qt-node")) {
    const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
      g.getAttribute("transform") ?? "",
    );
    out.set(datum(g).id as string, { x: Number(m?.[1]), y: Number(m?.[2]) });
  }
  return out;
}
function camera(div: HTMLElement) {
  const t = div.querySelector("g.qt-viewport")?.getAttribute("transform") ?? "";
  const m = /^translate\(([^,]+),([^)]+)\) scale\(([^)]+)\)$/.exec(t);
  return { x: Number(m?.[1]), y: Number(m?.[2]), k: Number(m?.[3]) };
}
const offs = (div: HTMLElement, selector: string) =>
  [...div.querySelectorAll(`${selector}.qt-off`)].map((el) => {
    const d = datum(el);
    return d.id ?? d.key;
  });
const chip = (div: HTMLElement, id: string) =>
  [...div.querySelectorAll("g.qt-node")]
    .find((g) => datum(g).id === id)
    ?.querySelector("g.qt-more text")?.textContent;

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.draws = [];
  spy.fits = [];
  document.body.replaceChildren();
});

const ROOT = "e:t_FCT_REVENUE";
const FADED_EDGE = '["e:u_12","memberOf","e:ug_exec"]';

describe("S1 groupAroundRoot(true) on the s-access first view", () => {
  it("arranges, fades e:ug_exec and its edge, counts the chip, then fits the shown frame", async () => {
    const o = await open("s-access");
    const first = o.state();
    expect([first.layout, first.selection]).toEqual(["force", { node: ROOT }]);
    expect(spots(o.div).size).toBe(7);
    expect(chip(o.div, "e:u_12")).toBe("+3");
    const { graph, vocab } = o.model;
    const drawn = engine.frontier(first, graph, vocab);
    const want = engine.groupAround(first, drawn, ROOT, iconMetrics);
    o.canvas.groupAroundRoot(true);
    expect(spy.draws.at(-1)).toMatchObject({ kind: "local", anchor: null });
    expect(spy.fits).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    expect(spots(o.div)).toEqual(new Map(want.positions));
    expect(engine.fadeSet(o.state(), drawn).map((f) => f.id)).toEqual([
      "e:ug_exec",
    ]);
    expect(o.state().around?.shown).toEqual([
      ROOT,
      "e:ug_analytics",
      "e:ug_fin_admin",
      "e:u_0",
      "e:u_7",
      "e:u_12",
    ]);
    expect(offs(o.div, "g.qt-node")).toEqual(["e:ug_exec"]);
    expect(offs(o.div, "path.qt-edge")).toEqual([FADED_EDGE]);
    expect(offs(o.div, "path.qt-ehit")).toEqual([FADED_EDGE]);
    expect(o.div.querySelectorAll("path.qt-ehit")).toHaveLength(
      o.div.querySelectorAll("path.qt-edge").length,
    );
    expect(chip(o.div, "e:u_12")).toBe("+4");
    expect(o.state().hidden).toEqual([]);
    expect(o.canvas.onCanvas("ug_exec")).toBe("faded");
    expect(spy.fits).toHaveLength(1);
    const fit = spy.fits[0] as FitOptions;
    expect([fit.pad, fit.minK, fit.animate, fit.boxes?.length]).toEqual([
      60,
      0.8,
      undefined,
      12,
    ]);
    const at = new Map(want.positions).get(ROOT) as Point;
    const mirrors = fit.boxes?.filter((_, i) => i % 2 === 1) ?? [];
    const shown = fit.boxes?.filter((_, i) => i % 2 === 0) ?? [];
    shown.forEach((b, i) => {
      expect(mirrors[i].x).toBeCloseTo(2 * at.x - b.x, 9);
      expect(mirrors[i].y).toBeCloseTo(2 * at.y - b.y, 9);
      expect(mirrors[i].r).toBe(b.r);
    });
    const c = camera(o.div);
    expect(c.k).toBeCloseTo(1.1407157420202236, 9);
    expect(c.x).toBeCloseTo(455.4274100140633, 9);
    expect(c.y).toBeCloseTo(336.17101947828905, 9);
    expect(fitTransform(fit.boxes ?? [], 800, 600, 60, 0.8)?.k).toBeCloseTo(
      c.k,
      12,
    );
  });

  it("the group fit is animated: mid-way the camera is between the two transforms", async () => {
    const o = await open("s-access");
    const before = camera(o.div);
    o.canvas.groupAroundRoot(true);
    const settles = o.log.settle.length;
    for (let ms = 0; o.log.settle.length === settles && ms < 3000; ms += 16)
      vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(200);
    const mid = camera(o.div);
    vi.advanceTimersByTime(3000);
    const end = camera(o.div);
    expect(mid.k).not.toBeCloseTo(before.k, 6);
    expect(mid.k).not.toBeCloseTo(end.k, 6);
  });
});

// why: QA verification item 3 (plant Q41) — the draw of the arrange keeps the hit paths of the
// earlier viewport; the kept hit path of a faded edge gets qt-off at once, not at the motion end
describe("S1 a kept hit path during the arrange motion", () => {
  it("32 ms after groupAroundRoot(true) the hit path of the faded edge has qt-off", async () => {
    const o = await open("s-access");
    const hit = () =>
      [...o.div.querySelectorAll("path.qt-ehit")].find(
        (p) => datum(p).key === FADED_EDGE,
      );
    expect(hit()?.classList.contains("qt-off")).toBe(false);
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(32);
    expect(o.log.settle).toHaveLength(1);
    expect(hit()?.classList.contains("qt-off")).toBe(true);
  });
});

describe("S2 groupAroundRoot(false) after S1", () => {
  it("one glide home to the exact positions, equal sets, no qt-off, then fit() of all nodes", async () => {
    const o = await open("s-access");
    const before = o.state();
    const home = spots(o.div);
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    const draws = spy.draws.length;
    o.canvas.groupAroundRoot(false);
    expect(spy.fits).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(spy.draws.length - draws).toBe(1);
    expect(spy.draws.at(-1)).toMatchObject({ kind: "local", anchor: null });
    expect(spots(o.div)).toEqual(home);
    expect(o.state().around).toBeNull();
    expect(o.state().positions).toEqual(before.positions);
    expect(o.state().hidden).toEqual(before.hidden);
    expect(o.div.querySelectorAll(".qt-off")).toHaveLength(0);
    expect(spy.fits).toHaveLength(2);
    expect(spy.fits[1]).toEqual({});
    const boxes = [...o.div.querySelectorAll("g.qt-node")].map((g) => {
      const d = datum(g) as unknown as { x: number; y: number; r: number };
      return { x: d.x, y: d.y, r: d.r };
    });
    const want = fitTransform(boxes, 800, 600, 40, 0);
    const c = camera(o.div);
    expect(c.k).toBeCloseTo(want?.k ?? NaN, 9);
    expect(c.x).toBeCloseTo(want?.x ?? NaN, 9);
  });
});

describe("S3 the qt-off rule of tokens.css", () => {
  it("has the five selectors, opacity and pointer-events with !important, visibility and the transition", () => {
    const css = readFileSync(
      path.resolve(import.meta.dirname, "../tokens.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = /([^{}]*\.qt-off[^{}]*)\{([^}]*)\}/.exec(css);
    const selectors = rule?.[1].split(",").map((s) => s.trim());
    expect(selectors).toEqual([
      ".qt-root .qt-node.qt-off",
      ".qt-root .qt-edge.qt-off",
      ".qt-root .qt-ehit.qt-off",
      ".qt-root .qt-elabel.qt-off",
      ".qt-root .qt-focus.qt-off",
    ]);
    const body = (rule?.[2] ?? "")
      .split(";")
      .map((d) => d.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(body).toEqual([
      "opacity: 0 !important",
      "visibility: hidden",
      "pointer-events: none !important",
      "transition: opacity 0.25s, visibility 0s 0.25s",
    ]);
  });
});

describe("S4 the same root, no selection, an edge selection", () => {
  it("the same root again and a non-boolean argument give no change and no event", async () => {
    const o = await open("s-access");
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    const html = o.div.innerHTML;
    const state = o.state();
    const events = o.events();
    const draws = spy.draws.length;
    o.canvas.groupAroundRoot(true);
    for (const bad of [1, "true", null, undefined, {}])
      o.canvas.groupAroundRoot(bad as boolean);
    vi.advanceTimersByTime(3000);
    expect([o.div.innerHTML, o.state(), o.events(), spy.draws.length]).toEqual([
      html,
      state,
      events,
      draws,
    ]);
  });

  it("with no selection: no change", async () => {
    const o = await open("s-access");
    o.canvas.select(null);
    vi.advanceTimersByTime(3000);
    const html = o.div.innerHTML;
    const events = o.events();
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    expect([o.div.innerHTML, o.events(), o.state().around]).toEqual([
      html,
      events,
      null,
    ]);
  });

  it("with an edge selection: grouped around its anchor, as S1", async () => {
    const o = await open("s-access");
    const first = o.state();
    const { graph, vocab } = o.model;
    const drawn = engine.frontier(first, graph, vocab);
    const want = engine.groupAround(first, drawn, ROOT, iconMetrics);
    o.canvas.select('["e:t_FCT_REVENUE","ownedBy","e:u_0"]');
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    expect(o.state().around?.root).toBe(ROOT);
    expect(spots(o.div)).toEqual(new Map(want.positions));
    expect(offs(o.div, "g.qt-node")).toEqual(["e:ug_exec"]);
  });
});

describe("S12 a tree layout refuses the grouping", () => {
  it("s-lineage in tree-h with e:db_revenue selected: no change of state or DOM, no event", async () => {
    const o = await open("s-lineage");
    o.canvas.setLayout("tree-h");
    o.canvas.select("e:db_revenue");
    vi.advanceTimersByTime(3000);
    expect(o.state().selection).toEqual({ node: "e:db_revenue" });
    const html = o.div.innerHTML;
    const state = o.state();
    const events = o.events();
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    expect([o.div.innerHTML, o.state(), o.events()]).toEqual([
      html,
      state,
      events,
    ]);
  });
});

describe("S13 Bubbles on s-designed", () => {
  it("shows the regulation and its 3 products; the 2 suppliers and 2 factories have qt-off", async () => {
    const o = await open("s-designed");
    o.canvas.setLayout("bubbles");
    o.canvas.select("e:reg_eu_battery");
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    const nodes = [...o.div.querySelectorAll("g.qt-node")];
    const shown = nodes.filter((g) => !g.classList.contains("qt-off"));
    expect(shown.map((g) => datum(g).id).sort()).toEqual(
      ["e:reg_eu_battery", "e:prd_cell", "e:prd_pack", "e:prd_bike"].sort(),
    );
    const types = nodes
      .filter((g) => g.classList.contains("qt-off"))
      .map((g) => (datum(g) as unknown as { type: string }).type)
      .sort();
    expect(types).toEqual(["factory", "factory", "supplier", "supplier"]);
  });
});
