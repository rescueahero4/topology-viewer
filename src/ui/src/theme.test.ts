import { describe, expect, it } from "vitest";
import { DARK_MODE, effectiveTheme } from "./theme";

describe("STORY-007-01 S5 — the dark-mode switch", () => {
  it("is off as built", () => {
    expect(DARK_MODE).toBe(false);
  });

  it.each([["dark"], ["light"], [undefined], [null], ["sepia"], [1], [{}]])(
    "gives light for %j",
    (requested) => {
      expect(effectiveTheme(requested)).toBe("light");
    },
  );
});
