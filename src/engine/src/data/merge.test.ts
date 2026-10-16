import { generate, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { merge, type EdgeRecord } from "./merge";
import { normalize, type Normalized } from "./normalize";

type Raw = Record<string, unknown>;
type Edge = { subject: string; predicate: string; object: string };

const NOW = { now: "2026-10-14" };

function okOf(result: Normalized) {
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const run = (input: unknown) => okOf(normalize(input, NOW));

function passesOf(input: { nodes: Raw[]; edges: Edge[] }): number {
  const records = run(input).graph.records;
  const edges: EdgeRecord[] = input.edges.map((edge, id) => ({
    id,
    ...edge,
    attrs: {},
    retired: false,
  }));
  return merge(records, edges, undefined).passes;
}

const labelsOf = (result: ReturnType<typeof run>, type: string) =>
  result.graph.entities.filter((entity) => entity.type === type);

describe("S14 record fields and attributes in the key", () => {
  it("merges records that differ only in record fields", () => {
    const hana = (id: string, created: string, by: string) => ({
      id,
      type: "user",
      label: "Hana Costa",
      attrs: { team: "data", created_at: created, updated_by: by },
    });
    const result = run({
      nodes: [
        hana("u1", "2026-01-01", "a"),
        hana("u2", "2026-02-01", "b"),
        hana("u3", "2026-03-01", "c"),
        {
          id: "u4",
          type: "user",
          label: "John Smith",
          attrs: { email: "j1@x.example" },
        },
        {
          id: "u5",
          type: "user",
          label: "John Smith",
          attrs: { email: "j2@x.example" },
        },
      ],
    });
    expect(result.graph.entities.map((e) => e.records)).toEqual([
      ["u1", "u2", "u3"],
      ["u4"],
      ["u5"],
    ]);
    expect(result.counts.merged).toBe(2);
  });
});

describe("S15 containment keeps namesakes apart", () => {
  const tables = [
    { id: "ta", type: "table", label: "A" },
    { id: "tb", type: "table", label: "B" },
  ];
  const columns = [
    { id: "c1", type: "column", label: "ID" },
    { id: "c2", type: "column", label: "ID" },
  ];
  const nodes = [...tables, ...columns];
  const down = (predicate: string) => [
    { subject: "ta", predicate, object: "c1" },
    { subject: "tb", predicate, object: "c2" },
  ];
  const columnEntities = (input: Raw) => labelsOf(run(input), "column").length;

  it("by contains", () => {
    expect(columnEntities({ nodes, edges: down("contains") })).toBe(2);
  });

  it("by partOf, which folds onto contains first", () => {
    const edges = [
      { subject: "c1", predicate: "partOf", object: "ta" },
      { subject: "c2", predicate: "partOf", object: "tb" },
    ];
    expect(columnEntities({ nodes, edges })).toBe(2);
  });

  it("by a payload predicate with role containment", () => {
    const predicates = { hasColumn: { role: "containment" } };
    expect(
      columnEntities({ nodes, edges: down("hasColumn"), predicates }),
    ).toBe(2);
  });

  it("not by an undeclared predicate", () => {
    expect(columnEntities({ nodes, edges: down("hasColumn") })).toBe(1);
  });

  it("not across two different globalId values", () => {
    const qdic = [
      { globalId: "clmn-1", nodeType: "column", physicalName: "ID" },
      { globalId: "clmn-2", nodeType: "column", physicalName: "ID" },
    ];
    expect(columnEntities({ nodes: qdic })).toBe(2);
  });
});

describe("S16 the pass cap", () => {
  it("merges a repeated table and its columns in 2 passes", () => {
    const nodes = ["ta", "tb"].flatMap((table) => [
      { id: table, type: "table", label: "T" },
      ...[1, 2, 3].map((k) => ({
        id: `${table}${k}`,
        type: "column",
        label: `C${k}`,
      })),
    ]);
    const edges = ["ta", "tb"].flatMap((table) =>
      [1, 2, 3].map((k) => ({
        subject: table,
        predicate: "contains",
        object: `${table}${k}`,
      })),
    );
    const result = run({ nodes, edges });
    expect(labelsOf(result, "table")).toHaveLength(1);
    expect(labelsOf(result, "column")).toHaveLength(3);
    expect(passesOf({ nodes, edges })).toBe(2);
  });

  it("stops a 6-level chain after 4 passes", () => {
    const nodes = ["a", "b"].flatMap((copy) =>
      [1, 2, 3, 4, 5, 6].map((level) => ({
        id: `${copy}${level}`,
        type: "t0",
        label: `L${level}`,
      })),
    );
    const edges = ["a", "b"].flatMap((copy) =>
      [1, 2, 3, 4, 5].map((level) => ({
        subject: `${copy}${level}`,
        predicate: "contains",
        object: `${copy}${level + 1}`,
      })),
    );
    const result = run({ nodes, edges });
    const count = (label: string) =>
      result.graph.entities.filter((e) => e.label === label).length;
    expect(["L1", "L2", "L3", "L4"].map(count)).toEqual([1, 1, 1, 1]);
    expect(["L5", "L6"].map(count)).toEqual([2, 2]);
    expect(passesOf({ nodes, edges })).toBe(4);
  });
});

describe("S17 the key is stable JSON of a structure", () => {
  it("never merges a joined-string look-alike", () => {
    const node = (id: string, attrs: Raw) => ({
      id,
      type: "t0",
      label: "L",
      attrs,
    });
    const result = run({
      nodes: [
        node("n0", { a: "x\u0001y" }),
        node("n1", { a: "x", "\u0001y": "" }),
        node("n2", { a: '{"b":1}' }),
        node("n3", { a: { b: 1 } }),
      ],
    });
    expect(result.graph.entities).toHaveLength(4);
  });
});

describe("S31 the merge at the caps", () => {
  it("normalizes 2,000 nodes with 50 deep attrs and 4,000 edges", () => {
    let value: unknown = "v".repeat(1024);
    for (let level = 0; level < 4; level++) value = { v: value };
    const attrs = Object.fromEntries(
      Array.from({ length: 50 }, (_, k) => [`k${k}`, value]),
    );
    const graph = generate.random(2000, 4000, 42);
    const nodes = graph.nodes.map((node) => ({ ...node, attrs }));
    const result = run({ nodes, edges: graph.edges });
    expect(result.graph.entities).toHaveLength(2000);
    expect(passesOf({ nodes, edges: graph.edges })).toBeLessThanOrEqual(4);
  });
});

describe("S45 s-access", () => {
  const { input, expect: outcome } = loadFixture("s-access");

  it("gives 483 entities with the first record id as the entity id", () => {
    const result = run(input);
    expect(result.graph.entities).toHaveLength(483);
    expect(result.counts.merged).toBe(42);
    const u0 = result.graph.entities.find((e) => e.id === "u_0");
    expect(u0?.records).toEqual(["u_0", "u_20", "u_40", "u_60"]);
    const ids = new Set(result.graph.entities.map((e) => e.id));
    for (const id of ["u_20", "u_40", "u_60"]) expect(ids.has(id)).toBe(false);
    const dangling = result.warnings.find((w) => w.code === "dangling-edge");
    expect(dangling?.count).toBe(outcome.warnings["dangling-edge"]);
  });

  it("resolves the root u_40 to entity u_0 with no root-not-found", () => {
    const raw = input as Raw;
    const result = run({
      ...raw,
      view: { ...(raw.view as Raw), root: "u_40" },
    });
    expect(result.issues.map((i) => i.code)).not.toContain("root-not-found");
    const entity = result.graph.entities.find((e) =>
      e.records.includes("u_40"),
    );
    expect(entity?.id).toBe("u_0");
  });
});
