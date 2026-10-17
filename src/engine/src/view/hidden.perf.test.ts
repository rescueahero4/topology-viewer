import { profile } from "@qdic-topology/contract";
import { generate } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { filterMode, stats } from "./filter";
import { frontier } from "./frontier";
import { hiddenList } from "./hidden";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const NODES = 2000;
const EDGES = 4000;
const RUNS = 3;

type Compact = { nodes: string[][]; edges: string[][] };

const PREDICATES = ["contains", "ownedBy", "memberOf", "taggedWith", "p"];

function compact(graph: generate.GeneratedGraph): Compact {
  return {
    nodes: graph.nodes.map((node) => [node.id, node.type]),
    edges: graph.edges.map((edge, k) => [
      edge.subject,
      PREDICATES[k % PREDICATES.length],
      edge.object,
    ]),
  };
}

function hub(): Compact {
  const star = compact(generate.star(NODES - 1));
  const ring = Array.from({ length: EDGES - star.edges.length }, (_, k) => [
    `n${1 + (k % (NODES - 1))}`,
    "p",
    `n${1 + ((k + 1) % (NODES - 1))}`,
  ]);
  return { nodes: star.nodes, edges: [...star.edges, ...ring] };
}

function leaves(): Compact {
  const star = compact(generate.star(NODES - 1));
  const nodes = star.nodes.map(([id], k) => [id, `t${k % 7}`]);
  const loops = Array.from({ length: EDGES - star.edges.length }, (_, k) => [
    "n0",
    `q${k}`,
    "n0",
  ]);
  return { nodes, edges: [...star.edges, ...loops] };
}

// why: ISSUE-006 — the median of 3 timed calls after one warm-up call; the work is pure
function time<T>(work: () => T): { value: T; ms: number } {
  const value = work();
  const times = Array.from({ length: RUNS }, () => {
    const start = performance.now();
    work();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return { value, ms: times[Math.floor(RUNS / 2)] };
}

function measure(input: Compact) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const act = (state: CanvasState, action: Action) => {
    const next = transition(state, action, graph, vocab);
    frontier(next, graph, vocab);
    return next;
  };
  const all = firstView(graph, vocab, { view: { budget: "all" } }, hash);
  const ids = graph.entities.map((entity) => entity.id);
  const half = ids.filter((_, k) => k % 2 === 1);
  const ms: Record<string, number> = {};
  const run = (name: string, work: () => CanvasState) => {
    const { value, ms: took } = time(work);
    ms[name] = took;
    return value;
  };
  const off = run("type off", () =>
    act(all, { kind: "toggleType", type: "t0", on: false }),
  );
  run("show all types", () => act(off, { kind: "showAllTypes" }));
  run("family off", () =>
    act(all, { kind: "toggleFamily", family: "Structure", on: false }),
  );
  run("predicate off", () =>
    act(all, { kind: "togglePredicate", predicate: "p", on: false }),
  );
  const flat = run("grouping off", () =>
    act(all, { kind: "grouping", grouping: "off" }),
  );
  run("grouping 2", () => act(flat, { kind: "grouping", grouping: 2 }));
  run("hide hub", () => act(flat, { kind: "hide", node: "e:n0" }));
  run("bulk hide all", () => act(all, { kind: "hideMany", ids }));
  const halfOff = run("bulk hide half", () =>
    act(flat, { kind: "hideMany", ids: half }),
  );
  const keys = halfOff.hidden.map((entry) => entry.key);
  run("restore 1,000", () => act(halfOff, { kind: "restore", keys }));
  run("bulk show 1,000 hidden", () =>
    act(halfOff, { kind: "showMany", ids: half }),
  );
  const small = firstView(graph, vocab, payload, hash);
  run("bulk show along paths", () => act(small, { kind: "showMany", ids }));
  const read = time(() => {
    filterMode(stats(vocab, halfOff));
    hiddenList(halfOff);
  });
  ms["stats + mode + list"] = read.ms;
  return ms;
}

describe("bounded filter and Hidden work at the caps (2,000 nodes, 4,000 edges)", () => {
  it.each([
    ["random", () => compact(generate.random(NODES, EDGES, 7))],
    ["hub with a ring", hub],
    ["star of 7 types with hub self-loops", leaves],
  ])(
    "%s: each transition with its frontier in < 100 ms",
    (_, make) => {
      const input = make();
      expect(input.nodes).toHaveLength(NODES);
      expect(input.edges).toHaveLength(EDGES);
      const ms = measure(input);
      for (const value of Object.values(ms)) expect(value).toBeLessThan(100);
    },
    60_000,
  );
});

// why: STORY-002-06 S26 — copies of one random component (100 entities, 200 triples), so the
// graph has the same shape at each size; a bulk Show of every id along paths from a first view
function copies(count: number): Compact {
  const part = compact(generate.random(100, 200, 7));
  const id = (k: number, name: string) => `n${k * 100 + Number(name.slice(1))}`;
  const range = Array.from({ length: count }, (_, k) => k);
  return {
    nodes: range.flatMap((k) => part.nodes.map(([n, t]) => [id(k, n), t])),
    edges: range.flatMap((k) =>
      part.edges.map(([s, p, o]) => [id(k, s), p, id(k, o)]),
    ),
  };
}

function showAll(nodes: number) {
  const input = copies(nodes / 100);
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const ids = graph.entities.map((entity) => entity.id);
  return () => {
    const next = transition(first, { kind: "showMany", ids }, graph, vocab);
    frontier(next, graph, vocab);
    return next;
  };
}

// why: lead decision D94 (2), ISSUE-007 — 4 times the entities: near-linear work takes about 4 times
// the time and quadratic work about 16 times, so the limit 8 keeps machine load out of the result
describe("S26 bulk Show along paths is near-linear", () => {
  it("takes < 100 ms at 2,000 entities and ≤ 8 × the time at 500", () => {
    const works = [showAll(500), showAll(2000)];
    for (const work of works) work();
    const [small, large] = works.map((work) => time(work));
    expect(small.value.revealed).toHaveLength(500);
    expect(large.value.revealed).toHaveLength(2000);
    expect(large.ms).toBeLessThan(100);
    expect(large.ms).toBeLessThanOrEqual(8 * small.ms);
  }, 60_000);
});
