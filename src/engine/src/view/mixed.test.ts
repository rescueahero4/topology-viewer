import { profile } from "@qdic-topology/contract";
import { generate, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnIdOf, frontier } from "./frontier";
import { grouper, topology, type Topology } from "./group";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return {
    graph,
    vocab,
    first: () => firstView(graph, vocab, payload, hash),
    act: (state: CanvasState, action: Action) =>
      transition(state, action, graph, vocab),
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
  };
}

type Edge = [string, string, string];

const edgesOf = (list: Edge[]) =>
  list.map(([subject, predicate, object]) => ({ subject, predicate, object }));

function bruteCount(top: Topology, set: Set<number>, least: number) {
  const degree = new Map<number, number>();
  const only = new Map<number, number>();
  top.links.forEach((link, index) => {
    if (!set.has(link.subject) || !set.has(link.object)) return;
    for (const end of [link.subject, link.object]) {
      degree.set(end, (degree.get(end) ?? 0) + 1);
      only.set(end, index);
    }
  });
  const sizes = new Map<string, number>();
  for (const entity of set) {
    if (degree.get(entity) !== 1) continue;
    const link = top.links[only.get(entity) as number];
    const anchor = link.subject === entity ? link.object : link.subject;
    if ((degree.get(anchor) ?? 0) < 2) continue;
    const side = link.subject === anchor;
    const key = JSON.stringify([
      anchor,
      link.predicate,
      side,
      top.types[entity],
    ]);
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  let count = set.size;
  for (const size of sizes.values()) if (size >= least) count -= size - 1;
  return count;
}

function noisy(seed: number) {
  const base = generate.random(60, 90, seed);
  const leaves = Array.from({ length: 40 }, (_, k) => ({
    id: `l${k}`,
    type: `t${k % 2}`,
    label: `L${k}`,
  }));
  const edges: Edge[] = base.edges.map((e) => [e.subject, "p", e.object]);
  base.edges.forEach((e, k) => {
    if (k % 5 === 0) edges.push([e.subject, "q", e.object]);
  });
  for (let k = 0; k < 60; k += 7) edges.push([`n${k}`, "p", `n${k}`]);
  leaves.forEach((leaf, k) =>
    edges.push(
      k % 3 ? [`n${k % 4}`, "r", leaf.id] : [leaf.id, "r", `n${k % 4}`],
    ),
  );
  return { nodes: [...base.nodes, ...leaves], edges: edgesOf(edges) };
}

describe("the incremental grouped count", () => {
  it.each([1, 2, 3])(
    "equals a full recount after each add and drop (seed %i)",
    (seed) => {
      const run = load(noisy(seed));
      const top = topology(run.graph, run.vocab);
      let state = seed * 7919;
      const next = () => (state = (state * 48271) % 2147483647);
      for (const [grouping, least] of [
        [2, 2],
        [5, 5],
        ["off", Infinity],
      ] as const) {
        const counter = grouper(top, grouping);
        const set = new Set<number>();
        for (let step = 0; step < 600; step++) {
          const entity = next() % top.ids.length;
          if (set.has(entity) && next() % 3 === 0) {
            set.delete(entity);
            counter.drop(entity);
          } else {
            set.add(entity);
            counter.add(entity);
          }
          expect(counter.count()).toBe(bruteCount(top, set, least));
        }
      }
    },
  );
});

describe("hostile ids", () => {
  it("handles prototype names as ids, predicates and group anchors", () => {
    const ids = ["__proto__", "constructor", "toString", "hasOwnProperty"];
    const run = load({
      nodes: [
        ...ids.map((id) => ({ id, type: "t0" })),
        { id: "x", type: "t1" },
        { id: "y", type: "t1" },
      ],
      edges: edgesOf([
        ["__proto__", "__proto__", "x"],
        ["__proto__", "__proto__", "y"],
        ["__proto__", "constructor", "constructor"],
        ["constructor", "toString", "toString"],
        ["toString", "p", "hasOwnProperty"],
      ]),
      view: { root: "constructor", approach: "active" },
    });
    const first = run.first();
    expect(first.revealed).toEqual(["constructor"]);
    const open = run.act(first, { kind: "explore", id: "constructor" });
    expect(open.revealed).toEqual(["__proto__", "constructor", "toString"]);
    const far = run.act(open, { kind: "path", id: "x" });
    expect(far.origins).toContainEqual(["x", "__proto__"]);
    const all = run.drawn({ ...far, revealed: null });
    expect(all.nodes.map((node) => node.id)).toContain(
      'g:["__proto__","__proto__",">","t1"]',
    );
    expect(JSON.parse(JSON.stringify(far))).toStrictEqual(far);
    expect(drawnIdOf(far, run.graph, run.vocab, "__proto__")).toBe(
      "e:__proto__",
    );
  });
});

describe("self-loops", () => {
  it("draws the loop, never groups its entity and counts it once for degree", () => {
    const chain = Array.from({ length: 20 }, (_, k) => `c${k}`);
    const run = load({
      nodes: [..."y m1 m2 x m3".split(" "), ...chain].map((id) => ({
        id,
        type: "t0",
      })),
      edges: edgesOf([
        ["y", "p", "m1"],
        ["y", "p", "m2"],
        ["x", "p", "x"],
        ["x", "p", "m3"],
        ...chain.slice(1).map((id, k): Edge => [`c${k}`, "p", id]),
      ]),
      view: { budget: 10 },
    });
    const first = run.first();
    expect(first.scope.root).toBe("y");
    const all = run.drawn({ ...first, revealed: null });
    expect(all.edges.map((edge) => edge.key)).toContain('["e:x","p","e:x"]');
    expect(all.nodes.map((node) => node.id)).toContain("e:x");
    const solo = load({
      nodes: [{ id: "a" }],
      edges: edgesOf([["a", "p", "a"]]),
    });
    const state = solo.first();
    expect(solo.drawn(state).nodes).toEqual([
      expect.objectContaining({ id: "e:a", more: 0 }),
    ]);
  });
});

describe("merged entities", () => {
  it("takes record ids in every action", () => {
    const run = load(loadFixture("s-access").input);
    const first = run.first();
    const byRecord = run.act(first, { kind: "explore", id: "u_20" });
    expect(byRecord).toStrictEqual(
      run.act(first, { kind: "explore", id: "u_0" }),
    );
    expect(run.act(byRecord, { kind: "collapse", id: "u_40" })).toStrictEqual(
      run.act(byRecord, { kind: "collapse", id: "u_0" }),
    );
    const picked = run.act(first, { kind: "select", entity: "u_60" });
    expect(picked.selection).toEqual({ node: "e:u_0" });
  });
});

describe("shaped records and an empty graph", () => {
  it("draws a raw rows payload", () => {
    const run = load({
      nodes: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "c", target: "d" },
      ],
    });
    const state = run.first();
    expect(state.scope.mode).toBe("all");
    expect(run.drawn(state).nodes.length).toBeGreaterThan(0);
  });

  it("keeps the empty state for every action", () => {
    const run = load(loadFixture("s-empty").input);
    const first = run.first();
    for (const action of [
      { kind: "explore", id: "a" },
      { kind: "collapse", id: "a" },
      { kind: "path", id: "a" },
      { kind: "expandGroup", group: "g:[]" },
      { kind: "collapseGroup", group: "g:[]" },
      { kind: "selectEdge", edge: "[]", anchor: "e:a" },
    ] as Action[])
      expect(run.act(first, action)).toBe(first);
    const narrow = run.act(first, { kind: "budget", budget: 10 });
    expect(narrow).toStrictEqual({ ...first, budget: 10 });
    expect(run.act(narrow, { kind: "reset" })).toStrictEqual(narrow);
  });
});

describe("a group member that gains a link", () => {
  it("leaves the group and keeps the group selected", () => {
    const run = load({
      nodes: [
        ["a", "t0"],
        ["l1", "t"],
        ["l2", "t"],
        ["l3", "t"],
        ["z", "t0"],
      ],
      edges: [
        ["a", "p", "l1"],
        ["a", "p", "l2"],
        ["a", "p", "l3"],
        ["l1", "p", "z"],
      ],
      view: { root: "l2", reveal: ["a", "l1", "l3"], approach: "active" },
    });
    const first = run.first();
    const group = 'g:["a","p",">","t"]';
    expect(first.selection).toEqual({ node: group });
    const open = run.act(first, { kind: "explore", id: "l1" });
    expect(open.selection).toEqual({ node: group });
    expect(run.drawn(open).nodes.map((node) => node.id)).toEqual([
      "e:a",
      "e:l1",
      group,
      "e:z",
    ]);
  });
});
