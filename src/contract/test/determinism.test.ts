import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseRenderInput } from "../src/index";

const vocabMeta = {
  title: "Metadata in other vocabularies",
  nodes: [
    { id: "ds", type: "data_source", label: "BigQuery · acme-dw" },
    {
      id: "tb",
      type: "table",
      label: "invoices",
      rto_hours: 4,
      attrs: {
        service_name: "bigquery",
        comment_on_ddl: "one row per issued invoice",
        steward_email: "mika.sato@acme.example",
      },
      _inferred: { display_name: "Named from the table and its schema" },
    },
    { id: "u", type: "steward", label: "Aiko Tanaka" },
  ],
  edges: [
    { source: "ds", target: "tb", predicate: "contains" },
    { source: "tb", target: "u", predicate: "hasSteward" },
  ],
  types: {
    steward: {
      label: "Steward",
      rank: 1,
      color: "#2f6f8f",
      glyph: "M3 12h18",
      role: "curation",
    },
  },
  fields: {
    rto_hours: {
      label: "Recovery time objective (hours)",
      why: "From the team's data contract naming",
    },
    steward_email: { slot: "owners", why: "An e-mail of the steward" },
  },
  view: { root: "tb", approach: "active", layout: "radial" },
  owner_team: "finance",
};

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("determinism", () => {
  it("S27 gives the same output, hash and key order for the same input", () => {
    const first = parseRenderInput(structuredClone(vocabMeta));
    const second = parseRenderInput(structuredClone(vocabMeta));
    expect(first).toEqual(second);
    expect(hash(first)).toBe(hash(second));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
