// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type {
  Action,
  CanvasState,
  DrawnId,
  DrawnNode,
  Frontier,
  Graph,
  Hex,
  Point,
  Vocab,
} from "#engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RendererText } from "#renderer";
import type { Canvas, CanvasEvent } from "./index";

// why: pass-through mock; production code has no test hook. It counts the `beginDrag` calls
const spy = vi.hoisted(() => ({ begins: 0 }));
vi.mock("#engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#engine")>();
  return {
    ...mod,
    beginDrag: (...args: Parameters<typeof mod.beginDrag>) => {
      spy.begins++;
      return mod.beginDrag(...args);
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
const { iconMetrics } = await import("#renderer");
const { createCanvas } = await import("./index");

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const LIGHT = engine.canvasColor("#F4F4F5") as Hex;
// The scenes of this test draw no tooltip, so only these keys are read.
const TEXT = {
  groupLabel: (typeLabel: string, count: number) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
} as RendererText;

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type W = { graph: Graph; vocab: Vocab; faded: ReadonlySet<DrawnId> };
type Ref = { state: CanvasState; front: Frontier };
const isGroup = (n: DrawnNode) => "members" in n;

// The reference router: written from the STORY-003-05 routing table, not imported (LEARNINGS 26).
function routed(w: W, r: Ref, a: Action, next: CanvasState): Ref {
  if (next === r.state) return r;
  const after = engine.frontier(next, w.graph, w.vocab);
  const change = { action: a, before: r.front, after };
  const { state } = engine.place(next, change, w.vocab, iconMetrics);
  return { state, front: after };
}
const act = (w: W, r: Ref, a: Action) =>
  routed(w, r, a, engine.transition(r.state, a, w.graph, w.vocab));

type Step =
  | { kind: "drag"; id: DrawnId; dx: number; dy: number; hold: number }
  | { kind: "expand" | "collapse" | "hide" | "restore"; id: string }
  | { kind: "toggleType"; type: string; on: boolean }
  | { kind: "setLayout"; name: "force" | "atomic" | "tree-h" };

function refOf(w: W, r: Ref, s: Step): Ref {
  const n = r.front.nodes.find((x) => x.id === ("id" in s ? s.id : ""));
  if (s.kind === "expand" && n !== undefined)
    return act(
      w,
      r,
      isGroup(n)
        ? { kind: "expandGroup", group: n.id }
        : { kind: "explore", id: n.entity },
    );
  if (s.kind === "collapse") {
    if (n !== undefined && !isGroup(n))
      return act(w, r, { kind: "collapse", id: n.entity });
    const member = r.front.nodes.some((x) => !isGroup(x) && x.group === s.id);
    if (s.id.startsWith("g:") && (n !== undefined || member))
      return act(w, r, { kind: "collapseGroup", group: s.id });
  }
  if (s.kind === "hide" && n !== undefined) {
    const a: Action = { kind: "hide", node: n.id };
    const out = engine.hide(r.state, a, w.graph, w.vocab);
    return out.refused !== undefined ? r : routed(w, r, a, out.state);
  }
  if (s.kind === "restore" && r.state.hidden.some((h) => h.key === s.id))
    return act(w, r, { kind: "restore", keys: [s.id] });
  if (s.kind === "toggleType")
    return act(w, r, { kind: "toggleType", type: s.type, on: s.on });
  if (s.kind === "setLayout")
    return {
      state: engine.setLayout(r.state, r.front, w.vocab, s.name, iconMetrics),
      front: r.front,
    };
  return r;
}

type Camera = CanvasEvent["settle"]["camera"];
type Log = { states: CanvasState[]; cam: Camera | null };
const latest = (log: Log) => log.states[log.states.length - 1];
const mouse = (type: string, x: number, y: number, buttons: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons,
  });
  // why: QA round 2 (c) — `d3-drag` adds its listeners on `event.view` (see `drag-fixtures.test.ts`)
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const datumId = (g: Element) =>
  (g as unknown as { __data__: { id: string } }).__data__.id;
const drawnOf = (positions: [DrawnId, Point][], f: Frontier) => {
  const all = new Map(positions);
  return new Map(f.nodes.map((n) => [n.id, all.get(n.id) as Point]));
};
function dom(div: HTMLElement) {
  return new Map(
    [...div.querySelectorAll("g.qt-node")].map((g) => {
      const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
        g.getAttribute("transform") ?? "",
      );
      return [datumId(g), { x: Number(m?.[1]), y: Number(m?.[2]) }];
    }),
  );
}
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

type Drag = Extract<Step, { kind: "drag" }>;
// why: SA §6 row 4 in each frame — 1-, 2- and 3-hop followers at most 48, 17 and 6 from the start,
// nothing beyond 3 hops moves; the DOM equals the reference `dragStep` positions. A press on a
// node that is not drawn (its element is kept from before the change) starts no drag
function drag(
  w: W,
  r: Ref,
  s: Drag,
  k: number,
  div: HTMLElement,
  el?: Element,
): Ref {
  const begins = spy.begins;
  const drawn = r.front.nodes.some((n) => n.id === s.id);
  el?.dispatchEvent(mouse("mousedown", 100, 100, 1));
  window.dispatchEvent(mouse("mousemove", 100 + s.dx * k, 100 + s.dy * k, 1));
  const ok = drawn && !w.faded.has(s.id) && (s.dx !== 0 || s.dy !== 0);
  const ctx0 = ok ? engine.beginDrag(r.state, r.front, s.id) : null;
  const home = drawnOf(r.state.positions, r.front);
  const hops = hopsOf(r.front, s.id);
  const p0 = home.get(s.id) ?? { x: 0, y: 0 };
  const x = p0.x + (100 + s.dx * k - 100) / k;
  const pointer = { x, y: p0.y + (100 + s.dy * k - 100) / k };
  let ctx = ctx0;
  for (let i = 0; i <= s.hold; i++) {
    const step = ctx === null ? null : engine.dragStep(ctx, pointer);
    ctx = step?.ctx ?? null;
    vi.advanceTimersByTime(16);
    const want = step === null ? home : drawnOf(step.positions, r.front);
    expect(dom(div)).toEqual(want);
    for (const [id, p] of want) {
      const h = hops.get(id) ?? 4;
      const q = home.get(id) as Point;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (h === 4) expect(d).toBe(0);
      else if (h > 0) expect(d).toBeLessThanOrEqual([48, 17, 6][h - 1] + 1e-9);
    }
  }
  window.dispatchEvent(mouse("mouseup", 100 + s.dx * k, 100 + s.dy * k, 0));
  vi.advanceTimersByTime(16);
  if (ctx === null) {
    if (!ok) expect(spy.begins - begins).toBe(0);
    return r;
  }
  return { state: engine.release(ctx).state, front: r.front };
}

function invoke(c: Canvas, s: Exclude<Step, Drag>) {
  if (s.kind === "setLayout") c.setLayout(s.name);
  else if (s.kind === "expand") c.expand(s.id);
  else if (s.kind === "collapse") c.collapse(s.id);
  else if (s.kind === "hide") c.hide([s.id]);
  else if (s.kind === "restore") c.restore([s.id]);
  else if (s.kind === "toggleType")
    c.setFilters({ kind: "toggleType", type: s.type, on: s.on });
}

// why: LEARNINGS 26 — each fourth drag starts on a node that is not drawn now (hidden, of a type
// that is off, or a member of a collapsed group); its element is kept from before the change
function stepOf(
  w: W,
  r: Ref,
  rand: () => number,
  drags: number,
  kept: Map<string, Element>,
): Step {
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(rand() * list.length)];
  const drawn = r.front.nodes.map((n) => n.id);
  const gone = [...kept.keys()].filter((id) => !drawn.includes(id));
  const kind = pick([
    "drag",
    "drag",
    "drag",
    "expand",
    "collapse",
    "hide",
    "restore",
    "toggleType",
    "setLayout",
  ] as const);
  if (kind === "drag") {
    const id = drags % 4 === 3 && gone.length > 0 ? pick(gone) : pick(drawn);
    const D = rand() * 600;
    const a = rand() * 2 * Math.PI;
    return {
      kind,
      id,
      dx: D * Math.cos(a),
      dy: D * Math.sin(a),
      hold: Math.floor(rand() * 11),
    };
  }
  if (kind === "restore")
    return { kind, id: pick([...r.state.hidden.map((h) => h.key), "e:nope"]) };
  if (kind === "toggleType")
    return { kind, type: pick([...w.vocab.types.keys()]), on: rand() < 0.5 };
  if (kind === "setLayout")
    return { kind, name: pick(["force", "atomic", "tree-h"] as const) };
  const groups = r.front.nodes.flatMap((n) =>
    "group" in n && n.group !== null ? [n.group] : [],
  );
  return { kind, id: pick([...drawn, ...(kind === "collapse" ? groups : [])]) };
}

async function open(key: string, state?: (w: W, r: Ref) => CanvasState) {
  const r0 = engine.normalize(loadFixture(key).input, { now: "2026-10-19" });
  if (!r0.ok) throw new Error("fatal");
  const { graph, payload, hash } = r0;
  const { vocab } = engine.resolveVocab(graph, payload, profile, LIGHT);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const model = { graph, payload, hash, vocab, canvas: LIGHT };
  let canvas = createCanvas(div, { text: TEXT, model });
  const log: Log = { states: [], cam: null };
  const listen = (c: Canvas) => {
    for (const name of ["select", "explore", "drag-end", "settle"] as const)
      c.on(name, (e) => log.states.push(e.state));
    c.on("settle", (e) => (log.cam = e.camera));
  };
  listen(canvas);
  await Promise.resolve();
  const w: W = { graph, vocab, faded: new Set() };
  let ref: Ref = {
    state: latest(log),
    front: engine.frontier(latest(log), graph, vocab),
  };
  if (state !== undefined) {
    const grouped = state(w, ref);
    w.faded = new Set(engine.fadeSet(grouped, ref.front).map((f) => f.id));
    canvas = createCanvas(div, { text: TEXT, model, state: grouped });
    listen(canvas);
    await Promise.resolve();
    ref = { state: grouped, front: ref.front };
  }
  return { div, canvas, log, w, ref };
}

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

const RUNS: [number, string, LayoutStart][] = [
  [1, "s-chain", "force"],
  [2, "s-star", "force"],
  [3, "s-access", "atomic"],
];
type LayoutStart = "force" | "atomic";

describe("S11 300 seeded steps with node drags against the engine (LEARNINGS 26)", () => {
  it.each(RUNS)(
    "seed %d on %s (%s)",
    async (seed, key, layout) => {
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
      const o = await open(key);
      let ref = o.ref;
      if (layout === "atomic") {
        o.canvas.setLayout("atomic");
        ref = refOf(o.w, ref, { kind: "setLayout", name: "atomic" });
      }
      const rand = mulberry32(seed);
      const kept = new Map<string, Element>();
      let drags = 0;
      let undrawn = 0;
      for (let i = 0; i < 100; i++) {
        for (const g of o.div.querySelectorAll("g.qt-node"))
          kept.set(datumId(g), g);
        const s = stepOf(o.w, ref, rand, drags, kept);
        if (s.kind === "drag") {
          if (drags % 4 === 3 && !ref.front.nodes.some((n) => n.id === s.id))
            undrawn++;
          drags++;
          ref = drag(o.w, ref, s, o.log.cam?.k ?? 1, o.div, kept.get(s.id));
        } else {
          invoke(o.canvas, s);
          ref = refOf(o.w, ref, s);
        }
        expect(latest(o.log), `${i} ${JSON.stringify(s)}`).toEqual(ref.state);
        expect(dom(o.div)).toEqual(drawnOf(ref.state.positions, ref.front));
      }
      expect(drags).toBeGreaterThan(20);
      expect(undrawn).toBeGreaterThan(0);
    },
    120_000,
  );

  it("faded nodes: seeded drags on the S8 grouped canvas; each fourth drag on the faded node", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const o = await open("s-access", (w, r) =>
      engine.groupAround(r.state, r.front, "e:t_FCT_REVENUE", iconMetrics),
    );
    expect([...o.w.faded]).toEqual(["e:ug_exec"]);
    const rand = mulberry32(4);
    let ref = o.ref;
    for (let i = 0; i < 20; i++) {
      const el = (id: string) =>
        [...o.div.querySelectorAll("g.qt-node")].find((g) => datumId(g) === id);
      const drawn = ref.front.nodes
        .map((n) => n.id)
        .filter((id) => !o.w.faded.has(id));
      const id =
        i % 4 === 3 ? "e:ug_exec" : drawn[Math.floor(rand() * drawn.length)];
      const D = rand() * 600;
      const s: Drag = {
        kind: "drag",
        id,
        dx: D,
        dy: 0,
        hold: Math.floor(rand() * 11),
      };
      ref = drag(o.w, ref, s, o.log.cam?.k ?? 1, o.div, el(id));
      expect(latest(o.log)).toEqual(ref.state);
    }
  });
});
