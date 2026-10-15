import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadProfile, profile } from "../src/index";
import qdic from "../src/profile/qdic.json";

const root = new URL("../../../", import.meta.url);
const storyFile = new URL(
  "docs/epics/closed/EPIC-001-contract-profile-guidance/stories/STORY-001-03-qdic-profile.md",
  root,
);

function rgb(hex: string) {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
}

function saturation(hex: string) {
  const [r, g, b] = rgb(hex) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return (l > 0.5 ? d / (2 - max - min) : d / (max + min)) * 100;
}

function luminance(hex: string) {
  const weights = [0.2126, 0.7152, 0.0722];
  return rgb(hex)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * (weights[i] ?? 0), 0);
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const names = (record: Record<string, unknown>) => Object.keys(record);
const typesIn = (category: string) =>
  Object.values(profile.nodeTypes).filter((t) => t.category === category)
    .length;

describe("QDIC profile counts", () => {
  it("S1 holds 26 node types in five categories", () => {
    expect(names(profile.nodeTypes)).toHaveLength(26);
    expect(typesIn("Catalog structure")).toBe(10);
    expect(typesIn("People & access")).toBe(3);
    expect(typesIn("Tagging")).toBe(5);
    expect(typesIn("Annotation concepts")).toBe(6);
    expect(typesIn("Extend")).toBe(2);
  });

  it("S2 holds 22 predicates by category and 4 inverse names", () => {
    const perCategory = (c: string) =>
      Object.values(profile.predicates).filter((p) => p.category === c).length;
    expect(names(profile.predicates)).toHaveLength(22);
    expect(
      [
        "Structure",
        "Lineage",
        "Reference",
        "Annotation",
        "Ownership & Access",
        "Other",
      ].map(perCategory),
    ).toEqual([2, 3, 3, 8, 4, 2]);
    expect(
      Object.fromEntries(
        Object.entries(profile.inverses).map(([k, v]) => [k, v.predicate]),
      ),
    ).toEqual({
      partOf: "contains",
      narrower: "broader",
      follows: "precededBy",
      producedBy: "produces",
    });
    for (const [name, inverse] of Object.entries(profile.inverses)) {
      expect(profile.predicates[inverse.predicate]?.inverse).toBe(name);
    }
  });

  it("S3 holds 30 system and 9 proposed pairings with known names", () => {
    const known = new Set([
      ...names(profile.predicates),
      ...names(profile.inverses),
    ]);
    const ends = new Set([...names(profile.nodeTypes), "any"]);
    expect(profile.pairings.filter((p) => p.owner === "System")).toHaveLength(
      30,
    );
    expect(
      profile.pairings.filter((p) => p.status === "proposed"),
    ).toHaveLength(9);
    expect(profile.pairings).toHaveLength(39);
    for (const p of profile.pairings) {
      expect(known.has(p.predicate)).toBe(true);
      expect(ends.has(p.subject)).toBe(true);
      expect(ends.has(p.object)).toBe(true);
    }
  });
});

describe("QDIC profile node types", () => {
  it("S5 sets levels on structure types only", () => {
    const levels = Object.fromEntries(
      Object.entries(profile.nodeTypes)
        .filter(([, t]) => t.level !== undefined)
        .map(([k, t]) => [k, t.level]),
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
    expect(
      Object.values(profile.nodeTypes).filter(
        (t) => t.treeRole === "structure",
      ),
    ).toHaveLength(10);
  });

  it("S6 gives property_set and property the attribute role, 14 types the curation role", () => {
    const role = (r: string) =>
      Object.entries(profile.nodeTypes)
        .filter(([, t]) => t.treeRole === r)
        .map(([k]) => k);
    expect(role("attribute").sort()).toEqual(["property", "property_set"]);
    expect(role("curation")).toHaveLength(14);
  });

  it("S18 splits 18 icon types from 8 designed types with guarded colours", () => {
    const all = Object.entries(profile.nodeTypes);
    const iconed = all.filter(([, t]) => t.icon !== undefined);
    const designed = all.filter(([, t]) => t.icon === undefined);
    expect(iconed).toHaveLength(18);
    for (const [, t] of iconed) {
      expect([t.rank, t.color, t.abbr, t.design]).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    }
    expect(designed.map(([k]) => k).sort()).toEqual([
      "bk",
      "classification",
      "domain",
      "external_system",
      "keyword",
      "metric",
      "model",
      "policy",
    ]);
    for (const [k, t] of designed) {
      expect(t.rank, k).toBeDefined();
      expect(t.abbr, k).toBeDefined();
      expect(t.design, k).toBeDefined();
      expect(saturation(t.color ?? ""), k).toBeLessThanOrEqual(55);
      expect(contrast(t.color ?? "", "#F4F4F5"), k).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(designed.map(([, t]) => t.abbr)).size).toBe(8);
  });

  it("S19 marks the 18 Graph Vocabulary types as system types", () => {
    const system = Object.values(profile.nodeTypes).filter((t) => t.isSystem);
    expect(system).toHaveLength(18);
    expect(system.every((t) => t.icon !== undefined)).toBe(true);
  });

  it("S13 has no pending-ddr marker, or the story header records the Owner acceptance", () => {
    const pending = Object.values(profile.nodeTypes).some(
      (t) => t.design === "pending-ddr",
    );
    const header = readFileSync(storyFile, "utf8").split("\n")[2] ?? "";
    expect(
      !pending || header.includes("design values provisional — Owner accepted"),
    ).toBe(true);
    expect(header).toContain("design values provisional — Owner accepted");
  });
});

describe("QDIC profile predicates and vocabulary", () => {
  it("S17 fixes the category order", () => {
    expect(profile.categoryOrder).toEqual([
      "Structure",
      "Lineage",
      "Reference",
      "Annotation",
      "Ownership & Access",
      "Other",
    ]);
    for (const p of Object.values(profile.predicates)) {
      expect(profile.categoryOrder).toContain(p.category);
    }
  });

  it("S20 uses the direction value set", () => {
    const by = (d: string) =>
      Object.entries(profile.predicates)
        .filter(([, p]) => p.direction === d)
        .map(([k]) => k)
        .sort();
    expect(by("in")).toEqual([
      "definedBy",
      "dependsOn",
      "derivedFrom",
      "mapsTo",
      "memberOf",
    ]);
    expect(by("both")).toEqual(["relatedTo", "synonymOf"]);
    expect(by("out")).toHaveLength(15);
  });

  it("S15 holds the three write rules", () => {
    expect(profile.writeRules).toHaveLength(3);
    for (const r of profile.writeRules) {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.source.section).toBe("The three rules");
    }
  });
});

describe("QDIC profile attributes, slots and lookups", () => {
  it("S8 holds the attribute sets", () => {
    const sets = profile.attributeSets;
    expect(sets.asset).toHaveLength(9);
    expect(sets.record?.map((a) => a.key)).toEqual([
      "created_at",
      "updated_at",
      "created_by",
      "updated_by",
    ]);
    expect(sets.keyword).toHaveLength(7);
    expect(
      sets.asset
        ?.filter((a) => a.resolves !== undefined)
        .map((a) => [a.key, a.resolves]),
    ).toEqual([
      [
        "asset_type",
        [
          ["view", "table"],
          ["database", "schema"],
        ],
      ],
    ]);
  });

  it("S7 holds 13 slots in inspector order", () => {
    const bySlot = (id: string) => profile.slots.find((s) => s.slot === id);
    expect(profile.slots.map((s) => s.slot)).toEqual([
      "physical_name",
      "logical_name",
      "description",
      "owners",
      "tags",
      "path",
      "data_source",
      "parent_owners",
      "data_type",
      "ddl_comment",
      "asset_groups",
      "updated",
      "link",
    ]);
    expect(bySlot("owners")?.edge).toBe("ownedBy");
    expect(bySlot("tags")?.edge).toBe("taggedWith");
    expect(bySlot("asset_groups")?.edge).toBe("groupedIn");
    expect(bySlot("ddl_comment")?.keys).toContain("comment_on_ddl");
    expect(bySlot("data_source")?.late).toEqual([
      "service_name",
      "data_source_id",
    ]);
    expect(bySlot("path")?.derive).toBe("path");
  });

  it("maps every not-yet-included field of the Graph Vocabulary", () => {
    expect(profile.notYetIncluded).toHaveLength(19);
    const slot = (f: string) =>
      profile.notYetIncluded.find((n) => n.field === f)?.slot;
    expect(slot("ext_owners")).toBe("owners");
    expect(slot("comment_on_ddl")).toBe("ddl_comment");
    expect(slot("stats_size")).toBeNull();
  });

  it("S16 lists the shape heuristics in order", () => {
    expect(profile.shapeHeuristics.map((h) => [h.kind, ...h.columns])).toEqual([
      ["rows", "source", "target"],
      ["rows", "from", "to"],
      ["rows", "parent", "child"],
      ["rows", "subject", "object"],
      ["rows", "*_id"],
      ["tree", "children", "items"],
    ]);
  });

  it("S14 maps global-id prefixes to known types", () => {
    const prefixes = profile.globalIdPrefixes;
    expect(
      ["tbl-", "clmn-", "schm-", "usr-"].map((p) => prefixes[p]?.type),
    ).toEqual(["table", "column", "schema", "user"]);
    expect(prefixes["node-"]).toMatchObject({ writable: true, type: null });
    for (const entry of Object.values(prefixes)) {
      if (entry.type !== null)
        expect(profile.nodeTypes).toHaveProperty(entry.type);
    }
  });
});

describe("QDIC profile slot rules", () => {
  const slot = (id: string) => profile.slots.find((s) => s.slot === id);

  it("S24 keeps definition out of the description keys", () => {
    expect(slot("description")?.keys).toEqual([
      "description",
      "desc",
      "summary",
    ]);
    expect(profile.attributeSets.keyword?.map((a) => a.key)).toContain(
      "definition",
    );
  });

  it("S25 keeps stewards out of the owners keys", () => {
    expect(slot("owners")?.edge).toBe("ownedBy");
    expect(slot("owners")?.keys).toEqual(["owners", "owner", "data_owner"]);
  });

  it("S26 filters asset groups and derives parent owners", () => {
    expect(slot("asset_groups")).toMatchObject({
      edge: "groupedIn",
      edgeObject: "asset_group",
    });
    expect(slot("parent_owners")?.keys).toEqual(["parent_owners"]);
    expect(slot("parent_owners")?.derive).toBe("parent-owners");
    const copy = structuredClone(qdic);
    const index = copy.slots.findIndex((s) => s.slot === "asset_groups");
    (copy.slots[index] as { edgeObject?: string }).edgeObject = "asset_grp";
    expect(() => loadProfile(copy)).toThrow(
      `slots.${index}.edgeObject: unknown node type "asset_grp"`,
    );
  });

  it("S27 resolves two pairs and keeps schm- on schema", () => {
    const resolver = profile.attributeSets.asset?.find(
      (a) => a.key === "asset_type",
    );
    expect(resolver?.resolves).toEqual([
      ["view", "table"],
      ["database", "schema"],
    ]);
    expect(profile.globalIdPrefixes["schm-"]).toMatchObject({
      type: "schema",
      source: { doc: "PRD", section: "FR-QDIC-6" },
    });
  });
});
