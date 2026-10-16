import { profile } from "@qdic-topology/contract";
import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { warningEntries } from "../data/notices";
import { canvasColor, type Hex } from "./colors";
import { resolveVocab } from "./resolve";

const LIGHT = canvasColor("#F4F4F5") as Hex;

// why: lead decision D47 — the caller joins the `normalize` issues and the vocab issues, in that
// order, and calls `warningEntries` once with the `normalize` `shaped`
function joined(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) return { result, warnings: null };
  const { vocab, issues } = resolveVocab(
    result.graph,
    result.payload,
    profile,
    LIGHT,
  );
  const warnings = warningEntries([...result.issues, ...issues], result.shaped);
  return { result, vocab, warnings };
}

const counts = (warnings: { code: string; count: number }[] | null) =>
  Object.fromEntries((warnings ?? []).map((w) => [w.code, w.count]));

describe("S30 the 32 fixtures", () => {
  it.each(Object.keys(fixtures))("%s gives its expect.warnings", (key) => {
    const { input, expect: outcome } = loadFixture(key);
    const { result, warnings } = joined(input);
    if (!result.ok || outcome.notice === "no-valid-nodes") return;
    expect(counts(warnings)).toEqual(outcome.warnings);
  });

  it.each([
    ["s-undeclared", 11],
    ["s-custom-active", 29],
    ["s-custom-passive", 29],
    ["s-mixed", 9],
    ["s-many-preds", 3],
    ["s-extend", 1],
    ["s-dirty", 1],
  ])("%s counts %i unknown-type", (key, count) => {
    expect(
      counts(joined(loadFixture(key).input).warnings)["unknown-type"],
    ).toBe(count);
  });

  it("counts no unknown-type for the other fixtures", () => {
    const named = new Set([
      "s-undeclared",
      "s-custom-active",
      "s-custom-passive",
      "s-mixed",
    ]);
    for (const key of ["s-many-preds", "s-extend", "s-dirty"]) named.add(key);
    for (const key of Object.keys(fixtures).filter((k) => !named.has(k)))
      expect(
        counts(joined(loadFixture(key).input).warnings)["unknown-type"],
      ).toBeUndefined();
  });
});

describe("S30 in-test cases", () => {
  const rows = { kind: "rows", subject: "from", object: "to" };

  it("gives one color-rejected for url(#a)", () => {
    const { warnings } = joined({
      nodes: [{ id: "a", type: "n" }],
      types: { n: { color: "url(#a)" } },
    });
    expect(counts(warnings)).toEqual({ "color-rejected": 1 });
  });

  it("gives shaped-from and no unknown-type for the shaped case", () => {
    const { vocab, warnings } = joined({
      nodes: [{ from: "n0", to: "n1" }],
      shape: rows,
    });
    expect(counts(warnings)).toEqual({ "shaped-from": 1 });
    expect(vocab?.types.get("row")?.provenance).toBe("inferred");
  });

  it("counts a model _inferred.type", () => {
    const { result, vocab, warnings } = joined({
      nodes: [{ id: "n9", type: "gizmo", _inferred: { type: "guessed" } }],
    });
    expect(counts(warnings)).toEqual({ "unknown-type": 1 });
    expect(vocab?.types.get("gizmo")?.provenance).toBe("custom");
    expect(result.ok && result.graph.records[0].inferred.type).toBe("guessed");
  });

  it("counts a cell type but not the row type of the set", () => {
    const { warnings } = joined({
      nodes: [{ from: "n0", to: "n1", cat: "gizmo" }],
      shape: { ...rows, type: "cat" },
    });
    expect(counts(warnings)).toEqual({ "shaped-from": 1, "unknown-type": 1 });
    expect(warnings?.find((w) => w.code === "unknown-type")?.ids).toEqual([
      "n0",
    ]);
  });

  it("counts a model record of type row beside shaped rows", () => {
    const { vocab, warnings } = joined({
      nodes: [{ from: "n0", to: "n1" }],
      neighborhood: { nodes: [{ id: "m1", type: "row" }] },
      shape: rows,
    });
    expect(counts(warnings)).toEqual({ "shaped-from": 1, "unknown-type": 1 });
    expect(warnings?.find((w) => w.code === "unknown-type")?.ids).toEqual([
      "m1",
    ]);
    expect(vocab?.types.get("row")?.provenance).toBe("inferred");
  });
});
