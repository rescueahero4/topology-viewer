import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";

const NOW = { now: "2026-10-14" };
const TYPES = { t0: { label: "T0", rank: 0 } };

function okOf(result: Normalized) {
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const run = (input: unknown, now = NOW) => okOf(normalize(input, now));

// why: built in a loop; the attrs object is level 1, so `depth` counts every object level
function deepObjects(depth: number): Record<string, unknown> {
  let inner: unknown = "x";
  for (let level = 2; level < depth; level++) inner = { a: inner };
  return { a: depth > 1 ? { a: inner } : inner, b: 1 };
}

function deepArrays(depth: number): Record<string, unknown> {
  let inner: unknown = "x";
  for (let level = 2; level <= depth; level++) inner = [inner];
  return { a: inner, b: 1 };
}

function depthOf(value: unknown): number {
  let deepest = 0;
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [item, level] = stack.pop() as [unknown, number];
    if (typeof item !== "object" || item === null) continue;
    deepest = Math.max(deepest, level);
    for (const child of Object.values(item)) stack.push([child, level + 1]);
  }
  return deepest;
}

describe("S42 the depth guard", () => {
  it("builds the test values at the given depth", () => {
    expect(depthOf(deepObjects(64))).toBe(64);
    expect(depthOf(deepObjects(65))).toBe(65);
    expect(depthOf(deepArrays(65))).toBe(65);
  });

  it("keeps a value of 64 levels", () => {
    const result = run({
      types: TYPES,
      nodes: [{ id: "n0", type: "t0", attrs: deepObjects(64) }],
    });
    expect(Object.hasOwn(result.graph.records[0].attrs, "a")).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it.each([
    ["objects", 65, deepObjects],
    ["objects", 10000, deepObjects],
    ["arrays", 65, deepArrays],
    ["arrays", 10000, deepArrays],
  ])(
    "drops nested %s of %i levels with field-rejected",
    (_kind, depth, build) => {
      const result = run({
        types: TYPES,
        nodes: [{ id: "n0", type: "t0", attrs: build(depth) }],
      });
      const attrs = result.graph.records[0].attrs;
      expect(Object.keys(attrs)).toEqual(["b"]);
      expect(result.issues).toEqual([
        { code: "field-rejected", path: ["nodes", 0, "attrs"] },
      ]);
    },
  );

  it("drops it from a compact node at the tuple path", () => {
    const result = run({
      types: TYPES,
      nodes: [["n0", "t0", "L0", deepObjects(10000)]],
    });
    expect(Object.keys(result.graph.records[0].attrs)).toEqual(["b"]);
    expect(result.issues).toEqual([
      { code: "field-rejected", path: ["nodes", 0, 3] },
    ]);
  });

  it("drops an unknown edge key that moves into the triple attrs", () => {
    const deep = deepObjects(10000).a;
    const result = run({
      types: TYPES,
      nodes: [
        { id: "n0", type: "t0" },
        { id: "n1", type: "t0" },
      ],
      edges: [{ subject: "n0", predicate: "p0", object: "n1", w: deep }],
    });
    expect(result.graph.triples).toHaveLength(1);
    expect(Object.hasOwn(result.graph.triples[0].attrs, "w")).toBe(false);
    expect(result.issues).toEqual([
      { code: "field-rejected", path: ["edges", 0, "attrs"] },
    ]);
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/RangeError|at |\.ts:/);
  });

  it("does not measure a node with no id", () => {
    const result = normalize({ nodes: [{ attrs: deepObjects(10000) }] }, NOW);
    expect(result).toStrictEqual({
      ok: false,
      fatal: {
        code: "no-valid-nodes",
        path: ["nodes"],
        info: { code: "no-valid-nodes", rawNodes: 1 },
      },
    });
  });
});

describe("S43 compact records that the contract changed", () => {
  it("keeps, falls back and skips as the contract says", () => {
    const result = run({
      nodes: [
        ["n0"],
        ["n1", undefined, "L1"],
        ["n2", null],
        ["n3", "t0", "L3", {}, "x"],
      ],
      edges: [
        ["n0", 1, "n1"],
        ["n0", "p0", "n1", {}, "x"],
        ["n0", "p0", "n1"],
      ],
    });
    const [n0, n1, n2] = result.graph.records;
    expect(n0.label).toBe("n0");
    expect(Object.hasOwn(n1, "type")).toBe(false);
    expect(n1.label).toBe("L1");
    expect(n2.id).toBe("n2");
    expect(Object.hasOwn(n2, "type")).toBe(false);
    expect(result.graph.records).toHaveLength(3);
    expect(result.warnings).toEqual([
      { code: "no-id", count: 1, ids: ["3"] },
      { code: "dangling-edge", count: 2, ids: ["0", "1"] },
      { code: "field-rejected", count: 1, ids: ["1"] },
    ]);
    expect(result.issues).toContainEqual({
      code: "field-rejected",
      path: ["nodes", 2, 1],
    });
    expect(result.graph.triples.map((t) => t.key)).toEqual([
      '["n0","p0","n1"]',
    ]);
  });
});

describe("S44 the size of issues", () => {
  it("stays one issue per field and bounds the ids", () => {
    const nodes = Array.from({ length: 2000 }, (_, k) => ({
      id: `n${k}`,
      type: "t0",
      label: 5,
      _inferred: "x",
    }));
    const result = run({ types: TYPES, nodes });
    expect(result.issues).toHaveLength(4000);
    expect(result.warnings.map((w) => [w.code, w.count])).toEqual([
      ["inferred-rejected", 2000],
      ["field-rejected", 2000],
    ]);
    for (const entry of result.warnings) {
      expect(entry.ids).toHaveLength(5);
      expect(entry.ids.every((id) => id.length <= 64)).toBe(true);
    }
  });
});

describe("S47 attrs._inferred", () => {
  it("reads the reason of s-vocab-meta node tb", () => {
    const result = run(loadFixture("s-vocab-meta").input);
    const tb = result.graph.records.find((r) => r.id === "tb");
    expect(tb?.inferred).toEqual({
      display_name: "Named from the table and its schema",
    });
    expect(Object.hasOwn(tb?.attrs ?? {}, "_inferred")).toBe(false);
    expect(result.issues.map((i) => i.code)).not.toContain("inferred-rejected");
  });

  it("rejects a bad value and prefers the node-level value", () => {
    const result = run({
      types: TYPES,
      nodes: [
        { id: "n0", type: "t0", attrs: { _inferred: "yes" } },
        { id: "n1", type: "t0", attrs: { _inferred: { label: 5 } } },
        {
          id: "n2",
          type: "t0",
          _inferred: { label: "from the node" },
          attrs: { _inferred: { label: "from attrs" } },
        },
      ],
    });
    expect(result.issues).toEqual([
      { code: "inferred-rejected", path: ["nodes", 0, "attrs", "_inferred"] },
      { code: "inferred-rejected", path: ["nodes", 1, "attrs", "_inferred"] },
    ]);
    const [n0, n1, n2] = result.graph.records;
    expect(n0.inferred).toEqual({});
    expect(n1.inferred).toEqual({});
    expect(n2.inferred).toEqual({ label: "from the node" });
    for (const record of [n0, n1, n2])
      expect(Object.hasOwn(record.attrs, "_inferred")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("yes");
  });

  it("gives a null-prototype record with no __proto__ key", () => {
    const X: unknown = JSON.parse('{"__proto__":"p","constructor":"c"}');
    const result = run({
      types: TYPES,
      nodes: [{ id: "n3", type: "t0", attrs: { _inferred: X } }],
    });
    const { inferred } = result.graph.records[0];
    expect(Object.getPrototypeOf(inferred)).toBeNull();
    expect(Object.hasOwn(inferred, "constructor")).toBe(true);
    expect(inferred.constructor).toBe("c");
    expect(Object.hasOwn(inferred, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(result.issues).toEqual([]);
  });
});

describe("S48 payload", () => {
  const a = {
    types: { t0: { label: "A" } },
    nodes: [{ id: "n0", type: "t0" }],
    view: { budget: 10 },
  };
  const b = {
    types: { t0: { label: "B" } },
    nodes: [{ id: "n0", type: "t0" }],
    view: { budget: 20 },
    fields: { x: { slot: "owners" } },
    vocabulary: { nodeTypes: [{ name: "t0", is_system: false }] },
    title: "t",
  };

  it("holds the parsed payload keys only, outside graph and hash", () => {
    const first = run(a);
    const second = run(b);
    expect(first.payload).toStrictEqual({
      types: { t0: { label: "A" } },
      view: { budget: 10 },
    });
    expect(second.payload).toStrictEqual({
      types: { t0: { label: "B" } },
      fields: { x: { slot: "owners" } },
      vocabulary: { nodeTypes: [{ name: "t0", is_system: false }] },
      view: { budget: 20 },
    });
    expect(second.issues).toEqual([{ code: "unknown-key", path: ["title"] }]);
    for (const key of ["title", "nodes", "schemaVersion", "shape"]) {
      expect(Object.hasOwn(first.payload, key)).toBe(false);
      expect(Object.hasOwn(second.payload, key)).toBe(false);
    }
    expect(second.graph).toEqual(first.graph);
    expect(second.hash).toBe(first.hash);
  });
});

describe("S21 retired edges", () => {
  const input = {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { subject: "a", predicate: "p0", object: "b", isActive: false },
      { subject: "a", predicate: "p1", object: "b", valid_to: "2026-01-01" },
      { subject: "a", predicate: "p2", object: "b", valid_to: "2027-01-01" },
    ],
  };

  it("marks inactive and expired edges and keeps them", () => {
    const result = run(input);
    expect(result.graph.triples.map((t) => t.retired)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("gives the same hash on another day", () => {
    const later = run(input, { now: "2027-06-01" });
    expect(later.graph.triples.map((t) => t.retired)).toEqual([
      true,
      true,
      true,
    ]);
    expect(later.hash).toBe(run(input).hash);
  });
});

describe("S30 a deep-frozen input", () => {
  function freeze(value: unknown): void {
    if (typeof value !== "object" || value === null) return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }

  it("is not changed", () => {
    const input = loadFixture("s-vocab-meta").input;
    const copy = structuredClone(input);
    freeze(input);
    expect(normalize(input, NOW).ok).toBe(true);
    expect(input).toEqual(copy);
  });
});
