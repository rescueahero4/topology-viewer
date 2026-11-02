import { generate } from "#fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { merge } from "./merge";
import { normalize, type Normalized } from "./normalize";
import { shape } from "./shape";

vi.mock("./shape", async (importOriginal) => {
  const real = await importOriginal<typeof import("./shape")>();
  return { ...real, shape: vi.fn(real.shape) };
});

vi.mock("./merge", async (importOriginal) => {
  const real = await importOriginal<typeof import("./merge")>();
  return { ...real, merge: vi.fn(real.merge) };
});

type Ok = Extract<Normalized, { ok: true }>;

const NOW = { now: "2026-10-14" };
const { shape: realShape } =
  await vi.importActual<typeof import("./shape")>("./shape");

let largest = 0;

// why: STORY-002-02 S17 — the spy is active only during the `shape` call, so a `Map` of zod
// or of `merge` does not count
function spyMaps() {
  vi.mocked(shape).mockImplementation((...args) => {
    const set = Reflect.get(Map.prototype, "set") as Map<
      unknown,
      unknown
    >["set"];
    const spy = vi.spyOn(Map.prototype, "set").mockImplementation(function (
      this: Map<unknown, unknown>,
      key,
      value,
    ) {
      const result = set.call(this, key, value);
      largest = Math.max(largest, this.size);
      return result;
    });
    try {
      return realShape(...args);
    } finally {
      spy.mockRestore();
    }
  });
}

beforeEach(() => {
  largest = 0;
  vi.mocked(shape).mockClear();
  vi.mocked(merge).mockClear();
});

afterEach(() => {
  vi.mocked(shape).mockImplementation(realShape);
});

function run(input: unknown): Ok {
  const result = normalize(input, NOW);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const pairs = (count: number, ends: number) =>
  Array.from({ length: count }, (_, i) => ({
    from: `n${i % ends}`,
    to: `n${((i % ends) + 1 + Math.floor(i / ends)) % ends}`,
  }));
const distinct = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ from: `a${i}`, to: `b${i}` }));

function tooLarge(unit: "nodes" | "edges", limit: number) {
  return {
    ok: false,
    fatal: {
      code: "too-large",
      path: [unit],
      info: {
        code: "too-large",
        got: { unit, count: limit + 1 },
        limit: { unit, count: limit },
      },
    },
  };
}

describe("S16 rows counted after expansion", () => {
  it("(a) passes 4,000 rows on 2,000 ends", () => {
    const result = run({ nodes: pairs(4000, 2000) });
    expect(result.graph.entities).toHaveLength(2000);
    expect(result.graph.triples).toHaveLength(4000);
    expect(result.counts.relationships).toBe(4000);
    expect(result.counts.edgeRecords).toBe(4000);
  });

  it("(b) folds the duplicate rows of ISSUE-003 V1", () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({
      from: `n${i % 1000}`,
      to: `n${(i + 1) % 1000}`,
    }));
    const result = run({ nodes: rows });
    expect(result.graph.entities).toHaveLength(1000);
    expect(result.counts.relationships).toBe(1000);
    expect(result.counts.edgeRecords).toBe(2001);
  });
});

describe("S17 rows and a tree that expand past a cap (ISSUE-003 V3)", () => {
  it.each([
    ["(a) 1,001 rows on 2,002 ends", { nodes: distinct(1001) }, "nodes", 2000],
    [
      "(b) 4,001 rows on 2,000 ends",
      { nodes: pairs(4001, 2000) },
      "edges",
      2000,
    ],
    [
      "(c) a tree of 5,001 objects",
      generate.tree(2, { width: 5000 }),
      "nodes",
      0,
    ],
  ] as const)("%s stops at the cap", (_name, input, unit, ends) => {
    spyMaps();
    const result = normalize(input, NOW);
    expect(result).toEqual(tooLarge(unit, unit === "nodes" ? 2000 : 4000));
    expect(vi.mocked(shape)).toHaveBeenCalledTimes(1);
    expect(largest).toBeGreaterThanOrEqual(ends);
    expect(largest).toBeLessThanOrEqual(2001);
    expect(vi.mocked(merge)).not.toHaveBeenCalled();
  });
});

describe("S27 the copy bound of hint literals", () => {
  it("(a) stops the Security probe before shape runs", () => {
    const input = {
      nodes: distinct(1000),
      shape: {
        kind: "rows",
        subject: "from",
        object: "to",
        type: "x".repeat(117136),
        predicate: "y".repeat(117136),
      },
    };
    expect(new TextEncoder().encode(JSON.stringify(input)).length).toBe(262143);
    expect(normalize(input, NOW)).toEqual({
      ok: false,
      fatal: {
        code: "too-large",
        path: ["shape", "type"],
        info: {
          code: "too-large",
          got: { unit: "kb", count: 343178 },
          limit: { unit: "kb", count: 256 },
        },
      },
    });
    expect(vi.mocked(shape)).not.toHaveBeenCalled();
    expect(vi.mocked(merge)).not.toHaveBeenCalled();
  });

  it("(b) passes 4,000 rows on 300 ends with a 40-character type", () => {
    const type = "t".repeat(40);
    const result = run({
      nodes: pairs(4000, 300),
      shape: { kind: "rows", subject: "from", object: "to", type },
    });
    expect(result.graph.entities).toHaveLength(300);
    expect(result.graph.entities.every((e) => e.type === type)).toBe(true);
    expect(result.graph.triples).toHaveLength(4000);
    expect(vi.mocked(shape)).toHaveBeenCalledTimes(1);
  });
});

describe("S30 (b, c) the counts start at the lists that data keeps", () => {
  it("(b) counts the edges of data with the shaped edges", () => {
    const input = {
      nodes: pairs(3999, 2000),
      edges: [
        { subject: "n0", predicate: "p0", object: "n5" },
        { subject: "n1", predicate: "p0", object: "n7" },
      ],
    };
    expect(normalize(input, NOW)).toEqual(tooLarge("edges", 4000));
  });

  it("(c) counts the nodes of neighborhood with the shaped nodes", () => {
    const input = {
      neighborhood: { nodes: [{ id: "z0" }] },
      nodes: distinct(1000),
    };
    expect(normalize(input, NOW)).toEqual(tooLarge("nodes", 2000));
  });
});
