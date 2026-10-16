import { profile } from "@qdic-topology/contract";
import { datasets, generate, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { canvasNotice } from "../data/notices";
import { normalize } from "../data/normalize";
import {
  groupDrawnId,
  type Action,
  type CanvasState,
} from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnIdOf, frontier } from "./frontier";
import { onCanvas } from "./hidden";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return {
    result,
    graph,
    vocab,
    first: () => firstView(graph, vocab, payload, hash),
    act: (state: CanvasState, action: Action) =>
      transition(state, action, graph, vocab),
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
  };
}

const withView = (input: unknown, view: unknown) => ({
  ...(input as object),
  view,
});

const ids = (state: CanvasState, all: string[]) => state.revealed ?? all;

describe("S2 catalog budgets", () => {
  const catalog = datasets.catalog.graph;
  const ROOT = "t_SF_ACCOUNT";
  it.each([
    [{ budget: 10 }, 10, 41, ROOT],
    [{ budget: 20 }, 20, 55, ROOT],
    [{ budget: 50 }, 50, 121, ROOT],
    [{ budget: "all" }, 60, 198, null],
    [{ approach: "passive" }, 20, 55, ROOT],
  ])(
    "view %j draws %i nodes, reveals %i, root %s",
    (view, count, size, root) => {
      const run = load(withView(catalog, view));
      const state = run.first();
      const all = run.graph.entities.map((entity) => entity.id);
      expect(run.drawn(state).nodes).toHaveLength(count);
      expect(ids(state, all)).toHaveLength(size);
      expect(run.drawn(state).nodes.length).toBeLessThan(all.length);
      expect(state.scope.root).toBe(root);
    },
  );
});

describe("S3 a group counts as one node", () => {
  it("draws all 25 entities as 16 nodes", () => {
    const leaves = Array.from({ length: 10 }, (_, k) => `l${k}`);
    const chain = Array.from({ length: 14 }, (_, k) => `b${k}`);
    const run = load({
      nodes: [
        { id: "a", type: "t0" },
        ...leaves.map((id) => ({ id, type: "leaf" })),
        ...chain.map((id) => ({ id, type: "t0" })),
      ],
      edges: [
        ...leaves.map((id) => ({ subject: "a", predicate: "p", object: id })),
        { subject: "a", predicate: "p", object: "b0" },
        ...chain
          .slice(1)
          .map((id, k) => ({ subject: `b${k}`, predicate: "p", object: id })),
      ],
    });
    const state = run.first();
    expect(state.scope.mode).toBe("all");
    expect(state.revealed).toBeNull();
    const { nodes } = run.drawn(state);
    expect(nodes).toHaveLength(16);
    expect(nodes.filter((node) => "members" in node)).toEqual([
      expect.objectContaining({ count: 10, members: leaves }),
    ]);
  });
});

describe("S4, S9 one drawn node", () => {
  it("S4 s-root-only draws the root alone with more 6", () => {
    const run = load(loadFixture("s-root-only").input);
    const state = run.first();
    expect(run.drawn(state).nodes).toEqual([
      expect.objectContaining({ id: "e:t_FCT_REVENUE", more: 6, opened: 0 }),
    ]);
    expect(state.approach).toBe("active");
    expect(state.selection).toEqual({ node: "e:t_FCT_REVENUE" });
  });

  it("S9 s-single has nothing to explore", () => {
    const run = load(loadFixture("s-single").input);
    const state = run.first();
    expect(run.drawn(state).nodes).toEqual([
      expect.objectContaining({ id: "e:t_FCT_REVENUE", more: 0 }),
    ]);
    expect(state.approach).toBe("active");
    expect(state.selection).toEqual({ node: "e:t_FCT_REVENUE" });
    const after = run.act(state, { kind: "explore", id: "t_FCT_REVENUE" });
    expect(after).toStrictEqual(state);
  });
});

describe("S5 an unknown reveal id", () => {
  it("is reported and ignored", () => {
    const fixture = loadFixture("s-access").input as {
      view: { root: string; reveal: string[] };
    };
    const view = { ...fixture.view, reveal: [...fixture.view.reveal, "nope"] };
    const run = load({ ...fixture, view });
    const codes = run.result.warnings.filter(
      (entry) => entry.code === "reveal-not-found",
    );
    expect(codes).toEqual([expect.objectContaining({ count: 1 })]);
    const state = run.first();
    expect(state.revealed).toHaveLength(7);
    expect(state.revealed).toContain(view.root);
    expect(state.scope.mode).toBe("ai");
  });
});

describe("S10 s-islands", () => {
  it("draws all 8 entities as 7 nodes, the same on two runs", () => {
    const run = load(loadFixture("s-islands").input);
    const state = run.first();
    expect(state.scope.mode).toBe("all");
    expect(state.approach).toBe("passive");
    const { nodes } = run.drawn(state);
    expect(nodes).toHaveLength(7);
    expect(nodes.filter((node) => "members" in node)).toEqual([
      expect.objectContaining({
        id: 'g:["a3","derivedFrom",">","table"]',
        members: ["a1", "a2"],
        count: 2,
      }),
    ]);
    const again = load(loadFixture("s-islands").input);
    expect(again.first()).toStrictEqual(state);
    expect(again.drawn(again.first())).toStrictEqual(run.drawn(state));
  });
});

describe("S14, S15, S17 explore and collapse", () => {
  const chainIds = (n: number) => Array.from({ length: n }, (_, k) => `t${k}`);

  it("S14 s-chain with budget 10", () => {
    const run = load(withView(loadFixture("s-chain").input, { budget: 10 }));
    const first = run.first();
    expect(first.scope.root).toBe("t1");
    expect(first.approach).toBe("passive");
    expect(first.revealed).toEqual(chainIds(10));
    const one = run.act(first, { kind: "explore", id: "t9" });
    const two = run.act(one, { kind: "explore", id: "t10" });
    expect(two.revealed).toEqual(chainIds(12));
    expect(two.origins).toEqual([
      ["t10", "t9"],
      ["t11", "t10"],
    ]);
    const back = run.act(two, { kind: "collapse", id: "t9" });
    expect(back.revealed).toEqual(chainIds(10));
    expect(run.drawn(back)).toStrictEqual(run.drawn(first));
  });

  it("S15 s-root-only explore then collapse the root", () => {
    const run = load(loadFixture("s-root-only").input);
    const first = run.first();
    const open = run.act(first, { kind: "explore", id: "t_FCT_REVENUE" });
    expect(open.revealed).toHaveLength(7);
    const root = run.drawn(open).nodes.find((n) => n.id === "e:t_FCT_REVENUE");
    expect(root).toEqual(expect.objectContaining({ opened: 6, more: 0 }));
    const back = run.act(open, { kind: "collapse", id: "t_FCT_REVENUE" });
    expect(run.drawn(back)).toStrictEqual(run.drawn(first));
  });

  it("S17 catalog budget 20 explore then collapse", () => {
    const run = load(withView(datasets.catalog.graph, { budget: 20 }));
    const first = run.first();
    const node = run.drawn(first).nodes.find((n) => n.more > 0);
    if (node === undefined || !("entity" in node)) throw new Error("none");
    const open = run.act(first, { kind: "explore", id: node.entity });
    expect(open.revealed?.length).toBeGreaterThan(first.revealed?.length ?? 0);
    const back = run.act(open, { kind: "collapse", id: node.entity });
    expect(run.drawn(back)).toStrictEqual(run.drawn(first));
  });
});

describe("S18 path to the canvas", () => {
  it("draws a 4-hop path with origins along it", () => {
    const run = load(withView(loadFixture("s-chain").input, { budget: 10 }));
    const first = run.first();
    const next = run.act(first, { kind: "path", id: "t13" });
    expect(next.revealed).toEqual(
      Array.from({ length: 14 }, (_, k) => `t${k}`),
    );
    expect(next.origins).toEqual([
      ["t10", "t9"],
      ["t11", "t10"],
      ["t12", "t11"],
      ["t13", "t12"],
    ]);
  });

  it("draws a 5-hop target alone", () => {
    const run = load(withView(generate.chain(20), { budget: 10 }));
    const first = run.first();
    expect(first.revealed).toEqual(
      Array.from({ length: 10 }, (_, k) => `n${k}`),
    );
    const next = run.act(first, { kind: "path", id: "n14" });
    expect(next.revealed).toEqual([...(first.revealed ?? []), "n14"]);
    expect(next.origins).toEqual([]);
  });

  it("keeps the state for an unknown id and for a drawn id", () => {
    const run = load(withView(loadFixture("s-chain").input, { budget: 10 }));
    const first = run.first();
    expect(run.act(first, { kind: "path", id: "nope" })).toStrictEqual(first);
    expect(run.act(first, { kind: "path", id: "t5" })).toStrictEqual(first);
  });
});

describe("S23 one drawn edge for two triples", () => {
  it("folds two attribute variants into one edge with count 2", () => {
    const run = load({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { subject: "a", predicate: "ownedBy", object: "b", attrs: { k: 1 } },
        { subject: "a", predicate: "ownedBy", object: "b", attrs: { k: 2 } },
      ],
    });
    expect(run.graph.triples).toHaveLength(2);
    expect(run.drawn(run.first()).edges).toEqual([
      expect.objectContaining({ key: '["e:a","ownedBy","e:b"]', count: 2 }),
    ]);
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("S27 the canonical graph is never changed", () => {
  it("runs every action on a deep-frozen graph", () => {
    const run = load(loadFixture("s-access").input);
    const snapshot = JSON.stringify(run.graph);
    deepFreeze(run.graph);
    let state = run.first();
    const group = (s: CanvasState) =>
      run.drawn(s).nodes.find((node) => "members" in node)?.id ?? "g:none";
    const actions: ((s: CanvasState) => Action)[] = [
      () => ({ kind: "explore", id: "t_FCT_REVENUE" }),
      (s) => ({ kind: "expandGroup", group: group(s) }),
      (s) => ({
        kind: "collapseGroup",
        group: groupDrawnId(s.expandedGroups[0] ?? "none"),
      }),
      () => ({ kind: "path", id: "u_3" }),
      () => ({ kind: "select", entity: "u_20" }),
      () => ({ kind: "select", node: "e:t_FCT_REVENUE" }),
      (s) => ({
        kind: "selectEdge",
        edge: run.drawn(s).edges[0].key,
        anchor: "e:t_FCT_REVENUE",
      }),
      () => ({ kind: "collapse", id: "t_FCT_REVENUE" }),
      () => ({ kind: "budget", budget: 50 }),
      () => ({ kind: "reset" }),
    ];
    for (const make of actions) {
      state = run.act(state, make(state));
      run.drawn(state);
      drawnIdOf(state, run.graph, run.vocab, "u_20");
      onCanvas(state, run.graph, run.vocab, "u_20");
    }
    expect(JSON.stringify(run.graph)).toBe(snapshot);
  });
});

describe("S32 a graph with no entity", () => {
  it("gives an empty frontier and the no-data notice", () => {
    const input = loadFixture("s-empty").input as {
      nodes: unknown[];
      edges: unknown[];
    };
    const run = load(input);
    const state = run.first();
    expect(run.drawn(state)).toStrictEqual({ nodes: [], edges: [] });
    expect(state.selection).toBeNull();
    const notice = canvasNotice({
      rawNodes: input.nodes.length,
      rawEdges: input.edges.length,
      drawn: run.drawn(state).nodes.length,
      typesTotal: 0,
      typesOff: 0,
    });
    expect(notice?.code).toBe("no-data");
  });
});
