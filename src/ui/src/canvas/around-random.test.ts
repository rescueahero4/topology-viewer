// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  collapseAround,
  drawnIdOf,
  exitAround,
  expandAround,
  fadeSet,
  frontier,
  groupAround,
  hide,
  normalize,
  place,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type AroundExit,
  type CanvasState,
  type DrawnNode,
  type Frontier,
  type Graph,
  type Hex,
  type LayoutName,
  type Point,
  type Vocab,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import {
  iconMetrics as M,
  type Renderer,
  type RendererText,
  type Scene,
} from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
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

type W = { graph: Graph; vocab: Vocab; known: Set<string> };
// `home`: the glide-home step of an exit with 2 steps (build-time item (c))
type Ref = { state: CanvasState; front: Frontier; home?: CanvasState };
type Call = { name: string; arg: unknown };
const isGroup = (n: DrawnNode) => "members" in n;
const entityOf = (n: DrawnNode) => ("entity" in n ? n.entity : "");
const expandOf = (n: DrawnNode): Action =>
  isGroup(n)
    ? { kind: "expandGroup", group: n.id }
    : { kind: "explore", id: entityOf(n) };
const node = (r: Ref, id: unknown) => r.front.nodes.find((n) => n.id === id);
const sorted = (list: string[]) => [...list].sort().join("\n");
const faded = (r: Ref, id: unknown) =>
  fadeSet(r.state, r.front).some((f) => f.id === id);
const at = (w: W, state: CanvasState, home?: CanvasState): Ref => ({
  state,
  front: frontier(state, w.graph, w.vocab),
  home,
});

// The reference router: from the story Context "Routing while grouped" and STORY-003-05, not
// imported (LEARNINGS 26). `exitAround` gives no step when the canvas is not grouped.
function exit(w: W, r: Ref, e: AroundExit): Ref | null {
  const x = exitAround(r.state, e, r.front, w.graph, w.vocab, M);
  if (x.steps.length === 0) return null;
  return at(w, x.state, x.steps.length === 2 ? x.steps[0] : undefined);
}
const NONE = "select selectEdge toggleFamily togglePredicate approach";
function route(w: W, r: Ref, a: Action, next: CanvasState): Ref | null {
  if (next === r.state) return null;
  const after = frontier(next, w.graph, w.vocab);
  const keys = (s: CanvasState) => sorted(s.hidden.map((h) => h.key));
  const ids = (f: Frontier) => sorted(f.nodes.map((n) => n.id));
  if (a.kind === "showMany" && ids(after) === ids(r.front))
    if (keys(next) === keys(r.state)) return null;
  if (NONE.split(" ").includes(a.kind)) return { state: next, front: after };
  if (a.kind === "budget" || a.kind === "reset")
    return at(w, setLayout(next, after, w.vocab, next.layout, M));
  const change = { action: a, before: r.front, after };
  const grouped = r.state.around !== null;
  const expand = a.kind === "explore" || a.kind === "expandGroup";
  const fold = a.kind === "collapse" || a.kind === "collapseGroup";
  const fn =
    grouped && expand ? expandAround : grouped && fold ? collapseAround : place;
  return { state: fn(next, change, w.vocab, M).state, front: after };
}
const step = (w: W, r: Ref, a: Action) =>
  exit(w, r, { kind: "action", action: a }) ??
  route(w, r, a, transition(r.state, a, w.graph, w.vocab));

const selectEntity = (w: W, s: CanvasState, id: string) => {
  const n = frontier(s, w.graph, w.vocab).nodes.find(
    (x) => x.id === drawnIdOf(s, w.graph, w.vocab, id),
  );
  if (n === undefined || isGroup(n)) return s;
  return transition(s, { kind: "select", entity: id }, w.graph, w.vocab);
};
function focusRef(w: W, r: Ref, id: string): Ref | null {
  if (!w.known.has(id)) return null;
  const n = node(r, drawnIdOf(r.state, w.graph, w.vocab, id));
  if (n !== undefined && !isGroup(n))
    return faded(r, n.id)
      ? exit(w, r, { kind: "focus", id: n.id })
      : step(w, r, { kind: "select", node: n.id });
  const a: Action =
    n === undefined
      ? { kind: "path", id }
      : { kind: "expandGroup", group: n.id };
  const ex = exit(w, r, { kind: "action", action: a });
  if (ex !== null) return at(w, selectEntity(w, ex.state, id), ex.home);
  const next = transition(r.state, a, w.graph, w.vocab);
  const to = drawnIdOf(next, w.graph, w.vocab, id);
  if (next === r.state || to === null) return null;
  const out = route(w, r, a, next) as Ref;
  if (faded(out, to)) {
    const x = exit(w, out, { kind: "focus", id: to }) as Ref;
    return { state: x.state, front: x.front };
  }
  return { ...out, state: selectEntity(w, out.state, id) };
}

function hideRef(w: W, r: Ref, ids: string[]): Ref | null {
  const nodes = [...new Set(ids)].flatMap((id) => node(r, id) ?? []);
  if (nodes.length === 0) return null;
  const many = nodes.flatMap((x) => ("members" in x ? x.members : [x.entity]));
  const a: Extract<Action, { kind: "hide" | "hideMany" }> =
    nodes.length === 1
      ? { kind: "hide", node: nodes[0].id }
      : { kind: "hideMany", ids: many };
  const ex = exit(w, r, { kind: "action", action: a });
  if (ex !== null) return ex;
  const out = hide(r.state, a, w.graph, w.vocab);
  return out.refused !== undefined ? null : route(w, r, a, out.state);
}

const anchorOf = ({ selection: s }: CanvasState) =>
  s === null ? null : "edge" in s ? s.anchor : s.node;
function groupRef(w: W, r: Ref, on: unknown): Ref | null {
  if (on === false) return exit(w, r, { kind: "off" });
  const root = anchorOf(r.state);
  if (on !== true || root === null || r.state.around?.root === root)
    return null;
  const next = groupAround(r.state, r.front, root, M);
  return next === r.state ? null : at(w, next);
}

function refOf(w: W, r: Ref, c: Call): Ref | null {
  const n = node(r, c.arg);
  const list = c.arg as string[];
  if (c.name === "expand")
    return n === undefined ? null : step(w, r, expandOf(n));
  if (c.name === "collapse") {
    if (n !== undefined && !isGroup(n))
      return step(w, r, { kind: "collapse", id: entityOf(n) });
    const member = r.front.nodes.some((x) => "group" in x && x.group === c.arg);
    if (!String(c.arg).startsWith("g:") || (n === undefined && !member))
      return null;
    return step(w, r, { kind: "collapseGroup", group: c.arg as string });
  }
  if (c.name === "hide") return hideRef(w, r, list);
  if (c.name === "restore") {
    const keys = list.filter((k) => r.state.hidden.some((h) => h.key === k));
    return keys.length === 0
      ? null
      : step(w, r, { kind: "restore", keys: [...new Set(keys)] });
  }
  if (c.name === "reveal") {
    const ids = [...new Set(list)].filter((id) => w.known.has(id));
    return ids.length === 0 ? null : step(w, r, { kind: "showMany", ids });
  }
  if (c.name === "focus") return focusRef(w, r, c.arg as string);
  if (c.name === "select") {
    if (c.arg === null) return step(w, r, { kind: "select", node: null });
    if (n !== undefined)
      return faded(r, n.id)
        ? exit(w, r, { kind: "focus", id: n.id })
        : step(w, r, { kind: "select", node: n.id });
    return null;
  }
  if (c.name === "groupAroundRoot") return groupRef(w, r, c.arg);
  if (c.name === "setApproach")
    return step(w, r, { kind: "approach", approach: c.arg as "active" });
  if (c.name === "setLayout") {
    const name = c.arg as LayoutName;
    if (r.state.around !== null) return exit(w, r, { kind: "layout", name });
    return at(w, setLayout(r.state, r.front, w.vocab, name, M));
  }
  return step(w, r, c.arg as Action);
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
