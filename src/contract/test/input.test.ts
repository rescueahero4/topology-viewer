import { describe, expect, it, vi } from "vitest";
import { checkSize, parseRenderInput, renderInputSchema } from "../index";

function parsed(raw: unknown) {
  const result = parseRenderInput(raw);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const SA_WARNING_CODES = [
  "no-id",
  "duplicate-id",
  "dangling-edge",
  "unknown-type",
  "constraint-violation",
  "glyph-rejected",
  "color-rejected",
  "rank-rejected",
  "layout-rejected",
  "budget-rejected",
  "schema-version-unknown",
  "inferred-rejected",
  "unknown-key",
  "root-not-found",
  "reveal-not-found",
  "shaped-from",
  "field-rejected",
];

const canonical = {
  schemaVersion: "1",
  nodes: [
    {
      id: "tbl-customer",
      type: "table",
      label: "CUSTOMER",
      attrs: { service_name: "snowflake" },
      _inferred: { description: "summarised from the DDL comment" },
    },
  ],
  edges: [
    {
      subject: "tbl-customer",
      predicate: "ownedBy",
      object: "usr-jane",
      attrs: {},
    },
  ],
  types: {
    steward: {
      label: "Steward",
      rank: 0,
      shape: "circle",
      color: "#2f6f8f",
      abbr: "ST",
      glyph: "M3 12h18",
    },
  },
  fields: {
    steward_email: {
      label: "Steward email",
      why: "column name in the source sheet",
    },
    comment_on_ddl: { slot: "ddl_comment" },
  },
  vocabulary: {
    nodeTypes: [
      {
        name: "steward",
        description: "A data steward",
        is_system: false,
        is_active: true,
      },
    ],
    predicates: [
      {
        name: "hasSteward",
        category: "governance",
        description: "The accountable person",
        inverse_predicate: null,
        is_system: false,
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
  },
  predicates: {
    hasSteward: { label: "Has steward", category: "governance", role: null },
  },
  view: {
    approach: "active",
    root: "tbl-customer",
    reveal: ["usr-jane", "ug-finance"],
    layout: "force",
    budget: 20,
  },
  shape: null,
};

describe("render input", () => {
  it("S1 parses the canonical payload of SA §4.1 with no issue", () => {
    const { data, issues } = parsed(canonical);
    expect(data.nodes).toHaveLength(1);
    expect(data.edges).toHaveLength(1);
    expect(issues).toEqual([]);
    expect(data).toEqual(canonical);
  });

  it("S2 parses the compact and the canonical form; EPIC-002 normalize must map both to one graph (SA §6)", () => {
    const compact = {
      defaults: { type: "table" },
      nodes: [
        ["tbl-customer", "table", "CUSTOMER", { service_name: "snowflake" }],
        ["usr-jane"],
      ],
      edges: [["tbl-customer", "ownedBy", "usr-jane"]],
    };
    const canonicalForm = {
      nodes: [
        {
          id: "tbl-customer",
          type: "table",
          label: "CUSTOMER",
          attrs: { service_name: "snowflake" },
        },
        { id: "usr-jane" },
      ],
      edges: [
        { subject: "tbl-customer", predicate: "ownedBy", object: "usr-jane" },
      ],
    };
    for (const raw of [compact, canonicalForm]) {
      const { data, issues } = parsed(raw);
      expect(data.nodes).toHaveLength(2);
      expect(data.edges).toHaveLength(1);
      expect(issues).toEqual([]);
    }
    expect(parsed(compact).data).toEqual({ schemaVersion: "1", ...compact });
  });

  it("S5 keeps and reports an unknown top-level key and moves an unknown node key into attrs", () => {
    const { data, issues } = parsed({
      title: "Customer access",
      nodes: [{ id: "a", rto_hours: 4, attrs: { tier: "gold" } }],
    });
    expect(issues).toEqual([{ code: "unknown-key", path: ["title"] }]);
    expect(data).toHaveProperty("title", "Customer access");
    expect(data.nodes?.[0]).toEqual({
      id: "a",
      attrs: { rto_hours: 4, tier: "gold" },
    });
  });

  it("S16 accepts two nodes with the same id", () => {
    const { data, issues } = parsed({ nodes: [{ id: "t1" }, { id: "t1" }] });
    expect(data.nodes).toHaveLength(2);
    expect(issues).toEqual([]);
  });

  it("S17 accepts a rows hint with flat nodes that have no id", () => {
    const shape = { kind: "rows", subject: "from", object: "to" };
    const { data, issues } = parsed({
      shape,
      nodes: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });
    expect(issues).toEqual([]);
    expect(data.shape).toEqual(shape);
    expect(data.nodes).toEqual([
      { attrs: { from: "a", to: "b" } },
      { attrs: { from: "b", to: "c" } },
    ]);
  });

  it("S18 stops a raw tree payload whose hint has no label with not-a-graph", () => {
    const result = parseRenderInput({
      name: "root",
      items: [{ name: "child", items: [] }],
      shape: { kind: "tree", children: "items" },
    });
    expect(result).toEqual({
      ok: false,
      fatal: { code: "not-a-graph", path: ["shape", "label"] },
    });
  });

  it("S19 gives the structural fatal codes", () => {
    expect(parseRenderInput({ nodes: "oops" })).toEqual({
      ok: false,
      fatal: { code: "nodes-not-array", path: ["nodes"] },
    });
    expect(parseRenderInput([{ id: "a" }])).toEqual({
      ok: false,
      fatal: { code: "not-object", path: [] },
    });
    expect(parseRenderInput({ nodes: [], edges: {} })).toEqual({
      ok: false,
      fatal: { code: "edges-not-array", path: ["edges"] },
    });
  });

  it("S21 keeps a node without id and an edge to a missing node, with no issue", () => {
    const nodes = [{ id: "a" }, { type: "table", label: "no id" }];
    const edges = [{ subject: "a", predicate: "contains", object: "missing" }];
    const { data, issues } = parsed({ nodes, edges });
    expect(data.nodes).toEqual(nodes);
    expect(data.edges).toEqual(edges);
    expect(issues).toEqual([]);
  });

  it("S22 keeps a valid _inferred record and drops a bad one with inferred-rejected", () => {
    const good = parsed({
      nodes: [{ id: "a", _inferred: { display_name: "Named from the table" } }],
    });
    expect(good.data.nodes?.[0]).toEqual({
      id: "a",
      _inferred: { display_name: "Named from the table" },
    });
    expect(good.issues).toEqual([]);
    const bad = parsed({ nodes: [{ id: "a", _inferred: "yes" }] });
    expect(bad.data.nodes?.[0]).toEqual({ id: "a" });
    expect(bad.issues).toEqual([
      { code: "inferred-rejected", path: ["nodes", 0, "_inferred"] },
    ]);
    expect(JSON.stringify(bad.data)).not.toContain("yes");
  });

  it("S23 keeps every fields entry, also one with an unknown slot", () => {
    const fields = {
      rto_hours: { label: "RTO", why: "contract" },
      steward_email: { slot: "owners" },
      x: { slot: "no-such-slot" },
    };
    const { data, issues } = parsed({ nodes: [{ id: "a" }], fields });
    expect(data.fields).toEqual(fields);
    expect(issues).toEqual([]);
  });

  it("S25 reads an absent or unknown schemaVersion as 1", () => {
    for (const raw of [{ nodes: [] }, { schemaVersion: "1", nodes: [] }]) {
      const { data, issues } = parsed(raw);
      expect(data.schemaVersion).toBe("1");
      expect(issues).toEqual([]);
    }
    const unknown = parsed({ schemaVersion: "2", nodes: [] });
    expect(unknown.data.schemaVersion).toBe("1");
    expect(unknown.issues).toEqual([
      { code: "schema-version-unknown", path: ["schemaVersion"] },
    ]);
    expect(JSON.stringify(unknown.data)).not.toContain('"2"');
  });

  it("S29 gives no stack trace for a tree of 10,000 levels", () => {
    const levels = 10_000;
    const open = '{"name":"n","items":[';
    const text =
      '{"shape":{"kind":"tree","children":"items","label":"name"},"name":"n","items":[' +
      open.repeat(levels - 1) +
      "]}".repeat(levels);
    const tooLarge = checkSize(text);
    if (tooLarge) {
      expect(tooLarge.code).toBe("too-large");
    } else {
      const raw: unknown = JSON.parse(text);
      const result = parseRenderInput(raw);
      if (!result.ok) expect(result.fatal.code).toBe("not-a-graph");
    }
    vi.spyOn(renderInputSchema, "parse").mockImplementationOnce(() => {
      throw new RangeError("Maximum call stack size exceeded");
    });
    expect(parseRenderInput({ nodes: [{ id: "a" }] })).toEqual({
      ok: false,
      fatal: { code: "not-a-graph", path: [] },
    });
  });

  it("S32 accepts a valid tree raw form and keeps its payload", () => {
    const raw = {
      name: "root",
      items: [{ name: "child", items: [{ name: "grandchild", items: [] }] }],
      shape: { kind: "tree", children: "items", label: "name" },
    };
    const { data, issues } = parsed(raw);
    expect(issues).toEqual([]);
    expect(data).toEqual({ schemaVersion: "1", ...raw });
  });

  it("S33 drops a bad hint on a payload whose nodes have ids, with one warning", () => {
    const result = parsed({
      nodes: [
        { id: "a", type: "table" },
        { id: "b", type: "table" },
      ],
      edges: [{ subject: "a", predicate: "contains", object: "b" }],
      shape: { kind: "tree", children: "sub_items" },
    });
    expect(result.data.nodes).toHaveLength(2);
    expect(result.data.edges).toHaveLength(1);
    expect(result.data).not.toHaveProperty("shape");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].path[0]).toBe("shape");
    expect(SA_WARNING_CODES).toContain(result.issues[0].code);
    expect(result.issues[0].code).toBe("layout-rejected");
    expect(JSON.stringify(result)).not.toContain("sub_items");
  });
});
