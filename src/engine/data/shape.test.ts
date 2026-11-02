import { parseRenderInput, profile } from "#contract";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";
import { noticeText, warningEntries } from "./notices";
import { shape } from "./shape";

type Ok = Extract<Normalized, { ok: true }>;

const NOW = { now: "2026-10-14" };
const ROWS = { kind: "rows", subject: "from", object: "to" };

function run(input: unknown): Ok {
  const result = normalize(input, NOW);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

function shapeOf(input: unknown) {
  const parsed = parseRenderInput(input);
  if (!parsed.ok) throw new Error(`fatal ${parsed.fatal.code}`);
  return shape(input, parsed.data, profile);
}

const triples = (result: Ok) =>
  result.graph.triples.map((t) => [t.subject, t.predicate, t.object]);
const reasons = (result: Ok) =>
  result.graph.triples.map((t) => t.inferred?.predicate);
const types = (result: Ok) =>
  Object.fromEntries(result.graph.records.map((r) => [r.id, r.type]));
const whyType = (result: Ok) =>
  Object.fromEntries(result.graph.records.map((r) => [r.id, r.inferred.type]));
const count = (result: Ok, code: string) =>
  result.issues.filter((issue) => issue.code === code).length;

const S1 = {
  nodes: [
    { from: "a", to: "b", note: "n0" },
    { from: "b", to: "c", note: "n1" },
    { from: "c", to: "d", note: "n2" },
  ],
  shape: ROWS,
};

describe("S1 rows with a hint and the default predicate", () => {
  const result = run(S1);

  it("makes one relatedTo triple per row with the note attribute", () => {
    expect(triples(result)).toEqual([
      ["a", "relatedTo", "b"],
      ["b", "relatedTo", "c"],
      ["c", "relatedTo", "d"],
    ]);
    expect(reasons(result)).toEqual(Array(3).fill("shaped from from"));
    expect(result.graph.triples.map((t) => ({ ...t.attrs }))).toEqual([
      { note: "n0" },
      { note: "n1" },
      { note: "n2" },
    ]);
  });

  it("makes one entity of type row per distinct cell with its reason", () => {
    expect(result.graph.entities.map((e) => [e.id, e.type])).toEqual([
      ["a", "row"],
      ["b", "row"],
      ["c", "row"],
      ["d", "row"],
    ]);
    expect(whyType(result)).toEqual({
      a: "shaped from from",
      b: "shaped from to",
      c: "shaped from to",
      d: "shaped from to",
    });
  });

  it("gives one shaped-from issue, the shaped facts and no unknown-type", () => {
    expect(count(result, "shaped-from")).toBe(1);
    expect(result.shaped).toEqual({ kind: "rows", count: 3 });
    expect(count(result, "unknown-type")).toBe(0);
  });

  it("keeps the reason and the cells _inferred and null (fix loop 1)", () => {
    const mixed = run({
      nodes: [{ from: "a", to: "b", note: null, attrs: { _inferred: "x" } }],
      shape: ROWS,
    });
    expect(reasons(mixed)).toEqual(["shaped from from"]);
    expect({ ...mixed.graph.triples[0].attrs }).toStrictEqual({
      _inferred: "x",
      note: null,
    });
  });
});

describe("S2 a predicate key and a type literal", () => {
  const rels = ["dependsOn", "feeds", "dependsOn"];
  const nodes = S1.nodes.map((row, i) => ({ ...row, rel: rels[i] }));
  const result = run({
    nodes,
    shape: { ...ROWS, predicate: "rel", type: "service" },
  });

  it("takes each predicate from the rel cell", () => {
    expect(triples(result).map((t) => t[1])).toEqual(rels);
    expect(reasons(result)).toEqual(Array(3).fill("shaped from rel"));
    for (const triple of result.graph.triples)
      expect(Object.hasOwn(triple.attrs, "rel")).toBe(false);
    expect(result.graph.shapedSet.triples).toEqual([]);
  });

  it("gives both ends the literal type", () => {
    expect(Object.values(types(result))).toEqual(Array(4).fill("service"));
    expect(Object.values(whyType(result))).toEqual(
      Array(4).fill("shaped from shape.type"),
    );
    expect(result.graph.shapedSet.records).toEqual(["a", "b", "c", "d"]);
  });
});

describe("S3 a type key", () => {
  const hint = { ...ROWS, type: "kind" };

  it("gives each subject its cell type and each object row", () => {
    const result = run({
      nodes: [
        { from: "a", to: "b", kind: "svc" },
        { from: "c", to: "d", kind: "db" },
      ],
      shape: hint,
    });
    expect(types(result)).toEqual({ a: "svc", b: "row", c: "db", d: "row" });
    expect(whyType(result)).toEqual({
      a: "shaped from kind",
      b: "shaped from to",
      c: "shaped from kind",
      d: "shaped from to",
    });
    expect(reasons(result)).toEqual(Array(2).fill("shaped from from"));
    expect(result.graph.shapedSet.records).toEqual(["b", "d"]);
  });

  it("keeps the first cell type of an id over row (D63, D69)", () => {
    const result = run({
      nodes: [
        { from: "a", to: "b", kind: "svc" },
        { from: "b", to: "c", kind: "db" },
        { from: "c", to: "a" },
        { from: "a", to: "c", kind: "db" },
      ],
      shape: hint,
    });
    expect(types(result)).toEqual({ a: "svc", b: "db", c: "row" });
    expect(whyType(result)).toEqual({
      a: "shaped from kind",
      b: "shaped from kind",
      c: "shaped from to",
    });
    expect(result.graph.shapedSet.records).toEqual(["c"]);
    expect(triples(result)).toEqual([
      ["a", "relatedTo", "b"],
      ["b", "relatedTo", "c"],
      ["c", "relatedTo", "a"],
      ["a", "relatedTo", "c"],
    ]);
  });
});

describe("S4 to S6 the rows heuristics of the profile", () => {
  const pairOf = (row: Record<string, string>) => {
    const result = run({ nodes: [row] });
    return [triples(result)[0], reasons(result)[0]];
  };

  it("matches source / target, from / to and subject / object", () => {
    expect(pairOf({ source: "a", target: "b" })).toEqual([
      ["a", "relatedTo", "b"],
      "shaped from source",
    ]);
    expect(pairOf({ from: "a", to: "b" })[0]).toEqual(["a", "relatedTo", "b"]);
    expect(pairOf({ subject: "a", object: "b" })).toEqual([
      ["a", "relatedTo", "b"],
      "shaped from subject",
    ]);
  });

  it("uses from / to before subject / object (S4)", () => {
    const result = run({
      nodes: [{ from: "a", to: "b", subject: "x", object: "y" }],
    });
    expect(triples(result)).toEqual([["a", "relatedTo", "b"]]);
    expect({ ...result.graph.triples[0].attrs }).toEqual({
      subject: "x",
      object: "y",
    });
  });

  it("makes contains from parent to child (S5)", () => {
    expect(pairOf({ parent: "p", child: "c" })).toEqual([
      ["p", "contains", "c"],
      "shaped from parent",
    ]);
  });

  it("takes the first two _id keys and keeps the rest (S6)", () => {
    const result = run({
      nodes: [{ order_id: "o1", customer_id: "c1", region_id: "r1" }],
    });
    expect(triples(result)).toEqual([["o1", "relatedTo", "c1"]]);
    expect({ ...result.graph.triples[0].attrs }).toEqual({ region_id: "r1" });
  });
});

describe("S7 rows with a missing or an object end", () => {
  it("skips and counts them as dangling-edge", () => {
    const result = run({
      nodes: [
        { from: "a", to: "b" },
        { from: "b" },
        { from: "c", to: { x: 1 } },
        { from: "c", to: "d" },
      ],
      shape: ROWS,
    });
    expect(triples(result)).toHaveLength(2);
    expect(count(result, "dangling-edge")).toBe(2);
    expect(JSON.stringify(result)).not.toContain("[object Object]");
  });
});

describe("S8 skipped rows, a row with no predicate cell, literals", () => {
  it("gives no-valid-nodes when every row is skipped", () => {
    const input = {
      nodes: [0, 1, 2].map((i) => ({ c: `x${i}`, b: `y${i}` })),
      shape: { kind: "rows", subject: "a", object: "b" },
    };
    const shaped = shapeOf(input);
    if (!shaped.ok || !("shaped" in shaped)) throw new Error("not shaped");
    expect(shaped.input.nodes).toEqual([]);
    expect(shaped.input.edges).toEqual([]);
    expect(shaped.issues.map((issue) => issue.code)).toEqual(
      Array(3).fill("dangling-edge"),
    );
    expect(normalize(input, NOW)).toEqual({
      ok: false,
      fatal: {
        code: "no-valid-nodes",
        path: ["nodes"],
        info: { code: "no-valid-nodes", rawNodes: 3 },
      },
    });
  });

  it("gives the hint default to a row with no rel cell (D38, D58)", () => {
    const input = {
      defaults: { type: "svc", predicate: "dep" },
      nodes: [
        { from: "a", to: "b", rel: "feeds" },
        { from: "b", to: "c" },
      ],
      shape: { ...ROWS, predicate: "rel" },
    };
    const shaped = shapeOf(input);
    expect(
      shaped.ok && "shapedSet" in shaped && shaped.shapedSet.edges,
    ).toEqual([1]);
    const result = run(input);
    expect(triples(result)).toEqual([
      ["a", "feeds", "b"],
      ["b", "relatedTo", "c"],
    ]);
    expect(reasons(result)[1]).toBe("shaped from from");
    expect(result.graph.shapedSet.triples).toEqual([
      result.graph.triples[1].key,
    ]);
    expect(Object.values(types(result))).not.toContain("svc");
    expect(triples(result).map((t) => t[1])).not.toContain("dep");
  });

  it("reads each hint value as a literal when nodes[0] is not an object (D52)", () => {
    const result = run({
      nodes: [null, { s: "a", o: "b" }],
      shape: {
        kind: "rows",
        subject: "s",
        object: "o",
        type: "T",
        predicate: "P",
      },
    });
    expect(triples(result)).toEqual([["a", "P", "b"]]);
    expect(reasons(result)).toEqual(["shaped from shape.predicate"]);
    expect(types(result)).toEqual({ a: "T", b: "T" });
    expect(Object.values(whyType(result))).toEqual(
      Array(2).fill("shaped from shape.type"),
    );
    expect(result.graph.shapedSet.records).toEqual(["a", "b"]);
    expect(count(result, "dangling-edge")).toBe(1);
    expect(result.shaped).toEqual({ kind: "rows", count: 1 });
  });
});

describe("S21 the shaped-from warning and its text", () => {
  const result = run(S1);

  it("counts the shaped edges, not the issues", () => {
    const entry = (list: typeof result.warnings) =>
      list.filter((warning) => warning.code === "shaped-from");
    expect(entry(result.warnings)).toEqual([
      { code: "shaped-from", count: 3, ids: ["shape"] },
    ]);
    expect(entry(warningEntries(result.issues, result.shaped))).toHaveLength(1);
    expect(entry(warningEntries(result.issues, result.shaped))[0].count).toBe(
      3,
    );
  });

  it("fills {kind} and {count} in both languages", () => {
    const shaped = result.shaped ?? {};
    expect(noticeText("shaped-from", shaped, "en").body).toBe(
      "The data arrived as a list of flat rows, not as nodes and edges. The chart made 3 relationship(s) from it and marks what it made as inferred.",
    );
    expect(noticeText("shaped-from", shaped, "ja").body).toBe(
      "データはノードとエッジではなく フラットな行のリスト の形で届きました。チャートはそこから 3 件のリレーションシップを作成し、作成したものを推定として表示しています。",
    );
  });
});

describe("S23 number and boolean cells", () => {
  it("become string ids", () => {
    const result = run({
      nodes: [
        { from: 1, to: true },
        { from: 2.5, to: false },
      ],
    });
    expect(result.graph.entities.map((e) => e.id)).toEqual([
      "1",
      "true",
      "2.5",
      "false",
    ]);
    expect(triples(result)).toHaveLength(2);
  });
});

describe("S24 rows with non-string node columns", () => {
  it("drops a type and a label column that are not strings", () => {
    const input = { nodes: [{ type: 5, label: true, from: "a", to: "b" }] };
    const parsed = parseRenderInput(input);
    expect(parsed.ok && parsed.issues).toEqual([
      { code: "field-rejected", path: ["nodes", 0, "type"] },
      { code: "field-rejected", path: ["nodes", 0, "label"] },
    ]);
    const result = run(input);
    expect(triples(result)).toEqual([["a", "relatedTo", "b"]]);
    const attrs = result.graph.triples[0].attrs;
    expect(Object.hasOwn(attrs, "type") || Object.hasOwn(attrs, "label")).toBe(
      false,
    );
    expect(types(result)).toEqual({ a: "row", b: "row" });
    expect(result.graph.records.map((r) => r.label)).toEqual(["a", "b"]);
  });

  it("does not shape rows with an own id", () => {
    const input = { nodes: [{ id: 7, from: "a", to: "b" }] };
    expect(normalize(input, NOW)).toEqual({
      ok: false,
      fatal: {
        code: "no-valid-nodes",
        path: ["nodes"],
        info: { code: "no-valid-nodes", rawNodes: 1 },
      },
    });
  });
});
