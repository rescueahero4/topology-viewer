import { describe, expect, it } from "vitest";
import { parseRenderInput } from "../index";

function parsed(raw: unknown) {
  const result = parseRenderInput(raw);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

function withType(entry: Record<string, unknown>) {
  return parsed({ nodes: [{ id: "a", type: "x" }], types: { x: entry } });
}

describe("types and predicates", () => {
  it("S8 keeps a valid glyph", () => {
    const { data, issues } = parsed({
      nodes: [],
      types: { supplier: { glyph: "M3 12h18" } },
    });
    expect(data.types?.supplier).toEqual({ glyph: "M3 12h18" });
    expect(issues).toEqual([]);
  });

  it.each([
    ["script", "M0 0 <script>"],
    ["513 characters", "M".repeat(513)],
    ["url reference", "url(#a)"],
  ])("S9 drops a glyph with %s and reports glyph-rejected", (_name, glyph) => {
    const { data, issues } = withType({ label: "X", glyph });
    expect(data.types?.x).toEqual({ label: "X" });
    expect(issues).toEqual([
      { code: "glyph-rejected", path: ["types", "x", "glyph"] },
    ]);
    expect(JSON.stringify(data)).not.toContain(glyph);
  });

  it.each([
    ["rank", 7, "rank-rejected", { rank: 0 }],
    ["role", "other", "layout-rejected", {}],
    ["shape", "star", "rank-rejected", {}],
    ["abbr", "ABC", "glyph-rejected", {}],
    ["level", -1, "layout-rejected", {}],
    ["color", `#${"a".repeat(64)}`, "color-rejected", {}],
  ])(
    "S10 gives %s = %j its fallback and %s",
    (field, value, code, fallback) => {
      const { data, issues } = withType({ [field]: value });
      expect(data.types?.x).toEqual(fallback);
      expect(issues).toEqual([{ code, path: ["types", "x", field] }]);
      expect(JSON.stringify(data)).not.toContain(JSON.stringify(value));
    },
  );

  it("S11 accepts a predicate hint with role containment", () => {
    const hasSteward = {
      label: "Has steward",
      category: "governance",
      role: "containment",
    };
    const { data, issues } = parsed({
      nodes: [],
      predicates: { hasSteward },
    });
    expect(data.predicates?.hasSteward).toEqual(hasSteward);
    expect(issues).toEqual([]);
  });
});
