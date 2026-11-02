import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";

type Raw = Record<string, unknown>;

const NOW = { now: "2026-10-14" };

function okOf(result: Normalized) {
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const run = (input: unknown) => okOf(normalize(input, NOW));

const violations = (result: ReturnType<typeof run>) =>
  result.issues.filter((issue) => issue.code === "constraint-violation");

describe("S12 supplied constraints and profile pairings", () => {
  it("reports only the user → classification edge", () => {
    const input = loadFixture("q-spec-scenarios").input as Raw;
    const vocabulary = input.vocabulary as { edgeConstraints: Raw[] };
    const edges = [
      {
        subjectNodeId: "usr-1",
        predicate: "classifiedAs",
        objectNodeId: "node-8f3a",
      },
      {
        subjectNodeId: "usr-1",
        predicate: "relatedTo",
        objectNodeId: "node-t1",
      },
      { subjectNodeId: "usr-1", predicate: "x", objectNodeId: "node-t1" },
    ];
    const result = run({
      ...input,
      nodes: [
        ...(input.nodes as Raw[]),
        { globalId: "usr-1", nodeType: "user", physicalName: "U1" },
        { globalId: "node-t1", nodeType: "tag", physicalName: "T1" },
      ],
      edges: [...(input.edges as Raw[]), ...edges],
      vocabulary: {
        ...vocabulary,
        edgeConstraints: [
          ...vocabulary.edgeConstraints,
          { predicate: "x", subject_node_type: "any", object_node_type: "tag" },
        ],
      },
    });
    const found = violations(result);
    expect(found).toHaveLength(1);
    const edgeCount = (input.edges as Raw[]).length;
    expect(found[0].path).toEqual(["edges", edgeCount]);
    expect(result.counts.edgeRecords).toBe(edgeCount + 3);
  });

  it("gives none for q-full-vocabulary", () => {
    expect(violations(run(loadFixture("q-full-vocabulary").input))).toEqual([]);
  });
});

describe("S46 a proposed pairing is not a violation", () => {
  const types = {
    tag: { label: "Tag", rank: 0 },
    keyword: { label: "Keyword", rank: 0 },
  };
  const nodes = [
    { id: "g1", type: "tag" },
    { id: "g2", type: "tag" },
    { id: "k1", type: "keyword" },
    { id: "k2", type: "keyword" },
  ];

  it("accepts broader keyword → keyword", () => {
    const result = run({
      types,
      nodes,
      edges: [{ subject: "k1", predicate: "broader", object: "k2" }],
    });
    expect(violations(result)).toEqual([]);
    expect(result.graph.triples).toHaveLength(1);
  });

  it("reports broader tag → keyword and keeps the edge", () => {
    const result = run({
      types,
      nodes,
      edges: [
        { subject: "k1", predicate: "broader", object: "k2" },
        { subject: "g1", predicate: "broader", object: "k1" },
      ],
    });
    expect(violations(result)).toEqual([
      { code: "constraint-violation", path: ["edges", 1] },
    ]);
    expect(result.graph.triples).toHaveLength(2);
  });
});

describe("D88 (4) shaped edges between shaped records", () => {
  const tree = { kind: "tree", children: "children", label: "name" };

  it("checks no shaped tree edge and still checks a model edge of the same types", () => {
    const result = run({
      nodes: [
        { name: "r", children: [{ name: "c", children: [{ name: "d" }] }] },
      ],
      shape: tree,
      neighborhood: {
        nodes: [
          { id: "m1", type: "row" },
          { id: "m2", type: "row" },
        ],
        edges: [{ subject: "m1", predicate: "contains", object: "m2" }],
      },
    });
    expect(result.graph.records.filter((r) => r.type === "row")).toHaveLength(
      5,
    );
    expect(violations(result)).toEqual([
      { code: "constraint-violation", path: ["neighborhood", "edges", 0] },
    ]);
  });

  it("gives none for a raw tree of row records", () => {
    const result = run({ name: "r", children: [{ name: "c" }, { name: "e" }] });
    expect(result.graph.triples).toHaveLength(2);
    expect(violations(result)).toEqual([]);
  });

  it("still checks a model edge sent between two shaped records", () => {
    const result = run({
      nodes: [{ name: "r", children: [{ name: "c" }] }],
      shape: tree,
      edges: [{ subject: "0.0", predicate: "contains", object: "0" }],
    });
    expect(violations(result)).toEqual([
      { code: "constraint-violation", path: ["edges", 0] },
    ]);
  });
});
