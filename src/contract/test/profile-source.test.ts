import { describe, expect, it } from "vitest";
import { loadProfile } from "../index";
import qdic from "../profile/qdic.json";

type Draft = {
  pairings: Record<string, unknown>[];
  slots: Record<string, unknown>[];
};

function clone() {
  return structuredClone(qdic) as unknown as Draft;
}

function failure(raw: unknown) {
  try {
    loadProfile(raw);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the loader accepted the profile");
}

describe("QDIC profile loader failures", () => {
  it("S21 rejects an unknown predicate in a pairing and in a slot edge", () => {
    const copy = clone();
    copy.pairings.push({
      predicate: "ownz",
      subject: "table",
      object: "user",
      owner: "System",
      status: null,
      source: { doc: "GV", section: "System pairings" },
    });
    copy.slots[0].edge = "hasOwner";
    const message = failure(copy);
    expect(message).toContain(`pairings.${copy.pairings.length - 1}.predicate`);
    expect(message).toContain("slots.0.edge");
  });

  it("S22 rejects an unknown node type in a pairing", () => {
    const copy = clone();
    copy.pairings[0].object = "tabel";
    expect(failure(copy)).toContain("pairings.0.object");
  });
});
