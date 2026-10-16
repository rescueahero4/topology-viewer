import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { setLayout } from "./layout";
import { treeRowKeys } from "./tree";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function run(input: object) {
  const sent = { ...input, view: { approach: "passive", budget: "all" } };
  const result = normalize(sent, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const state: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping: "off",
  };
  const drawn = frontier(state, graph, vocab);
  return { vocab, drawn, tree: setLayout(state, drawn, vocab, "tree-h", {}) };
}

describe("D92 (1) the attribute lane copies the v56 round", () => {
  it("gives the mockup key where a value changes inside one round", () => {
    const { vocab, drawn } = run({
      nodes: [
        { id: "n0", type: "table" },
        { id: "n1", type: "property_set" },
        { id: "n2", type: "property" },
        { id: "n3", type: "column" },
        { id: "n4", type: "property_set" },
        { id: "n5", type: "schema" },
      ],
      edges: [
        ["n2", "relatedTo", "n1"],
        ["n1", "relatedTo", "n3"],
        ["n4", "relatedTo", "n0"],
        ["n1", "relatedTo", "n4"],
      ],
    });
    // why: mockup lines 1558-1572 by hand — round 1 gives n4 (3, 1) from n0 and n1 (4, 1) from
    // n3; in round 2, n4 lowers n1 to (3, 2), and then n1 is read with its new level 3 and gives
    // n2 (3, 2); the path n0-n4-n1-n2 has 3 steps, so a round-by-round read gives 3.3
    expect(treeRowKeys(drawn, vocab)).toEqual([
      ["e:n0", 3],
      ["e:n1", 3.2],
      ["e:n2", 3.2],
      ["e:n3", 4],
      ["e:n4", 3.1],
      ["e:n5", 2],
    ]);
  });
});

describe("D92 (2) a payload level above 99", () => {
  it("is read as 99, under the curation zone", () => {
    const { tree } = run({
      nodes: [
        { id: "a", type: "big" },
        { id: "b", type: "edge99" },
        { id: "c", type: "edge100" },
        { id: "k", type: "kpi" },
      ],
      edges: [["a", "relatedTo", "k"]],
      types: {
        big: { level: 150 },
        edge99: { level: 99 },
        edge100: { level: 100 },
        kpi: { role: "curation" },
      },
    });
    expect(tree.treeRows?.rows).toEqual([
      ["e:a", 99],
      ["e:b", 99],
      ["e:c", 99],
      ["e:k", 101],
    ]);
    expect(tree.treeRows?.keyCoord).toEqual([
      [99, 0],
      [101, 240],
    ]);
  });
});

describe("L-1 a level of -0", () => {
  it("gives the row key 0", () => {
    const { vocab, tree } = run({
      nodes: [
        { id: "t1", type: "t" },
        { id: "t2", type: "u" },
      ],
      edges: [["t1", "contains", "t2"]],
      types: JSON.parse('{"t":{"level":-0}}') as object,
    });
    expect(Object.is(vocab.types.get("t")?.level, -0)).toBe(true);
    const rows = tree.treeRows;
    if (rows === null) throw new Error("no rows");
    expect(rows.rows).toEqual([
      ["e:t1", 0],
      ["e:t2", 1],
    ]);
    for (const n of [
      ...rows.rows.map(([, key]) => key),
      ...rows.keyCoord.flat(),
    ])
      expect(Object.is(n, -0)).toBe(false);
  });
});

describe("D92 (2) lead reading: derived keys stay at 99", () => {
  it("keeps a rule (1) container at 99 under a level-99 container", () => {
    const { tree } = run({
      nodes: [
        { id: "a", type: "box" },
        { id: "b", type: "box" },
        { id: "c", type: "box" },
        { id: "k", type: "kpi" },
      ],
      edges: [
        ["a", "contains", "b"],
        ["b", "contains", "c"],
        ["k", "relatedTo", "a"],
      ],
      types: { box: { level: 99 }, kpi: { role: "curation" } },
    });
    expect(tree.treeRows?.rows).toEqual([
      ["e:a", 99],
      ["e:b", 99],
      ["e:c", 99],
      ["e:k", 101],
    ]);
  });

  it("keeps a rule (4) chain and a lane under a level-99 ancestor at 99", () => {
    const { tree } = run({
      nodes: [
        { id: "r", type: "top" },
        { id: "c1", type: "x" },
        { id: "c2", type: "x" },
        { id: "p", type: "property_set" },
        { id: "k", type: "kpi" },
      ],
      edges: [
        ["r", "contains", "c1"],
        ["c1", "contains", "c2"],
        ["r", "relatedTo", "p"],
        ["k", "relatedTo", "r"],
      ],
      types: { top: { level: 99 }, kpi: { role: "curation" } },
    });
    expect(new Map(tree.treeRows?.rows)).toEqual(
      new Map([
        ["e:r", 99],
        ["e:c1", 99],
        ["e:c2", 99],
        ["e:p", 99],
        ["e:k", 101],
      ]),
    );
    expect(tree.treeRows?.keyCoord).toEqual([
      [99, 0],
      [101, 240],
    ]);
  });
});
