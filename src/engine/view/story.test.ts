import { profile } from "#contract";
import { datasets, loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnIdOf, frontier } from "./frontier";
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

type Input = { view?: Record<string, unknown> };

describe("S6, S7 s-badroot", () => {
  it("S6 ignores the hint and fills from the most connected entity", () => {
    const run = load(loadFixture("s-badroot").input);
    const state = run.first();
    const auto = load({ ...datasets.catalog.graph, view: { budget: 20 } });
    expect(state.revealed).toEqual(auto.first().revealed);
    expect(state.revealed).toHaveLength(55);
    expect(state.revealed).toContain("t_FCT_REVENUE");
    expect(drawnIdOf(state, run.graph, run.vocab, "t_FCT_REVENUE")).toBe(
      "e:t_FCT_REVENUE",
    );
    expect(state.scope).toEqual({
      mode: "auto",
      root: "t_SF_ACCOUNT",
      hint: null,
    });
    expect(state.approach).toBe("active");
    expect(state.selection).toEqual({ node: "e:t_SF_ACCOUNT" });
  });

  it("S7 stays Active with no view.approach", () => {
    const input = loadFixture("s-badroot").input as Input;
    const view = { ...input.view };
    delete view.approach;
    const state = load({ ...input, view }).first();
    expect(view.root).toBeDefined();
    expect(state.approach).toBe("active");
    expect(state.selection).toEqual({ node: "e:t_SF_ACCOUNT" });
  });
});

describe("S8 Passive", () => {
  it.each(["s-vague", "s-nohint"])("%s selects nothing", (key) => {
    const state = load(loadFixture(key).input).first();
    expect(state.approach).toBe("passive");
    expect(state.selection).toBeNull();
  });
});

describe("S20 budget change and Reset select again", () => {
  const input = loadFixture("s-access").input as Input;
  it.each([
    ["active", { node: "e:t_FCT_REVENUE" }],
    ["passive", null],
  ])("%s", (approach, selected) => {
    const run = load({ ...input, view: { ...input.view, approach } });
    let state = run.act(run.first(), { kind: "explore", id: "t_FCT_REVENUE" });
    const group = run.drawn(state).nodes.find((node) => "members" in node);
    state = run.act(state, { kind: "expandGroup", group: group?.id ?? "" });
    state = run.act(state, { kind: "select", entity: "u_0" });
    expect(state.origins).not.toHaveLength(0);
    expect(state.expandedGroups).toHaveLength(1);
    const wider = run.act(state, { kind: "budget", budget: 50 });
    expect(wider.budget).toBe(50);
    expect(wider.origins).toEqual([]);
    expect(wider.expandedGroups).toEqual([]);
    expect(wider.selection).toEqual(selected);
    const reset = run.act(wider, { kind: "reset" });
    expect(reset.selection).toEqual(selected);
    expect(reset.scope.mode).toBe("ai");
    expect(reset.revealed).toEqual(run.first().revealed);
  });
});

describe("S30 a root inside a group", () => {
  it("selects the group of the root", () => {
    const run = load({
      nodes: [
        { id: "a", type: "t0" },
        { id: "r", type: "t1" },
        { id: "l1", type: "t1" },
        { id: "l2", type: "t1" },
      ],
      edges: ["r", "l1", "l2"].map((id) => ({
        subject: "a",
        predicate: "p",
        object: id,
      })),
      view: { root: "r", reveal: ["a", "l1", "l2"], approach: "active" },
    });
    const state = run.first();
    const group = 'g:["a","p",">","t1"]';
    const { nodes } = run.drawn(state);
    expect(nodes.map((node) => node.id)).toEqual(["e:a", group]);
    expect(nodes[1]).toEqual(
      expect.objectContaining({ members: ["r", "l1", "l2"], count: 3 }),
    );
    expect(state.selection).toEqual({ node: group });
  });
});

describe("S37 a root that is not a string or not found", () => {
  const graph = {
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [{ subject: "a", predicate: "p", object: "b" }],
  };
  const runs = [7, null, {}, ["a"], true, "zzz"].map((root) => {
    const result = normalize(
      { ...graph, view: { root } },
      { now: "2026-10-14" },
    );
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { vocab } = resolveVocab(
      result.graph,
      result.payload,
      profile,
      LIGHT,
    );
    const state = firstView(result.graph, vocab, result.payload, result.hash);
    return { root, result, state };
  });
  const last = runs[runs.length - 1];

  it.each(runs.map((run) => [JSON.stringify(run.root), run] as const))(
    "root %s gives one root-not-found and opens Active",
    (_, { result, state }) => {
      const found = result.issues.filter((i) => i.code === "root-not-found");
      expect(found).toEqual([
        { code: "root-not-found", path: ["view", "root"] },
      ]);
      expect(state.approach).toBe("active");
      expect(state.selection).toEqual({ node: "e:a" });
      expect(state).toStrictEqual(last.state);
      expect(result.hash).toBe(last.result.hash);
    },
  );

  it("keeps a sent approach and adds none with no root", () => {
    const passive = normalize(
      { ...graph, view: { root: 7, approach: "passive" } },
      { now: "2026-10-14" },
    );
    const none = normalize({ ...graph, view: {} }, { now: "2026-10-14" });
    if (!passive.ok || !none.ok) throw new Error("fatal");
    expect(passive.payload.view).toStrictEqual({ approach: "passive" });
    expect(none.payload.view).toStrictEqual({});
  });
});

describe("S38 explore and collapse clear an edge selection", () => {
  const run = load({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, type: "t0" })),
    edges: [
      { subject: "a", predicate: "p", object: "b" },
      { subject: "b", predicate: "p", object: "c" },
      { subject: "c", predicate: "p", object: "d" },
    ],
    view: { root: "a", reveal: ["b"], approach: "active" },
  });
  const edge = '["e:a","p","e:b"]';
  const pick = (state: CanvasState) =>
    run.act(state, { kind: "selectEdge", edge, anchor: "e:b" });

  it("keeps the anchor node and drops the edge", () => {
    const picked = pick(run.first());
    expect(picked.selection).toEqual({ edge, anchor: "e:b" });
    const open = run.act(picked, { kind: "explore", id: "b" });
    expect(run.drawn(open).edges.map((e) => e.key)).toContain(edge);
    expect(open.selection).toEqual({ node: "e:b" });
    const shut = run.act(pick(open), { kind: "collapse", id: "b" });
    expect(run.drawn(shut).edges.map((e) => e.key)).toContain(edge);
    expect(shut.selection).toEqual({ node: "e:b" });
    const node = run.act(pick(shut), { kind: "select", node: "e:a" });
    expect(node.selection).toEqual({ node: "e:a" });
  });

  it("keeps the edge for a path that leaves it drawn", () => {
    const far = run.act(pick(run.first()), { kind: "path", id: "d" });
    expect(far.revealed).toEqual(["a", "b", "c", "d"]);
    expect(far.selection).toEqual({ edge, anchor: "e:b" });
  });
});
