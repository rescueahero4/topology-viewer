import { notices, type Expect } from "#contract";
import { fixtures, loadFixture, producers } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";

const NOW = { now: "2026-10-14" };
const PASSIVE = { approach: "passive", selected: null };
const CASES = producers.map((entry, index) => [index + 1, entry] as const);

// why: SA v0.12 §4.2 — the 23 codes, each with its producer; a string is a corpus fixture and a
// number is the case number of a `producers` entry (index + 1)
const PRODUCERS: Record<string, string | number> = {
  "no-id": "s-noid-some",
  "duplicate-id": "s-dirty",
  "dangling-edge": "s-dirty",
  "unknown-type": "s-undeclared",
  "constraint-violation": "s-chain",
  "glyph-rejected": 2,
  "color-rejected": 3,
  "rank-rejected": 4,
  "layout-rejected": 5,
  "budget-rejected": 6,
  "schema-version-unknown": 7,
  "inferred-rejected": 8,
  "unknown-key": 9,
  "root-not-found": "s-badroot",
  "reveal-not-found": 10,
  "shaped-from": 14,
  "field-rejected": 11,
  "not-object": "s-not-graph",
  "nodes-not-array": "s-invalid",
  "edges-not-array": 12,
  "no-valid-nodes": "s-noid-all",
  "too-large": "s-stress",
  "not-a-graph": 13,
};

// why: these codes are checked in the engine result by the story that produces them
const CHECKED_LATER: Record<string, string> = {
  "unknown-type": "STORY-002-03 S30 (vocab/resolve)",
};

function produced(result: Normalized): string[] {
  if (!result.ok) return [result.fatal.code];
  return result.warnings.map((warning) => warning.code);
}

function named(outcome: Expect): string[] {
  return [
    outcome.schema,
    outcome.notice ?? "",
    ...Object.keys(outcome.warnings),
  ];
}

describe("T8 the in-test code cases", () => {
  it("has the 14 producers", () => {
    expect(producers).toHaveLength(14);
  });

  it.each(CASES)("case %s", (_number, { code, input, expect: outcome }) => {
    expect(named(outcome)).toContain(code);
    const result = normalize(input, NOW);
    if (outcome.schema !== "pass") {
      expect(!result.ok && result.fatal.code).toBe(outcome.schema);
      return;
    }
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const counts = Object.fromEntries(
      result.warnings.map((w) => [w.code, w.count]),
    );
    expect(counts).toEqual(outcome.warnings);
  });
});

describe("S37 the code cases are synthetic", () => {
  it.each(CASES)("case %s", (_number, { input }) => {
    const ids = [
      ...((input.nodes as Record<string, string>[] | undefined) ?? []).flatMap(
        (node) =>
          [node.id, node.from, node.to].filter((id) => id !== undefined),
      ),
      ...(Array.isArray(input.edges)
        ? (input.edges as Record<string, string>[])
        : []
      ).flatMap((edge) => [edge.subject, edge.object]),
    ];
    for (const id of ids) expect(id).toMatch(/^[a-z]+[0-9.]*$/);
    const text = JSON.stringify(input);
    expect(text).not.toContain("@");
    expect(text).not.toContain("://");
  });
});

describe("S38 each of the 23 codes has a producer", () => {
  it("lists every warning and fatal code of the catalog", () => {
    const issueCodes = notices.codes.filter((code) =>
      ["warning", "fatal"].includes(notices.severity[code]),
    );
    expect(Object.keys(PRODUCERS).sort()).toEqual([...issueCodes].sort());
    expect(Object.keys(PRODUCERS)).toHaveLength(23);
  });

  it.each(Object.entries(PRODUCERS))("%s ← %s", (code, producer) => {
    if (typeof producer === "number" && producers[producer - 1] === undefined) {
      expect(CHECKED_LATER[code]).toBeDefined();
      return;
    }
    const { input, expect: outcome } =
      typeof producer === "number"
        ? producers[producer - 1]
        : loadFixture(producer);
    if (typeof producer === "string")
      expect(Object.hasOwn(fixtures, producer)).toBe(true);
    expect(named(outcome)).toContain(code);
    if (Object.hasOwn(CHECKED_LATER, code)) return;
    expect(produced(normalize(input, NOW))).toContain(code);
  });

  it("checks 22 codes in the engine result now", () => {
    expect(
      Object.keys(PRODUCERS).length - Object.keys(CHECKED_LATER).length,
    ).toBe(22);
  });
});

describe("S26 case 14 of STORY-002-02", () => {
  it("gives shaped-from with count 1 in the result and the record", () => {
    const { input, expect: outcome } = producers[13];
    const result = normalize(input, NOW);
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    expect(result.warnings).toEqual([
      { code: "shaped-from", count: 1, ids: ["shape"] },
    ]);
    expect(outcome.warnings).toEqual({ "shaped-from": 1 });
    expect(Object.hasOwn(outcome.warnings, "unknown-type")).toBe(false);
    expect(outcome.firstPaint).toEqual(PASSIVE);
  });
});
