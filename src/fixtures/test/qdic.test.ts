import { profile } from "#contract";
import { describe, expect, it } from "vitest";
import { loadFixture } from "..";
import { edgesOf, isRecord, nodeId, nodesOf, skipCounts } from "./payload";

function typesOf(input: unknown): Map<string, string> {
  return new Map(
    nodesOf(input).map((node) => [String(nodeId(node)), String(node.nodeType)]),
  );
}

describe("S8 q-full-vocabulary covers the whole profile", () => {
  const { input } = loadFixture("q-full-vocabulary");
  const types = typesOf(input);
  const edges = edgesOf(input);
  const predicates = new Set(edges.map((edge) => String(edge.predicate)));

  it("has an edge for each node and no skipped record", () => {
    expect(skipCounts(input)).toEqual({
      "no-id": 0,
      "duplicate-id": 0,
      "dangling-edge": 0,
    });
  });

  it("uses every node type of the profile", () => {
    const used = new Set(types.values());
    expect(Object.keys(profile.nodeTypes).filter((t) => !used.has(t))).toEqual(
      [],
    );
    expect([...used].filter((t) => !(t in profile.nodeTypes))).toEqual([]);
  });

  it("uses every canonical predicate and every inverse name", () => {
    expect(
      Object.keys(profile.predicates).filter((p) => !predicates.has(p)),
    ).toEqual([]);
    expect(
      Object.keys(profile.inverses).filter((p) => !predicates.has(p)),
    ).toEqual([]);
  });

  it("uses every pairing with matching node types", () => {
    const missing = profile.pairings.filter(
      (pairing) =>
        !edges.some((edge) => {
          const subject = types.get(String(edge.subjectNodeId));
          const object = types.get(String(edge.objectNodeId));
          return (
            edge.predicate === pairing.predicate &&
            (pairing.subject === "any" || pairing.subject === subject) &&
            (pairing.object === "any" || pairing.object === object)
          );
        }),
    );
    expect(missing).toEqual([]);
  });

  it("carries the edge attributes of the profile", () => {
    const permissioned = edges.find((e) => e.predicate === "permissionedTo");
    const enriched = edges.find((e) => e.predicate === "enrichedWith");
    expect(
      isRecord(permissioned?.attrs) && permissioned.attrs.permissions,
    ).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(isRecord(enriched?.attrs) && isRecord(enriched.attrs.values)).toBe(
      true,
    );
    expect(edges.some((e) => typeof e.valid_from === "string")).toBe(true);
    expect(edges.some((e) => typeof e.valid_to === "string")).toBe(true);
    expect(edges.filter((e) => e.isActive === false)).toHaveLength(1);
    expect(edges.filter((e) => e.isActive === true).length).toBeGreaterThan(0);
  });

  it("uses GraphQL names only", () => {
    for (const node of nodesOf(input)) {
      expect(Object.keys(node)).not.toEqual(
        expect.arrayContaining(["id", "type"]),
      );
    }
    for (const edge of edges) {
      expect(edge).not.toHaveProperty("source");
      expect(edge).not.toHaveProperty("target");
    }
  });
});

describe("S9 q-spec-scenarios follows the two spec scenarios", () => {
  const { input } = loadFixture("q-spec-scenarios");
  const types = typesOf(input);
  const graph = input as {
    vocabulary: Record<string, Record<string, unknown>[]>;
  };
  const named = (name: string) =>
    nodesOf(input).find((node) => node.physicalName === name);

  it("classifies CUSTOMER_EMAIL as PII (scenario A)", () => {
    const pii = named("PII");
    expect(pii?.nodeType).toBe("classification");
    expect(pii?.isWritable).toBe(true);
    expect(edgesOf(input)).toContainEqual(
      expect.objectContaining({
        subjectNodeId: "clmn-customer-email",
        predicate: "classifiedAs",
        objectNodeId: pii?.globalId,
      }),
    );
    expect(types.get("clmn-customer-email")).toBe("column");
  });

  it("gives CUSTOMER a steward, Jane Doe (scenario B)", () => {
    const jane = named("Jane Doe");
    expect(jane?.nodeType).toBe("steward");
    expect(jane?.isWritable).toBe(true);
    expect(edgesOf(input)).toContainEqual(
      expect.objectContaining({
        subjectNodeId: "tbl-customer",
        predicate: "hasSteward",
        objectNodeId: jane?.globalId,
      }),
    );
  });

  it("supplies the custom steward type, the governance predicate and the constraint", () => {
    expect(graph.vocabulary.nodeTypes).toContainEqual(
      expect.objectContaining({ name: "steward", is_system: false }),
    );
    expect(graph.vocabulary.predicates).toContainEqual(
      expect.objectContaining({ name: "hasSteward", category: "governance" }),
    );
    expect(graph.vocabulary.edgeConstraints).toContainEqual({
      predicate: "classifiedAs",
      subject_node_type: "column",
      object_node_type: "classification",
    });
  });

  it("uses GraphQL field names only", () => {
    for (const node of nodesOf(input)) {
      for (const key of ["id", "type", "label", "attrs"])
        expect(node).not.toHaveProperty(key);
      expect(node).toHaveProperty("globalId");
      expect(node).toHaveProperty("nodeType");
      expect(node).toHaveProperty("physicalName");
      expect(node).toHaveProperty("isWritable");
    }
    for (const edge of edgesOf(input)) {
      for (const key of ["source", "target", "subject", "object"])
        expect(edge).not.toHaveProperty(key);
      expect(edge).toHaveProperty("subjectNodeId");
      expect(edge).toHaveProperty("objectNodeId");
    }
  });
});
