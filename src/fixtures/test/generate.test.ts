import { describe, expect, it } from "vitest";
import { generate } from "../src";
import type { TreeObject } from "../src/generate";

// why: an explicit stack, because a recursive walk of 10,000 levels overflows
function walk(root: TreeObject): [number, string | TreeObject[]][] {
  const out: [number, string | TreeObject[]][] = [];
  const stack: [TreeObject, number][] = [[root, 1]];
  while (stack.length > 0) {
    const [item, level] = stack.pop() as [TreeObject, number];
    out.push([level, item.name]);
    const children = item.children;
    if (Array.isArray(children))
      for (const child of children) stack.push([child, level + 1]);
  }
  return out;
}

function objects(root: TreeObject): { count: number; levels: number } {
  const items = walk(root);
  return {
    count: items.length,
    levels: Math.max(...items.map(([level]) => level)),
  };
}

describe("S41 the synthetic generators", () => {
  it("grid(27, 45) gives 1,215 nodes, no edges and the cells", () => {
    const result = generate.grid(27, 45);
    expect(result.nodes).toHaveLength(1215);
    expect(result.edges).toEqual([]);
    expect(result.cells).toHaveLength(1215);
    expect(result.cells[607]).toEqual(["n607", 13, 22]);
  });

  it("chain(20) gives 20 nodes and 19 edges", () => {
    const result = generate.chain(20);
    expect(result.nodes).toHaveLength(20);
    expect(result.edges).toHaveLength(19);
    expect(result.edges[0]).toEqual({
      subject: "n0",
      predicate: "relatedTo",
      object: "n1",
    });
    expect(result.nodes[19]).toEqual({
      id: "n19",
      type: "t0",
      label: "Node 19",
    });
  });

  it("star(500) gives 501 nodes and 500 edges from n0", () => {
    const result = generate.star(500);
    expect(result.nodes).toHaveLength(501);
    expect(result.edges).toHaveLength(500);
    expect(result.edges.every((edge) => edge.subject === "n0")).toBe(true);
  });

  it("tree(2, { width: 5000 }) gives 5,001 objects", () => {
    expect(objects(generate.tree(2, { width: 5000 })).count).toBe(5001);
  });

  it("tree(10000) gives 10,000 levels with no RangeError", () => {
    expect(objects(generate.tree(10000))).toEqual({
      count: 10000,
      levels: 10000,
    });
  });

  it("random(2000, 4000, 42) gives 4,000 distinct edges and no self-loop", () => {
    const result = generate.random(2000, 4000, 42);
    expect(result.nodes).toHaveLength(2000);
    expect(result.edges).toHaveLength(4000);
    const pairs = new Set(result.edges.map((e) => `${e.subject} ${e.object}`));
    expect(pairs.size).toBe(4000);
    expect(result.edges.some((e) => e.subject === e.object)).toBe(false);
    expect(result.nodes[7].type).toBe("t2");
  });

  it("gives a deep-equal result on a second call", () => {
    expect(generate.grid(27, 45)).toEqual(generate.grid(27, 45));
    expect(generate.chain(20)).toEqual(generate.chain(20));
    expect(generate.star(500)).toEqual(generate.star(500));
    expect(generate.tree(2, { width: 5000 })).toEqual(
      generate.tree(2, { width: 5000 }),
    );
    expect(generate.random(2000, 4000, 42)).toEqual(
      generate.random(2000, 4000, 42),
    );
    expect(walk(generate.tree(10000))).toEqual(walk(generate.tree(10000)));
  });
});
