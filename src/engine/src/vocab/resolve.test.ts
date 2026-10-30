import { profile, type Profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Graph, type Payload } from "../data/normalize";
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
const names = (map: Map<string, { provenance: string }>, value: string) =>
  [...map.values()]
    .filter((entry) => entry.provenance === value)
    .map((entry) => (entry as { name?: string }).name);

describe("S1 q-full-vocabulary with the delivered profile", () => {
  const { vocab } = resolved(loadFixture("q-full-vocabulary").input);
  const types = vocab.types;

  it("resolves 26 types: 18 system and 8 custom", () => {
    expect(types.size).toBe(26);
    expect(names(types, "system")).toHaveLength(18);
    expect(names(types, "custom").sort()).toEqual([
      "bk",
      "classification",
      "domain",
      "external_system",
      "keyword",
      "metric",
      "model",
      "policy",
    ]);
  });

  it("resolves 22 predicates: 13 system and 9 custom", () => {
    expect(vocab.predicates.size).toBe(22);
    expect(names(vocab.predicates, "system")).toHaveLength(13);
    expect(names(vocab.predicates, "custom").sort()).toEqual(
      [
        "representsConcept",
        "relatedTo",
        "synonymOf",
        "classifiedAs",
        "governedBy",
        "calculatedFrom",
        "sourcedFrom",
        "precededBy",
        "produces",
      ].sort(),
    );
  });

  it("gives the families in profile order", () => {
    expect(vocab.families.map((family) => family.key)).toEqual([
      "Structure",
      "Lineage",
      "Reference",
      "Annotation",
      "Ownership & Access",
      "Other",
    ]);
  });

  it("copies builtIn, role and layoutRole from the profile only", () => {
    const flagged = (map: Map<string, object>, key: string, value: unknown) =>
      [...map.entries()]
        .filter(
          ([, entry]) => (entry as Record<string, unknown>)[key] === value,
        )
        .map(([name]) => name)
        .sort();
    expect(flagged(types, "builtIn", true)).toEqual([
      "classification",
      "domain",
      "external_system",
      "metric",
      "model",
      "policy",
    ]);
    expect(flagged(vocab.predicates, "builtIn", true)).toEqual([
      "calculatedFrom",
      "classifiedAs",
      "governedBy",
      "relatedTo",
      "sourcedFrom",
      "synonymOf",
    ]);
    expect(flagged(vocab.predicates, "role", "containment")).toEqual([
      "contains",
    ]);
    const roles = [...vocab.predicates.values()].filter((p) =>
      Object.hasOwn(p, "role"),
    );
    expect(roles.map((p) => p.name)).toEqual(["contains"]);
    expect(flagged(vocab.predicates, "layoutRole", "structure")).toEqual([
      "broader",
      "contains",
    ]);
    expect(flagged(vocab.predicates, "layoutRole", "lineage")).toEqual([
      "definedBy",
      "dependsOn",
      "derivedFrom",
      "mapsTo",
    ]);
  });

  it("holds the profile level and treeRole of each type", () => {
    const levels = Object.fromEntries(
      [...types.values()]
        .filter((t) => t.level !== undefined)
        .map((t) => [t.name, t.level]),
    );
    expect(levels).toEqual({
      data_source: 0,
      database: 1,
      bigroup: 1,
      etl: 1,
      schema: 2,
      dashboard: 2,
      table: 3,
      view: 3,
      report: 3,
      column: 4,
    });
    const role = (value: string) =>
      [...types.values()]
        .filter((t) => t.treeRole === value)
        .map((t) => t.name);
    expect(role("structure").sort()).toEqual(Object.keys(levels).sort());
    expect(role("attribute").sort()).toEqual(["property", "property_set"]);
    expect(role("curation")).toHaveLength(14);
  });
});

describe("S2 q-spec-scenarios with two more vocabulary rows", () => {
  const { input } = loadFixture("q-spec-scenarios");
  const data = structuredClone(input) as {
    vocabulary: { nodeTypes: object[] };
  };
  data.vocabulary.nodeTypes.push(
    { name: "qa_check", is_system: true },
    { name: "old_tag", is_active: false, is_system: false },
  );
  const { vocab, issues } = resolved(data);

  it("resolves steward, the families and the row types", () => {
    expect(vocab.types.get("steward")?.provenance).toBe("custom");
    expect(vocab.predicates.get("hasSteward")?.family).toBe("governance");
    expect(vocab.predicates.get("classifiedAs")?.family).toBe("Annotation");
    expect(vocab.families).toEqual([
      { key: "Structure", count: 1 },
      { key: "Annotation", count: 1 },
      { key: "governance", count: 1 },
    ]);
    expect(vocab.types.get("qa_check")?.provenance).toBe("system");
    expect(vocab.types.get("old_tag")).toMatchObject({
      provenance: "custom",
      retired: true,
    });
    expect(vocab.types.get("steward")?.retired).toBe(false);
    expect(unknown(issues)).toBe(0);
  });
});

describe("S3 global-id prefixes and asset_type", () => {
  const { vocab, issues } = resolved({
    nodes: [
      { globalId: "tbl-1" },
      { globalId: "clmn-1" },
      { globalId: "schm-1" },
      { globalId: "usr-1" },
      { globalId: "node-9" },
      { id: "a1", attrs: { asset_type: "view" } },
      { id: "a2", attrs: { asset_type: "table" } },
      { id: "a3", attrs: {} },
    ],
  });
  const entity = (id: string) => vocab.entities.get(id);

  it("infers the type from the prefix, then from asset_type", () => {
    for (const [id, type] of [
      ["tbl-1", "table"],
      ["clmn-1", "column"],
      ["schm-1", "schema"],
      ["usr-1", "user"],
      ["a1", "view"],
      ["a2", "table"],
    ])
      expect(entity(id)).toMatchObject({ type, provenance: "inferred" });
    expect(entity("node-9")).toMatchObject({ type: null, writable: true });
    expect(entity("a3")?.type).toBeNull();
    expect(issues.filter((i) => i.code === "unknown-type")).toEqual([
      { code: "unknown-type", path: ["entities", "node-9"] },
      { code: "unknown-type", path: ["entities", "a3"] },
    ]);
  });
});

describe("S4 supplied beats system beats prefix", () => {
  it("keeps the supplied type and label and the profile provenance", () => {
    const { vocab } = resolved({
      nodes: [{ globalId: "tbl-7", nodeType: "view" }],
      types: { view: { label: "Vista" } },
    });
    expect(entityType(vocab, "tbl-7")).toBe("view");
    expect(vocab.types.get("view")).toMatchObject({
      label: "Vista",
      provenance: "system",
    });
    expect(vocab.entities.get("tbl-7")?.provenance).toBe("system");
  });
});

describe("S5 a shaped graph built by hand", () => {
  const triple = {
    key: JSON.stringify(["a", "relatedTo", "b"]),
    subject: "a",
    predicate: "relatedTo",
    object: "b",
    attrs: {},
    retired: false,
    inferred: { predicate: "shaped from from" },
    records: [0],
  };
  const record = (id: string, reason: string) => ({
    id,
    type: "row",
    label: id,
    attrs: {},
    idSource: "id" as const,
    inferred: { type: reason },
    position: 0,
  });
  const base = {
    records: [record("a", "shaped from from"), record("b", "shaped from to")],
    entities: [
      { id: "a", type: "row", label: "a", records: ["a"] },
      { id: "b", type: "row", label: "b", records: ["b"] },
    ],
    triples: [triple],
  };
  const payload: Payload = {};

  it("gives provenance inferred with the first reason and no unknown-type", () => {
    const graph: Graph = {
      ...base,
      shapedSet: { records: ["a", "b"], triples: [triple.key] },
    };
    const { vocab, issues } = resolveVocab(graph, payload, profile, LIGHT);
    expect(vocab.types.get("row")).toMatchObject({
      provenance: "inferred",
      reason: "shaped from from",
      visual: { rank: 0, shape: "circle", size: 20 },
    });
    expect(vocab.predicates.get("relatedTo")).toMatchObject({
      provenance: "inferred",
      reason: "shaped from from",
    });
    expect(unknown(issues)).toBe(0);
  });

  it("gives custom and 2 unknown-type with the empty set", () => {
    const graph: Graph = { ...base, shapedSet: { records: [], triples: [] } };
    const { vocab, issues } = resolveVocab(graph, payload, profile, LIGHT);
    expect(vocab.types.get("row")?.provenance).toBe("custom");
    expect(Object.hasOwn(vocab.types.get("row") ?? {}, "reason")).toBe(false);
    expect(vocab.predicates.get("relatedTo")?.provenance).toBe("custom");
    expect(unknown(issues)).toBe(2);
  });
});

describe("S6 families of supplied categories", () => {
  const nodes = [{ id: "a" }, { id: "b" }];
  const one = (predicate: string) => ({ subject: "a", predicate, object: "b" });
  const input = {
    nodes,
    edges: ["owns", "hasSteward", "audits", "flows", "misc", "derivedFrom"].map(
      one,
    ),
    predicates: {
      hasSteward: {
        category: "governance",
        inverse: "stewardOf",
        role: "containment",
      },
      audits: { category: "audit" },
      flows: { category: "LINEAGE" },
      misc: { category: "CUSTOM" },
    },
  };

  it("matches profile families by the D15 rule and keeps custom ones", () => {
    const { vocab } = resolved(input);
    const family = (name: string) => vocab.predicates.get(name)?.family;
    expect(vocab.predicates.get("owns")).toMatchObject({
      family: "Custom",
      provenance: "custom",
    });
    expect(vocab.predicates.get("hasSteward")).toMatchObject({
      family: "governance",
      inverse: "stewardOf",
      role: "containment",
    });
    expect([family("audits"), family("flows"), family("misc")]).toEqual([
      "audit",
      "Lineage",
      "Custom",
    ]);
    expect(vocab.families).toEqual([
      { key: "Lineage", count: 2 },
      { key: "audit", count: 1 },
      { key: "governance", count: 1 },
      { key: "Custom", count: 2 },
    ]);
    expect(vocab.predicates.get("derivedFrom")?.direction).toBe("in");
  });

  it("matches a decomposed accent after NFC against a test profile", () => {
    const test = copy();
    test.categoryOrder.push("Qualité");
    const { vocab } = resolved(
      {
        ...input,
        edges: [...input.edges, one("checks")],
        predicates: { ...input.predicates, checks: { category: "QUALITÉ" } },
      },
      test,
    );
    expect(vocab.predicates.get("checks")?.family).toBe("Qualité");
    expect(vocab.families.map((f) => f.key)).toEqual([
      "Lineage",
      "Qualité",
      "audit",
      "governance",
      "Custom",
    ]);
  });
});

describe("the preview marks of the profile types that the data does not use", () => {
  const { vocab } = resolved(loadFixture("q-full-vocabulary").input);
  const small = resolved({
    nodes: [{ id: "a", type: "table" }],
    edges: [],
  }).vocab;

  it("has no preview when the data uses every profile type", () => {
    expect(vocab.previews.size).toBe(0);
  });

  it("gives a profile icon or a shape with new letters to every other profile type", () => {
    const spare = Object.keys(profile.nodeTypes).filter((n) => n !== "table");
    expect([...small.previews.keys()]).toEqual(spare);
    const letters = new Set<string>();
    for (const [name, visual] of small.previews) {
      if (profile.nodeTypes[name].icon !== undefined)
        expect(visual).toEqual({ icon: profile.nodeTypes[name].icon });
      else if ("letters" in visual && visual.letters !== undefined) {
        expect(letters.has(visual.letters), name).toBe(false);
        letters.add(visual.letters);
      } else throw new Error(`no letters for ${name}`);
    }
  });
});
