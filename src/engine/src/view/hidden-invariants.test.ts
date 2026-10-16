import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { entityType, resolveVocab } from "../vocab/resolve";
import { frontier, type Frontier } from "./frontier";
import { hiddenList, hiddenOf, onCanvas } from "./hidden";
import { firstView, hide, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const TYPES = ["t0", "t1", "t2", undefined];
const PREDICATES = ["contains", "ownedBy", "memberOf", "pX", "pY"];
const RUNS = 240;
const STEPS = 40;

// why: NF-3 — a seeded generator (mulberry32), so every run is the same
function random(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { int, pick: <T>(list: T[]) => list[int(list.length)] };
}

function world(seed: number) {
  const rnd = random(seed);
  const n = 6 + rnd.int(9);
  const ids = Array.from({ length: n }, (_, k) => `n${k}`);
  const input = {
    nodes: ids.map((id) => {
      const type = rnd.pick(TYPES);
      return type === undefined ? [id] : [id, type];
    }),
    edges: Array.from({ length: n + rnd.int(n + 1) }, () => [
      rnd.pick(ids),
      rnd.pick(PREDICATES),
      rnd.pick(ids),
    ]),
    view: rnd.int(2) === 0 ? { budget: 10 } : {},
  };
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const order = graph.entities.map((entity) => entity.id);
  const near = new Map(order.map((id) => [id, new Set<string>()]));
  for (const { subject, object } of graph.triples)
    if (subject !== object) {
      near.get(subject)?.add(object);
      near.get(object)?.add(subject);
    }
  const first = firstView(graph, vocab, payload, hash);
  return { rnd, graph, vocab, order, near, first };
}

type World = ReturnType<typeof world>;

function randomAction(w: World, state: CanvasState, view: Frontier): Action {
  const { rnd } = w;
  const some = (list: string[]) =>
    list.filter(() => rnd.int(3) === 0).concat(rnd.int(4) === 0 ? ["zz"] : []);
  const keys = state.hidden.map((entry) => entry.key);
  const nodes = view.nodes.map((node) => node.id);
  const choices: (() => Action)[] = [
    () => ({ kind: "hide", node: rnd.pick([...nodes, "e:zz"]) }),
    () => ({ kind: "hideMany", ids: some(w.order) }),
    () => ({ kind: "restore", keys: some([...keys, "e:zz"]) }),
    () => ({ kind: "showMany", ids: some(w.order) }),
    () => ({ kind: "explore", id: rnd.pick(w.order) }),
    () => ({ kind: "collapse", id: rnd.pick(w.order) }),
    () => ({ kind: "path", id: rnd.pick(w.order) }),
    () => ({
      kind: "toggleType",
      type: rnd.pick(TYPES) ?? null,
      on: rnd.int(2) === 0,
    }),
    () => ({ kind: "showAllTypes" }),
    () => ({ kind: "grouping", grouping: rnd.pick([2, 5, "off"] as const) }),
  ];
  return rnd.pick(choices)();
}

// why: STORY-002-06 Context "Restore rule" and FR-TABLE-4 — each read value from the state alone
function reads(w: World, state: CanvasState) {
  const drawn = new Set(state.revealed ?? w.order);
  const off = (id: string) =>
    state.filters.typesOff.includes(entityType(w.vocab, id));
  const listed = state.hidden.filter((e) =>
    e.members.some((id) => !drawn.has(id)),
  );
  expect(listed).toStrictEqual(state.hidden);
  expect(hiddenList(state).map((item) => item.key)).toEqual(
    [...state.hidden].reverse().map((entry) => entry.key),
  );
  for (const id of w.order) {
    const key = drawn.has(id)
      ? null
      : ((
          state.hidden.find((e) => e.members.includes(id)) ??
          state.hidden.find((e) => e.stranded.includes(id))
        )?.key ?? null);
    expect(hiddenOf(state, w.graph, id)).toBe(key);
    const want = !drawn.has(id)
      ? key === null
        ? "not-drawn"
        : "hidden"
      : off(id)
        ? "not-drawn"
        : "drawn";
    expect(onCanvas(state, w.graph, w.vocab, id)).toBe(want);
  }
  for (const node of frontier(state, w.graph, w.vocab).nodes) {
    if (!("entity" in node)) continue;
    expect(off(node.entity)).toBe(false);
    const away = [...(w.near.get(node.entity) ?? [])];
    const more = away.filter((id) => !drawn.has(id) && !off(id)).length;
    expect(node.more).toBe(state.revealed === null ? 0 : more);
  }
}

// why: STORY-002-04 Context (`origins` is a map), SA §6 rows "Bulk Hide never leaves zero drawn
// nodes" and 2 ("Expand then collapse returns … the same drawn set"), PRD FR-TABLE-5
function invariants(w: World, state: CanvasState) {
  const drawn = new Set(state.revealed ?? w.order);
  expect(drawn.size).toBeGreaterThan(0);
  const children = state.origins.map(([child]) => child);
  expect(new Set(children).size).toBe(children.length);
  for (const pair of state.origins)
    for (const id of pair) expect(drawn.has(id)).toBe(true);
  const keys = state.hidden.map((entry) => entry.key);
  expect(new Set(keys).size).toBe(keys.length);
  const view = frontier(state, w.graph, w.vocab);
  const node = view.nodes.find(
    (item) => "entity" in item && item.more > 0 && item.opened === 0,
  );
  if (node === undefined || !("entity" in node)) return;
  const act = (s: CanvasState, kind: "explore" | "collapse") =>
    transition(s, { kind, id: node.entity }, w.graph, w.vocab);
  expect(
    frontier(act(act(state, "explore"), "collapse"), w.graph, w.vocab),
  ).toStrictEqual(view);
}

function hideChecks(w: World, before: CanvasState, action: Action) {
  if (action.kind !== "hide" && action.kind !== "hideMany") return null;
  const result = hide(before, action, w.graph, w.vocab);
  const shown = frontier(before, w.graph, w.vocab).nodes.length;
  if (shown === 0 && action.kind === "hideMany")
    expect(result).toStrictEqual({
      state: before,
      hidden: 0,
      refused: "last-drawn",
    });
  if (result.hidden > 0)
    expect(
      frontier(result.state, w.graph, w.vocab).nodes.length,
    ).toBeGreaterThan(0);
  return result.state;
}

function walk(seed: number) {
  const w = world(seed);
  let state: CanvasState = {
    ...w.first,
    positions: w.order.map((id, k) => [`e:${id}`, { x: k, y: -k }]),
  };
  const { positions } = state;
  const actions: Action[] = [];
  for (let step = 0; step < STEPS; step++) {
    const action = randomAction(w, state, frontier(state, w.graph, w.vocab));
    actions.push(action);
    const next = transition(state, action, w.graph, w.vocab);
    const viaHide = hideChecks(w, state, action);
    if (viaHide !== null) expect(viaHide).toStrictEqual(next);
    state = next;
    expect(state.positions).toBe(positions);
    reads(w, state);
    invariants(w, state);
  }
  return { state, actions };
}

describe("the read functions and the state invariants after random steps", () => {
  it(`hold after every step of ${RUNS} random runs`, () => {
    for (let seed = 1; seed <= RUNS; seed++)
      expect(walk(seed)).toStrictEqual(walk(seed));
  }, 120_000);
});
