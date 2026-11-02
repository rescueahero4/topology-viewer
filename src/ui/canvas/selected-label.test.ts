import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.resolve(import.meta.dirname, "../tokens.css"),
  "utf8",
);

describe("ISSUE-011 the .qt-selected rule of tokens.css", () => {
  it("keeps the empty rule on the node as a whole rule at a line start", () => {
    // why: LEARNINGS 37 — a longer selector with the same end must not match
    expect(`\n${css}`).toContain("\n.qt-root .qt-node.qt-selected {\n}");
  });

  it("has no rule with the class qt-selected that sets display", () => {
    const rules = [
      ...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ];
    const selected = rules.filter(([, selectors]) =>
      selectors.split(",").some((s) => /\.qt-selected(?![a-z0-9-])/.test(s)),
    );
    expect(selected.length).toBeGreaterThan(0);
    expect(
      selected
        .filter(([, , body]) => /(^|[;{\s])display\s*:/.test(body))
        .map(([rule]) => rule.trim()),
    ).toEqual([]);
  });
});
