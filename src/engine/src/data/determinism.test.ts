import { datasets, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";

const NOW = { now: "2026-10-14" };

describe("S28 same input, same result", () => {
  it.each([
    ["s-vocab-meta", () => loadFixture("s-vocab-meta").input],
    ["catalog", () => structuredClone(datasets.catalog.graph)],
  ])("%s", (_key, input) => {
    const first = normalize(input(), NOW);
    const second = normalize(input(), NOW);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(first.ok && second.ok && second.hash === first.hash).toBe(true);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
