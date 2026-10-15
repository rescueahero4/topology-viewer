import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInputJsonSchema, renderInputSchema } from "../src/index";

const snapshotFile = join(
  import.meta.dirname,
  "__snapshots__",
  "render-input.schema.json",
);

describe("JSON Schema export", () => {
  it("S20 equals the committed snapshot and covers the top-level keys", () => {
    const generated = z.toJSONSchema(renderInputSchema, {
      target: "draft-2020-12",
    });
    const snapshot: unknown = JSON.parse(readFileSync(snapshotFile, "utf8"));
    expect(renderInputJsonSchema).toEqual(generated);
    expect(generated).toEqual(snapshot);
    expect(generated.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    const keys = Object.keys(generated.properties ?? {});
    for (const key of [
      "schemaVersion",
      "nodes",
      "edges",
      "defaults",
      "types",
      "predicates",
      "fields",
      "vocabulary",
      "view",
      "shape",
    ]) {
      expect(keys).toContain(key);
    }
    expect(keys).not.toContain("title");
  });
});
