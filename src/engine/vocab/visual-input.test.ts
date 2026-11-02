import { parseRenderInput, profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, parseColor, type Hex } from "./colors";
import { resolveVocab, type Vocab } from "./resolve";
import type { Designed } from "./visual";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const HEX = /^#[0-9a-f]{6}$/;

function resolved(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return resolveVocab(result.graph, result.payload, profile, LIGHT);
}

function designed(vocab: Vocab, type: string): Designed {
  const visual = vocab.types.get(type)?.visual;
  if (visual === undefined || "icon" in visual)
    throw new Error(`no design for ${type}`);
  return visual;
}

const nodes = (...types: string[]) =>
  types.map((type, i) => ({ id: `n${i}`, type }));

describe("S9 colour inputs through visual", () => {
  const accepted: [string, string][] = [
    ["red", "#ff0000"],
    ["RED", "#ff0000"],
    ["rgb(1,2,3)", "#010203"],
    ["RGB(1,2,3)", "#010203"],
    ["rgba(1, 2, 3, 0.5)", "#010203"],
    ["rgb(1 2 3 / 50%)", "#010203"],
    ["rgb(100%, 0%, 50%)", "#ff0080"],
    ["rgb(1.4, 2.5, 3)", "#010303"],
    ["hsl(120, 50%, 40%)", "#339933"],
    ["hsl(120deg 50% 40%)", "#339933"],
    ["#ABC", "#aabbcc"],
    ["#11223344", "#112233"],
    ["abc", "#aabbcc"],
    ["grey", "#808080"],
  ];
  const rejected = [
    "url(#x)",
    "url(#a)",
    "#12345",
    "#gggggg",
    "transparent",
    "currentcolor",
    "oklch(0.5 0.1 200)",
    "var(--x)",
    "rgb(1,2",
    "rgb(256,0,0)",
    "rgb(1,2,3%)",
    "rgb(1,2,3 / 0.5",
    "hsl(361,200%,-5%)",
    "constructor",
    "__proto__",
    "toString",
    "a".repeat(64),
  ];
  const run = (colors: string[]) => {
    const types = Object.fromEntries(
      colors.map((color, i) => [`t${i}`, { color }]),
    );
    return resolved({ nodes: nodes(...Object.keys(types)), types });
  };
  const text = (value: unknown) =>
    JSON.stringify(value, (_key, item: unknown) =>
      item instanceof Map ? [...item] : item,
    );

  it("accepts the Q8 forms with colorIn from numbers", () => {
    const { vocab, issues } = run(accepted.map(([input]) => input));
    const visuals = accepted.map((_, i) => designed(vocab, `t${i}`));
    expect(visuals.map((v) => v.colorIn)).toEqual(
      accepted.map(([, hex]) => hex),
    );
    for (const v of visuals)
      for (const hex of [v.color, v.colorIn, v.ink]) expect(hex).toMatch(HEX);
    expect(issues.filter((i) => i.code === "color-rejected")).toEqual([]);
  });

  it("rejects every other form with code and path only", () => {
    const result = run(rejected);
    const found = result.issues.filter((i) => i.code === "color-rejected");
    expect(found).toStrictEqual(
      rejected.map((_, i) => ({
        code: "color-rejected",
        path: ["types", `t${i}`, "color"],
      })),
    );
    rejected.forEach((input, i) => {
      const v = designed(result.vocab, `t${i}`);
      expect(v).not.toHaveProperty("colorIn");
      expect(v.adjusted).toBe(false);
      expect(v.color).toMatch(HEX);
      expect(text(result)).not.toContain(input);
    });
  });

  it("refuses 65 characters before parsing", () => {
    expect(parseColor("a".repeat(65))).toBeNull();
    expect(parseColor(` ${"#abc".padEnd(63, " ")}`)).toEqual([170, 187, 204]);
  });
});

describe("S14 marks from untrusted labels", () => {
  it("keeps letters only", () => {
    const labels = ["顧客", "Ölfeld", "<img onerror>", "‮abc", "éclair"];
    const types = Object.fromEntries(
      labels.map((label, i) => [`t${i}`, { label }]),
    );
    const { vocab } = resolved({ nodes: nodes(...Object.keys(types)), types });
    const marks = Object.keys(types).map(
      (type) => designed(vocab, type).letters,
    );
    expect(marks).toEqual(["顧", "ÖL", "IO", "AB", "EC"]);
    for (const mark of marks)
      expect(mark).not.toMatch(/[<>&"\p{Cc}\p{M}‪-‮⁦-⁩]/u);
  });
});

describe("S15 declared abbr through the contract", () => {
  it("keeps PR, drops ABCD and keeps the letters of é1", () => {
    const input = {
      nodes: nodes("a", "process", "b", "c"),
      types: { a: { abbr: "PR" }, b: { abbr: "ABCD" }, c: { abbr: "é1" } },
    };
    const contract = parseRenderInput(input);
    expect(contract.ok && contract.issues).toEqual([
      { code: "glyph-rejected", path: ["types", "b", "abbr"] },
    ]);
    const { vocab } = resolved(input);
    expect(designed(vocab, "a").letters).toBe("PR");
    expect(designed(vocab, "process").letters).not.toBe("PR");
    expect(designed(vocab, "b").letters).toBe("BA");
    expect(designed(vocab, "c").letters).toBe("É");
  });
});

describe("S16 s-mixed-designed", () => {
  it("gives icons to the QDIC types and follows the payload for the others", () => {
    const { input } = loadFixture("s-mixed-designed");
    const data = structuredClone(input) as { types: Record<string, object> };
    data.types.table = { color: "#ff0000" };
    const { vocab } = resolved(data);
    expect(vocab.types.get("table")?.visual).toStrictEqual({ icon: "table" });
    expect(vocab.types.get("user")?.visual).toStrictEqual({ icon: "user" });
    expect(designed(vocab, "ml_model")).toMatchObject({
      shape: "diamond",
      letters: "ML",
    });
    expect(designed(vocab, "endpoint").glyph).toBeDefined();
  });
});

describe("S17 s-extend", () => {
  it("uses the profile values, then the payload glyph", () => {
    const { input } = loadFixture("s-extend");
    const before = resolved(input).vocab;
    expect(designed(before, "keyword")).toMatchObject({
      rank: 0,
      letters: "KY",
      color: "#37815c",
    });
    expect(designed(before, "bk")).toMatchObject({
      rank: 0,
      letters: "BK",
      color: "#688137",
    });
    const data = {
      ...(input as object),
      types: { keyword: { glyph: "M3 12h18" } },
    };
    const after = resolved(data).vocab;
    expect(designed(after, "keyword")).toMatchObject({
      glyph: "M3 12h18",
      color: "#37815c",
    });
    expect(designed(after, "keyword")).not.toHaveProperty("letters");
  });
});

describe("mixed visual inputs", () => {
  it("reads rank and shape together", () => {
    const { vocab } = resolved({
      nodes: nodes("a", "b", "c"),
      types: {
        a: { shape: "diamond" },
        b: { rank: 3, shape: "diamond" },
        c: { rank: 6 },
      },
    });
    expect(designed(vocab, "a")).toMatchObject({
      rank: 2,
      shape: "diamond",
      size: 32,
    });
    expect(designed(vocab, "b")).toMatchObject({
      rank: 3,
      shape: "pentagon",
      size: 38,
    });
    expect(designed(vocab, "c")).toMatchObject({
      rank: 6,
      shape: "octagon",
      size: 56,
    });
  });

  it("keeps the profile colour of an icon-less type when the payload colour is rejected", () => {
    const { vocab, issues } = resolved({
      nodes: nodes("keyword"),
      types: { keyword: { color: "url(#k)" } },
    });
    expect(designed(vocab, "keyword")).toMatchObject({
      color: "#37815c",
      colorIn: "#37815c",
    });
    expect(issues).toEqual([
      { code: "color-rejected", path: ["types", "keyword", "color"] },
    ]);
  });

  it("gives entities with no type one rank-0 circle with no mark", () => {
    const { vocab } = resolved({
      nodes: [{ id: "x" }, { id: "y" }, { id: "z", type: "q" }],
    });
    expect(vocab.untyped).toMatchObject({
      rank: 0,
      shape: "circle",
      size: 20,
      adjusted: false,
    });
    expect(vocab.untyped).not.toHaveProperty("letters");
    expect(designed(vocab, "q").color).not.toBe(vocab.untyped?.color);
    expect(
      resolved({ nodes: [{ id: "a", type: "q" }] }).vocab.untyped,
    ).toBeNull();
  });

  it("reads an own types.constructor entry and nothing from the prototype", () => {
    const types: unknown = JSON.parse(
      '{ "constructor": { "rank": 3, "abbr": "CX" } }',
    );
    const { vocab } = resolved({
      nodes: nodes("constructor", "toString"),
      types,
    });
    expect(designed(vocab, "constructor")).toMatchObject({
      rank: 3,
      letters: "CX",
    });
    expect(vocab.types.get("constructor")?.declared).toBe(true);
    expect(designed(vocab, "toString")).toMatchObject({
      rank: 0,
      letters: "TS",
    });
    expect(vocab.types.get("toString")?.declared).toBe(false);
  });
});
