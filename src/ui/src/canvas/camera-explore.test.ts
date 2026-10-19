// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  firstView,
  frontier,
  normalize,
  place,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type CanvasState,
  type Graph,
  type Hex,
  type Point,
  type Vocab,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  fitTransform,
  iconMetrics,
  revealPlan,
  type Box,
  type Camera,
  type RendererText,
  type Scene,
} from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditStrings, domAudit } from "./domAudit";
import { sceneOf } from "./scene";

type Callback = (
  entries: { contentRect: { width: number; height: number } }[],
) => void;
const observers: Callback[] = [];
// why: jsdom has no ResizeObserver and gives each element 0 × 0; the test drives both
class FakeObserver {
  constructor(cb: Callback) {
    observers.push(cb);
  }
  observe() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", FakeObserver);
let size = { w: 800, h: 600 };
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: size.w, height: size.h }) as DOMRect;

const NOW = "2026-10-19";
const CANVAS = canvasColor("#F4F4F5") as Hex;
const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  tipGroup: (count, typeLabel) => `${count} × ${typeLabel}`,
  tipOpened: (sub) => `${sub} · expanded`,
  tipMore: (sub, more) => `${sub} · ${more} more`,
  tipMember: (sub) => `${sub} · member`,
  tipEdge: (subject, object) => `${subject} → ${object}`,
  tipEdgeAction: (label) => label,
};

type Run = { graph: Graph; vocab: Vocab; state: CanvasState };

function firstOf(): Run {
  const result = normalize(loadFixture("s-access").input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
  const first = firstView(graph, vocab, payload, hash);
  const view = frontier(first, graph, vocab);
  const state = setLayout(first, view, vocab, first.layout, iconMetrics);
  return { graph, vocab, state };
}

const sceneAt = (run: Run, state: CanvasState): Scene =>
  sceneOf(
    {
      state,
      frontier: frontier(state, run.graph, run.vocab),
      vocab: run.vocab,
      canvas: CANVAS,
    },
    TEXT,
  );

function explore(run: Run, id: string): CanvasState {
  const action: Action = { kind: "explore", id: id.slice(2) };
  const next = transition(run.state, action, run.graph, run.vocab);
  const before = frontier(run.state, run.graph, run.vocab);
  const after = frontier(next, run.graph, run.vocab);
  return place(next, { action, before, after }, run.vocab, iconMetrics).state;
}

const box = (n: Scene["nodes"][number]): Box => ({ x: n.x, y: n.y, r: n.r });
const screen = (t: Camera, p: Point) => ({
  x: t.x + t.k * p.x,
  y: t.y + t.k * p.y,
});

type Row = [string, [number, number, number] | null, "union" | "must" | null];
const ROWS: Row[] = [
  ["e:t_FCT_REVENUE", [0.906563, 470.9935, 428.1666], "union"],
  ["e:ug_analytics", [1.060163, 368.4872, 338.9772], "union"],
  ["e:ug_fin_admin", [0.668943, 390.8329, 189.0336], "must"],
  ["e:ug_exec", [0.674428, 515.4412, 402.3767], "must"],
  ["e:u_0", [0.935062, 309.5259, 274.3644], "union"],
  ["e:u_7", null, null],
  ["e:u_12", null, null],
];

afterEach(() => {
  size = { w: 800, h: 600 };
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", FakeObserver);
  Reflect.deleteProperty(navigator, "maxTouchPoints");
  document.body.replaceChildren();
});

describe("S3 the explore camera of the s-access first view (TL-4, SA §6 row 6)", () => {
  const run = firstOf();
  const first = sceneAt(run, run.state);
  const t = fitTransform(first.nodes.map(box), 800, 600, 40, 0) as Camera;

  it.each(ROWS)("%s", (id, want, branch) => {
    const after = sceneAt(run, explore(run, id));
    const old = first.nodes.find((n) => n.id === id) as Scene["nodes"][number];
    const moved = after.nodes.find(
      (n) => n.id === id,
    ) as Scene["nodes"][number];
    const s = screen(t, old);
    const p = { x: moved.x, y: moved.y };
    const prev = new Set(first.nodes.map((n) => n.id));
    const seen = (n: Scene["nodes"][number]) => {
      const q = screen(t, first.nodes.find((f) => f.id === n.id) ?? n);
      return q.x >= 0 && q.x <= 800 && q.y >= 0 && q.y <= 600;
    };
    const must = after.nodes.filter((n) => n.id === id || !prev.has(n.id));
    const context = after.nodes.filter(
      (n) => n.id !== id && prev.has(n.id) && seen(n),
    );
    const plan = revealPlan(
      t,
      800,
      600,
      { s, p },
      must.map(box),
      context.map(box),
    );
    if (want === null) {
      expect(plan).toBeNull();
      return;
    }
    const c = plan as Camera;
    for (const [i, key] of (["k", "x", "y"] as const).entries())
      expect(Math.abs(c[key] - want[i])).toBeLessThan(1e-4);
    const mustOnly = revealPlan(t, 800, 600, { s, p }, must.map(box), []);
    if (branch === "must") expect(c).toEqual(mustOnly);
    else expect(c.k).toBeGreaterThanOrEqual(0.55 * t.k);
    const anchor = screen(c, p);
    expect(Math.abs(anchor.x - s.x)).toBeLessThan(1e-9);
    expect(Math.abs(anchor.y - s.y)).toBeLessThan(1e-9);
    expect(c.k).toBeLessThanOrEqual(t.k);
    for (const n of must) {
      const q = screen(c, n);
      expect(q.x >= 0 && q.x <= 800 && q.y >= 0 && q.y <= 600).toBe(true);
    }
  });

  it.each(ROWS)("%s through the renderer under reduced motion", (id, want) => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const div = document.createElement("div");
    document.body.appendChild(div);
    const renderer = createRenderer(div, { text: TEXT });
    renderer.draw(first);
    expect(renderer.transform()).toEqual(t);
    renderer.draw(sceneAt(run, explore(run, id)), { anchor: id });
    const c = renderer.transform();
    if (want === null) expect(c).toEqual(t);
    else
      for (const [i, key] of (["k", "x", "y"] as const).entries())
        expect(Math.abs(c[key] - want[i])).toBeLessThan(1e-4);
  });
});

describe("S19 the DOM audit after camera moves (DA-5, build-time items B4)", () => {
  it("keeps one --k declaration on the root and no finding at each step", () => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 1,
      configurable: true,
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const run = firstOf();
    const scene = sceneAt(run, run.state);
    const strings = auditStrings(run.graph, run.vocab, scene);
    const div = document.createElement("div");
    document.body.appendChild(div);
    createRenderer(div, { text: TEXT }).draw(scene);
    const root = div.firstElementChild as HTMLDivElement;
    const svg = root.querySelector("svg") as SVGSVGElement;
    const step = (k: number | null) => {
      const style = root.getAttribute("style") ?? "";
      const match = /^--k: ([0-9]+(\.[0-9]+)?);$/.exec(style);
      expect(match).not.toBeNull();
      if (k !== null)
        expect(Math.abs(Number(match?.[1]) - k)).toBeLessThan(1e-9);
      expect([null, "-webkit-tap-highlight-color: rgba(0,0,0,0);"]).toContain(
        svg.getAttribute("style"),
      );
      expect(domAudit(root, strings, TEXT.canvasName)).toEqual([]);
    };
    step(1.476959788076312);
    size = { w: 1000, h: 700 };
    observers[observers.length - 1]([
      { contentRect: { width: 1000, height: 700 } },
    ]);
    step(1.7609905165525257);
    const wheel = (deltaY: number) => {
      svg.dispatchEvent(new WheelEvent("wheel", { deltaY, cancelable: true }));
      vi.advanceTimersByTime(200);
    };
    wheel(1300);
    expect(root.classList.contains("qt-lod-low")).toBe(true);
    step(null);
    wheel(-900);
    expect(root.classList.contains("qt-lod-mid")).toBe(true);
    step(null);
  });
});
