import { describe, expect, it } from "vitest";
import {
  CAPS,
  checkCounts,
  inferredField,
  matchShapeHeuristic,
  parseRenderInput,
  rawCounts,
} from "../src/index";

const OVER = 2001;
const TOO_LARGE_NODES = {
  ok: false,
  fatal: { code: "too-large", path: ["nodes"] },
};

function list<T>(length: number, item: (i: number) => T): T[] {
  return Array.from({ length }, (_, i) => item(i));
}

const fromTo = list(OVER, (i) => ({
  from: `n${i % 1000}`,
  to: `n${(i + 1) % 1000}`,
}));
const withIds = list(OVER, (i) => ({ id: `n${i}` }));

function rowsWith(at: number, item: unknown): unknown[] {
  return fromTo.map((row, i) => (i === at ? item : row));
}

describe("raw forms are counted after expansion (ISSUE-003)", () => {
  it("S31 (V1) accepts 2,001 from/to rows with no hint", () => {
    const result = parseRenderInput({ nodes: fromTo });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues).toEqual([]);
    expect(result.data.nodes).toHaveLength(OVER);
  });

  it("S33 exempts the nodes list only for a present hint that is not null", () => {
    const hint = { kind: "rows", subject: "src", object: "dst" };
    const rows = list(OVER, (i) => ({ src: `a${i}`, dst: `b${i}` }));
    expect(parseRenderInput({ nodes: rows, shape: hint }).ok).toBe(true);
    expect(parseRenderInput({ nodes: withIds, shape: hint }).ok).toBe(true);
    expect(
      parseRenderInput({ nodes: withIds, shape: { kind: "rows" } }),
    ).toEqual(TOO_LARGE_NODES);
    expect(parseRenderInput({ nodes: withIds, shape: null })).toEqual(
      TOO_LARGE_NODES,
    );
  });

  it("S34 exempts id-less rows of each other heuristic and a tree list", () => {
    const payloads = [
      list(OVER, (i) => ({ source: `a${i}`, target: `b${i}` })),
      list(OVER, (i) => ({ parent: `a${i}`, child: `b${i}` })),
      list(OVER, (i) => ({ subject: `a${i}`, object: `b${i}` })),
      list(OVER, (i) => ({ a_id: `a${i}`, b_id: `b${i}` })),
      list(OVER, (i) =>
        i === 0 ? { name: "r", items: [] } : { name: `r${i}` },
      ),
    ];
    for (const nodes of payloads)
      expect(parseRenderInput({ nodes }).ok).toBe(true);
  });

  it("S35 keeps the cap on lists that SA §4.1 sends to normalize", () => {
    const payloads = [
      list(OVER, () => ({ a: "x", b: "y" })),
      rowsWith(1000, { from: "a", to: "b", id: "x" }),
      rowsWith(1000, { from: "a", to: "b", globalId: "g" }),
      rowsWith(5, ["x"]),
      rowsWith(5, null),
    ];
    for (const nodes of payloads)
      expect(parseRenderInput({ nodes })).toEqual(TOO_LARGE_NODES);
  });

  it("S36 keeps the caps of neighborhood nodes and of the edges", () => {
    expect(
      parseRenderInput({ nodes: fromTo, neighborhood: { nodes: withIds } }),
    ).toEqual(TOO_LARGE_NODES);
    const edges = list(4001, (i) => ({
      subject: `a${i}`,
      predicate: "p",
      object: `b${i}`,
    }));
    expect(parseRenderInput({ nodes: fromTo, edges })).toEqual({
      ok: false,
      fatal: { code: "too-large", path: ["edges"] },
    });
    expect(CAPS).toEqual({
      nodes: 2000,
      edges: 4000,
      bytes: 262144,
      pasteBytes: 1048576,
      depth: 256,
    });
    expect(Object.isFrozen(CAPS)).toBe(true);
  });

  it("S37 reads own keys only on the first row", () => {
    const rest = fromTo.slice(1).map((row) => JSON.stringify(row));
    const first = JSON.parse(
      `[${['{"__proto__":{"polluted":1},"constructor":{"polluted":1},"from":"a","to":"b"}', ...rest].join(",")}]`,
    ) as unknown[];
    expect(parseRenderInput({ nodes: first }).ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const second = JSON.parse(
      `[${['{"__proto__":{"from":"x"},"to":"b"}', ...rest].join(",")}]`,
    ) as unknown[];
    expect(parseRenderInput({ nodes: second })).toEqual(TOO_LARGE_NODES);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("S38 gives the index of the first matching heuristic", () => {
    const inputs = [
      { source: 1, target: 2, from: 3, to: 4 },
      { to: 1, from: 2 },
      { parent: 1, child: 2 },
      { subject: 1, object: 2 },
      { a_id: 1, b_id: 2 },
      { a_id: 1 },
      { children: [] },
      { items: [] },
      { name: "x" },
      "text",
      null,
      [],
    ];
    expect(inputs.map(matchShapeHeuristic)).toEqual([
      0,
      1,
      2,
      3,
      4,
      null,
      5,
      5,
      null,
      null,
      null,
      null,
    ]);
  });

  it("S59 counts with one rule and exports inferredField", () => {
    const withNeighborhood = {
      nodes: fromTo,
      neighborhood: { nodes: withIds },
    };
    const withEdges = {
      nodes: withIds,
      edges: list(3, () => ["a", "p", "b"]),
      links: list(2, () => ["a", "p", "b"]),
      neighborhood: { edges: [["a", "p", "b"]] },
    };
    expect(rawCounts({ nodes: fromTo })).toEqual({ nodes: 0, edges: 0 });
    expect(rawCounts(withNeighborhood)).toEqual({ nodes: 2001, edges: 0 });
    expect(rawCounts(withEdges)).toEqual({ nodes: 2001, edges: 6 });
    expect(rawCounts("x")).toEqual({ nodes: 0, edges: 0 });
    expect(rawCounts({ nodes: "x" })).toEqual({ nodes: 0, edges: 0 });
    expect(inferredField.safeParse({ a: "x" }).success).toBe(true);
    expect(inferredField.safeParse({ a: 1 }).success).toBe(false);
    for (const raw of [withNeighborhood, withEdges]) {
      const counts = rawCounts(raw);
      const expected = checkCounts(counts.nodes, counts.edges);
      expect(expected).toEqual({ code: "too-large", path: ["nodes"] });
      expect(parseRenderInput(raw)).toEqual({ ok: false, fatal: expected });
    }
  });
});
