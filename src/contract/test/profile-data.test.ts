import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profile } from "../src/index";

describe("STORY-002-09 profile data", () => {
  const slot = (id: string) => profile.slots.find((s) => s.slot === id);
  const slotsWith = (field: keyof (typeof profile.slots)[number]) =>
    profile.slots.filter((s) => s[field] !== undefined).map((s) => s.slot);
  type Predicate = (typeof profile.predicates)[string];
  const predicatesWhere = (test: (p: Predicate) => boolean) =>
    Object.entries(profile.predicates)
      .filter(([, p]) => test(p))
      .map(([name]) => name)
      .sort();
  const person = [
    { paths: [["given_name"], ["family_name"]], join: " " },
    { paths: [["name"]], join: "" },
    { paths: [["label"]], join: "" },
    { paths: [["email"]], join: "" },
    { paths: [["email_address"]], join: "" },
  ];
  const topology = readFileSync(
    new URL("../../../.design-recall/mockups/lib/topology.js", import.meta.url),
    "utf8",
  );

  it("S16 moves the broad aliases to assetOnlyKeys", () => {
    expect(slot("logical_name")?.keys).toEqual([
      "logical_name",
      "logicalName",
      "business_name",
      "display_name",
      "displayName",
    ]);
    expect(slot("logical_name")?.assetOnlyKeys).toEqual(["title"]);
    expect(slot("tags")?.keys).toEqual(["tags", "keywords"]);
    expect(slot("tags")?.assetOnlyKeys).toEqual(["labels"]);
    expect(slotsWith("assetOnlyKeys")).toEqual(["logical_name", "tags"]);
  });

  it("S17 sets strong and labelFallback on the mockup slots", () => {
    expect(slotsWith("strong")).toEqual([
      "logical_name",
      "owners",
      "tags",
      "path",
      "ddl_comment",
    ]);
    expect(slot("logical_name")?.strong).toBe(true);
    expect(slotsWith("labelFallback")).toEqual(["physical_name"]);
    expect(slot("physical_name")?.labelFallback).toBe(true);
  });

  it("S20 gives Parent owners the ownedBy edge", () => {
    expect(slot("parent_owners")).toMatchObject({
      keys: ["parent_owners"],
      derive: "parent-owners",
      edge: "ownedBy",
    });
    expect(slot("owners")?.edge).toBe("ownedBy");
    expect(
      profile.slots.filter((s) => s.derive === "parent-owners"),
    ).toHaveLength(1);
  });

  it("S22 holds the list-item names of the mockup readers", () => {
    expect(slot("owners")?.itemName).toEqual(person);
    expect(slot("parent_owners")?.itemName).toEqual(person);
    expect(slot("tags")?.itemName).toEqual([
      {
        paths: [
          ["parent_tag", "label"],
          ["child_tag", "label"],
        ],
        join: " / ",
      },
      { paths: [["label"]], join: "" },
      { paths: [["name"]], join: "" },
    ]);
    expect(slot("asset_groups")?.itemName).toEqual([
      { paths: [["name"]], join: "" },
    ]);
    expect(slotsWith("itemName")).toEqual([
      "owners",
      "tags",
      "parent_owners",
      "asset_groups",
    ]);
  });

  it("S24 marks the six annotation concepts and six predicates as built-in", () => {
    const types = Object.entries(profile.nodeTypes).filter(
      ([, t]) => t.builtIn,
    );
    expect(types.map(([name]) => name).sort()).toEqual(
      [
        "classification",
        "domain",
        "policy",
        "metric",
        "external_system",
        "model",
      ].sort(),
    );
    for (const [name, t] of types) {
      expect(t.isSystem, name).toBe(false);
      expect(t.category, name).toBe("Annotation concepts");
      expect(t.source).toMatchObject({ doc: "SA-Intro", section: "Reference" });
      expect(t.source.note?.length, name).toBeGreaterThan(0);
    }
    expect(predicatesWhere((p) => p.builtIn === true)).toEqual(
      [
        "relatedTo",
        "synonymOf",
        "classifiedAs",
        "governedBy",
        "calculatedFrom",
        "sourcedFrom",
      ].sort(),
    );
    for (const name of predicatesWhere((p) => p.builtIn === true)) {
      const p = profile.predicates[name];
      expect(p?.isSystem, name).toBe(false);
      expect(p?.category, name).toBe("Annotation");
      expect(p?.source.note?.length, name).toBeGreaterThan(0);
    }
    for (const name of ["precededBy", "produces", "representsConcept"])
      expect(profile.predicates[name]?.builtIn, name).toBeUndefined();
  });

  it("S26 orders the Types menu by the four SA-Intro categories", () => {
    expect(profile.typeMenuCategories).toEqual({
      order: [
        "Catalog structure",
        "People & access",
        "Tagging",
        "Annotation concepts",
      ],
      source: { doc: "SA-Intro", section: "Node types you get out of the box" },
    });
    const order = profile.typeMenuCategories.order;
    expect(
      Object.entries(profile.nodeTypes)
        .filter(([, t]) => !order.includes(t.category))
        .map(([name]) => name)
        .sort(),
    ).toEqual(["bk", "keyword"]);
    expect(profile.categoryOrder).toEqual([
      "Structure",
      "Lineage",
      "Reference",
      "Annotation",
      "Ownership & Access",
      "Other",
    ]);
  });

  it("S29 makes the structure types equal the Catalog structure types", () => {
    const by = (test: (t: (typeof profile.nodeTypes)[string]) => boolean) =>
      Object.entries(profile.nodeTypes)
        .filter(([, t]) => test(t))
        .map(([name]) => name)
        .sort();
    const expected = [
      "bigroup",
      "column",
      "dashboard",
      "data_source",
      "database",
      "etl",
      "report",
      "schema",
      "table",
      "view",
    ];
    expect(by((t) => t.treeRole === "structure")).toEqual(expected);
    expect(by((t) => t.category === "Catalog structure")).toEqual(expected);
  });

  it("S45 gives each heuristic a predicate and the tree entry its label keys", () => {
    const heuristics = profile.shapeHeuristics;
    expect(heuristics.map((h) => h.predicate)).toEqual([
      "relatedTo",
      "relatedTo",
      "contains",
      "relatedTo",
      "relatedTo",
      "contains",
    ]);
    expect(heuristics.map((h) => h.labelKeys)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ["name", "label", "title"],
    ]);
    expect(heuristics.map((h) => h.hintDefault === true)).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(heuristics[5]?.source.note).toContain("epic Q7");
    expect(heuristics.map((h) => [h.source.doc, h.source.section])).toEqual([
      ["PRD", "FR-DATA-10"],
      ["PRD", "FR-DATA-10"],
      ["PRD", "FR-DATA-10"],
      ["GV", "Predicates"],
      ["PRD", "FR-DATA-10"],
      ["PRD", "FR-DATA-10"],
    ]);
  });

  it("S55 marks exactly is_lost as the lost attribute", () => {
    const marked = Object.entries(profile.attributeSets).flatMap(
      ([set, list]) =>
        list.flatMap((a, i) => (a.lost ? [[set, i, a.key]] : [])),
    );
    expect(marked).toEqual([["asset", 8, "is_lost"]]);
    const source = profile.attributeSets.asset?.[8]?.source;
    expect(source).toMatchObject({ doc: "GV", section: "Attributes" });
    expect(source?.note).toMatch(/\blost\b/);
    expect(source?.note).toContain("app.js");
    expect(source?.note).not.toContain("FR-");
  });

  it("S56 gives exactly contains the containment role", () => {
    expect(predicatesWhere((p) => p.role === "containment")).toEqual([
      "contains",
    ]);
    const note = profile.predicates.contains?.source.note;
    expect(note).toMatch(/\brole\b/);
    expect(note).toContain("Derived from the asset hierarchy");
    expect(profile.inverses.partOf?.predicate).toBe("contains");
  });

  it("S57 makes the layout roles equal the mockup sets", () => {
    const set = (pattern: RegExp) =>
      [...(topology.match(pattern)?.[1] ?? "").matchAll(/"(\w+)"/g)]
        .map((match) => match[1])
        .sort();
    const lineage = set(/const LINEAGE_PREDICATES = new Set\(\[([^\]]*)\]/);
    const categories = topology.match(
      /const PREDICATE_CATEGORY = \{([\s\S]*?)\};/,
    )?.[1];
    const structure = [...(categories ?? "").matchAll(/(\w+): "structure"/g)]
      .map((match) => match[1])
      .sort();
    expect(lineage).toHaveLength(4);
    expect(predicatesWhere((p) => p.layoutRole === "lineage")).toEqual(lineage);
    expect(predicatesWhere((p) => p.category === "Lineage")).toEqual([
      "definedBy",
      "dependsOn",
      "derivedFrom",
    ]);
    const structural = predicatesWhere((p) => p.layoutRole === "structure");
    expect(structural).toEqual(["broader", "contains"]);
    const inverses = Object.entries(profile.inverses)
      .filter(([, inverse]) => structural.includes(inverse.predicate))
      .map(([name]) => name);
    expect([...structural, ...inverses].sort()).toEqual(structure);
    expect(structure).toHaveLength(4);
    for (const name of [...lineage, ...structural])
      expect(profile.predicates[name]?.source.note, name).toMatch(
        /\blayoutRole\b/,
      );
  });
});
