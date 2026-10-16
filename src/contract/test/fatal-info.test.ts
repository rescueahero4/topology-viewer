import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fatalInfoSchema, notices, shapedKindSchema } from "../src/index";

const PLACEHOLDER = /\{(\w+)\}/g;
const LANGUAGES = ["en", "ja"] as const;
const TAG = /<[a-zA-Z/]/;

const topology = readFileSync(
  new URL("../../../.design-recall/mockups/lib/topology.js", import.meta.url),
  "utf8",
);
const kindOfLine =
  topology.split("\n").find((line) => line.includes("const kindOf =")) ?? "";

function fill(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, key: string) => values[key] ?? "—");
}

function names(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

describe("fatal-notice values", () => {
  it("S1 has the 7 got texts; the en texts are the mockup kindOf strings", () => {
    const tokens = [
      "array",
      "string",
      "number",
      "boolean",
      "null",
      "object",
      "missing",
    ];
    for (const language of LANGUAGES) {
      const texts = notices.got[language];
      expect(Object.keys(texts)).toEqual(tokens);
      for (const value of Object.values(texts)) {
        expect(value.length).toBeGreaterThan(0);
        expect(value).not.toMatch(TAG);
      }
    }
    expect(notices.got.en).toEqual({
      array: "a list",
      string: "text",
      number: "a number",
      boolean: "true/false",
      null: "null",
      object: "an object",
      missing: "nothing (the field is missing)",
    });
    expect(kindOfLine).not.toBe("");
    for (const value of Object.values(notices.got.en))
      expect(kindOfLine, value).toContain(`"${value}"`);
  });

  it("S2 has the 3 measure templates, each with the one placeholder count", () => {
    expect(notices.measure.en).toEqual({
      nodes: "{count} nodes",
      edges: "{count} edges",
      kb: "{count} KB",
    });
    expect(notices.measure.ja).toEqual({
      nodes: "{count} ノード",
      edges: "{count} エッジ",
      kb: "{count} KB",
    });
    for (const language of LANGUAGES)
      for (const template of Object.values(notices.measure[language]))
        expect(names(template)).toEqual(["count"]);
  });

  it("S3 fills the too-large and not-object bodies", () => {
    const measure = (language: "en" | "ja", count: string) =>
      fill(notices.measure[language].nodes, { count });
    for (const [language, text] of [
      [
        "en",
        "This result has 2,345 nodes, more than the limit of 2,000 nodes, so nothing is drawn.",
      ],
      [
        "ja",
        "この結果は 2,345 ノード で、上限の 2,000 ノード を超えているため、何も描画されません。",
      ],
    ] as const) {
      const body = notices[language]["too-large"].body;
      expect(
        fill(body, {
          got: measure(language, "2,345"),
          limit: measure(language, "2,000"),
        }),
      ).toBe(text);
    }
    expect(
      fill(notices.en["not-object"].body, { got: notices.got.en.array }),
    ).toBe(
      "The chart expects an object with a `nodes` list and an `edges` list, but received a list.",
    );
  });

  it("S4 has one option per fatal code with the placeholders of that code", () => {
    const fatal = notices.codes.filter(
      (code) => notices.severity[code] === "fatal",
    );
    const options = fatalInfoSchema.options.map((option) => {
      const { code, ...rest } = option.shape;
      return [code.value, Object.keys(rest).sort()] as const;
    });
    expect(options.map(([code]) => code).sort()).toEqual([...fatal].sort());
    for (const [code, keys] of options)
      expect(keys, code).toEqual([...notices.en[code].placeholders].sort());
  });

  it("S5 accepts the 4 valid values and rejects the 6 bad ones", () => {
    const good = [
      { code: "not-object", got: "array" },
      { code: "no-valid-nodes", rawNodes: 2 },
      {
        code: "too-large",
        got: { unit: "nodes", count: 2345 },
        limit: { unit: "nodes", count: 2000 },
      },
      { code: "not-a-graph" },
    ];
    const bad = [
      { code: "not-object", got: "a list" },
      { code: "not-object", got: "array", extra: 1 },
      { code: "no-id" },
      {
        code: "too-large",
        got: { unit: "MB", count: 1 },
        limit: { unit: "kb", count: 256 },
      },
      { code: "no-valid-nodes", rawNodes: -1 },
      { code: "no-valid-nodes", rawNodes: 1.5 },
    ];
    for (const value of good)
      expect(fatalInfoSchema.safeParse(value).success, value.code).toBe(true);
    for (const value of bad)
      expect(fatalInfoSchema.safeParse(value).success, value.code).toBe(false);
  });

  it("S44 has the 2 kind texts, and the shaped-from body takes them", () => {
    expect(notices.kind.en).toEqual({
      rows: "a list of flat rows",
      tree: "a nested object",
    });
    expect(notices.kind.ja).toEqual({
      rows: "フラットな行のリスト",
      tree: "ネストしたオブジェクト",
    });
    for (const language of LANGUAGES) {
      expect(Object.keys(notices.kind[language])).toEqual(
        shapedKindSchema.options,
      );
      for (const value of Object.values(notices.kind[language])) {
        expect(value).not.toMatch(TAG);
        expect(notices[language]["shaped-from"].ai).toContain(value);
      }
    }
    expect(
      fill(notices.en["shaped-from"].body, {
        kind: notices.kind.en.rows,
        count: "240",
      }),
    ).toBe(
      "The data arrived as a list of flat rows, not as nodes and edges. The chart made 240 relationship(s) from it and marks what it made as inferred.",
    );
  });
});
