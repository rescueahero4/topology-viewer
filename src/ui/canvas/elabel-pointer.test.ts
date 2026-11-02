import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cssRules } from "../cssRules";

const rules = cssRules(
  readFileSync(path.resolve(import.meta.dirname, "../tokens.css"), "utf8"),
);
const decls = (selector: string) =>
  rules
    .filter((rule) => rule.selectors.includes(selector))
    .flatMap((rule) => rule.decls)
    .filter((decl) => decl.property === "pointer-events")
    .map((decl) => decl.value);

describe("S1 the relation pills let the pointer pass through (H18)", () => {
  it("has exactly one rule [.qt-elabel] { pointer-events: none }", () => {
    const own = rules.filter(
      (rule) =>
        rule.selectors.length === 1 && rule.selectors[0] === ".qt-elabel",
    );
    expect(own).toEqual([
      {
        selectors: [".qt-elabel"],
        at: null,
        decls: [{ property: "pointer-events", value: "none" }],
      },
    ]);
  });

  it("keeps the pointer rules of the edge hit paths and the bubbles", () => {
    expect(decls(".qt-ehit")).toEqual(["stroke"]);
    expect(decls(".qt-bubble circle")).toEqual(["visiblePainted"]);
  });

  it("gives no rule that selects .qt-blabel a pointer-events declaration", () => {
    const blabel = rules.filter((rule) =>
      rule.selectors.some((selector) => /\.qt-blabel\b/.test(selector)),
    );
    expect(blabel.length).toBeGreaterThan(0);
    for (const rule of blabel)
      expect(rule.decls.map((decl) => decl.property)).not.toContain(
        "pointer-events",
      );
  });
});
