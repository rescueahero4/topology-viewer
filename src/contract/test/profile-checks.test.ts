import { describe, expect, it } from "vitest";
import { loadProfile } from "../src/index";
import qdic from "../src/profile/qdic.json";

type Draft = {
  nodeTypes: Record<string, Record<string, unknown>>;
  predicates: Record<string, Record<string, unknown>>;
  inverses: Record<string, Record<string, unknown>>;
  pairings: Record<string, unknown>[];
  slots: Record<string, unknown>[];
  notYetIncluded: Record<string, unknown>[];
  attributeSets: Record<string, Record<string, unknown>[]>;
  globalIdPrefixes: Record<string, Record<string, unknown>>;
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
