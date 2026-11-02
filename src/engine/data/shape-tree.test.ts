import { generate } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";

type Ok = Extract<Normalized, { ok: true }>;

const NOW = { now: "2026-10-14" };
const HINT = { kind: "tree", children: "items", label: "name" };
const TREE = {
  name: "r",
  items: [{ name: "x" }, { name: "y", items: [{ name: "z" }] }],
};

function run(input: unknown): Ok {
  const result = normalize(input, NOW);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const triples = (result: Ok) =>
  result.graph.triples.map((t) => [t.subject, t.predicate, t.object]);
const labels = (result: Ok) =>
  result.graph.records.map((record) => [record.id, record.label]);
const attrsOf = (result: Ok, id: string) =>
  result.graph.records.find((record) => record.id === id)?.attrs;
const codes = (result: Ok) => result.issues.map((issue) => issue.code);

function nested(levels: number): Record<string, unknown> {
  let value: Record<string, unknown> = { a: 1 };
  for (let level = 1; level < levels; level++) value = { a: value };
  return value;
}

describe("S11 a tree hint with no id", () => {
  const result = run({ ...TREE, shape: HINT });

  it("makes one entity per object with a path id and its label", () => {
    expect(labels(result)).toEqual([
      ["0", "r"],
      ["0.0", "x"],
      ["0.1", "y"],
      ["0.1.0", "z"],
    ]);
  });

  it("makes contains from parent to child, each with its reason", () => {
    expect(triples(result)).toEqual([
      ["0", "contains", "0.0"],
      ["0", "contains", "0.1"],
      ["0.1", "contains", "0.1.0"],
    ]);
    for (const triple of result.graph.triples)
      expect(triple.inferred?.predicate).toBe("shaped from items");
    for (const record of result.graph.records) {
      expect(record.type).toBe("row");
      expect(record.inferred.type).toBe("shaped from items");
    }
    expect(result.shaped?.kind).toBe("tree");
  });
});

describe("S12 a tree hint with an id key", () => {
  it("takes the ids from the code cells", () => {
    const tree = {
      name: "r",
      code: "c0",
      items: [
        { name: "x", code: "c1" },
        { name: "y", code: "c2", items: [{ name: "z", code: "c3" }] },
      ],
    };
    const result = run({ ...tree, shape: { ...HINT, id: "code" } });
    expect(result.graph.records.map((record) => record.id)).toEqual([
      "c0",
      "c1",
      "c2",
      "c3",
    ]);
    expect(triples(result)[2]).toEqual(["c2", "contains", "c3"]);
    expect(Object.hasOwn(attrsOf(result, "c1") ?? {}, "code")).toBe(false);
  });
});

describe("S13 the tree heuristic", () => {
  it("matches children, reads the label keys and skips a scalar child", () => {
    const result = run({ name: "root", children: [{ title: "a" }, 5] });
    expect(labels(result)).toEqual([
      ["0", "root"],
      ["0.0", "a"],
    ]);
    expect(codes(result).filter((code) => code === "no-id")).toHaveLength(1);
  });
});

describe("S15 the depth cap", () => {
  it("passes 64 levels", () => {
    expect(run(generate.tree(64)).graph.records).toHaveLength(64);
  });

  it.each([65, 100])("stops %i levels with not-a-graph", (depth) => {
    const result = normalize(generate.tree(depth), NOW);
    expect(result).toEqual({
      ok: false,
      fatal: { code: "not-a-graph", path: [], info: { code: "not-a-graph" } },
    });
    for (const text of ["RangeError", "at ", ".ts:"])
      expect(JSON.stringify(result)).not.toContain(text);
  });

  it("hands on an id-less object nested 200 levels", () => {
    const result = normalize({ nodes: [nested(200)] }, NOW);
    expect(!result.ok && result.fatal.code).toBe("no-valid-nodes");
    for (const text of ["RangeError", "at ", ".ts:"])
      expect(JSON.stringify(result)).not.toContain(text);
  });
});

describe("S20 the same input gives the same output", () => {
  const rows = {
    nodes: [
      { from: "a", to: "b", note: "n0" },
      { from: "b", to: "c", note: "n1" },
    ],
    shape: { kind: "rows", subject: "from", object: "to" },
  };

  it.each([rows, { ...TREE, shape: HINT }])("twice", (input) => {
    const first = run(input);
    const second = run(input);
    expect(second).toEqual(first);
    expect(second.hash).toBe(first.hash);
  });
});

describe("S28 a nodes list of tree roots", () => {
  it("walks each root with no hint", () => {
    const result = run({
      nodes: [{ name: "a", children: [{ name: "b" }] }, { title: "c" }],
    });
    expect(labels(result)).toEqual([
      ["0", "a"],
      ["0.0", "b"],
      ["1", "c"],
    ]);
    expect(triples(result)).toEqual([["0", "contains", "0.0"]]);
    expect(result.shaped).toEqual({ kind: "tree", count: 1 });
  });

  it("skips an item that is not an object with a tree hint", () => {
    const result = run({
      nodes: [{ name: "a", children: [{ name: "b" }] }, 5, { name: "c" }],
      shape: { kind: "tree", children: "children", label: "name" },
    });
    expect(result.graph.records.map((record) => record.id)).toEqual([
      "0",
      "0.0",
      "2",
    ]);
    expect(codes(result).filter((code) => code === "no-id")).toHaveLength(1);
    expect(triples(result)).toHaveLength(1);
    expect(result.shaped).toEqual({ kind: "tree", count: 1 });
  });
});

describe("S31 the other keys of a tree object", () => {
  it("keeps the scalar keys as attributes and leaves out the rest", () => {
    const result = run({
      name: "r",
      owner: "o",
      size: 3,
      ok: true,
      meta: { a: 1 },
      tags: ["x"],
      children: [{ name: "c", code: 7 }],
    });
    const root = attrsOf(result, "0");
    expect(Object.getPrototypeOf(root)).toBeNull();
    expect({ ...root }).toStrictEqual({ owner: "o", size: 3, ok: true });
    expect({ ...attrsOf(result, "0.0") }).toStrictEqual({ code: 7 });
    const named = result.issues.filter((issue) =>
      issue.path.some((part) => part === "meta" || part === "tags"),
    );
    expect(named).toEqual([]);
  });

  it("keeps two objects with the same label and other values apart", () => {
    const result = run({
      name: "r",
      children: [
        { name: "c", code: 1 },
        { name: "c", code: 2 },
      ],
    });
    expect(result.graph.entities).toHaveLength(3);
  });
});
