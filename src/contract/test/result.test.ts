import { describe, expect, it } from "vitest";
import { structuredContentSchema, warningEntrySchema } from "../index";

describe("tool result", () => {
  it("S26 validates the counts and a warning entry and refuses an extra key", () => {
    const counts = {
      schemaVersion: "1",
      entities: 483,
      records: 525,
      relationships: 1204,
      root: "FCT_REVENUE",
      approach: "active",
      warningCount: 3,
    };
    expect(structuredContentSchema.safeParse(counts).success).toBe(true);
    expect(
      new TextEncoder().encode(JSON.stringify(counts)).length,
    ).toBeLessThanOrEqual(200);
    expect(
      warningEntrySchema.safeParse({ code: "no-id", count: 2, ids: [] })
        .success,
    ).toBe(true);
    expect(
      structuredContentSchema.safeParse({ ...counts, dataset: {} }).success,
    ).toBe(false);
  });
});
