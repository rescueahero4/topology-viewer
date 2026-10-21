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

  it("holds the lucide ISC notice", () => {
    expect(notice).toContain("lucide");
    expect(notice).toContain("ISC License");
    expect(block).toMatch(/^\/\/ Copyright \(c\) .*Lucide/m);
    expect(notice).toContain(
      "Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted",
    );
  });
});
