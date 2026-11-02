// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "#contract";
import {
  canvasColor,
  drawnIdOf,
  frontier,
  hide,
  normalize,
  place,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type CanvasState,
  type DrawnNode,
  type Frontier,
  type Graph,
  type Hex,
  type Point,
  type Vocab,
} from "#engine";
import { loadFixture } from "#fixtures";
import { iconMetrics, type RendererText } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas, type Canvas, type CanvasEvent } from "./index";

// why: jsdom has no ResizeObserver and gives each element 0 × 0
const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const LIGHT = canvasColor("#F4F4F5") as Hex;
// The scenes of this test draw no tooltip, so only these keys are read.
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

type W = { graph: Graph; vocab: Vocab; known: Set<string> };
type Ref = { state: CanvasState; front: Frontier; crowded: boolean };
type Call = { name: string; arg: unknown };
const isGroup = (n: DrawnNode) => "members" in n;
const node = (r: Ref, id: unknown) => r.front.nodes.find((n) => n.id === id);
const entityOf = (n: DrawnNode) => ("entity" in n ? n.entity : "");
const sorted = (list: string[]) => [...list].sort().join("\n");

// The reference router: written from the story routing table, not imported (LEARNINGS 26).
const NONE = "select selectEdge toggleFamily togglePredicate approach";
function route(w: W, r: Ref, a: Action, next: CanvasState): Ref | null {
  if (next === r.state) return null;
  const after = frontier(next, w.graph, w.vocab);
  const ids = (f: Frontier) => sorted(f.nodes.map((n) => n.id));
  const keys = (s: CanvasState) => sorted(s.hidden.map((h) => h.key));
  const same = ids(after) === ids(r.front) && keys(next) === keys(r.state);
  if (a.kind === "showMany" && same) return null;
  if (NONE.split(" ").includes(a.kind))
    return { state: next, front: after, crowded: false };
  if (a.kind === "budget" || a.kind === "reset") {
    const state = setLayout(next, after, w.vocab, next.layout, iconMetrics);
    return { state, front: after, crowded: false };
  }
  const change = { action: a, before: r.front, after };
  const p = place(next, change, w.vocab, iconMetrics);
  return { state: p.state, front: after, crowded: p.crowded };
}
const step = (w: W, r: Ref, a: Action) =>
  route(w, r, a, transition(r.state, a, w.graph, w.vocab));

function focusRef(w: W, r: Ref, id: string): Ref | null {
  if (!w.known.has(id)) return null;
  const n = node(r, drawnIdOf(r.state, w.graph, w.vocab, id));
  if (n !== undefined && !isGroup(n))
    return step(w, r, { kind: "select", node: n.id });
  const a: Action =
    n === undefined
      ? { kind: "path", id }
      : { kind: "expandGroup", group: n.id };
  const next = transition(r.state, a, w.graph, w.vocab);
  const to = drawnIdOf(next, w.graph, w.vocab, id);
  if (next === r.state || to === null) return null;
  const out = route(w, r, a, next) as Ref;
  const m = node(out, to);
  if (m === undefined || isGroup(m)) return out;
  const select: Action = { kind: "select", entity: id };
  return { ...out, state: transition(out.state, select, w.graph, w.vocab) };
}

function hideRef(w: W, r: Ref, ids: string[]): Ref | null {
  const list = [...new Set(ids)].map((id) => node(r, id));
  const nodes = list.filter((x) => x !== undefined);
  if (nodes.length === 0) return null;
  const many = nodes.flatMap((x) => ("members" in x ? x.members : [x.entity]));
  const a: Action =
    nodes.length === 1
      ? { kind: "hide", node: nodes[0].id }
      : { kind: "hideMany", ids: many };
  const out = hide(r.state, a, w.graph, w.vocab);
  return out.refused !== undefined ? null : route(w, r, a, out.state);
}

const anchorOf = ({ selection: s }: CanvasState) =>
  s === null ? "" : "edge" in s ? s.anchor : s.node;

function refOf(w: W, r: Ref, c: Call): Ref | null {
  const n = node(r, c.arg);
  const list = c.arg as string[];
  if (c.name === "expand")
    return n === undefined
      ? null
      : step(
          w,
          r,
          isGroup(n)
            ? { kind: "expandGroup", group: n.id }
            : { kind: "explore", id: entityOf(n) },
        );
  if (c.name === "collapse") {
    if (n !== undefined && !isGroup(n))
      return step(w, r, { kind: "collapse", id: entityOf(n) });
    const member = r.front.nodes.some((x) => "group" in x && x.group === c.arg);
    const g = typeof c.arg === "string" && c.arg.startsWith("g:");
    if (!g || (n === undefined && !member)) return null;
    return step(w, r, { kind: "collapseGroup", group: c.arg as string });
  }
  if (c.name === "hide") return hideRef(w, r, list);
  if (c.name === "restore") {
    const keys = list.filter((k) => r.state.hidden.some((h) => h.key === k));
    if (keys.length === 0) return null;
    return step(w, r, { kind: "restore", keys: [...new Set(keys)] });
  }
  if (c.name === "reveal") {
    const ids = [...new Set(list)].filter((id) => w.known.has(id));
    return ids.length === 0 ? null : step(w, r, { kind: "showMany", ids });
  }
  if (c.name === "focus") return focusRef(w, r, c.arg as string);
  if (c.name === "activate")
    return n === undefined ? null : activateRef(w, r, n);
  if (c.name === "select") {
    if (c.arg === null || n !== undefined)
      return step(w, r, { kind: "select", node: n?.id ?? null });
    if (!r.front.edges.some((e) => e.key === c.arg)) return null;
    const edge = c.arg as string;
    return step(w, r, { kind: "selectEdge", edge, anchor: anchorOf(r.state) });
  }
  if (c.name === "setLayout") {
    const name = c.arg as "force";
    const state = setLayout(r.state, r.front, w.vocab, name, iconMetrics);
    return { state, front: r.front, crowded: false };
  }
  return step(w, r, c.arg as Action);
}

function activateRef(w: W, r: Ref, n: DrawnNode): Ref | null {
  const open = !isGroup(n) && n.opened > 0;
  if (isGroup(n) || open || n.more > 0)
    return refOf(w, r, { name: open ? "collapse" : "expand", arg: n.id });
  if ("group" in n && n.group !== null)
    return refOf(w, r, { name: "collapse", arg: n.group });
  return focusRef(w, r, entityOf(n));
}

// why: LEARNINGS 26 — every fourth call takes a node that is not drawn: hidden, of a type that is
// off, a member of a collapsed group, or unknown
function target(w: W, r: Ref, rand: () => number, i: number): string {
  const pick = (list: string[]) => list[Math.floor(rand() * list.length)];
  const drawn = r.front.nodes.map((x) => x.id);
  if (i % 4 !== 3 && drawn.length > 0) return pick(drawn);
  const e = (ids: string[]) => ids.map((id) => `e:${id}`);
  const hidden = e(r.state.hidden.flatMap((h) => h.members));
  const members = e(
    r.front.nodes.flatMap((x) => ("members" in x ? x.members : [])),
  );
  const off = e([...w.known]).filter((id) => !drawn.includes(id));
  return pick([...hidden, ...members, ...off, "e:nope", "g:nope"]);
}

const KINDS =
  "expand collapse hide restore reveal focus filter select activate";
const MORE = " setLayout setBudget resetView setApproach";
function callOf(w: W, r: Ref, rand: () => number, i: number): Call {
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(rand() * list.length)];
  const name = pick((KINDS + MORE).split(" "));
  const id = target(w, r, rand, i);
  const many = 1 + Math.floor(rand() * 3);
  const on = rand() < 0.5;
  const filters: Action[] = [
    { kind: "toggleType", type: pick([...w.vocab.types.keys(), null]), on },
    { kind: "showAllTypes" },
    { kind: "toggleFamily", family: pick(w.vocab.families).key, on },
    {
      kind: "togglePredicate",
      predicate: pick([...w.vocab.predicates.keys()]),
      on,
    },
    { kind: "grouping", grouping: pick([2, 5, 10, "off"] as const) },
  ];
  const edges = r.front.edges.map((e) => e.key).concat(["[]"]);
  const args: Record<string, unknown> = {
    hide: Array.from({ length: many }, () => target(w, r, rand, i)),
    restore: [pick([...r.state.hidden.map((h) => h.key), id])],
    reveal: [id.slice(2)],
    focus: id.slice(2),
    select: pick([id, null, pick(edges)]),
    setLayout: pick(["force", "atomic", "bubbles", "tree-h", "tree-v"]),
    setBudget: { kind: "budget", budget: pick([10, 20, 50, "all"] as const) },
    resetView: { kind: "reset" },
    setApproach: {
      kind: "approach",
      approach: pick(["active", "passive"] as const),
    },
    filter: pick(filters),
  };
  return { name, arg: name in args ? args[name] : id };
}

function invoke(canvas: Canvas, div: HTMLElement, c: Call): void {
  const a = c.arg as Action;
  if (c.name === "setBudget" && a.kind === "budget") canvas.setBudget(a.budget);
  else if (c.name === "resetView") canvas.resetView();
  else if (c.name === "setApproach" && a.kind === "approach")
    canvas.setApproach(a.approach);
  else if (c.name === "filter") canvas.setFilters(c.arg as never);
  else if (c.name !== "activate")
    (canvas as unknown as Record<string, (arg: unknown) => void>)[c.name](
      c.arg,
    );
  else
    [...div.querySelectorAll("g.qt-node")]
      .find(
        (g) => (g as unknown as { __data__: DrawnNode }).__data__.id === c.arg,
      )
      ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
}

const spotsOf = (r: Ref) => {
  const all = new Map(r.state.positions);
  return new Map(r.front.nodes.map((n) => [n.id, all.get(n.id) as Point]));
};
const far = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function domMatches(div: HTMLElement, r: Ref): void {
  const dom = [...div.querySelectorAll("g.qt-node")].map((g) => [
    (g as unknown as { __data__: DrawnNode }).__data__.id,
    g.getAttribute("transform"),
  ]);
  const want = [...spotsOf(r)].map(([id, p]) => [
    id,
    `translate(${p.x},${p.y})`,
  ]);
  expect(dom).toEqual(want);
}

type Cam = CanvasEvent["settle"]["camera"];
// why: SA §6 rows 1, 3, 6, 8, 19 and 20 after each call (QA round 2 item 7)
function rows(c: Call, was: Ref, now: Ref, cams: [Cam, Cam]): void {
  const a = spotsOf(was);
  const b = spotsOf(now);
  const kept = [...a].filter(([id]) => b.has(id));
  const kind = (c.arg as { kind?: string } | null)?.kind ?? "";
  if (c.name === "filter" && ["toggleFamily", "togglePredicate"].includes(kind))
    expect(now.state.positions).toEqual(was.state.positions);
  if (c.name === "restore")
    for (const [id, p] of kept) expect(b.get(id)).toEqual(p);
  if (c.name === "hide") expect(now.front.nodes.length).toBeGreaterThan(0);
  if (c.name === "resetView" && now.state.approach === "active")
    expect(now.state.selection).not.toBeNull();
  const p0 = a.get(c.arg as string);
  if (c.name !== "expand" || p0 === undefined || now === was) return;
  if (!now.crowded)
    for (const [id, p] of kept)
      if (id !== c.arg)
        expect(far(b.get(id) as Point, p)).toBeLessThan(100 + 1e-9);
  const p1 = b.get(c.arg as string) ?? p0;
  const [t0, t1] = cams;
  const s = { x: t0.x + t0.k * p0.x, y: t0.y + t0.k * p0.y };
  if (s.x < 0 || s.x > 800 || s.y < 0 || s.y > 600) return;
  expect(Math.abs(t1.x + t1.k * p1.x - s.x)).toBeLessThan(1e-9);
  expect(Math.abs(t1.y + t1.k * p1.y - s.y)).toBeLessThan(1e-9);
}

// why: SA §6 row 2 at a fixed rate — call 8 of each ten expands a drawn entity with `opened` 0
// and `more` above 0, and call 9 collapses it
function pairCall(r: Ref, i: number, undo: string | null): Call | null {
  if (i % 10 === 9 && undo !== null) return { name: "collapse", arg: undo };
  if (i % 10 !== 8) return null;
  const n = r.front.nodes.find(
    (x) => !isGroup(x) && x.opened === 0 && x.more > 0,
  );
  return n === undefined ? null : { name: "expand", arg: n.id };
}

const CHAIN = () => {
  const chain = loadFixture("s-chain").input as { view?: object };
  return { ...chain, view: { ...chain.view, budget: 10 } };
};
const RUNS: [number, string, () => unknown][] = [
  [1, "s-access", () => loadFixture("s-access").input],
  [2, "s-star", () => loadFixture("s-star").input],
  [3, "the s-chain copy with budget 10", CHAIN],
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

describe("S26 300 seeded calls against a reference router (LEARNINGS 26)", () => {
  it.each(RUNS)(
    "seed %d on %s",
    async (seed, _name, input) => {
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
      const result = normalize(input(), { now: "2026-10-19" });
      if (!result.ok) throw new Error("fatal");
      const { graph, payload, hash } = result;
      const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
      const known = new Set(
        graph.entities.flatMap((e) => [e.id, ...e.records]),
      );
      const w: W = { graph, vocab, known };
      const div = document.createElement("div");
      document.body.appendChild(div);
      const model = { graph, payload, hash, vocab, canvas: LIGHT };
      const canvas = createCanvas(div, { text: TEXT, model });
      const settles: CanvasEvent["settle"][] = [];
      canvas.on("settle", (e) => settles.push(e));
      await Promise.resolve();
      const last = () => settles[settles.length - 1];
      let ref: Ref = {
        state: last().state,
        front: last().frontier,
        crowded: false,
      };
      const rand = mulberry32(seed);
      let undo: { id: string; spots: Map<string, Point> } | null = null;
      let pairs = 0;
      for (let i = 0; i < 100; i++) {
        const call: Call =
          pairCall(ref, i, undo?.id ?? null) ?? callOf(w, ref, rand, i);
        const was = ref;
        const t0 = last().camera;
        invoke(canvas, div, call);
        ref = refOf(w, ref, call) ?? ref;
        expect(last().state, `${i} ${JSON.stringify(call)}`).toEqual(ref.state);
        domMatches(div, ref);
        rows(call, was, ref, [t0, last().camera]);
        if (i % 10 === 9 && undo !== null) {
          expect(spotsOf(ref)).toEqual(undo.spots);
          pairs++;
        }
        const opened: boolean =
          i % 10 === 8 && call.name === "expand" && ref !== was;
        undo = opened ? { id: call.arg as string, spots: spotsOf(was) } : null;
      }
      expect(pairs).toBeGreaterThan(0);
    },
    120_000,
  );
});
