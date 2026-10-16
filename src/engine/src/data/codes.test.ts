import {
  expectSchema,
  notices,
  type Expect,
  type FirstPaint,
} from "@qdic-topology/contract";
import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";

type Case = { input: Record<string, unknown>; expect: Expect };

const NOW = { now: "2026-10-14" };
const TYPES = { t0: { label: "T0", rank: 0 } };
const NODES = [
  { id: "n0", type: "t0" },
  { id: "n1", type: "t0" },
];
const PASSIVE: FirstPaint = { approach: "passive", selected: null };

function graphCase(
  code: string,
  extra: Record<string, unknown>,
  firstPaint = PASSIVE,
): Case {
  return {
    input: { types: TYPES, nodes: NODES, ...extra },
    expect: expectSchema.parse({
      schema: "pass",
      firstPaint,
      notice: null,
      warnings: { [code]: 1 },
    }),
  };
}

function fatalCase(code: string, input: Record<string, unknown>): Case {
  return {
    input,
    expect: expectSchema.parse({
      schema: code,
      firstPaint: PASSIVE,
      notice: null,
      warnings: {},
    }),
  };
}

// why: decision D3 — the 14 codes that no corpus fixture names, plus a second producer of
// `constraint-violation`
const CASES: Record<number, Case> = {
  1: graphCase("constraint-violation", {
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
  2: graphCase("glyph-rejected", {
    types: { t0: { ...TYPES.t0, glyph: "M0 0 <x>" } },
  }),
  3: graphCase("color-rejected", {
    types: { t0: { ...TYPES.t0, color: "c".repeat(65) } },
  }),
  4: graphCase("rank-rejected", { types: { t0: { ...TYPES.t0, rank: 7 } } }),
  5: graphCase("layout-rejected", { view: { layout: "radial" } }),
  6: graphCase("budget-rejected", { view: { budget: 30 } }),
  7: graphCase("schema-version-unknown", { schemaVersion: "2" }),
  8: graphCase("inferred-rejected", {
    nodes: [{ ...NODES[0], _inferred: "yes" }, NODES[1]],
  }),
  9: graphCase("unknown-key", { title: "t" }),
  10: graphCase(
    "reveal-not-found",
    { view: { root: "n0", reveal: ["n9"] } },
    { approach: "active", selected: "n0" },
  ),
  11: graphCase("field-rejected", {
    nodes: [{ ...NODES[0], label: 5 }, NODES[1]],
  }),
  12: fatalCase("edges-not-array", { types: TYPES, nodes: NODES, edges: {} }),
  13: fatalCase("not-a-graph", {
    items: [{ name: "a" }],
    shape: { kind: "graph" },
  }),
  14: {
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
};

// why: SA v0.12 §4.2 — the 23 codes, each with its producer; a string is a corpus fixture and a
// number is an in-test case
const PRODUCERS: Record<string, string | number> = {
  "no-id": "s-noid-some",
  "duplicate-id": "s-dirty",
  "dangling-edge": "s-dirty",
  "unknown-type": "s-undeclared",
  "constraint-violation": "s-chain",
  "glyph-rejected": 2,
  "color-rejected": 3,
  "rank-rejected": 4,
  "layout-rejected": 5,
  "budget-rejected": 6,
  "schema-version-unknown": 7,
  "inferred-rejected": 8,
  "unknown-key": 9,
  "root-not-found": "s-badroot",
  "reveal-not-found": 10,
  "shaped-from": 14,
  "field-rejected": 11,
  "not-object": "s-not-graph",
  "nodes-not-array": "s-invalid",
  "edges-not-array": 12,
  "no-valid-nodes": "s-noid-all",
  "too-large": "s-stress",
  "not-a-graph": 13,
};

// why: these codes are checked in the engine result by the story that produces them
const CHECKED_LATER: Record<string, string> = {
  "unknown-type": "STORY-002-03 S30 (vocab/resolve)",
};

function produced(result: Normalized): string[] {
  if (!result.ok) return [result.fatal.code];
  return result.warnings.map((warning) => warning.code);
}

function named(outcome: Expect): string[] {
  return [
    outcome.schema,
    outcome.notice ?? "",
    ...Object.keys(outcome.warnings),
  ];
}

describe("T8 the in-test code cases", () => {
  it.each(Object.entries(CASES))(
    "case %s",
    (_number, { input, expect: outcome }) => {
      const result = normalize(input, NOW);
      if (outcome.schema !== "pass") {
        expect(!result.ok && result.fatal.code).toBe(outcome.schema);
        return;
      }
      if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
      const counts = Object.fromEntries(
        result.warnings.map((w) => [w.code, w.count]),
      );
      expect(counts).toEqual(outcome.warnings);
    },
  );
});

describe("S37 the code cases are synthetic", () => {
  it.each(Object.entries(CASES))("case %s", (_number, { input }) => {
    const ids = [
      ...((input.nodes as Record<string, string>[] | undefined) ?? []).flatMap(
        (node) =>
          [node.id, node.from, node.to].filter((id) => id !== undefined),
      ),
      ...(Array.isArray(input.edges)
        ? (input.edges as Record<string, string>[])
        : []
      ).flatMap((edge) => [edge.subject, edge.object]),
    ];
    for (const id of ids) expect(id).toMatch(/^[a-z]+[0-9.]*$/);
    const text = JSON.stringify(input);
    expect(text).not.toContain("@");
    expect(text).not.toContain("://");
  });
});

describe("S38 each of the 23 codes has a producer", () => {
  it("lists every warning and fatal code of the catalog", () => {
    const issueCodes = notices.codes.filter((code) =>
      ["warning", "fatal"].includes(notices.severity[code]),
    );
    expect(Object.keys(PRODUCERS).sort()).toEqual([...issueCodes].sort());
    expect(Object.keys(PRODUCERS)).toHaveLength(23);
  });

  it.each(Object.entries(PRODUCERS))("%s ← %s", (code, producer) => {
    if (typeof producer === "number" && !Object.hasOwn(CASES, producer)) {
      expect(CHECKED_LATER[code]).toBeDefined();
      return;
    }
    const { input, expect: outcome } =
      typeof producer === "number" ? CASES[producer] : loadFixture(producer);
    if (typeof producer === "string")
      expect(Object.hasOwn(fixtures, producer)).toBe(true);
    expect(named(outcome)).toContain(code);
    if (Object.hasOwn(CHECKED_LATER, code)) return;
    expect(produced(normalize(input, NOW))).toContain(code);
  });

  it("checks 22 codes in the engine result now", () => {
    expect(
      Object.keys(PRODUCERS).length - Object.keys(CHECKED_LATER).length,
    ).toBe(22);
  });
});

describe("S26 case 14 of STORY-002-02", () => {
  it("gives shaped-from with count 1 in the result and the record", () => {
    const { input, expect: outcome } = CASES[14];
    const result = normalize(input, NOW);
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    expect(result.warnings).toEqual([
      { code: "shaped-from", count: 1, ids: ["shape"] },
    ]);
    expect(outcome.warnings).toEqual({ "shaped-from": 1 });
    expect(Object.hasOwn(outcome.warnings, "unknown-type")).toBe(false);
    expect(outcome.firstPaint).toEqual(PASSIVE);
  });
});
