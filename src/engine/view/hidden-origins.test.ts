import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { frontier } from "./frontier";
import { onCanvas } from "./hidden";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return {
    first: () => firstView(graph, vocab, payload, hash),
    act: (state: CanvasState, action: Action) =>
      transition(state, action, graph, vocab),
    run: (state: CanvasState, actions: Action[]) =>
      actions.reduce(
        (next, action) => transition(next, action, graph, vocab),
        state,
      ),
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
    on: (state: CanvasState, id: string) => onCanvas(state, graph, vocab, id),
  };
}

const hideOf = (id: string): Action => ({ kind: "hide", node: `e:${id}` });

describe("S22 one origins pair for each key (QA F-1)", () => {
  it("keeps one pair for t10 through 5 hide and explore cycles", () => {
    const run = load({
      ...(loadFixture("s-chain").input as object),
      view: { budget: 10 },
    });
    let state = run.act(run.first(), { kind: "explore", id: "t9" });
    for (let cycle = 0; cycle < 5; cycle++) {
      state = run.run(state, [hideOf("t10"), { kind: "explore", id: "t9" }]);
      const pairs = state.origins.filter(([child]) => child === "t10");
      expect(pairs).toEqual([["t10", "t9"]]);
      const node = run.drawn(state).nodes.find((item) => item.id === "e:t9");
      expect(node?.opened).toBe(1);
    }
  });
});

describe("S23 explore then collapse after a hide (QA F-2)", () => {
  it("gives the drawn set before the explore again", () => {
    const run = load({
      nodes: ["A", "H", "X", "C"].map((id) => [id, "t"]),
      edges: ["A-H", "A-X", "H-C", "C-X", "X-H"].map((pair) => {
        const [subject, object] = pair.split("-");
        return [subject, "p", object];
      }),
      view: { root: "A", reveal: [] },
    });
    const before = run.run(run.first(), [
      { kind: "grouping", grouping: "off" },
      { kind: "explore", id: "A" },
      { kind: "explore", id: "H" },
      hideOf("H"),
    ]);
    expect(before.revealed).toEqual(["A", "X", "C"]);
    const after = run.run(before, [
      { kind: "explore", id: "X" },
      { kind: "collapse", id: "X" },
    ]);
    expect(after.revealed).toEqual(before.revealed);
    expect(run.on(after, "C")).toBe("drawn");
  });
});
