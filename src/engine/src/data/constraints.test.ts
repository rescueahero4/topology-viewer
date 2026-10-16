import { loadFixture } from "@qdic-topology/fixtures";
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
