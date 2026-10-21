import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import {
  canvasColor,
  familyOrder,
  firstView,
  normalize,
  resolveVocab,
  stats,
  typeGroups,
  type Hex,
} from "../index";

const LIGHT = canvasColor("#F4F4F5") as Hex;

describe("S16 typeGroups and familyOrder", () => {
  it("give the profile order of the type groups with Custom, and of the families", () => {
    expect(typeGroups()).toEqual([
      "Catalog structure",
      "People & access",
      "Tagging",
      "Annotation concepts",
      "Custom",
    ]);
    expect(familyOrder()).toEqual([
      "Structure",
      "Lineage",
      "Reference",
      "Annotation",
      "Ownership & Access",
      "Other",
    ]);
  });

  it("put each TypeRow group of q-full-vocabulary in typeGroups", () => {
    const result = normalize(loadFixture("q-full-vocabulary").input, {
      now: "2026-10-20",
    });
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { graph, payload, hash } = result;
    const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
    const groups = new Set(
      stats(vocab, firstView(graph, vocab, payload, hash)).types.map(
        (row) => row.group,
      ),
    );
    expect(groups.size).toBeGreaterThan(1);
    for (const group of groups) expect(typeGroups()).toContain(group);
  });

  it("give a new array on each call, so a caller cannot change the profile", () => {
    (typeGroups() as string[]).push("x");
    (familyOrder() as string[]).length = 0;
    expect(typeGroups()).toHaveLength(5);
    expect(familyOrder()).toEqual(profile.categoryOrder);
  });
});
