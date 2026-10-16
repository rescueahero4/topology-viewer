import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnIdOf, frontier } from "./frontier";
import { onCanvas } from "./hidden";
import { firstView } from "./story";

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
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
  };
}

const withView = (input: unknown, view: unknown) => ({
  ...(input as object),
  view,
});

describe("S33 the exact frontier in canonical order", () => {
  it("places the group at its first member and keeps triple order", () => {
    const run = load({
      nodes: [
        { id: "l9", type: "t2" },
        { id: "a", type: "t0" },
        { id: "b", type: "t0" },
        { id: "l2", type: "t1" },
        { id: "l1", type: "t1" },
        { id: "c", type: "t0" },
      ],
      edges: [
        { subject: "a", predicate: "p", object: "b" },
        { subject: "b", predicate: "p", object: "c" },
        { subject: "a", predicate: "q", object: "l1" },
        { subject: "a", predicate: "q", object: "l2" },
        { subject: "b", predicate: "q", object: "l9" },
      ],
      view: { budget: "all" },
    });
    const G = 'g:["a","q",">","t1"]';
    const node = (id: string, type: string) => ({
      id: `e:${id}`,
      entity: id,
      type,
      label: id,
      more: 0,
      opened: 0,
    });
    expect(run.drawn(run.first())).toStrictEqual({
      nodes: [
        node("l9", "t2"),
        node("a", "t0"),
        node("b", "t0"),
        {
          id: G,
          type: "t1",
          members: ["l2", "l1"],
          count: 2,
          more: 0,
          opened: 0,
        },
        node("c", "t0"),
      ],
      edges: [
        {
          key: '["e:a","p","e:b"]',
          subject: "e:a",
          predicate: "p",
          object: "e:b",
          count: 1,
          muted: false,
        },
        {
          key: '["e:b","p","e:c"]',
          subject: "e:b",
          predicate: "p",
          object: "e:c",
          count: 1,
          muted: false,
        },
        {
          key: JSON.stringify(["e:a", "q", G]),
          subject: "e:a",
          predicate: "q",
          object: G,
          count: 2,
          muted: false,
        },
        {
          key: '["e:b","q","e:l9"]',
          subject: "e:b",
          predicate: "q",
          object: "e:l9",
          count: 1,
          muted: false,
        },
      ],
    });
  });
});

describe("S34 record ids of a merged entity", () => {
  it("map to the entity in drawnIdOf, onCanvas and the view", () => {
    const input = loadFixture("s-access").input;
    const run = load(input);
    const state: CanvasState = { ...run.first(), grouping: "off" };
    for (const id of ["u_0", "u_20", "u_40", "u_60"]) {
      expect(drawnIdOf(state, run.graph, run.vocab, id)).toBe("e:u_0");
      expect(onCanvas(state, run.graph, run.vocab, id)).toBe("drawn");
    }
    expect(drawnIdOf(state, run.graph, run.vocab, "nope")).toBeNull();
    expect(onCanvas(state, run.graph, run.vocab, "nope")).toBe("not-drawn");
    const view = {
      approach: "active",
      root: "t_FCT_REVENUE",
      reveal: ["u_20", "u_40"],
    };
    const again = load(withView(input, view)).first();
    expect([...(again.revealed ?? [])].sort()).toEqual([
      "t_FCT_REVENUE",
      "u_0",
    ]);
  });
});
