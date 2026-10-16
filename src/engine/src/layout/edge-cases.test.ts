import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { generate, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState, LayoutName } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { boxOf, type IconMetrics } from "./drawn";
import { layout } from "./layout";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const ALL = { approach: "passive", budget: "all" } as const;

function run(input: object, all = false) {
  const sent = all ? { ...input, view: ALL } : input;
  const result = normalize(sent, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const state: CanvasState = all ? { ...first, grouping: "off" } : first;
  return { state, vocab, drawn: frontier(state, graph, vocab) };
}

const finite = (points: [string, { x: number; y: number }][]) =>
  points.every(([, p]) => Number.isFinite(p.x) && Number.isFinite(p.y));

describe("S18 an empty frontier and one node", () => {
  const single = run(loadFixture("s-single").input as object);

  it.each(LAYOUTS)("%s gives the empty result for no node", (name) => {
    const empty = { nodes: [], edges: [] };
    const out = layout(single.state, empty, single.vocab, name, METRICS, 7);
    expect(out).toStrictEqual({
      positions: [],
      ticks: 0,
      treeRows: null,
      bubbles: [],
    });
  });

  it.each(LAYOUTS)("%s gives one finite position for s-single", (name) => {
    const { state, drawn, vocab } = single;
    expect(drawn.nodes).toHaveLength(1);
    const out = layout(state, drawn, vocab, name, METRICS, state.graphHash);
    expect(out.positions).toHaveLength(1);
    expect(finite(out.positions)).toBe(true);
  });
});

describe("S19 2,000 nodes in the static layouts", () => {
  const big = run(generate.random(2000, 4000, 42), true);

  it.each(["atomic", "bubbles", "tree-h", "tree-v"] as const)(
    "%s ends with finite positions",
    (name) => {
      expect(big.drawn.nodes).toHaveLength(2000);
      const out = layout(big.state, big.drawn, big.vocab, name, METRICS, 1);
      expect(out.positions).toHaveLength(2000);
      expect(finite(out.positions)).toBe(true);
    },
  );
});

describe("S23 a type with no metrics entry", () => {
  const typed = run(
    {
      nodes: [
        { id: "w", type: "widget" },
        { id: "t", type: "table" },
      ],
      edges: [["w", "uses", "t"]],
      types: { widget: { rank: 2 } },
    },
    true,
  );

  it("uses the STORY-002-03 size or the rank-0 box", () => {
    expect(boxOf("widget", typed.vocab, {})).toStrictEqual({
      w: 32,
      h: 32,
      tier: "node",
    });
    expect(boxOf("table", typed.vocab, {})).toStrictEqual({
      w: 20,
      h: 20,
      tier: "leaf",
    });
    expect(boxOf("table", typed.vocab, METRICS)).toStrictEqual(METRICS.table);
  });

  it.each(LAYOUTS)("%s gives finite positions with no metrics", (name) => {
    const { state, drawn, vocab } = typed;
    const out = layout(state, drawn, vocab, name, {}, state.graphHash);
    expect(out.positions).toHaveLength(2);
    expect(finite(out.positions)).toBe(true);
  });
});
