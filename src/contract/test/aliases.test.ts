import { describe, expect, it } from "vitest";
import { parseRenderInput } from "../src/index";

function parsed(raw: unknown) {
  const result = parseRenderInput(raw);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

describe("QDIC shapes and aliases", () => {
  it("S3 parses GraphQL nodes and edges inside a neighborhood wrapper", () => {
    const neighborhood = {
      nodes: [
        {
          globalId: "tbl-customer",
          nodeType: "table",
          physicalName: "CUSTOMER",
          logicalName: "Customer",
          isWritable: false,
          attributes: { service_name: "snowflake" },
        },
        {
          globalId: "node-2c9b",
          nodeType: "steward",
          physicalName: "Jane Doe",
          isWritable: true,
          attributes: { email: "jane.doe@example.com" },
        },
      ],
      edges: [
        {
          subjectNodeId: "tbl-customer",
          predicate: "hasSteward",
          objectNodeId: "node-2c9b",
          isActive: true,
          valid_from: "2026-09-01",
          valid_to: "2027-09-01",
        },
      ],
    };
    const { data, issues } = parsed({ neighborhood });
    expect(issues).toEqual([]);
    expect(data.neighborhood).toEqual(neighborhood);
  });

  it("S4 parses source/target edges under the key links", () => {
    const links = [
      { source: "a", target: "b", predicate: "dependsOn" },
      { source: "b", target: "c", predicate: "dependsOn" },
    ];
    const { data, issues } = parsed({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      links,
    });
    expect(issues).toEqual([]);
    expect(data.links).toEqual(links);
  });

  it("S24 keeps every vocabulary row and edge constraint", () => {
    const vocabulary = {
      nodeTypes: [
        {
          name: "steward",
          description: "A person designated as accountable for a data asset.",
          category: "governance",
          inverse_predicate: null,
          is_system: false,
          is_active: true,
        },
      ],
      predicates: [
        {
          name: "hasSteward",
          description: "The person accountable for this asset.",
          category: "governance",
          inverse_predicate: null,
          is_system: false,
          is_active: true,
        },
        {
          name: "contains",
          description: "Structure",
          category: "structure",
          inverse_predicate: "partOf",
          is_system: true,
          is_active: true,
        },
      ],
      edgeConstraints: [
        {
          predicate: "hasSteward",
          subject_node_type: "table",
          object_node_type: "steward",
        },
      ],
    };
    const { data, issues } = parsed({ nodes: [{ id: "a" }], vocabulary });
    expect(issues).toEqual([]);
    expect(data.vocabulary).toEqual(vocabulary);
  });
});
