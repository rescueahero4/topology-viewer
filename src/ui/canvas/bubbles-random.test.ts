// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DrawnNode, Hex, Point } from "#engine";
import type { BubbleHandlers, RendererText } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Call, Ref, W } from "./around-reference";
import type { Enclose } from "./bubbles-reference";
import type { Canvas, CanvasEvent } from "./index";

// why: S27 form — the `bubble` handlers that the controller gives to `createRenderer`
const spy = vi.hoisted(() => ({ bubble: null as BubbleHandlers | null }));
vi.mock("#renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      spy.bubble = args[1].bubble ?? null;
      return mod.createRenderer(...args);
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
const { refOf } = await import("./around-reference");
const { domSpots, drawnOf, shapesOf } = await import("./bubbles-reference");
// why: the reference circle is the `packEnclose` of the renderer's own `d3-hierarchy` copy
const renderer = path.resolve(
  import.meta.dirname,
  "../../../package.json",
);
const hierarchy = createRequire(renderer).resolve("d3-hierarchy");
const { packEnclose } = (await import(pathToFileURL(hierarchy).href)) as {
  packEnclose: Enclose;
};

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const LIGHT = engine.canvasColor("#F4F4F5") as Hex;
const TEXT = {
  groupLabel: (typeLabel: string, count: number) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  bubbleCount: (n: number) => ` · ${n}`,
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

const mouse = (type: string, x: number, y: number, buttons = 1) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons,
  });
  // why: STORY-003-06a decisions item 1 — the test gives `view` as an own property
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
const frame = () => vi.advanceTimersByTime(16);

type World = {
  w: W;
  div: HTMLElement;
  canvas: Canvas;
  last: () => CanvasEvent["settle"];
  ref: Ref;
};

// why: SA §6 rows 15, 16 — the DOM equals the reference state: the node positions, and one circle
// and one pill per shown type, each the `packEnclose` of the shown rooms within 1e-9
function check(g: World, label: string) {
  expect(g.last().state, label).toEqual(g.ref.state);
  const spots = domSpots(g.div);
  for (const n of g.ref.front.nodes)
    expect(spots.get(n.id), label).toEqual(
      new Map(g.ref.state.positions).get(n.id),
    );
  const want =
    g.ref.state.layout === "bubbles"
      ? shapesOf(g.ref.state, g.ref.front, g.w.vocab, packEnclose)
      : [];
  const got = drawnOf(g.div);
  expect(
    got.map((c) => c.type),
    label,
  ).toEqual(want.map((s) => s.type));
  expect(g.div.querySelectorAll("g.qt-blabel")).toHaveLength(want.length);
  for (const [i, c] of got.entries()) {
    const d = Math.max(
      Math.abs(c.x - want[i].x),
      Math.abs(c.y - want[i].y),
      Math.abs(c.r - want[i].r),
    );
    expect(d, label).toBeLessThan(1e-9);
  }
}

function pillDrag(g: World, rand: () => number) {
  const pills = [...g.div.querySelectorAll("g.qt-blabel")];
  if (pills.length === 0) return;
  const pill = pills[Math.floor(rand() * pills.length)];
  const type = datum<{ type: string | null }>(pill).type;
  const k = g.last().camera.k;
  const c0 = { x: 100, y: 100 };
  const D = (c: Point) => ({ x: (c.x - c0.x) / k, y: (c.y - c0.y) / k });
  let c = c0;
  let state = g.ref.state;
  const sum = { x: 0, y: 0 };
  pill.dispatchEvent(mouse("mousedown", c0.x, c0.y));
  for (let f = 1 + Math.floor(rand() * 5); f > 0; f--) {
    const next = {
      x: c.x + 1 + Math.floor(rand() * 30),
      y: c.y - 15 + Math.floor(rand() * 30),
    };
    const v = { x: D(next).x - D(c).x, y: D(next).y - D(c).y };
    window.dispatchEvent(mouse("mousemove", next.x, next.y));
    frame();
    state = engine.dragBubble(state, g.ref.front, type, v);
    sum.x += v.x;
    sum.y += v.y;
    c = next;
  }
  window.dispatchEvent(mouse("mouseup", c.x, c.y, 0));
  const before = new Map(g.ref.state.positions);
  const members = new Set(
    g.ref.front.nodes.filter((n) => n.type === type).map((n) => n.id),
  );
  for (const [id, p] of state.positions) {
    const b = before.get(id) as Point;
    if (!members.has(id)) expect(p).toEqual(b);
    else
      expect(
        Math.abs(p.x - b.x - sum.x) + Math.abs(p.y - b.y - sum.y),
      ).toBeLessThan(1e-9);
  }
  g.ref = { state, front: g.ref.front };
}

function nodeDrag(g: World, rand: () => number) {
  const nodes = [...g.div.querySelectorAll("g.qt-node")];
  const el = nodes[Math.floor(rand() * nodes.length)];
  const id = datum<DrawnNode>(el).id;
  const k = g.last().camera.k;
  const origin = new Map(g.ref.state.positions).get(id) as Point;
  let ctx = engine.beginDrag(g.ref.state, g.ref.front, id);
  el.dispatchEvent(mouse("mousedown", 100, 100));
  for (let f = 1 + Math.floor(rand() * 4); f > 0; f--) {
    const c = { x: 100 + 10 * f + Math.floor(rand() * 20), y: 100 + f };
    window.dispatchEvent(mouse("mousemove", c.x, c.y));
    frame();
    const pointer = {
      x: origin.x + (c.x - 100) / k,
      y: origin.y + (c.y - 100) / k,
    };
    if (ctx !== null) ctx = engine.dragStep(ctx, pointer).ctx;
  }
  window.dispatchEvent(mouse("mouseup", 200, 200, 0));
  if (ctx !== null)
    g.ref = { state: engine.release(ctx).state, front: g.ref.front };
}

const KINDS =
  "pill pill node expand collapse group hide restore type layout empty".split(
    " ",
  );
function step(g: World, rand: () => number, i: number) {
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(rand() * list.length)];
  const drawn = g.ref.front.nodes;
  // why: all types off draws nothing (`types-off`); Show all types brings the nodes back
  if (drawn.length === 0) {
    g.canvas.setFilters({ kind: "showAllTypes" });
    g.ref =
      refOf(g.w, g.ref, {
        name: "setFilters",
        arg: { kind: "showAllTypes" },
      }) ?? g.ref;
    return check(g, `${i} showAllTypes`);
  }
  const hidden = g.ref.state.hidden.flatMap((h) =>
    h.members.map((m) => `e:${m}`),
  );
  const id = i % 4 === 3 && hidden.length > 0 ? pick(hidden) : pick(drawn).id;
  const run = (c: Call) => {
    const was = g.ref;
    (g.canvas as unknown as Record<string, (a: unknown) => void>)[c.name](
      c.arg,
    );
    g.ref = refOf(g.w, g.ref, c) ?? g.ref;
    if (c.name === "expand") {
      const after = new Map(g.ref.state.positions);
      const still = new Set(g.ref.front.nodes.map((x) => x.id));
      for (const n of was.front.nodes)
        if (still.has(n.id))
          expect(after.get(n.id), `${i} expand ${String(c.arg)}`).toEqual(
            new Map(was.state.positions).get(n.id),
          );
    }
  };
  const kind = pick(KINDS);
  if (kind === "pill") pillDrag(g, rand);
  else if (kind === "node") nodeDrag(g, rand);
  else if (kind === "expand" || kind === "collapse")
    run({ name: kind, arg: id });
  else if (kind === "group") {
    const groups = drawn.filter((n) => "members" in n).map((n) => n.id);
    const opened = drawn.flatMap((n) =>
      "group" in n && n.group !== null ? [n.group] : [],
    );
    if (opened.length > 0 && rand() < 0.5)
      run({ name: "collapse", arg: pick(opened) });
    else if (groups.length > 0) run({ name: "expand", arg: pick(groups) });
  } else if (kind === "hide") run({ name: "hide", arg: [id] });
  else if (kind === "restore") {
    const keys = g.ref.state.hidden.map((h) => h.key);
    if (keys.length > 0) run({ name: "restore", arg: [pick(keys)] });
  } else if (kind === "type") {
    const type = pick([...g.w.vocab.types.keys()]);
    run({
      name: "setFilters",
      arg: { kind: "toggleType", type, on: rand() < 0.5 },
    });
  } else if (kind === "layout") {
    run({ name: "setLayout", arg: "force" });
    check(g, `${i} force`);
    run({ name: "setLayout", arg: "bubbles" });
  } else {
    const shown = new Set(drawn.map((n) => n.type));
    const none = [...g.w.vocab.types.keys()].filter((t) => !shown.has(t));
    if (none.length > 0) expect(spy.bubble?.start(pick(none))).toBe(false);
  }
  check(g, `${i} ${kind}`);
}

async function world(key: string): Promise<World> {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const r = engine.normalize(loadFixture(key).input, { now: "2026-10-19" });
  if (!r.ok) throw new Error("fatal");
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, LIGHT);
  const known = new Set(r.graph.entities.flatMap((e) => [e.id, ...e.records]));
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, {
    text: TEXT,
    model: { ...r, vocab, canvas: LIGHT },
  });
  const settles: CanvasEvent["settle"][] = [];
  canvas.on("settle", (e) => settles.push(e));
  await Promise.resolve();
  const last = () => settles[settles.length - 1];
  const w: W = { graph: r.graph, vocab, known };
  const g: World = {
    w,
    div,
    canvas,
    last,
    ref: { state: last().state, front: last().frontier },
  };
  const c: Call = { name: "setLayout", arg: "bubbles" };
  canvas.setLayout("bubbles");
  g.ref = refOf(w, g.ref, c) as Ref;
  check(g, "first");
  return g;
}

const RUNS = ["s-designed", "s-star"].flatMap((key) =>
  [1, 2, 3].map((seed) => [key, seed] as const),
);

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

describe("S28 seeded steps in Bubbles (SA §6 rows 15, 16; LEARNINGS 26)", () => {
  it.each(RUNS)(
    "%s, seed %d, 300 steps",
    async (key, seed) => {
      const g = await world(key);
      const rand = mulberry32(seed);
      for (let i = 0; i < 300; i++) step(g, rand, i);
    },
    120_000,
  );
});
