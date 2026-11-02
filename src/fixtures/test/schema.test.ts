import { checkCounts, parseRenderInput } from "#contract";
import { describe, expect, it } from "vitest";
import { fixtures, loadFixture } from "..";
import { edgesOf, nodesOf } from "./payload";

const all = Object.keys(fixtures);
const passing = all.filter((key) => fixtures[key].expect.schema === "pass");
const failing = all.filter((key) => fixtures[key].expect.schema !== "pass");

describe("S3 a fixture that expects pass is accepted by the schema", () => {
  it.each(passing)("%s", (key) => {
    expect(parseRenderInput(loadFixture(key).input).ok).toBe(true);
  });

  it.each(["q-spec-scenarios", "q-full-vocabulary"])(
    "%s has no field issue",
    (key) => {
      const result = parseRenderInput(loadFixture(key).input);
      expect(result.ok && result.issues).toEqual([]);
    },
  );
});

describe("S4 a fixture that expects a fatal code is rejected with that code", () => {
  it.each(failing)("%s", (key) => {
    const { input, expect: outcome } = loadFixture(key);
    const result = parseRenderInput(input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fatal.code).toBe(outcome.schema);
  });

  it("s-invalid gives nodes-not-array and s-not-graph gives not-object", () => {
    const invalid = parseRenderInput(loadFixture("s-invalid").input);
    const notGraph = parseRenderInput(loadFixture("s-not-graph").input);
    expect(!invalid.ok && invalid.fatal.code).toBe("nodes-not-array");
    expect(!notGraph.ok && notGraph.fatal.code).toBe("not-object");
  });
});

describe("S5 s-stress is above the caps", () => {
  const { input, expect: outcome } = loadFixture("s-stress");

  it("has 5,462 nodes and the count check gives the declared verdict", () => {
    const nodes = nodesOf(input).length;
    expect(nodes).toBe(5462);
    expect(checkCounts(nodes, edgesOf(input).length)?.code).toBe(
      outcome.schema,
    );
    expect(outcome.schema).toBe("too-large");
  });
});
