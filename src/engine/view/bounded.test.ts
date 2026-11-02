import { profile } from "#contract";
import { generate } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnIdOf, frontier } from "./frontier";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const KB = 1024;
const NODES = 2000;
const EDGES = 4000;

type Compact = { nodes: string[][]; edges: string[][] };

function compact(graph: generate.GeneratedGraph): Compact {
  return {
    nodes: graph.nodes.map((node) => [node.id, node.type]),
    edges: graph.edges.map((edge) => [edge.subject, "p", edge.object]),
  };
}

function random(): Compact {
  return compact(generate.random(NODES, EDGES, 7));
}

function doubleHub(): Compact {
  const { nodes } = compact(generate.star(NODES - 1));
  const edges: string[][] = [];
  for (let k = 1; k < NODES; k++) edges.push(["n0", "p", `n${k}`]);
  for (let k = 1; k < NODES; k++) edges.push(["n0", "q", `n${k}`]);
  edges.push(["n1", "p", "n2"], ["n2", "p", "n3"]);
  return { nodes, edges };
}

function loopedStar(): Compact {
  const star = compact(generate.star(NODES - 1));
  const loops = Array.from({ length: EDGES - star.edges.length }, (_, k) => [
    "n0",
    `p${k}`,
    "n0",
  ]);
  const nodes = star.nodes.map(([id], k) => [id, `t${k}`]);
  return { nodes, edges: [...star.edges, ...loops] };
}

function denseCore(): Compact {
  const core = compact(generate.random(100, EDGES, 11));
  const rest = Array.from({ length: NODES - 100 }, (_, k) => [`m${k}`, "t1"]);
  return { nodes: [...core.nodes, ...rest], edges: core.edges };
}

function load(input: Compact) {
  expect(input.nodes).toHaveLength(NODES);
  expect(input.edges).toHaveLength(EDGES);
  expect(JSON.stringify(input).length).toBeLessThanOrEqual(256 * KB);
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return { graph, payload, hash, vocab };
}

const RUNS = 3;

// why: ISSUE-006 — the median of 3 timed calls after one warm-up call; the work is pure, so each
// call gives the same value
function time<T>(work: () => T): { value: T; ms: number } {
  const value = work();
  const times = Array.from({ length: RUNS }, () => {
    const start = performance.now();
    work();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return { value, ms: times[Math.floor(RUNS / 2)] };
}

// why: PRD NF-1 — first paint < 1 s and < 100 ms to the first animated frame of an expand at
// ≤ 2,000 drawn nodes; these limits have no CPU throttle and leave room for layout and render
function measure(input: Compact) {
  const { graph, payload, hash, vocab } = load(input);
  const act = (state: CanvasState, action: Action) =>
    transition(state, action, graph, vocab);
  const first = time(() => firstView(graph, vocab, payload, hash));
  const all = time(() =>
    firstView(graph, vocab, { view: { budget: "all" } }, hash),
  );
  const drawAll = time(() => frontier(all.value, graph, vocab));
  const hub = first.value.scope.root ?? "";
  const open = time(() => act(first.value, { kind: "explore", id: hub }));
  const drawOpen = time(() => frontier(open.value, graph, vocab));
  const shut = time(() => act(open.value, { kind: "collapse", id: hub }));
  const far = graph.entities[graph.entities.length - 1].id;
  const reach = time(() => act(first.value, { kind: "path", id: far }));
  const wider = time(() => act(open.value, { kind: "budget", budget: 50 }));
  const reset = time(() => act(wider.value, { kind: "reset" }));
  const pick = time(() => act(all.value, { kind: "select", entity: far }));
  const lookup = time(() => drawnIdOf(all.value, graph, vocab, far));
  const ms = {
    first: first.ms,
    all: all.ms,
    drawAll: drawAll.ms,
    explore: open.ms,
    drawOpen: drawOpen.ms,
    collapse: shut.ms,
    path: reach.ms,
    budget: wider.ms,
    reset: reset.ms,
    select: pick.ms,
    drawnIdOf: lookup.ms,
  };
  return { ms, drawn: drawAll.value.nodes.length, first: first.value };
}

describe("bounded work at the caps (2,000 nodes, 4,000 edges)", () => {
  it.each([
    ["random", random],
    ["double hub", doubleHub],
    ["star of distinct types with hub self-loops", loopedStar],
    ["dense core", denseCore],
  ])("%s: a first view in < 250 ms, each transition in < 100 ms", (_, make) => {
    const { ms, first } = measure(make());
    expect(first.revealed?.length ?? 0).toBeGreaterThan(0);
    const { first: cold, all, ...steps } = ms;
    expect(Math.max(cold, all)).toBeLessThan(250);
    for (const value of Object.values(steps)) expect(value).toBeLessThan(100);
  });
});
