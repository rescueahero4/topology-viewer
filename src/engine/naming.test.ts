import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// why: SA §5 and guardrail 11 (P20) — one word, one meaning for the drawn states (S-C6)
const WORDS = /\b(visible|invisible|removed)\b/gi;

const sources = readdirSync(import.meta.dirname, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

describe("S29 state words", () => {
  it("finds the control word", () => {
    expect("const visible = 1".match(WORDS)).toHaveLength(1);
  });

  it.each(sources)("%s uses none of the banned words", (file) => {
    const text = readFileSync(join(import.meta.dirname, file), "utf8");
    expect(text.match(WORDS)).toBeNull();
  });
});
