import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(import.meta.dirname, "icons.ts"), "utf8");
// why: S26 — the comment block that comes before the first code line, as one text
const block = source.slice(0, source.indexOf("\nconst "));
const notice = block
  .split("\n")
  .map((line) => line.replace(/^\/\/ ?/, ""))
  .join(" ")
  .replace(/\s+/g, " ");

describe("S26 the lucide notice in icons.ts (owner decision H7)", () => {
  it("is one // why: comment block", () => {
    expect(block.startsWith("// why:")).toBe(true);
    for (const line of block.split("\n")) expect(line).toMatch(/^\/\//);
  });

  // why: Security Done gate 2026-10-21 — the icons of this file that the lucide-static 1.60.0
  // LICENSE lists as derived from Feather (MIT)
  it("names each Feather icon of the file", () => {
    const feather = [
      "alert-triangle",
      "arrow-right",
      "chevron-down",
      "chevron-up",
      "chevrons-down",
      "chevrons-up",
      "info",
      "layout",
      "maximize",
      "minimize",
      "search",
      "upload",
      "x",
    ];
    const list = notice.slice(
      notice.indexOf("The icons ") + "The icons ".length,
      notice.indexOf(" come from Feather"),
    );
    expect(list.split(/, | and /)).toEqual(feather);
    for (const name of feather)
      expect(source).toMatch(new RegExp(`^  "?${name}"?: \\[`, "m"));
  });

  it("holds the lucide ISC notice", () => {
    expect(notice).toContain("lucide");
    expect(notice).toContain("ISC License");
    expect(block).toMatch(/^\/\/ Copyright \(c\) .*Lucide/m);
    expect(notice).toContain(
      "Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted",
    );
  });
});
