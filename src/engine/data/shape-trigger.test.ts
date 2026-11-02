import {
  matchShapeHeuristic,
  parseRenderInput,
  profile,
} from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";
import { shape } from "./shape";

type Ok = Extract<Normalized, { ok: true }>;

const NOW = { now: "2026-10-14" };
const NOT_A_GRAPH = { code: "not-a-graph" };

function run(input: unknown): Ok {
  const result = normalize(input, NOW);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

function parsed(input: unknown) {
  const result = parseRenderInput(input);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const fatalOf = (input: unknown) => {
  const result = normalize(input, NOW);
  return result.ok ? null : result.fatal;
};
const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);
const triples = (result: Ok) =>
  result.graph.triples.map((t) => [t.subject, t.predicate, t.object]);

describe("S9 id-less objects with no match, and a payload with no nodes", () => {
  it("hands id-less objects on to normalize", () => {
    const fatal = fatalOf({ nodes: [{ x: 1, y: 2 }, { x: 3 }] });
    expect(fatal?.code).toBe("no-valid-nodes");
  });

  it("gives not-a-graph with no key text for a payload with no nodes", () => {
    const input = { data: { y: 1 } };
    expect(parsed(input).issues).toEqual([]);
    const result = normalize(input, NOW);
    expect(result).toEqual({
      ok: false,
      fatal: { code: "not-a-graph", path: [], info: NOT_A_GRAPH },
    });
    expect(JSON.stringify(result)).not.toContain("data");
  });
});

describe("S10 the trigger leaves graph payloads and id-less lists alone", () => {
  const canonical = { nodes: [{ id: "n0" }, { id: "n1" }] };
  const inputs = [
    loadFixture("s-noid-all").input,
    loadFixture("s-noid-some").input,
    canonical,
  ];

  it.each(inputs)("returns the same data with no shaped facts", (input) => {
    const { data } = parsed(input);
    const result = shape(input, data, profile);
    expect(result).toStrictEqual({ ok: true, input: data, issues: [] });
    expect(result.ok && result.input).toBe(data);
  });

  it("gives the fixture results through normalize", () => {
    const all = loadFixture("s-noid-all");
    expect(fatalOf(all.input)?.code).toBe(all.expect.notice);
    const some = run(loadFixture("s-noid-some").input);
    expect(codes(some.issues).filter((code) => code === "no-id")).toHaveLength(
      2,
    );
    expect(run(canonical).shaped).toBeUndefined();
    expect(fatalOf(loadFixture("s-not-graph").input)?.code).toBe("not-object");
  });
});

describe("S14 bad hints", () => {
  const nodesOf = (nodes: unknown[], hint: unknown) => ({
    nodes,
    edges: [],
    shape: hint,
  });
  const graphHint = { kind: "graph" };

  it("(a) drops a bad hint and hands on id-less objects with no match", () => {
    const input = nodesOf([{ a: 1 }, { a: 2 }], graphHint);
    expect(codes(parsed(input).issues)).toEqual(["layout-rejected"]);
    expect(fatalOf(input)).toEqual({
      code: "no-valid-nodes",
      path: ["nodes"],
      info: { code: "no-valid-nodes", rawNodes: 2 },
    });
  });

  it("(b) drops a hint with no subject and matches from / to", () => {
    const input = nodesOf([{ from: 1, to: 2 }], { kind: "rows", object: "to" });
    expect(codes(parsed(input).issues)).toEqual(["layout-rejected"]);
    const result = run(input);
    expect(triples(result)).toEqual([["1", "relatedTo", "2"]]);
    expect(result.shaped).toEqual({ kind: "rows", count: 1 });
  });

  it("(c) drops a bad hint on nodes with ids", () => {
    const input = nodesOf([{ id: "n0" }], graphHint);
    expect(codes(parsed(input).issues)).toEqual(["layout-rejected"]);
    expect(run(input).shaped).toBeUndefined();
  });

  it.each([
    { items: [{ name: "a" }], shape: graphHint },
    { items: [{ name: "a" }], shape: { kind: "tree", children: "items" } },
  ])("(d, e) stops a raw tree with a bad hint", (input) => {
    const contract = parseRenderInput(input);
    expect(!contract.ok && contract.fatal.path[0]).toBe("shape");
    const result = normalize(input, NOW);
    expect(result.ok ? null : result.fatal).toMatchObject({
      info: NOT_A_GRAPH,
    });
    for (const text of ["at ", ".ts:"])
      expect(JSON.stringify(result)).not.toContain(text);
  });
});

describe("S25 edge lists with no nodes, and a rows match on a raw tree", () => {
  it.each([
    { edges: [{ source: "a", target: "b" }] },
    { links: [{ source: "a", target: "b" }] },
    { from: "a", to: "b", children: [] },
  ])("gives not-a-graph", (input) => {
    expect(parsed(input).issues).toEqual([]);
    expect(fatalOf(input)).toEqual({
      code: "not-a-graph",
      path: [],
      info: NOT_A_GRAPH,
    });
  });

  it("finds the from / to entry first on the third payload", () => {
    expect(matchShapeHeuristic({ from: "a", to: "b", children: [] })).toBe(1);
  });
});

describe("S29 a rows hint with no nodes key", () => {
  it("gives not-a-graph with no key text", () => {
    const input = {
      items: [{ from: "a", to: "b" }],
      shape: { kind: "rows", subject: "from", object: "to" },
    };
    expect(parsed(input).issues).toEqual([]);
    const result = normalize(input, NOW);
    expect(result.ok ? null : result.fatal).toMatchObject({
      info: NOT_A_GRAPH,
    });
    expect(JSON.stringify(result)).not.toContain("items");
  });
});

describe("S30 (a) the other keys of data stay", () => {
  const input = {
    nodes: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
    edges: [{ subject: "c", predicate: "p0", object: "a" }],
    types: { t0: { label: "T0", rank: 0 } },
    view: { root: "b" },
  };

  it("puts the shaped edges after the edges of data", () => {
    const { data } = parsed(input);
    const result = shape(input, data, profile);
    if (!result.ok) throw new Error("fatal");
    expect(result.input.edges?.[0]).toEqual(data.edges?.[0]);
    expect(result.input.edges).toHaveLength(3);
    expect(result.input.types).toEqual(data.types);
    expect(result.input.view).toEqual(data.view);
  });

  it("gives the triples in the canonical order and resolves the root", () => {
    const result = run(input);
    expect(triples(result)).toEqual([
      ["c", "p0", "a"],
      ["a", "relatedTo", "b"],
      ["b", "relatedTo", "c"],
    ]);
    expect(result.shaped?.count).toBe(2);
    expect(codes(result.issues)).not.toContain("root-not-found");
  });
});

describe("S32 the shaped set and a model-sent reason", () => {
  const input = {
    nodes: [{ from: "a", to: "b" }],
    edges: [{ subject: "m", predicate: "p0", object: "a" }],
    neighborhood: {
      nodes: [{ id: "m", type: "t9", _inferred: { type: "model reason" } }],
    },
  };

  it("holds only the nodes and edges that shape chose", () => {
    const result = shape(input, parsed(input).data, profile);
    expect(result.ok && "shapedSet" in result && result.shapedSet).toEqual({
      nodes: ["a", "b"],
      edges: [1],
    });
  });

  it("gives the graph shapedSet and keeps the model reason", () => {
    const result = run(input);
    expect(result.graph.shapedSet).toEqual({
      records: ["a", "b"],
      triples: [result.graph.triples[1].key],
    });
    expect(triples(result)[1]).toEqual(["a", "relatedTo", "b"]);
    const m = result.graph.records.find((item) => item.id === "m");
    expect(m?.inferred.type).toBe("model reason");
  });
});
