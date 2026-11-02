import { describe, expect, it } from "vitest";
import { copyMessage } from "./notices";
import { normalize } from "./normalize";

const NOW = { now: "2026-10-23" };

// why: SA §4.1 — level 0 is the input object; `top` is the level of the slot that holds the value
const deep = (top: number, level: number) =>
  JSON.parse(
    `${'{"a":'.repeat(level - top + 1)}1${"}".repeat(level - top + 1)}`,
  ) as unknown;

const PLACES: [string, (level: number) => unknown][] = [
  [
    "node attrs",
    (level) => ({ nodes: [{ id: "a", type: "t", attrs: deep(3, level) }] }),
  ],
  [
    "vocabulary",
    (level) => ({ nodes: [{ id: "a" }], vocabulary: { x: deep(2, level) } }),
  ],
];

const FATAL = {
  code: "too-large",
  path: [],
  info: {
    code: "too-large",
    got: { unit: "levels", count: 257 },
    limit: { unit: "levels", count: 256 },
  },
};

describe("S21 normalize stops a value deeper than 256 levels", () => {
  it.each(PLACES)("%s at level 256 renders", (_place, input) => {
    expect(normalize(input(256), NOW).ok).toBe(true);
  });

  it.each(PLACES)("%s at level 257 is fatal too-large", (_place, input) => {
    expect(normalize(input(257), NOW)).toStrictEqual({
      ok: false,
      fatal: FATAL,
    });
  });

  it("gives the same copy text as the server tool error", () => {
    const result = normalize(PLACES[0][1](257), NOW);
    const info = result.ok ? {} : (result.fatal as typeof FATAL).info;
    expect(copyMessage("too-large", info, "en", "too-large")).toBe(
      "The topology chart couldn't show your last result: This result is too large to draw.\nThis result has 257 levels of nesting, more than the limit of 256 levels of nesting, so nothing is drawn.\nHow to fix it: Send at most 2,000 nodes, 4,000 edges and 8 MB of JSON in one call. Send a smaller result: filter it to the part that answers the question, or send the most relevant part first.\nDetails: too-large",
    );
    const ja = copyMessage("too-large", info, "ja", "too-large");
    expect(ja).toContain("257 階層のネスト");
    expect(ja).toContain("256 階層のネスト");
  });
});
