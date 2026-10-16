import { profile, type Profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Graph } from "../data/normalize";
import { canvasColor, type Hex } from "./colors";
import { entityType, resolveVocab } from "./resolve";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function resolved(input: unknown, source: Profile = profile) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return resolveVocab(result.graph, result.payload, source, LIGHT);
}

const copy = (): Profile => structuredClone(profile);
const unknown = (issues: { code: string }[]) =>
  issues.filter((issue) => issue.code === "unknown-type").length;

describe("S18 lost from the profile flag", () => {
  // why: equal attributes are part of the merge key, so a merged entity whose records differ is
  // built by hand (no call of `normalize`)
  const record = (id: string, attrs: Record<string, unknown>) => ({
    id,
    type: "table",
    label: "T",
    attrs,
    idSource: "id" as const,
    inferred: {},
    position: 0,
  });
  const graph: Graph = {
    records: [
      record("t1", {}),
      record("t2", { is_lost: true }),
      record("t3", {}),
    ],
    entities: [
      { id: "t1", type: "table", label: "T", records: ["t1", "t2"] },
      { id: "t3", type: "table", label: "T", records: ["t3"] },
    ],
    triples: [],
    shapedSet: { records: [], triples: [] },
  };

  it("(a) marks the entity of a record with the flagged key", () => {
    const { vocab } = resolveVocab(graph, {}, profile, LIGHT);
    expect(vocab.entities.get("t1")?.lost).toBe(true);
    expect(vocab.entities.get("t3")?.lost).toBe(false);
  });

  it("(b) marks nothing with a test profile with no lost flag", () => {
    const test = copy();
    for (const set of Object.values(test.attributeSets))
      for (const attribute of set) delete attribute.lost;
    const { vocab } = resolveVocab(graph, {}, test, LIGHT);
    expect(vocab.entities.get("t1")?.lost).toBe(false);
  });

  it("reads only the own value true", () => {
    const { vocab } = resolved({
      nodes: [
        { id: "x1", type: "table", attrs: { is_lost: "true" } },
        { id: "x2", type: "table", attrs: { is_lost: 1 } },
      ],
    });
    expect(vocab.entities.get("x1")?.lost).toBe(false);
    expect(vocab.entities.get("x2")?.lost).toBe(false);
  });
});

describe("S34 asset_type pairs from the profile", () => {
  const input = {
    nodes: [
      { globalId: "schm-1", attrs: { asset_type: "database" } },
      { globalId: "schm-2", attrs: { asset_type: "schema" } },
      { globalId: "schm-3" },
      { globalId: "tbl-3", attrs: { asset_type: "view" } },
      { globalId: "clmn-3", attrs: { asset_type: "view" } },
      { id: "n1", attrs: { asset_type: "database" } },
    ],
  };
  const ids = ["schm-1", "schm-2", "schm-3", "tbl-3", "clmn-3", "n1"];

  it("resolves each pair and keeps a prefix outside the pair", () => {
    const { vocab, issues } = resolved(input);
    expect(ids.map((id) => entityType(vocab, id))).toEqual([
      "database",
      "schema",
      "schema",
      "view",
      "column",
      "database",
    ]);
    expect(
      ids.every((id) => vocab.entities.get(id)?.provenance === "inferred"),
    ).toBe(true);
    expect(unknown(issues)).toBe(0);
  });

  it("reads the pairs from a test profile", () => {
    const test = copy();
    test.attributeSets.asset[0].resolves = [["view", "table"]];
    const { vocab, issues } = resolved(input, test);
    expect(entityType(vocab, "schm-1")).toBe("schema");
    expect(entityType(vocab, "n1")).toBeNull();
    expect(unknown(issues)).toBe(1);
  });
});

describe("S42 writable", () => {
  it("reads isWritable, else a writable profile prefix", () => {
    const { input } = loadFixture("q-spec-scenarios");
    const data = structuredClone(input) as { nodes: object[] };
    data.nodes.push({ globalId: "node-9" }, { id: "x1", type: "table" });
    const { vocab } = resolved(data);
    const writable = (id: string) => vocab.entities.get(id)?.writable;
    expect(writable("tbl-customer")).toBe(false);
    expect(writable("clmn-customer-email")).toBe(false);
    expect(writable("node-8f3a")).toBe(true);
    expect(writable("node-2c9b")).toBe(true);
    expect(writable("node-9")).toBe(true);
    expect(Object.hasOwn(vocab.entities.get("x1") ?? {}, "writable")).toBe(
      false,
    );
  });
});

describe("mixed forms", () => {
  it("keeps a record type before a prefix and an asset_type", () => {
    const { vocab } = resolved({
      nodes: [
        {
          globalId: "tbl-1",
          nodeType: "column",
          attrs: { asset_type: "view" },
        },
        { id: "tbl-2", type: "gizmo", attrs: { asset_type: "view" } },
      ],
    });
    expect(vocab.entities.get("tbl-1")).toMatchObject({
      type: "column",
      provenance: "system",
    });
    expect(vocab.entities.get("tbl-2")).toMatchObject({
      type: "gizmo",
      provenance: "custom",
    });
  });

  it("uses payload level and role only when the profile has none", () => {
    const { vocab } = resolved({
      nodes: [
        { id: "a", type: "table" },
        { id: "b", type: "box" },
      ],
      types: {
        table: { level: 9, role: "curation" },
        box: { level: 2, role: "attribute" },
      },
    });
    expect(vocab.types.get("table")).toMatchObject({
      level: 3,
      treeRole: "structure",
    });
    expect(vocab.types.get("box")).toMatchObject({
      level: 2,
      treeRole: "attribute",
    });
  });

  it("counts entities and provenance for the summary", () => {
    const { vocab } = resolved(loadFixture("q-spec-scenarios").input);
    expect(vocab.types.get("table")?.count).toBe(1);
    expect(vocab.provenance).toEqual({ system: 2, custom: 2, inferred: 0 });
  });

  it("reads a payload role null as absent and never a row role", () => {
    const { vocab } = resolved({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { subject: "a", predicate: "contains", object: "b" },
        { subject: "a", predicate: "p9", object: "b" },
      ],
      predicates: { contains: { role: null } },
      vocabulary: {
        predicates: [
          { name: "p9", role: "containment", layoutRole: "lineage" },
        ],
      },
    });
    expect(vocab.predicates.get("contains")?.role).toBe("containment");
    expect(vocab.predicates.get("p9")).not.toHaveProperty("role");
    expect(vocab.predicates.get("p9")).not.toHaveProperty("layoutRole");
  });
});

describe("D88 (2) a supplied row is_system wins over the profile", () => {
  it("gives custom for a row is_system false on a system type and predicate", () => {
    const { vocab } = resolved({
      nodes: [
        { id: "t", type: "table" },
        { id: "u", type: "user" },
        { id: "x", type: "x_type" },
      ],
      edges: [
        ["t", "ownedBy", "u"],
        ["t", "contains", "x"],
        ["t", "relatedTo", "x"],
      ],
      vocabulary: {
        nodeTypes: [
          { name: "table", is_system: false },
          { name: "x_type", is_system: true },
          { name: "user" },
        ],
        predicates: [
          { name: "ownedBy", is_system: false },
          { name: "relatedTo", is_system: true },
          { name: "contains" },
        ],
      },
    });
    expect(vocab.types.get("table")?.provenance).toBe("custom");
    expect(vocab.types.get("x_type")?.provenance).toBe("system");
    expect(vocab.types.get("user")?.provenance).toBe("system");
    expect(vocab.entities.get("t")?.provenance).toBe("custom");
    expect(vocab.predicates.get("ownedBy")?.provenance).toBe("custom");
    expect(vocab.predicates.get("relatedTo")?.provenance).toBe("system");
    expect(vocab.predicates.get("contains")?.provenance).toBe("system");
  });
});
