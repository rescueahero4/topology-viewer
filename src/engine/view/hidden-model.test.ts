import { profile } from "#contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState, DrawnId } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { entityType, resolveVocab } from "../vocab/resolve";
import { frontier, type Frontier } from "./frontier";
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

type Entry = { key: string; members: string[]; stranded: string[] };

type Model = {
  revealed: Set<string> | null;
  mode: string;
  typesOff: (string | null)[];
  refused?: "last-drawn";
  hidden: Entry[];
  origins: [string, string][];
};

function world(seed: number) {
  const rnd = random(seed);
  const n = 6 + rnd.int(9);
  const ids = Array.from({ length: n }, (_, k) => `n${k}`);
  const edges = Array.from({ length: n + rnd.int(n + 1) }, () => [
    rnd.pick(ids),
    rnd.pick(PREDICATES),
    rnd.pick(ids),
  ]);
  const input = {
    nodes: ids.map((id) => {
      const type = rnd.pick(TYPES);
      return type === undefined ? [id] : [id, type];
    }),
    edges,
    view: rnd.int(2) === 0 ? { budget: 10 } : {},
  };
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const order = graph.entities.map((entity) => entity.id);
  const at = new Map(order.map((id, index) => [id, index]));
  const near = new Map(order.map((id) => [id, new Set<string>()]));
  const loops = new Set<string>();
  for (const { subject, object } of graph.triples) {
    if (subject === object) loops.add(subject);
    else {
      near.get(subject)?.add(object);
      near.get(object)?.add(subject);
    }
  }
  const byOrder = (a: string, b: string) =>
    (at.get(a) as number) - (at.get(b) as number);
  const neighbours = (id: string) => [...(near.get(id) ?? [])].sort(byOrder);
  const first = firstView(graph, vocab, payload, hash);
  return { rnd, graph, vocab, order, byOrder, neighbours, loops, first };
}

type World = ReturnType<typeof world>;

const all = (w: World, m: Model) => m.revealed ?? new Set(w.order);
const off = (w: World, m: Model, id: string) =>
  m.typesOff.includes(entityType(w.vocab, id));
const shownOf = (w: World, m: Model, drawn: Set<string>) =>
  [...drawn].filter((id) => !off(w, m, id));

function strand(w: World, m: Model, drawn: Set<string>, from: string[]) {
  const out: string[] = [];
  const on = (id: string) => drawn.has(id) && !off(w, m, id);
  const candidates = [...new Set(from.flatMap(w.neighbours))].sort(w.byOrder);
  for (const id of candidates)
    if (
      on(id) &&
      shownOf(w, m, drawn).length > 1 &&
      !w.loops.has(id) &&
      !w.neighbours(id).some(on)
    ) {
      drawn.delete(id);
      out.push(id);
    }
  return out;
}

function withEntries(m: Model, drawn: Set<string>, entries: Entry[]): Model {
  const keys = new Set(entries.map((entry) => entry.key));
  return {
    ...m,
    revealed: drawn,
    mode: m.mode === "all" ? "custom" : m.mode,
    hidden: [...m.hidden.filter((entry) => !keys.has(entry.key)), ...entries],
    origins: m.origins.filter(([c, o]) => drawn.has(c) && drawn.has(o)),
  };
}

function hideOne(w: World, m: Model, view: Frontier, key: string): Model {
  const node = view.nodes.find((item) => item.id === key);
  if (node === undefined) return m;
  const members = "members" in node ? node.members : [node.entity];
  const drawn = new Set(all(w, m));
  if (members.length >= shownOf(w, m, drawn).length)
    return { ...m, refused: "last-drawn" };
  for (const id of members) drawn.delete(id);
  const entry = { key, members, stranded: strand(w, m, drawn, members) };
  return withEntries(m, drawn, [entry]);
}

function hideSome(w: World, m: Model, ids: string[]): Model {
  const drawn = new Set(all(w, m));
  const list = [...new Set(ids)].filter((id) => drawn.has(id));
  const size = shownOf(w, m, drawn).length;
  if (size === 0) return { ...m, refused: "last-drawn" };
  const pool = list.filter((id) => !off(w, m, id));
  const cut = pool.length >= size;
  if (cut) list.splice(list.indexOf(pool[0]), 1);
  if (list.length === 0) return cut ? { ...m, refused: "last-drawn" } : m;
  for (const id of list) drawn.delete(id);
  const entries = list.map((id) => ({
    key: `e:${id}`,
    members: [id],
    stranded: strand(w, m, drawn, [id]),
  }));
  return withEntries(m, drawn, entries);
}

const onList = (m: Model, drawn: Set<string>) =>
  m.hidden.filter((entry) => entry.members.some((id) => !drawn.has(id)));

function restoreSome(w: World, m: Model, keys: string[]): Model {
  const chosen = m.hidden.filter((entry) => keys.includes(entry.key));
  if (chosen.length === 0) return m;
  const drawn = new Set(all(w, m));
  const rest = onList(
    { ...m, hidden: m.hidden.filter((entry) => !keys.includes(entry.key)) },
    drawn,
  );
  const held = new Set(rest.flatMap((entry) => entry.members));
  const back = [
    ...new Set(
      chosen.flatMap((entry) => [...entry.members, ...entry.stranded]),
    ),
  ]
    .filter((id) => !held.has(id) && !drawn.has(id))
    .sort(w.byOrder);
  const from = new Map<string, string>();
  for (const id of back) {
    const hit = w.neighbours(id).find((x) => drawn.has(x) && !off(w, m, x));
    if (hit !== undefined) from.set(id, hit);
  }
  for (const id of back) {
    if (from.has(id)) continue;
    const via = w.neighbours(id).find((x) => from.has(x));
    if (via !== undefined) from.set(id, from.get(via) as string);
  }
  const origins: [string, string][] = [
    ...m.origins,
    ...back.flatMap((id): [string, string][] =>
      from.has(id) ? [[id, from.get(id) as string]] : [],
    ),
  ];
  for (const id of back) drawn.add(id);
  const whole = drawn.size === w.order.length && rest.length === 0;
  const mode = whole && m.mode === "custom" ? "all" : m.mode;
  return { ...m, revealed: drawn, origins, hidden: rest, mode };
}

function pathInto(w: World, drawn: Set<string>, m: Model, target: string) {
  const prev = new Map<string, string | null>([[target, null]]);
  let ring = [target];
  let hit: string | null = null;
  search: for (let hop = 0; hop < 4 && ring.length > 0; hop++) {
    const next: string[] = [];
    for (const id of ring)
      for (const x of w.neighbours(id)) {
        if (prev.has(x)) continue;
        prev.set(x, id);
        hit = drawn.has(x) ? x : null;
        if (hit !== null) break search;
        next.push(x);
      }
    ring = next;
  }
  if (hit === null) {
    drawn.add(target);
    return;
  }
  for (let from = hit, step = prev.get(hit); step; step = prev.get(step)) {
    drawn.add(step);
    m.origins.push([step, from]);
    from = step;
  }
}

function showSome(w: World, m: Model, ids: string[]): Model {
  if (m.revealed === null) return m;
  const drawn = new Set(m.revealed);
  const listed = onList(m, drawn);
  const keyOf = (id: string) =>
    listed.find((entry) => entry.members.includes(id))?.key ??
    listed.find((entry) => entry.stranded.includes(id))?.key;
  const next: Model = { ...m, origins: [...m.origins] };
  const keys: string[] = [];
  for (const id of new Set(ids)) {
    if (drawn.has(id) || !w.order.includes(id)) continue;
    const key = keyOf(id);
    if (key !== undefined) keys.push(key);
    else pathInto(w, drawn, next, id);
  }
  const shown = { ...next, revealed: drawn };
  return keys.length === 0 ? shown : restoreSome(w, shown, keys);
}

function explore(w: World, m: Model, id: string): Model {
  const drawn = m.revealed;
  if (drawn === null || !drawn.has(id) || off(w, m, id)) return m;
  const added = w.neighbours(id).filter((x) => !drawn.has(x) && !off(w, m, x));
  if (added.length === 0) return m;
  return {
    ...m,
    revealed: new Set([...drawn, ...added]),
    origins: [...m.origins, ...added.map((x): [string, string] => [x, id])],
  };
}

function collapse(m: Model, id: string): Model {
  const drawn = m.revealed;
  if (drawn === null || !drawn.has(id)) return m;
  const drop = new Set<string>();
  const stack = [id];
  const fresh = (child: string) =>
    child !== id && drawn.has(child) && !drop.has(child);
  while (stack.length > 0) {
    const from = stack.pop();
    for (const [child, origin] of m.origins)
      if (origin === from && fresh(child)) {
        drop.add(child);
        stack.push(child);
      }
  }
  if (drop.size === 0) return m;
  return {
    ...m,
    revealed: new Set([...drawn].filter((x) => !drop.has(x))),
    origins: m.origins.filter(([child]) => !drop.has(child)),
  };
}

function types(w: World, m: Model, action: Action): Model {
  if (action.kind === "showAllTypes") return { ...m, typesOff: [] };
  if (action.kind !== "toggleType") return m;
  const present = w.order.some((id) => entityType(w.vocab, id) === action.type);
  if (!present) return m;
  const rest = m.typesOff.filter((type) => type !== action.type);
  const named = [...rest, action.type].filter((t) => t !== null).sort();
  const nulls = action.type === null || rest.includes(null) ? [null] : [];
  return { ...m, typesOff: action.on ? rest : [...nulls, ...named] };
}

function apply(w: World, m: Model, view: Frontier, action: Action): Model {
  const next = (() => {
    if (action.kind === "hide") return hideOne(w, m, view, action.node);
    if (action.kind === "hideMany") return hideSome(w, m, action.ids);
    if (action.kind === "restore") return restoreSome(w, m, action.keys);
    if (action.kind === "showMany") return showSome(w, m, action.ids);
    if (action.kind === "explore") return explore(w, m, action.id);
    if (action.kind === "collapse") return collapse(m, action.id);
    return types(w, m, action);
  })();
  const drawn = next.revealed;
  return { ...next, hidden: drawn === null ? [] : onList(next, drawn) };
}

function randomAction(w: World, state: CanvasState, view: Frontier): Action {
  const { rnd } = w;
  const some = (list: string[]) =>
    list.filter(() => rnd.int(3) === 0).concat(rnd.int(4) === 0 ? ["zz"] : []);
  const keys = state.hidden.map((entry) => entry.key);
  const nodes = view.nodes.map((node): DrawnId => node.id);
  const choices: (() => Action)[] = [
    () => ({ kind: "hide", node: rnd.pick([...nodes, "e:zz", "g:[]"]) }),
    () => ({ kind: "hide", node: rnd.pick([...nodes, "e:n0"]) }),
    () => ({ kind: "hideMany", ids: some(w.order) }),
    () => ({ kind: "restore", keys: some([...keys, "e:zz"]) }),
    () => ({ kind: "showMany", ids: some(w.order) }),
    () => ({ kind: "explore", id: rnd.pick(w.order) }),
    () => ({ kind: "collapse", id: rnd.pick(w.order) }),
    () => ({
      kind: "toggleType",
      type: rnd.pick(TYPES) ?? null,
      on: rnd.int(2) === 0,
    }),
    () => ({ kind: "showAllTypes" }),
    () => ({ kind: "grouping", grouping: rnd.pick([2, 5, "off"] as const) }),
    () => ({
      kind: "expandGroup",
      group: rnd.pick([
        ...view.nodes.filter((node) => "members" in node).map((n) => n.id),
        "g:[]",
      ]),
    }),
  ];
  return rnd.pick(choices)();
}

function check(w: World, m: Model, state: CanvasState) {
  const drawn = all(w, m);
  expect(state.revealed === null).toBe(m.revealed === null);
  expect(new Set(state.revealed ?? w.order)).toEqual(drawn);
  expect(state.scope.mode).toBe(m.mode);
  expect(state.filters.typesOff).toStrictEqual(m.typesOff);
  expect(state.hidden).toStrictEqual(m.hidden.map((e) => ({ ...e, seq: 0 })));
  expect(state.origins).toStrictEqual(m.origins);
}

function walk(seed: number) {
  const w = world(seed);
  let state: CanvasState = {
    ...w.first,
    positions: w.order.map((id, k) => [`e:${id}`, { x: k, y: -k }]),
  };
  const { positions, revealed, scope, origins } = state;
  const drawn = revealed === null ? null : new Set(revealed);
  let m: Model = {
    revealed: drawn,
    mode: scope.mode,
    typesOff: [],
    hidden: [],
    origins,
  };
  const actions: Action[] = [];
  for (let step = 0; step < STEPS; step++) {
    const view = frontier(state, w.graph, w.vocab);
    const action = randomAction(w, state, view);
    actions.push(action);
    if (action.kind === "hide" || action.kind === "hideMany") {
      const result = hide(state, action, w.graph, w.vocab);
      const { refused, ...next } = apply(w, m, view, action);
      const fresh = next.hidden.filter((entry) => !m.hidden.includes(entry));
      const count = fresh.reduce((sum, e) => sum + e.members.length, 0);
      expect(result.hidden).toBe(count);
      expect(result.refused).toBe(refused);
      m = next;
      state = result.state;
    } else {
      m = apply(w, m, view, action);
      state = transition(state, action, w.graph, w.vocab);
    }
    expect(state.positions).toBe(positions);
    check(w, m, state);
  }
  return { state, actions };
}

// why: the read functions and the state invariants are in `hidden-invariants.test.ts`
describe("an independent model of the type filter, strand, bulk and restore rules", () => {
  it(`agrees with the engine after every step of ${RUNS} random runs`, () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const once = walk(seed);
      const twice = walk(seed);
      expect(twice).toStrictEqual(once);
    }
  }, 120_000);
});
