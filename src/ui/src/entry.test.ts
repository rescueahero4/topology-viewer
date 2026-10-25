import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as entry from "./index";
import type { AppInput, AppProps, ShellHost } from "./index";

const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "..", "package.json"), "utf8"),
) as { exports: Record<string, string> };

// why: S28 — `tsc -b` checks that the entry gives the three types
type Entry = [AppInput, AppProps, ShellHost];

describe("S28 the package entry", () => {
  it("has the . export next to the delivered ./canvas export", () => {
    expect(manifest.exports).toEqual({
      ".": "./src/index.ts",
      "./canvas": "./src/canvas/index.ts",
      "./testFrame": "./src/testFrame.ts",
    });
  });

  // why: STORY-006-04 rule 2 — the widget host applies the link check `linkOf` again;
  // STORY-007-01 rule 1 — the widget takes the dark-mode switch from the entry
  it("gives the values App, DARK_MODE, effectiveTheme, langOf, linkOf, t, formatted, Menu, MenuItem and UiIcon", () => {
    expect(Object.keys(entry).sort()).toEqual([
      "App",
      "DARK_MODE",
      "Menu",
      "MenuItem",
      "UiIcon",
      "effectiveTheme",
      "formatted",
      "langOf",
      "linkOf",
      "t",
    ]);
    expect(typeof entry.App).toBe("function");
    expect(entry.langOf("ja-JP")).toBe("ja");
    const types: Entry | null = null;
    expect(types).toBeNull();
  });
});
