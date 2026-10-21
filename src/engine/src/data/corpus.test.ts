import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";
import { canvasNotice, noticeText } from "./notices";

type Raw = Record<string, unknown>;

const NOW = { now: "2026-10-14" };
// why: these two warning codes come from vocab/resolve (STORY-002-03) and data/shape (STORY-002-02)
const LATER = new Set(["unknown-type", "shaped-from"]);

function okOf(result: Normalized) {
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const run = (input: unknown) => okOf(normalize(input, NOW));

const counts = (result: ReturnType<typeof run>) =>
  Object.fromEntries(result.warnings.map((w) => [w.code, w.count]));

function length(input: unknown, key: string): number {
  const list = (input as Raw)[key];
  return Array.isArray(list) ? list.length : 0;
}

function noticeOf(input: unknown, result: Normalized): string | null {
  if (!result.ok)
    return result.fatal.code === "no-valid-nodes" ? result.fatal.code : null;
  const drawn = result.graph.entities.length;
  const stats = {
    rawNodes: length(input, "nodes"),
    rawEdges: length(input, "edges"),
  };
  return (
    canvasNotice({ ...stats, drawn, typesTotal: 0, typesOff: 0 })?.code ?? null
  );
}

describe("S6 s-dirty", () => {
  const { input, expect: outcome } = loadFixture("s-dirty");
  const result = run(input);

  it("skips and counts the bad records", () => {
    expect(counts(result)).toEqual({
      "no-id": 1,
      "duplicate-id": 1,
      "dangling-edge": 3,
    });
    const { "unknown-type": later, ...rest } = outcome.warnings;
    expect(later).toBe(1);
    expect(counts(result)).toEqual(rest);
  });

  it("keeps the first t1, the self-loop and the default predicate", () => {
    const ids = result.graph.entities.map((e) => e.id);
    expect(ids).not.toContain("42");
    expect(result.graph.records.find((r) => r.id === "t1")?.label).toBe(
      "FCT_REVENUE",
    );
    const keys = result.graph.triples.map((t) => [
      t.subject,
      t.predicate,
      t.object,
    ]);
    expect(keys).toContainEqual(["t1", "relatedTo", "t1"]);
    expect(keys).toContainEqual(["t5", "relatedTo", "t2"]);
    expect(keys.map(([, predicate]) => predicate)).not.toContain("contains");
  });
});

describe("S7 the ids of the skip entries", () => {
  it("lists the 0-based positions of s-noid-some", () => {
    const result = run(loadFixture("s-noid-some").input);
    expect(result.graph.entities).toHaveLength(3);
    expect(result.warnings).toEqual([
      { code: "no-id", count: 2, ids: ["1", "3"] },
      { code: "dangling-edge", count: 1, ids: ["c9"] },
    ]);
  });

  it("keeps at most 5 ids", () => {
    const nodes = [
      ...Array.from({ length: 8 }, () => ({ type: "t0" })),
      { id: "n0" },
    ];
    const entry = run({ nodes }).warnings[0];
    expect(entry.count).toBe(8);
    expect(entry.ids).toHaveLength(5);
  });

  it("cuts an id to 64 characters", () => {
    const result = run({
      nodes: [{ id: "n0" }],
      edges: [{ subject: "n0", predicate: "p0", object: "x".repeat(200) }],
    });
    expect(result.warnings[0].ids).toEqual(["x".repeat(64)]);
  });
});

describe("S8 s-noid-all", () => {
  it("gives the fatal no-valid-nodes with the raw count", () => {
    const { input, expect: outcome } = loadFixture("s-noid-all");
    const result = normalize(input, NOW);
    expect(result).toStrictEqual({
      ok: false,
      fatal: {
        code: "no-valid-nodes",
        path: ["nodes"],
        info: { code: "no-valid-nodes", rawNodes: 2 },
      },
    });
    expect(noticeOf(input, result)).toBe(outcome.notice);
  });
});

describe("S10 the empty fixtures", () => {
  it("s-empty gives no-data", () => {
    const { input, expect: outcome } = loadFixture("s-empty");
    const result = run(input);
    expect(result.graph.entities).toEqual([]);
    expect(noticeOf(input, result)).toBe("no-data");
    expect(outcome.notice).toBe("no-data");
  });

  it("s-edges-only gives edges-only with 2 raw edges", () => {
    const { input, expect: outcome } = loadFixture("s-edges-only");
    const result = run(input);
    expect(result.graph.entities).toEqual([]);
    expect(
      canvasNotice({
        rawNodes: 0,
        rawEdges: length(input, "edges"),
        drawn: 0,
        typesTotal: 0,
        typesOff: 0,
      }),
    ).toEqual({
      code: "edges-only",
      info: { rawEdges: 2 },
    });
    expect(noticeOf(input, result)).toBe(outcome.notice);
    expect(counts(result)).toEqual(outcome.warnings);
  });
});

describe("S27 the 38 fixtures", () => {
  const keys = Object.keys(fixtures);

  it("has 38 fixtures", () => {
    expect(keys).toHaveLength(38);
  });

  it.each(keys)("%s", (key) => {
    const { input, expect: outcome } = loadFixture(key);
    const result = normalize(input, NOW);
    expect(noticeOf(input, result)).toBe(outcome.notice);
    if (outcome.schema !== "pass") {
      expect(!result.ok && result.fatal.code).toBe(outcome.schema);
      return;
    }
    if (outcome.notice === "no-valid-nodes") return;
    const expected = Object.fromEntries(
      Object.entries(outcome.warnings).filter(([code]) => !LATER.has(code)),
    );
    expect(counts(okOf(result))).toEqual(expected);
  });

  it("s-stress gives too-large with the node counts and the text", () => {
    const result = normalize(loadFixture("s-stress").input, NOW);
    expect(result).toStrictEqual({
      ok: false,
      fatal: {
        code: "too-large",
        path: ["nodes"],
        info: {
          code: "too-large",
          got: { unit: "nodes", count: 5462 },
          limit: { unit: "nodes", count: 2000 },
        },
      },
    });
    const info =
      !result.ok && result.fatal.code !== "error-fallback"
        ? result.fatal.info
        : {};
    expect(noticeText("too-large", info, "en").body).toBe(
      "This result has 5,462 nodes, more than the limit of 2,000 nodes, so nothing is drawn.",
    );
  });

  it.each([
    ["s-access", 2],
    ["s-badroot", 6],
    ["s-lineage", 6],
    ["s-vague", 6],
    ["s-chain", 13],
    ["s-extend", 1],
    ["s-islands", 2],
    ["s-many-preds", 6],
    ["s-mixed", 6],
    ["s-mixed-designed", 6],
    ["s-undeclared", 6],
    ["s-vocab-meta", 1],
  ])("%s has %i constraint violations", (key, count) => {
    expect(counts(run(loadFixture(key).input))["constraint-violation"]).toBe(
      count,
    );
  });
});
