import { profile } from "@qdic-topology/contract";
import { datasets, loadFixture } from "@qdic-topology/fixtures";
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
