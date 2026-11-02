import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { canvasColor, normalize, resolveVocab, type Hex } from "../index";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-20" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, issues } = result;
  const run = () => resolveVocab(graph, payload, profile, LIGHT).vocab;
  return { vocab: run(), run, issues };
}

const rows = (nodeTypes: unknown[]) => ({
  nodes: [{ id: "a", type: "k" }],
  edges: [],
  vocabulary: { nodeTypes },
});

describe("S12 q-spec-scenarios", () => {
  it("gives the vocabulary description of a supplied type and none for a profile type", () => {
    const { vocab } = load(loadFixture("q-spec-scenarios").input);
    expect(vocab.types.get("steward")?.description).toBe(
      "A person designated as accountable for a data asset.",
    );
    expect(vocab.types.get("classification")?.description).toBe(
      "Classification (e.g. PII)",
    );
    expect(vocab.types.get("table")).toBeDefined();
    expect(vocab.types.get("table")?.description).toBeUndefined();
  });
});

describe("S13 in-test vocabulary rows", () => {
  it("takes the first row of a name", () => {
    const { vocab } = load(
      rows([
        { name: "k", description: "A" },
        { name: "k", description: "B" },
      ]),
    );
    expect(vocab.types.get("k")?.description).toBe("A");
  });

  it("gives no description for an empty string", () => {
    const { vocab } = load(rows([{ name: "k", description: "" }]));
    expect(vocab.types.get("k")).toBeDefined();
    expect(vocab.types.get("k")?.description).toBeUndefined();
  });

  it("gives no description and one field-rejected issue for a number", () => {
    const { vocab, issues } = load(rows([{ name: "k", description: 7 }]));
    expect(vocab.types.get("k")?.description).toBeUndefined();
    expect(
      issues.filter(
        (issue) =>
          issue.code === "field-rejected" &&
          issue.path.join(".") === "vocabulary.nodeTypes.0.description",
      ),
    ).toHaveLength(1);
  });

  it("keeps a description of 100,000 characters as it is, on each call", () => {
    const text = "d".repeat(99_999) + "é";
    const { vocab, run } = load(rows([{ name: "k", description: text }]));
    const description = vocab.types.get("k")?.description;
    expect(description?.length).toBe(100_000);
    expect(description === text).toBe(true);
    expect(run().types.get("k")?.description).toBe(description);
  });
});
