import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { datasets, loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { treeRowKeys } from "../index";
import type { CanvasState, LayoutName, Point } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { setLayout } from "./layout";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const ALL = { approach: "passive", budget: "all" } as const;

function run(input: object, all = true) {
  const sent = all ? { ...input, view: ALL } : input;
  const result = normalize(sent, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const state: CanvasState = all ? { ...first, grouping: "off" } : first;
  const drawn = frontier(state, graph, vocab);
  const to = (name: LayoutName, from = state) =>
    setLayout(from, drawn, vocab, name, METRICS);
  return { drawn, vocab, state, to };
}

function rowsOf(state: CanvasState) {
  if (state.treeRows === null) throw new Error("no rows");
  return new Map(state.treeRows.rows);
}

const where = (state: CanvasState) => new Map(state.positions);
const at = (state: CanvasState, id: string) => where(state).get(id) as Point;

const catalog = () => datasets.catalog.graph;

describe("S10 q-full-vocabulary rows in tree-h", () => {
  it("puts each row key on its compacted x", () => {
    const { drawn, state, to } = run(
      loadFixture("q-full-vocabulary").input as object,
    );
    expect(drawn.nodes).toHaveLength(39);
    const tree = to("tree-h");
    const rows = rowsOf(tree);
    const expected: [string, number, number][] = [
      ["e:pset-retention", 3.1, 960],
      ["e:prop-retention-days", 3.2, 1200],
      ["e:tag-pii", 101, 1680],
      ["e:usr-jane", 101, 1680],
      ["e:tag-personal", 102, 1920],
      ["e:tag-email", 103, 2160],
      ["e:node-kw-order", 104, 2400],
    ];
    for (const [id, key, x] of expected) {
      expect(rows.get(id)).toBe(key);
      expect(at(tree, id).x).toBe(x);
    }
    const byType: [string, number, number][] = [
      ["data_source", 0, 0],
      ["database", 1, 240],
      ["bigroup", 1, 240],
      ["etl", 1, 240],
      ["schema", 2, 480],
      ["dashboard", 2, 480],
      ["table", 3, 720],
      ["view", 3, 720],
      ["report", 3, 720],
      ["column", 4, 1440],
    ];
    for (const [type, key, x] of byType) {
      const nodes = drawn.nodes.filter((node) => node.type === type);
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(rows.get(node.id)).toBe(key);
        expect(at(tree, node.id).x).toBe(x);
      }
    }
    expect(state.treeRows).toBeNull();
  });
});

describe("S11 catalog in tree-h and tree-v", () => {
  it("keeps the rows and the order inside each row", () => {
    const { to } = run(catalog());
    const h = to("tree-h");
    const v = to("tree-v");
    expect(h.treeRows?.rows).toEqual(v.treeRows?.rows);
    const hx = new Set([...where(h).values()].map((p) => p.x));
    const vy = new Set([...where(v).values()].map((p) => p.y));
    expect([...hx].sort((a, b) => a - b)).toEqual(
      [...vy].sort((a, b) => a - b).map((y) => (y / 150) * 240),
    );
    for (const [id, p] of where(h)) expect(at(v, id).y / 150).toBe(p.x / 240);
    const inRow = (state: CanvasState, axis: "x" | "y", other: "x" | "y") =>
      [...where(state)]
        .sort((a, b) => a[1][axis] - b[1][axis] || a[1][other] - b[1][other])
        .map(([id]) => id);
    expect(inRow(h, "x", "y")).toEqual(inRow(v, "y", "x"));
  });
});

describe("S12 payload level, profile level and the curation zone", () => {
  it("gives the row keys of the rules", () => {
    const { to } = run({
      nodes: [
        { id: "s1", type: "supplier" },
        { id: "t1", type: "table" },
        { id: "k1", type: "kpi" },
        { id: "k2", type: "kpi" },
      ],
      edges: [
        ["t1", "relatedTo", "k1"],
        ["k1", "relatedTo", "k2"],
      ],
      types: {
        supplier: { level: 1 },
        kpi: { role: "curation" },
        table: { level: 4 },
      },
    });
    const tree = to("tree-h");
    expect(tree.treeRows?.rows).toEqual([
      ["e:s1", 1],
      ["e:t1", 3],
      ["e:k1", 101],
      ["e:k2", 102],
    ]);
    expect(tree.treeRows?.keyCoord).toEqual([
      [1, 0],
      [3, 240],
      [101, 480],
      [102, 720],
    ]);
  });
});

const chain = (predicate: string) => ({
  nodes: [
    { id: "a", type: "p" },
    { id: "b", type: "q" },
    { id: "c", type: "r" },
  ],
  edges: [
    ["a", predicate, "b"],
    ["b", predicate, "c"],
  ],
});

describe("S28 and S13 containment chains with no level", () => {
  it("puts a contains chain on 3 consecutive rows", () => {
    const tree = run(chain("contains")).to("tree-h");
    expect([at(tree, "e:a").x, at(tree, "e:b").x, at(tree, "e:c").x]).toEqual([
      0, 240, 480,
    ]);
  });

  it("does the same for a payload containment predicate", () => {
    const input = {
      ...chain("hasPart"),
      predicates: { hasPart: { role: "containment" } },
    };
    const tree = run(input).to("tree-h");
    expect(tree.treeRows?.rows).toEqual([
      ["e:a", 0],
      ["e:b", 1],
      ["e:c", 2],
    ]);
  });
});

const withO = (level?: number) => ({
  nodes: [...chain("contains").nodes, { id: "o", type: "o" }],
  edges: [...chain("contains").edges, ["o", "relatedTo", "c"]],
  ...(level === undefined ? {} : { types: { q: { level } } }),
});

describe("S29 and S34 row 0 and the nearest levelled ancestor", () => {
  it("puts o on row key 0", () => {
    expect(rowsOf(run(withO()).to("tree-h")).get("e:o")).toBe(0);
  });

  it("puts b on its payload level and c one row under it", () => {
    const tree = run(withO(3)).to("tree-h");
    expect(tree.treeRows?.rows).toEqual([
      ["e:a", 0],
      ["e:b", 3],
      ["e:c", 4],
      ["e:o", 0],
    ]);
    expect(tree.treeRows?.keyCoord).toEqual([
      [0, 0],
      [3, 240],
      [4, 480],
    ]);
  });
});

describe("S14 lineage orders a row only", () => {
  it.each([
    ["a", "b", ["e:b", "e:a"]],
    ["b", "a", ["e:a", "e:b"]],
  ])("%s derivedFrom %s puts the object first", (s, o, order) => {
    const tree = run({
      nodes: [
        { id: "a", type: "table" },
        { id: "b", type: "table" },
      ],
      edges: [[s, "derivedFrom", o]],
    }).to("tree-h");
    expect([...rowsOf(tree).values()]).toEqual([3, 3]);
    const sorted = [...where(tree)].sort((x, y) => x[1].y - y[1].y);
    expect(sorted.map(([id]) => id)).toEqual(order);
  });
});

describe("S15 a containment cycle", () => {
  it("ends with finite positions", () => {
    const tree = run({
      nodes: [
        { id: "a", type: "p" },
        { id: "b", type: "p" },
      ],
      edges: [
        ["a", "contains", "b"],
        ["b", "contains", "a"],
      ],
    }).to("tree-h");
    for (const [, p] of tree.positions)
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(tree.treeRows?.rows).toEqual([
      ["e:a", 0],
      ["e:b", 1],
    ]);
  });
});

describe("S16 s-chain rows by profile level", () => {
  it("puts etl on L1, the dashboard on L2, tables and views on L3", () => {
    const { drawn, to } = run(loadFixture("s-chain").input as object, false);
    const tree = to("tree-h");
    const rows = rowsOf(tree);
    const level = { etl: 1, dashboard: 2, table: 3, view: 3 } as const;
    for (const node of drawn.nodes)
      expect(rows.get(node.id)).toBe(level[node.type as keyof typeof level]);
    expect(rows.get("e:t13")).toBe(2);
    const l3 = [...where(tree)]
      .filter(([id]) => rows.get(id) === 3)
      .sort((a, b) => a[1].y - b[1].y);
    expect(l3[0][0]).toBe("e:t0");
  });
});

describe("S17 no containment, no level, no role", () => {
  it.each([
    ["s-custom-passive", () => loadFixture("s-custom-passive").input as object],
    ["a feeds chain", () => chainOf()],
  ])("%s lies on row 0", (_, input) => {
    const tree = run(input()).to("tree-h");
    expect(new Set(rowsOf(tree).values())).toEqual(new Set([0]));
    expect(tree.treeRows?.keyCoord).toEqual([[0, 0]]);
    const points = tree.positions.map(([, p]) => `${p.x},${p.y}`);
    expect(new Set(points).size).toBe(points.length);
  });
});

function chainOf() {
  const nodes = Array.from({ length: 10 }, (_, k) => ({
    id: `n${k}`,
    type: "t0",
  }));
  const edges = nodes.slice(1).map((_, k) => [`n${k}`, "feeds", `n${k + 1}`]);
  return { nodes, edges };
}

describe("S30 the treeRows JSON shape", () => {
  it("holds the fixture rows in tree-v and goes null in Force", () => {
    const { drawn, vocab, to } = run(
      loadFixture("q-full-vocabulary").input as object,
    );
    const tree = to("tree-v");
    const rows = tree.treeRows;
    if (rows === null) throw new Error("no rows");
    expect(Object.keys(rows)).toEqual(["vertical", "rows", "keyCoord"]);
    expect(rows.vertical).toBe(true);
    expect(rows.rows.map(([id]) => id)).toEqual(
      drawn.nodes.map(({ id }) => id),
    );
    const keyOf = new Map(rows.rows);
    const ofType = (type: string) =>
      drawn.nodes
        .filter((node) => node.type === type)
        .map(({ id }) => keyOf.get(id));
    expect(ofType("data_source")).toEqual([0]);
    expect(ofType("column")).toEqual([4, 4]);
    expect(keyOf.get("e:tag-pii")).toBe(101);
    expect(keyOf.get("e:tag-personal")).toBe(102);
    expect(keyOf.get("e:tag-email")).toBe(103);
    expect(keyOf.get("e:node-kw-order")).toBe(104);
    const keys = [0, 1, 2, 3, 3.1, 3.2, 4, 101, 102, 103, 104];
    expect(rows.keyCoord).toEqual(keys.map((key, i) => [key, i * 150]));
    const numbers = [...rows.rows.map(([, k]) => k), ...rows.keyCoord.flat()];
    for (const n of numbers) {
      expect(Number.isFinite(n)).toBe(true);
      expect(Object.is(n, -0)).toBe(false);
    }
    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
    expect(treeRowKeys(drawn, vocab)).toEqual(rows.rows);
    expect(to("force", tree).treeRows).toBeNull();
  });

  it("holds the catalog rows in tree-h", () => {
    const { drawn, to } = run(catalog());
    const rows = to("tree-h").treeRows;
    expect(rows?.vertical).toBe(false);
    expect(rows?.rows).toHaveLength(drawn.nodes.length);
    expect(rows?.rows).toEqual(to("tree-v").treeRows?.rows);
    rows?.keyCoord.forEach(([, coord], i) => expect(coord).toBe(i * 240));
  });
});
