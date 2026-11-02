import { profile } from "#contract";
import { describe, expect, it } from "vitest";
import { canvasColor, normalize, resolveVocab, type Hex } from "../index";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function typesOf(input: unknown) {
  const result = normalize(input, { now: "2026-10-20" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return resolveVocab(result.graph, result.payload, profile, LIGHT).vocab.types;
}

const nodes = [
  { id: "t", type: "table" },
  { id: "c", type: "column" },
  { id: "k", type: "kiln" },
  { id: "m", type: "mould" },
];

// why: ISSUE-012 C11 (SA §4.4 cascade, supplied → system) — the flag tells the shell that the
// label is model text, also for a profile type
describe("ResolvedType.labelSupplied", () => {
  it("is set only for a type whose payload entry gives a label", () => {
    const types = typesOf({
      nodes,
      edges: [],
      types: {
        table: { label: "Tabelle" },
        kiln: { label: "Kiln" },
        mould: {},
      },
    });
    expect(types.get("table")).toMatchObject({
      label: "Tabelle",
      labelSupplied: true,
    });
    expect(types.get("kiln")).toMatchObject({
      label: "Kiln",
      labelSupplied: true,
    });
    expect(types.get("column")?.labelSupplied).toBeUndefined();
    expect(types.get("mould")?.labelSupplied).toBeUndefined();
    expect(types.get("mould")?.label).toBe("Mould");
  });

  it("is not set for a rejected label", () => {
    const types = typesOf({ nodes, edges: [], types: { table: { label: 7 } } });
    expect(types.get("table")?.labelSupplied).toBeUndefined();
  });
});
