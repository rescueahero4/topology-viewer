import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState, Filters } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { entityType, resolveVocab } from "../vocab/resolve";
import { filterMode, stats } from "./filter";
import { frontier } from "./frontier";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const TYPES = ["t0", "t1", "t2", "t3", undefined];
const KNOWN = ["contains", "ownedBy", "memberOf", "taggedWith", "derivedFrom"];
const RUNS = 200;
const STEPS = 30;

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
  const n = 6 + rnd.int(20);
  const ids = Array.from({ length: n }, (_, k) => `n${k}`);
  const custom = Array.from({ length: rnd.int(12) }, (_, k) => `p${k}`);
  const names = [...KNOWN, ...custom];
  const edges = Array.from({ length: n + rnd.int(2 * n) }, () => [
    rnd.pick(ids),
    rnd.pick(names),
    rnd.pick(ids),
  ]);
  const result = normalize(
    {
      nodes: ids.map((id) => {
        const type = rnd.pick(TYPES);
        return type === undefined ? [id] : [id, type];
      }),
      edges,
    },
    { now: "2026-10-14" },
  );
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  return { rnd, graph, vocab, names, first };
}

type World = ReturnType<typeof world>;

const turn = <T extends string | null>(list: T[], name: T, on: boolean) => {
  const rest = list.filter((item) => item !== name);
  const all = [...rest, name];
  const named = all.filter((item) => item !== null).sort();
  return on ? rest : [...all.filter((item) => item === null), ...named];
};

function model(w: World, f: Filters, action: Action): Filters {
  const family = (p: string) => w.vocab.predicates.get(p)?.family;
  if (action.kind === "showAllTypes") return { ...f, typesOff: [] };
  const typed = (type: string | null) =>
    w.graph.entities.some((entity) => entityType(w.vocab, entity.id) === type);
  if (action.kind === "toggleType" && typed(action.type))
    return { ...f, typesOff: turn(f.typesOff, action.type, action.on) };
  if (
    action.kind === "toggleFamily" &&
    w.vocab.families.some((item) => item.key === action.family)
  )
    return {
      ...f,
      familiesOff: turn(f.familiesOff, action.family, action.on),
      predicatesOff: f.predicatesOff.filter((p) => family(p) !== action.family),
    };
  if (
    action.kind === "togglePredicate" &&
    w.vocab.predicates.get(action.predicate)?.count
  )
    return {
      ...f,
      predicatesOff: turn(f.predicatesOff, action.predicate, action.on),
    };
  return f;
}

function randomAction(w: World): Action {
  const { rnd } = w;
  const on = rnd.int(2) === 0;
  const families = [...w.vocab.families.map((item) => item.key), "zz"];
  const choices: (() => Action)[] = [
    () => ({
      kind: "toggleType",
      type: rnd.pick([...TYPES, "zz"]) ?? null,
      on,
    }),
    () => ({ kind: "showAllTypes" }),
    () => ({ kind: "toggleFamily", family: rnd.pick(families), on }),
    () => ({
      kind: "togglePredicate",
      predicate: rnd.pick([...w.names, "zz"]),
      on,
    }),
    () => ({ kind: "grouping", grouping: rnd.pick([2, 5, "off"] as const) }),
  ];
  return rnd.pick(choices)();
}

const styleOnly = (action: Action) =>
  action.kind === "toggleFamily" || action.kind === "togglePredicate";

function check(w: World, f: Filters, before: CanvasState, after: CanvasState) {
  expect(after.filters).toStrictEqual(f);
  const rows = stats(w.vocab, after);
  for (const row of rows.types)
    expect(row.on).toBe(!f.typesOff.includes(row.type));
  for (const row of rows.families)
    expect(row.on).toBe(!f.familiesOff.includes(row.family));
  for (const row of rows.predicates)
    expect(row.on).toBe(!f.predicatesOff.includes(row.predicate));
  expect(filterMode(rows)).toStrictEqual(filterMode(stats(w.vocab, w.first)));
  const drawn = frontier(after, w.graph, w.vocab);
  for (const node of drawn.nodes)
    if ("entity" in node)
      expect(f.typesOff).not.toContain(entityType(w.vocab, node.entity));
  for (const edge of drawn.edges) {
    const family = w.vocab.predicates.get(edge.predicate)?.family ?? "";
    const muted =
      f.predicatesOff.includes(edge.predicate) ||
      f.familiesOff.includes(family);
    expect(edge.muted).toBe(muted);
  }
  expect(after.positions).toBe(before.positions);
  expect(after.revealed).toBe(before.revealed);
}

function walk(seed: number) {
  const w = world(seed);
  let state: CanvasState = {
    ...w.first,
    positions: w.graph.entities.map((e, k) => [`e:${e.id}`, { x: k, y: k }]),
  };
  let f = state.filters;
  for (let step = 0; step < STEPS; step++) {
    const action = randomAction(w);
    const next = transition(state, action, w.graph, w.vocab);
    f = model(w, f, action);
    check(w, f, state, next);
    if (styleOnly(action)) {
      const strip = (s: CanvasState) => ({ ...s, filters: null });
      expect(strip(next)).toStrictEqual(strip(state));
      const keys = (s: CanvasState) =>
        frontier(s, w.graph, w.vocab).edges.map((edge) => edge.key);
      expect(frontier(next, w.graph, w.vocab).nodes).toStrictEqual(
        frontier(state, w.graph, w.vocab).nodes,
      );
      expect(keys(next)).toStrictEqual(keys(state));
    }
    state = next;
  }
  return state;
}

describe("an independent model of the filter rules", () => {
  it(`agrees with the engine after every step of ${RUNS} random runs`, () => {
    const modes = new Set<string>();
    for (let seed = 1; seed <= RUNS; seed++) {
      const once = walk(seed);
      expect(walk(seed)).toStrictEqual(once);
      modes.add(filterMode(stats(world(seed).vocab, once)).predicates);
    }
    expect(modes).toEqual(new Set(["basic", "advanced"]));
  }, 120_000);
});
