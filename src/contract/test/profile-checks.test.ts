import { describe, expect, it } from "vitest";
import { loadProfile } from "../index";
import qdic from "../profile/qdic.json";

type Draft = {
  nodeTypes: Record<string, Record<string, unknown>>;
  predicates: Record<string, Record<string, unknown>>;
  inverses: Record<string, Record<string, unknown>>;
  pairings: Record<string, unknown>[];
  slots: Record<string, unknown>[];
  notYetIncluded: Record<string, unknown>[];
  attributeSets: Record<string, Record<string, unknown>[]>;
  globalIdPrefixes: Record<string, Record<string, unknown>>;
  shapeHeuristics: Record<string, unknown>[];
  typeMenuCategories: { order: string[] };
};

function broken(edit: (d: Draft) => void) {
  const draft = structuredClone(qdic) as unknown as Draft;
  edit(draft);
  try {
    loadProfile(draft);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the loader accepted the profile");
}

const first = <T>(list: T[]) => list[0];

describe("profile cross-reference checks", () => {
  it("rejects a level on a non-structure type", () => {
    expect(broken((d) => (d.nodeTypes.user.level = 1))).toBe(
      "Invalid profile:\nnodeTypes.user.level: level is set for structure types only",
    );
  });

  it("rejects a structure type without a level", () => {
    expect(broken((d) => delete d.nodeTypes.database.level)).toBe(
      "Invalid profile:\nnodeTypes.database.level: level is set for structure types only",
    );
  });

  it("rejects an icon type with design values", () => {
    expect(broken((d) => (d.nodeTypes.database.rank = 0))).toBe(
      "Invalid profile:\nnodeTypes.database.icon: a type has an icon or design values, not both",
    );
  });

  it("rejects a type without icon and without design values", () => {
    expect(broken((d) => delete d.nodeTypes.keyword.abbr)).toBe(
      "Invalid profile:\nnodeTypes.keyword: a type without icon needs rank, color, abbr and design",
    );
  });

  it("rejects an unknown attribute set", () => {
    expect(broken((d) => (d.nodeTypes.table.attributeSet = "nope"))).toBe(
      'Invalid profile:\nnodeTypes.table.attributeSet: unknown attribute set "nope"',
    );
  });

  it("rejects an unknown predicate category", () => {
    const name = Object.keys(qdic.predicates)[0];
    expect(broken((d) => (d.predicates[name].category = "Nope"))).toBe(
      `Invalid profile:\npredicates.${name}.category: unknown category "Nope"`,
    );
  });

  it("rejects a bad inverse", () => {
    const [name] = Object.entries(qdic.predicates).find(
      ([, v]) => v.inverse !== null,
    )!;
    const wrong = Object.keys(qdic.inverses).find(
      (k) =>
        (qdic.predicates as Record<string, { inverse: unknown }>)[name]
          .inverse !== k,
    )!;
    expect(broken((d) => (d.predicates[name].inverse = wrong))).toBe(
      `Invalid profile:\npredicates.${name}.inverse: "${wrong}" is not an inverse of "${name}"`,
    );
  });

  it("rejects an inverse of an unknown predicate", () => {
    const name = Object.keys(qdic.inverses)[0];
    expect(broken((d) => (d.inverses[name].predicate = "nope"))).toBe(
      `Invalid profile:
predicates.contains.inverse: "${name}" is not an inverse of "contains"
inverses.${name}.predicate: unknown predicate "nope"`,
    );
  });

  it("rejects a pairing with an unknown predicate", () => {
    expect(broken((d) => (first(d.pairings).predicate = "nope"))).toBe(
      'Invalid profile:\npairings.0.predicate: unknown predicate "nope"',
    );
  });

  it("rejects a pairing with an unknown subject", () => {
    expect(broken((d) => (first(d.pairings).subject = "nope"))).toBe(
      'Invalid profile:\npairings.0.subject: unknown node type "nope"',
    );
  });

  it("rejects a pairing with an unknown object", () => {
    expect(broken((d) => (first(d.pairings).object = "nope"))).toBe(
      'Invalid profile:\npairings.0.object: unknown node type "nope"',
    );
  });

  it("rejects a slot with an unknown edge", () => {
    const at = qdic.slots.findIndex((s) => "edge" in s);
    expect(broken((d) => (d.slots[at].edge = "nope"))).toBe(
      `Invalid profile:\nslots.${at}.edge: unknown predicate "nope"`,
    );
  });

  it("rejects a bad notYetIncluded slot", () => {
    const at = qdic.notYetIncluded.findIndex((n) => n.slot !== null);
    expect(broken((d) => (d.notYetIncluded[at].slot = "nope"))).toBe(
      `Invalid profile:\nnotYetIncluded.${at}.slot: unknown slot "nope"`,
    );
  });

  it("rejects a bad resolves type", () => {
    const [set, list] = Object.entries(qdic.attributeSets).find(([, l]) =>
      l.some((a) => "resolves" in a),
    )!;
    const at = list.findIndex((a) => "resolves" in a);
    expect(
      broken((d) => (d.attributeSets[set][at].resolves = [["nope", "table"]])),
    ).toBe(
      `Invalid profile:\nattributeSets.${set}.${at}.resolves.0.0: unknown node type "nope"`,
    );
  });

  it("rejects a global-id prefix with an unknown type", () => {
    expect(broken((d) => (d.globalIdPrefixes["tbl-"].type = "nope"))).toBe(
      'Invalid profile:\nglobalIdPrefixes.tbl-.type: unknown node type "nope"',
    );
  });
});

const at = (id: string) => qdic.slots.findIndex((s) => s.slot === id);
type Alternative = { paths: string[][]; join: string; sep?: string };
const alternatives = (d: Draft, id: string) =>
  d.slots[at(id)].itemName as Alternative[];

describe("STORY-002-09 profile checks", () => {
  it("S18 rejects bad slot flags and an unknown slot field", () => {
    expect(broken((d) => (d.slots[at("owners")].strong = false))).toContain(
      `slots.${at("owners")}.strong`,
    );
    expect(
      broken((d) => (d.slots[at("physical_name")].labelFallback = "yes")),
    ).toContain(`slots.${at("physical_name")}.labelFallback`);
    expect(broken((d) => (d.slots[at("tags")].assetOnlyKeys = []))).toContain(
      `slots.${at("tags")}.assetOnlyKeys`,
    );
    expect(broken((d) => (d.slots[at("owners")].strongg = true))).toContain(
      `\nslots.${at("owners")}: Unrecognized key`,
    );
  });

  it("S19 rejects an asset-only key that is also a plain key or in two lists", () => {
    const logical = at("logical_name");
    const message = (index: number) =>
      `slots.${index}.assetOnlyKeys.0: key "${index === logical ? "title" : "labels"}" is also a plain key or in another assetOnlyKeys list`;
    expect(
      broken((d) => (d.slots[logical].keys as string[]).push("title")),
    ).toContain(message(logical));
    expect(
      broken((d) =>
        (d.slots[at("description")].keys as string[]).push("labels"),
      ),
    ).toContain(message(at("tags")));
    expect(
      broken((d) =>
        (d.slots[at("tags")].assetOnlyKeys as string[]).push("title"),
      ),
    ).toContain(message(logical));
  });

  it("S21 needs a known edge on the parent-owners slot", () => {
    const index = at("parent_owners");
    expect(broken((d) => delete d.slots[index].edge)).toContain(
      `slots.${index}.edge: a parent-owners slot needs an edge`,
    );
    expect(broken((d) => (d.slots[index].edge = "ownz"))).toContain(
      `slots.${index}.edge: unknown predicate "ownz"`,
    );
  });

  it("S23 rejects bad itemName alternatives", () => {
    const tags = at("tags");
    const owners = at("owners");
    expect(broken((d) => (d.slots[tags].itemName = []))).toContain(
      `slots.${tags}.itemName`,
    );
    expect(
      broken((d) => (alternatives(d, "owners")[0].paths = [[]])),
    ).toContain(`slots.${owners}.itemName.0.paths.0`);
    expect(broken((d) => (alternatives(d, "owners")[0].join = ""))).toContain(
      `slots.${owners}.itemName.0.join: an alternative with two or more paths needs a join text`,
    );
    expect(broken((d) => (alternatives(d, "owners")[0].sep = "-"))).toContain(
      `\nslots.${owners}.itemName.0: Unrecognized key`,
    );
  });

  it("S25 rejects builtIn on a system type and a system predicate", () => {
    expect(broken((d) => (d.nodeTypes.table.builtIn = true))).toContain(
      "nodeTypes.table.builtIn: a system entry is not built-in",
    );
    expect(broken((d) => (d.predicates.contains.builtIn = true))).toContain(
      "predicates.contains.builtIn: a system entry is not built-in",
    );
  });

  it("S27 rejects a repeated Types menu category and one with no node type", () => {
    expect(
      broken((d) => d.typeMenuCategories.order.push("Catalog structure")),
    ).toContain("typeMenuCategories.order.4:");
    expect(broken((d) => d.typeMenuCategories.order.push("Custom"))).toContain(
      'typeMenuCategories.order.4: category "Custom" is repeated or no node type has it',
    );
  });

  it("S46 checks the heuristic predicate, labelKeys and hintDefault", () => {
    const h = (d: Draft, k: number) => d.shapeHeuristics[k];
    expect(broken((d) => (h(d, 2).predicate = "contians"))).toContain(
      'shapeHeuristics.2.predicate: unknown predicate "contians"',
    );
    expect(broken((d) => delete h(d, 0).predicate)).toContain(
      "shapeHeuristics.0.predicate",
    );
    expect(broken((d) => (h(d, 0).labelKeys = ["name"]))).toContain(
      "shapeHeuristics.0.labelKeys: labelKeys is set for tree entries only",
    );
    expect(broken((d) => delete h(d, 5).labelKeys)).toContain(
      "shapeHeuristics.5.labelKeys: labelKeys is set for tree entries only",
    );
    expect(broken((d) => (h(d, 1).hintDefault = true))).toContain(
      'shapeHeuristics.1.hintDefault: a second hintDefault for kind "rows"',
    );
    expect(broken((d) => delete h(d, 5).hintDefault)).toContain(
      '\nshapeHeuristics: no hintDefault entry for kind "tree"',
    );
  });

  it("S58 rejects bad lost, role, layoutRole and builtIn values", () => {
    expect(broken((d) => (d.attributeSets.asset[8].lost = false))).toContain(
      "attributeSets.asset.8.lost",
    );
    expect(broken((d) => (d.predicates.contains.role = "structure"))).toContain(
      "predicates.contains.role",
    );
    expect(
      broken((d) => (d.predicates.mapsTo.layoutRole = "upstream")),
    ).toContain("predicates.mapsTo.layoutRole");
    expect(
      broken((d) => (d.predicates.broader.layoutRole = "containment")),
    ).toContain("predicates.broader.layoutRole");
    expect(broken((d) => (d.predicates.relatedTo.builtIn = false))).toContain(
      "predicates.relatedTo.builtIn",
    );
    expect(
      broken((d) => (d.predicates.contains.roles = "containment")),
    ).toContain("\npredicates.contains: Unrecognized key");
  });
});
