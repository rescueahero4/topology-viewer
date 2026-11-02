import { describe, expect, it } from "vitest";
import { loadProfile } from "../index";
import neutral from "../profile/neutral.json";
import qdic from "../profile/qdic.json";

describe("the neutral profile", () => {
  it("passes the profile checks", () => {
    expect(() => loadProfile(neutral)).not.toThrow();
  });

  it("has no node types, so that no type name of a payload has a meaning", () => {
    expect(Object.keys(neutral.nodeTypes)).toEqual([]);
    expect(neutral.slots).toEqual([]);
    expect(neutral.pairings).toEqual([]);
  });

  it("keeps the predicates of the mock data and their families", () => {
    expect(Object.keys(neutral.predicates)).toEqual(
      Object.keys(qdic.predicates),
    );
    expect(neutral.categoryOrder).toEqual(qdic.categoryOrder);
  });
});
