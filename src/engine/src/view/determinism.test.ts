import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { frontier, type Frontier } from "./frontier";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function steps(key: string) {
  const result = normalize(loadFixture(key).input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const drawn = (state: CanvasState) => frontier(state, graph, vocab);
  const actions: ((state: CanvasState) => Action)[] = [
    () => ({ kind: "explore", id: "t_FCT_REVENUE" }),
    (state) => ({
      kind: "expandGroup",
      group: drawn(state).nodes.find((node) => "members" in node)?.id ?? "",
    }),
    (state) => ({
      kind: "select",
      node: drawn(state).nodes.find((node) => "entity" in node)?.id ?? null,
    }),
    () => ({ kind: "budget", budget: 10 }),
    () => ({ kind: "reset" }),
  ];
  let state = firstView(graph, vocab, payload, hash);
  const out: { state: CanvasState; frontier: Frontier }[] = [
    { state, frontier: drawn(state) },
  ];
  for (const make of actions) {
    state = transition(state, make(state), graph, vocab);
    out.push({ state, frontier: drawn(state) });
  }
  return out;
}

describe("S28 same input, same states and frontiers", () => {
  it("runs s-access twice to equal results", () => {
    const first = steps("s-access");
    const second = steps("s-access");
    expect(second).toStrictEqual(first);
    expect(first[2].state.expandedGroups).toHaveLength(1);
    expect(first[3].state.selection).not.toBeNull();
  });
});
