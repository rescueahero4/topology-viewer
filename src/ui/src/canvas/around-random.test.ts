// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  fadeSet,
  normalize,
  resolveVocab,
  type CanvasState,
  type DrawnNode,
  type Frontier,
  type Hex,
  type LayoutName,
  type Point,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import type { Renderer, RendererText, Scene } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anchorOf,
  refOf,
  type Call,
  type Ref,
  type W,
} from "./around-reference";
import { createCanvas, type Canvas, type CanvasEvent } from "./index";

// why: build-time item (c) — the first drawn scene of each call is read through a pass-through mock
const spy = vi.hoisted(() => ({ scenes: [] as Scene[] }));
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        draw: (scene, motion) => (
          spy.scenes.push(scene),
          r.draw(scene, motion)
        ),
      } satisfies Renderer;
    },
  };
});

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const LIGHT = canvasColor("#F4F4F5") as Hex;
const TEXT = {
  groupLabel: (typeLabel: string, count: number) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  bubbleCount: (n: number) => ` · ${n}`,
  lostMark: "lost",
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

// why: each call name is the name of a `Canvas` method
const invoke = (canvas: Canvas, c: Call) =>
  (canvas as unknown as Record<string, (arg: unknown) => void>)[c.name](c.arg);

// why: LEARNINGS 26 — each fourth call targets a faded, hidden, type-off (not drawn) or group node
function target(w: W, r: Ref, rand: () => number, i: number): string {
  const pick = (list: string[]) => list[Math.floor(rand() * list.length)];
  const drawn = r.front.nodes.map((x) => x.id);
  if (i % 4 !== 3) return pick(drawn);
  const e = (ids: string[]) => ids.map((id) => `e:${id}`);
  const pool = [
    ...fadeSet(r.state, r.front).map((f) => f.id),
    ...e(r.state.hidden.flatMap((h) => h.members)),
    ...e(r.front.nodes.flatMap((x) => ("members" in x ? x.members : []))),
    ...e([...w.known]).filter((id) => !drawn.includes(id)),
  ];
  return pick(pool.length > 0 ? pool : drawn);
}

// why: build-time item (e) — hostile ids and no-change calls while grouped, once each
const HOSTILE: Call[] = [
  { name: "groupAroundRoot", arg: 1 },
  { name: "groupAroundRoot", arg: "true" },
  { name: "expand", arg: "__proto__" },
  { name: "collapse", arg: "e:nope" },
  { name: "hide", arg: [] },
  { name: "restore", arg: [] },
  { name: "reveal", arg: ["__proto__"] },
  { name: "focus", arg: "e:nope" },
  { name: "select", arg: "__proto__" },
];
const one = (name: string, arg: unknown): Call[] => [{ name, arg }];
const KINDS =
  "expand collapse hide restore reveal type showAll grouping focus faded approach regroup";
function callOf(w: W, r: Ref, rand: () => number, i: number): Call[] {
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(rand() * list.length)];
  if (r.state.around === null) return regroup(r);
  if (i >= 4 && i < 4 + HOSTILE.length) return [HOSTILE[i - 4]];
  const id = target(w, r, rand, i);
  const off = fadeSet(r.state, r.front).map((f) => f.id);
  const keys = r.state.hidden.map((h) => h.key);
  const filter = (arg: object) => one("setFilters", arg);
  switch (pick(KINDS.split(" "))) {
    case "expand":
      return one("expand", id);
    case "collapse":
      return one("collapse", id);
    case "hide":
      return one("hide", [id]);
    case "restore":
      return one("restore", [pick([...keys, id])]);
    case "reveal":
      return one("reveal", [id.slice(2)]);
    case "type":
      return filter({
        kind: "toggleType",
        type: pick([...w.vocab.types.keys()]),
        on: rand() < 0.4,
      });
    case "showAll":
      return filter({ kind: "showAllTypes" });
    case "grouping":
      return filter({ kind: "grouping", grouping: pick([2, 5, 10, "off"]) });
    case "focus":
      return one("focus", id.slice(2));
    case "faded":
      return one("select", off.length > 0 ? pick(off) : id);
    case "approach":
      return one("setApproach", pick(["active", "passive"]));
    default:
      return [...one("select", pick(r.front.nodes).id), ...GROUP];
  }
}
// why: Context S17 (A) — after a call that ends the grouping, group around the selected node,
// else around the first drawn node
const GROUP = one("groupAroundRoot", true);
const regroup = (r: Ref): Call[] =>
  anchorOf(r.state) === null
    ? [...one("select", r.front.nodes[0].id), ...GROUP]
    : GROUP;

const spotsOf = (r: { state: CanvasState; front: Frontier }) => {
  const all = new Map(r.state.positions);
  return new Map(r.front.nodes.map((n) => [n.id, all.get(n.id) as Point]));
};
// why: the DOM equals the state: each position and each fade flag
function domMatches(div: HTMLElement, r: Ref): void {
  const off = new Set(fadeSet(r.state, r.front).map((f) => f.id));
  const want = [...spotsOf(r)].map(
    ([id, p]) => `${id} ${p.x},${p.y} ${off.has(id)}`,
  );
  const dom = [...div.querySelectorAll("g.qt-node")].map((g) => {
    const id = (g as unknown as { __data__: DrawnNode }).__data__.id;
    return `${id} ${g.getAttribute("transform")?.slice(10, -1)} ${g.classList.contains("qt-off")}`;
  });
  expect(dom).toEqual(want);
}

async function world(key: string, layout: LayoutName) {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const result = normalize(loadFixture(key).input, { now: "2026-10-19" });
  if (!result.ok) throw new Error("fatal");
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const known = new Set(graph.entities.flatMap((e) => [e.id, ...e.records]));
  const w: W = { graph, vocab, known };
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, {
    text: TEXT,
    model: { graph, payload, hash, vocab, canvas: LIGHT },
  });
  const settles: CanvasEvent["settle"][] = [];
  canvas.on("settle", (e) => settles.push(e));
  await Promise.resolve();
  let ref: Ref = { state: settles[0].state, front: settles[0].frontier };
  const run = (c: Call) => {
    const was = ref;
    spy.scenes = [];
    invoke(canvas, c);
    ref = refOf(w, ref, c) ?? ref;
    expect(settles[settles.length - 1].state, JSON.stringify(c)).toEqual(
      ref.state,
    );
    domMatches(div, ref);
    const saved = new Map(was.state.around?.saved ?? []);
    if (ref.home !== undefined)
      for (const n of spy.scenes[0].nodes)
        if (saved.has(n.id))
          expect({ x: n.x, y: n.y }).toEqual(saved.get(n.id));
    return ref;
  };
  run({ name: "setLayout", arg: layout });
  return { w, run, now: () => ref };
}

const PAIRS = ["s-access", "s-lineage"].flatMap((key) =>
  (["force", "atomic", "bubbles"] as const).flatMap((layout) =>
    [1, 2, 3].map((seed) => [key, layout, seed] as const),
  ),
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

describe("S17 (A) the full mix against the reference router", () => {
  it.each(PAIRS)(
    "%s in %s, seed %d",
    async (key, layout, seed) => {
      const { w, run, now } = await world(key, layout);
      const rand = mulberry32(seed);
      let exits = 0;
      for (const c of regroup(now())) run(c);
      for (let i = 0; i < 50; i++)
        for (const c of callOf(w, now(), rand, i))
          if (run(c).home !== undefined) exits++;
      expect(exits).toBeGreaterThan(0);
    },
    120_000,
  );
});
