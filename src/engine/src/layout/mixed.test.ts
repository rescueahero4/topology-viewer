import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState, LayoutName } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnOf, type IconMetrics } from "./drawn";
import { layout } from "./layout";
import { treeRowKeys } from "./tree";

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

function load(input: object, grouping: CanvasState["grouping"] = 2) {
  const sent = { ...input, view: { approach: "passive", budget: "all" } };
  const result = normalize(sent, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const state: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping,
  };
  const drawn = frontier(state, graph, vocab);
  const lay = (name: LayoutName) =>
    layout(state, drawn, vocab, name, METRICS, hash);
  return { drawn, vocab, lay };
}

function checked(input: object, grouping?: CanvasState["grouping"]) {
  const run = load(input, grouping);
  for (const name of LAYOUTS) {
    const out = run.lay(name);
    expect(out.positions.map(([id]) => id)).toEqual(
      run.drawn.nodes.map(({ id }) => id),
    );
    for (const [, p] of out.positions)
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(JSON.stringify(load(input, grouping).lay(name))).toBe(
      JSON.stringify(out),
    );
  }
  return run;
}

const MIXED = {
  nodes: [
    { id: "tbl", type: "table", label: "Orders" },
    ...Array.from({ length: 5 }, (_, k) => ({ id: `col${k}`, type: "column" })),
    { id: "__proto__", type: "constructor", label: "x".repeat(300) },
    { id: "e:fake", type: "tag", label: "😀😀😀😀😀😀😀😀😀😀😀😀" },
    { id: 'g:["a"]', type: "table" },
    { id: "loop", type: "tag" },
    { id: "alone" },
    { id: "other1", type: "t" },
    { id: "other2", type: "t" },
  ],
  edges: [
    ...Array.from({ length: 5 }, (_, k) => ["tbl", "contains", `col${k}`]),
    ["tbl", "derivedFrom", 'g:["a"]'],
    ['g:["a"]', "derivedFrom", "tbl"],
    ["tbl", "contains", "__proto__"],
    ["__proto__", "contains", "tbl"],
    ["e:fake", "taggedWith", "tbl"],
    ["loop", "contains", "loop"],
    ["loop", "relatedTo", "loop"],
    ["other1", "relatedTo", "other2"],
  ],
};

describe("mixed forms in every layout", () => {
  it("handles a group, cycles, self-loops, hostile ids and parts", () => {
    const run = checked(MIXED);
    expect(run.drawn.nodes.some((node) => "members" in node)).toBe(true);
    const off = checked(MIXED, "off");
    expect(off.drawn.nodes).toHaveLength(MIXED.nodes.length);
    const rows = new Map(treeRowKeys(off.drawn, off.vocab));
    expect(rows.get("e:tbl")).toBe(3);
    expect(rows.get("e:col0")).toBe(4);
    expect(rows.get("e:__proto__")).toBe(4);
    expect(rows.get("e:alone")).toBe(0);
  });

  it("gives the group node of the columns the column row", () => {
    const run = checked(MIXED);
    const group = run.drawn.nodes.find((node) => "members" in node);
    const rows = new Map(treeRowKeys(run.drawn, run.vocab));
    expect(group?.type).toBe("column");
    expect(rows.get(group?.id ?? "")).toBe(4);
    const laid = drawnOf(run.drawn, run.vocab, METRICS).nodes;
    expect(laid.find((node) => node.id === group?.id)?.chars).toBe(22);
    expect(laid.find((node) => node.id === "e:__proto__")?.chars).toBe(22);
  });

  it("lays out an all-same-type graph with no level on one tree row", () => {
    const nodes = Array.from({ length: 30 }, (_, k) => ({
      id: `n${k}`,
      type: "s",
    }));
    const edges = nodes
      .slice(1)
      .map((_, k) => [`n${k}`, "relatedTo", `n${k + 1}`]);
    const run = checked({ nodes, edges }, "off");
    expect(run.lay("tree-v").treeRows?.keyCoord).toEqual([[0, 0]]);
  });
});

describe("deep and wide trees", () => {
  const chainOf = (n: number) => ({
    nodes: Array.from({ length: n }, (_, k) => ({ id: `n${k}`, type: "d" })),
    edges: Array.from({ length: n - 1 }, (_, k) => [
      `n${k}`,
      "contains",
      `n${k + 1}`,
    ]),
  });

  it("puts a 2,000-deep containment chain on 2,000 rows", () => {
    const run = load(chainOf(2000), "off");
    const out = run.lay("tree-h");
    expect(out.treeRows?.keyCoord).toHaveLength(2000);
    expect(out.treeRows?.rows.at(-1)).toEqual(["e:n1999", 1999]);
    expect(run.lay("atomic").positions).toHaveLength(2000);
  }, 30_000);

  it("puts a 1,999-leaf containment star on 2 rows", () => {
    const nodes = Array.from({ length: 2000 }, (_, k) => ({
      id: `n${k}`,
      type: "w",
    }));
    const edges = nodes.slice(1).map(({ id }) => ["n0", "contains", id]);
    const run = load({ nodes, edges }, "off");
    expect(run.lay("tree-v").treeRows?.keyCoord).toEqual([
      [0, 0],
      [1, 150],
    ]);
  }, 30_000);

  it("releases a long containment cycle and a lineage cycle", () => {
    const ring = chainOf(50);
    ring.edges.push(
      ["n49", "contains", "n0"],
      ["n0", "derivedFrom", "n10"],
      ["n10", "derivedFrom", "n0"],
    );
    const run = checked(ring, "off");
    const keys = run.lay("tree-h").treeRows?.rows.map(([, key]) => key);
    expect(keys).toEqual(Array.from({ length: 50 }, (_, k) => k));
  });
});
