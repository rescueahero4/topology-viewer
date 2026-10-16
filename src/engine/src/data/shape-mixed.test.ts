import { parseRenderInput, profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize, type Normalized } from "./normalize";
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
const types = (result: Ok) =>
  Object.fromEntries(result.graph.records.map((r) => [r.id, r.type]));
const attrsOf = (result: Ok, id: string) => ({
  ...result.graph.records.find((record) => record.id === id)?.attrs,
});
const count = (result: Ok, code: string) =>
  result.issues.filter((issue) => issue.code === code).length;

describe("rows with node fields and explicit attrs (mixed columns)", () => {
  it("reads node fields and attrs entries as columns", () => {
    const result = run({
      nodes: [{ from: "a", to: "b", label: "L", attrs: { weight: 2 } }],
      shape: ROWS,
    });
    expect({ ...result.graph.triples[0].attrs }).toEqual({
      label: "L",
      weight: 2,
    });
  });

  it("reads a type key that is a node field of the contract", () => {
    const result = run({
      nodes: [{ from: "a", to: "b", type: "svc" }],
      shape: { ...ROWS, type: "type" },
    });
    expect(types(result)).toEqual({ a: "svc", b: "row" });
    expect(result.graph.shapedSet.records).toEqual(["b"]);
    expect(Object.hasOwn(result.graph.triples[0].attrs, "type")).toBe(false);
  });

  it("reads a column of a raw attrs object as a literal hint value (D38)", () => {
    const result = run({
      nodes: [{ from: "a", to: "b", attrs: { kind: "svc" } }],
      shape: { ...ROWS, type: "kind" },
    });
    expect(types(result)).toEqual({ a: "kind", b: "kind" });
  });

  it("skips a row with an empty end", () => {
    const result = run({
      nodes: [
        { from: "", to: "b" },
        { from: "a", to: "b" },
      ],
      shape: ROWS,
    });
    expect(triples(result)).toEqual([["a", "relatedTo", "b"]]);
    expect(count(result, "dangling-edge")).toBe(1);
  });

  it("keeps a model-sent edge _inferred as an attribute", () => {
    const result = run({
      nodes: [{ from: "a", to: "b" }],
      edges: [
        { subject: "a", predicate: "p0", object: "b", _inferred: { p: "x" } },
      ],
    });
    expect(result.graph.triples[0].inferred).toBeUndefined();
    expect({ ...result.graph.triples[0].attrs }).toEqual({
      _inferred: { p: "x" },
    });
    expect(result.graph.triples[1].inferred?.predicate).toBe(
      "shaped from from",
    );
  });
});

describe("shaped edges after every edge list of data (D57)", () => {
  const edge = (object: string) => ({ subject: "m", predicate: "p0", object });
  const neighborhood = { nodes: [{ id: "m" }], edges: [edge("a")] };

  it("go after edges, links and neighborhood.edges", () => {
    const input = {
      nodes: [{ from: "a", to: "b" }],
      edges: [edge("b")],
      links: [edge("a")],
      neighborhood,
    };
    const result = shapeOf(input);
    expect(
      result.ok && "shapedSet" in result && result.shapedSet.edges,
    ).toEqual([3]);
    const graph = run(input).graph;
    expect(graph.triples.at(-1)?.records).toEqual([3]);
    expect(graph.shapedSet.triples).toEqual([graph.triples.at(-1)?.key]);
  });

  it("go after links when neighborhood has no edge", () => {
    const input = {
      nodes: [{ from: "a", to: "b" }],
      links: [edge("a"), edge("b")],
      neighborhood: { nodes: [{ id: "m" }] },
    };
    const result = shapeOf(input);
    expect(result.ok && result.input.links).toHaveLength(3);
    expect(
      result.ok && "shapedSet" in result && result.shapedSet.edges,
    ).toEqual([2]);
  });
});

describe("tree forms (mixed and build-time rules)", () => {
  it("reads a root of a nodes list with node fields and attrs", () => {
    const result = run({
      nodes: [{ name: "a", type: "svc", attrs: { k: 1 }, children: [] }],
    });
    expect(types(result)).toEqual({ "0": "row" });
    expect(attrsOf(result, "0")).toEqual({ type: "svc", k: 1 });
  });

  it("skips an object with no id cell and keeps its children", () => {
    const result = run({
      name: "r",
      code: "c0",
      items: [{ name: "x", items: [{ name: "z", code: "c2" }] }],
      shape: { kind: "tree", children: "items", label: "name", id: "code" },
    });
    expect(result.graph.records.map((record) => record.id)).toEqual([
      "c0",
      "c2",
    ]);
    expect(triples(result)).toEqual([]);
    expect(count(result, "no-id")).toBe(1);
  });

  it("gives not-a-graph for a tree hint with neighborhood and no nodes", () => {
    const result = normalize(
      {
        neighborhood: { nodes: [{ id: "m" }] },
        shape: { kind: "tree", children: "items", label: "name" },
      },
      NOW,
    );
    expect(result.ok ? null : result.fatal.code).toBe("not-a-graph");
  });

  it("shapes an empty nodes list with a hint into no graph", () => {
    const result = run({ nodes: [], shape: ROWS });
    expect(result.graph.records).toEqual([]);
    expect(result.shaped).toEqual({ kind: "rows", count: 0 });
  });
});
