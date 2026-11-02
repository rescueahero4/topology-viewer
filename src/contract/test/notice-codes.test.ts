import { describe, expect, it } from "vitest";
import {
  issueSchema,
  notices,
  parseRenderInput,
  warningEntrySchema,
} from "../index";

const S33_CODE = "layout-rejected";

const one = { nodes: [{ id: "a", type: "table" }] };
const withType = (field: string, value: unknown) => ({
  ...one,
  types: { x: { label: "X", [field]: value } },
});

const WARNING_INPUTS: [string, unknown][] = [
  ["S7 layout", { ...one, view: { layout: "radial" } }],
  ["S7 budget", { ...one, view: { budget: 30 } }],
  ["S7 hiddenTypes", { ...one, view: { hiddenTypes: [] } }],
  ["S9 script", withType("glyph", "M0 0 <script>")],
  ["S9 513 characters", withType("glyph", "M".repeat(513))],
  ["S9 url", withType("glyph", "url(#a)")],
  ["S10 rank", withType("rank", 7)],
  ["S10 role", withType("role", "other")],
  ["S10 shape", withType("shape", "star")],
  ["S10 abbr", withType("abbr", "ABC")],
  ["S10 level", withType("level", -1)],
  ["S10 color", withType("color", "#".repeat(65))],
  ["S22", { nodes: [{ id: "a", _inferred: "yes" }] }],
  ["S25", { ...one, schemaVersion: "2" }],
  [
    "S33",
    {
      nodes: [
        { id: "a", type: "table" },
        { id: "b", type: "table" },
      ],
      edges: [{ subject: "a", predicate: "contains", object: "b" }],
      shape: { kind: "tree", children: "sub_items" },
    },
  ],
  [
    "S35",
    {
      nodes: [{ id: "a", label: 5 }],
      edges: [{ subject: "a", predicate: "has", object: "a", isActive: "yes" }],
      types: { t: { label: 1, zzz: 2 } },
      predicates: "x",
      defaults: "x",
      view: { approach: "x" },
      shape: { kind: "rows", subject: "from", object: "to", zzz: 1 },
    },
  ],
];

describe("S17 code schemas of STORY-001-02 use the catalog subsets", () => {
  const warnings = notices.codes.filter(
    (code) => notices.severity[code] === "warning",
  );
  const issueCodes = notices.codes.filter((code) =>
    ["warning", "fatal"].includes(notices.severity[code]),
  );

  it("warningEntrySchema accepts the 17 warning codes only", () => {
    expect(warnings).toHaveLength(17);
    for (const code of [...notices.codes, "no-such-code"])
      expect(
        warningEntrySchema.safeParse({ code, count: 1, ids: [] }).success,
        code,
      ).toBe(warnings.includes(code as (typeof warnings)[number]));
  });

  it("the issue entry schema accepts the 23 warning and fatal codes only", () => {
    expect(issueCodes).toHaveLength(23);
    for (const code of [...notices.codes, "no-such-code"])
      expect(issueSchema.safeParse({ code, path: [] }).success, code).toBe(
        issueCodes.includes(code as (typeof issueCodes)[number]),
      );
  });

  it.each(WARNING_INPUTS)(
    "parseRenderInput gives warning codes only (%s)",
    (_, input) => {
      const result = parseRenderInput(input);
      if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
      expect(result.issues.length).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(notices.codes).toContain(issue.code);
        expect(notices.severity[issue.code]).toBe("warning");
      }
    },
  );

  it("S33 gives the code whose text names the top-level shape hint", () => {
    const result = parseRenderInput(
      WARNING_INPUTS.find(([name]) => name === "S33")?.[1],
    );
    expect(result.ok && result.issues.map((issue) => issue.code)).toEqual([
      S33_CODE,
    ]);
  });

  it("S18 gives the fatal code not-a-graph", () => {
    const result = parseRenderInput({
      items: [{ name: "x" }],
      shape: { kind: "tree", children: "items" },
    });
    if (result.ok) throw new Error("expected a fatal code");
    expect(notices.codes).toContain(result.fatal.code);
    expect(notices.severity[result.fatal.code]).toBe("fatal");
    expect(result.fatal.code).toBe("not-a-graph");
  });

  it("S32 gives no code", () => {
    const leaf = { name: "c", items: [] };
    const result = parseRenderInput({
      name: "a",
      items: [{ name: "b", items: [leaf] }],
      shape: { kind: "tree", children: "items", label: "name" },
    });
    expect(result).toMatchObject({ ok: true, issues: [] });
  });
});
