import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { pairingsOf } from "../index";

const pairs = (list: string[]) =>
  list.map((text) => {
    const [subject, object] = text.split(">");
    return { subject, object };
  });

describe("S19 pairingsOf", () => {
  it("gives the profile pairs of a predicate in profile order", () => {
    expect(pairingsOf("contains")).toEqual(
      pairs([
        "database>schema",
        "schema>table",
        "table>column",
        "bigroup>dashboard",
        "dashboard>report",
      ]),
    );
    expect(pairingsOf("ownedBy")).toEqual(pairs(["any>user"]));
    expect(pairingsOf("permissionedTo")).toEqual(pairs(["user_group>any"]));
  });

  it("keeps the pairs of every owner (relatedTo is BPaaS)", () => {
    const related = profile.pairings.filter((p) => p.predicate === "relatedTo");
    expect(related.every((p) => p.owner === "BPaaS")).toBe(true);
    expect(pairingsOf("relatedTo")).toEqual(
      related.map(({ subject, object }) => ({ subject, object })),
    );
    expect(pairingsOf("relatedTo")).toHaveLength(4);
  });

  it("gives only the keys subject and object, in new objects", () => {
    for (const name of ["contains", "ownedBy", "permissionedTo", "relatedTo"])
      for (const pair of pairingsOf(name))
        expect(Object.keys(pair).sort()).toEqual(["object", "subject"]);
    const first = pairingsOf("contains")[0] as { subject: string };
    first.subject = "changed";
    expect(pairingsOf("contains")[0].subject).toBe("database");
    expect(pairingsOf("contains")).toEqual(pairingsOf("contains"));
  });

  it.each(["nope", "", "__proto__"])(
    "gives [] for %j, with no throw",
    (name) => {
      expect(pairingsOf(name)).toEqual([]);
    },
  );
});
