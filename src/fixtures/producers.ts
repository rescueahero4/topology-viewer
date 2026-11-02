import {
  expectSchema,
  type Expect,
  type FirstPaint,
  type NoticeCode,
} from "#contract";

export type Producer = {
  code: NoticeCode;
  input: Record<string, unknown>;
  expect: Expect;
};

const TYPES = { t0: { label: "T0", rank: 0 } };
const NODES = [
  { id: "n0", type: "t0" },
  { id: "n1", type: "t0" },
];
const PASSIVE: FirstPaint = { approach: "passive", selected: null };

function graphCase(
  code: NoticeCode,
  extra: Record<string, unknown>,
  firstPaint = PASSIVE,
): Producer {
  return {
    code,
    input: { types: TYPES, nodes: NODES, ...extra },
    expect: expectSchema.parse({
      schema: "pass",
      firstPaint,
      notice: null,
      warnings: { [code]: 1 },
    }),
  };
}

function fatalCase(code: NoticeCode, input: Record<string, unknown>): Producer {
  return {
    code,
    input,
    expect: expectSchema.parse({
      schema: code,
      firstPaint: PASSIVE,
      notice: null,
      warnings: {},
    }),
  };
}

// why: EPIC-002 decision D3 — the codes that no corpus fixture named, plus a second producer of
// `constraint-violation`; EPIC-005 question 3 moves the list here, so every test layer reads it
export const producers: readonly Producer[] = [
  graphCase("constraint-violation", {
    types: { ...TYPES, t1: { label: "T1", rank: 0 } },
    vocabulary: {
      edgeConstraints: [
        { predicate: "p0", subject_node_type: "t0", object_node_type: "t1" },
      ],
    },
    nodes: [
      { id: "n0", type: "t1" },
      { id: "n1", type: "t1" },
    ],
    edges: [{ subject: "n0", predicate: "p0", object: "n1" }],
  }),
  graphCase("glyph-rejected", {
    types: { t0: { ...TYPES.t0, glyph: "M0 0 <x>" } },
  }),
  graphCase("color-rejected", {
    types: { t0: { ...TYPES.t0, color: "c".repeat(65) } },
  }),
  graphCase("rank-rejected", { types: { t0: { ...TYPES.t0, rank: 7 } } }),
  graphCase("layout-rejected", { view: { layout: "radial" } }),
  graphCase("budget-rejected", { view: { budget: 30 } }),
  graphCase("schema-version-unknown", { schemaVersion: "2" }),
  graphCase("inferred-rejected", {
    nodes: [{ ...NODES[0], _inferred: "yes" }, NODES[1]],
  }),
  graphCase("unknown-key", { title: "t" }),
  graphCase(
    "reveal-not-found",
    { view: { root: "n0", reveal: ["n9"] } },
    { approach: "active", selected: "n0" },
  ),
  graphCase("field-rejected", {
    nodes: [{ ...NODES[0], label: 5 }, NODES[1]],
  }),
  fatalCase("edges-not-array", { types: TYPES, nodes: NODES, edges: {} }),
  fatalCase("not-a-graph", {
    items: [{ name: "a" }],
    shape: { kind: "graph" },
  }),
  {
    code: "shaped-from",
    input: {
      nodes: [{ from: "n0", to: "n1" }],
      shape: { kind: "rows", subject: "from", object: "to" },
    },
    expect: expectSchema.parse({
      schema: "pass",
      firstPaint: PASSIVE,
      notice: null,
      warnings: { "shaped-from": 1 },
    }),
  },
];
