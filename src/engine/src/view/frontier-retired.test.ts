import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { frontier, type DrawnEdge } from "./frontier";
import { firstView } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const NOW = "2026-10-19";

function load(input: unknown, now = NOW) {
  const result = normalize(input, { now });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const state = firstView(graph, vocab, payload, hash);
  return { graph, vocab, hash, drawn: frontier(state, graph, vocab) };
}

const edgeOf = (edges: DrawnEdge[], key: string) => {
  const edge = edges.find((e) => e.key === key);
  if (edge === undefined) throw new Error(`no drawn edge ${key}`);
  return edge;
};

const ALL = { approach: "passive", budget: "all" };
const TABLES = [
  { id: "a", type: "table" },
  { id: "b", type: "table" },
];
const AB = '["e:a","p","e:b"]';

describe("S1 q-full-vocabulary: one retired drawn edge", () => {
  const run = load(loadFixture("q-full-vocabulary").input);
  const RETIRED = '["e:tbl-orders-archive","derivedFrom","e:tbl-orders"]';
  const KEPT = '["e:clmn-archive-order-id","derivedFrom","e:clmn-order-id"]';

  it("has 1 retired triple of 47", () => {
    expect(run.graph.triples).toHaveLength(47);
    expect(run.graph.triples.filter((t) => t.retired)).toHaveLength(1);
  });

  it("marks only the edge of that triple, with count 1", () => {
    expect(run.drawn.nodes).toHaveLength(20);
    expect(run.drawn.edges).toHaveLength(25);
    const edge = edgeOf(run.drawn.edges, RETIRED);
    expect(edge.retired).toBe(true);
    expect(edge.count).toBe(1);
    expect(edgeOf(run.drawn.edges, KEPT).retired).toBe(false);
    const others = run.drawn.edges.filter((e) => e.key !== RETIRED);
    expect(others).toHaveLength(24);
    expect(others.every((e) => e.retired === false)).toBe(true);
  });
});

describe("S2 two triples of one link (H5: any triple retired)", () => {
  const triple = (note: string, extra: object = {}) => ({
    subject: "a",
    predicate: "p",
    object: "b",
    attrs: { note },
    ...extra,
  });
  const off = triple("old", { isActive: false });
  const on = triple("new");
  const run = (edges: object[]) =>
    load({ nodes: TABLES, edges, view: ALL }).drawn;

  it.each([
    ["retired first", [off, on]],
    ["retired last", [on, off]],
  ])("gives one retired edge with count 2, %s", (_, edges) => {
    const drawn = run(edges);
    expect(drawn.edges).toHaveLength(1);
    expect(edgeOf(drawn.edges, AB)).toMatchObject({ count: 2, retired: true });
  });

  it("gives retired false when both triples are active", () => {
    const drawn = run([on, triple("other")]);
    expect(edgeOf(drawn.edges, AB)).toMatchObject({
      count: 2,
      retired: false,
    });
  });
});

describe("S3 the OR over the links of one drawn group edge", () => {
  const G = 'g:["h","contains",">","column"]';
  const KEY = JSON.stringify(["e:h", "contains", G]);
  const run = (inactive: string | null) =>
    load({
      nodes: [
        { id: "h", type: "table" },
        { id: "c1", type: "column" },
        { id: "c2", type: "column" },
        { id: "c3", type: "column" },
      ],
      edges: ["c1", "c2", "c3"].map((c) => ({
        subject: "h",
        predicate: "contains",
        object: c,
        ...(c === inactive ? { isActive: false } : {}),
      })),
      view: { approach: "passive", budget: 20 },
    }).drawn;

  it("draws e:h and the group, with one edge of 3 links", () => {
    const drawn = run(null);
    expect(drawn.nodes.map((n) => n.id)).toEqual(["e:h", G]);
    expect(drawn.edges).toHaveLength(1);
    expect(edgeOf(drawn.edges, KEY).count).toBe(3);
  });

  it.each([
    ["c1", true],
    ["c3", true],
    [null, false],
  ])("isActive false on %s gives retired %s", (inactive, retired) => {
    expect(edgeOf(run(inactive).edges, KEY).retired).toBe(retired);
  });
});

describe("S4 the triple fields that set retired, and those that do not", () => {
  const one = (extra: object, now: string, payload: object = {}) =>
    load(
      {
        nodes: TABLES,
        edges: [{ subject: "a", predicate: "p", object: "b", ...extra }],
        view: ALL,
        ...payload,
      },
      now,
    );

  it("valid_to is compared with now; the hash does not change", () => {
    const before = one({ valid_to: "2021-06-30" }, "2020-01-01");
    const after = one({ valid_to: "2021-06-30" }, NOW);
    expect(edgeOf(before.drawn.edges, AB).retired).toBe(false);
    expect(edgeOf(after.drawn.edges, AB).retired).toBe(true);
    expect(after.hash).toBe(before.hash);
  });

  it("validTo in camel case does not retire the triple", () => {
    for (const now of ["2020-01-01", NOW])
      expect(
        edgeOf(one({ validTo: "2021-06-30" }, now).drawn.edges, AB).retired,
      ).toBe(false);
  });

  it('isActive "false" as a string does not retire the triple', () => {
    expect(
      edgeOf(one({ isActive: "false" }, NOW).drawn.edges, AB).retired,
    ).toBe(false);
  });

  it("a retired predicate row does not retire the drawn edge", () => {
    const row = {
      vocabulary: { predicates: [{ name: "p", is_active: false }] },
    };
    const run = one({}, NOW, row);
    expect(run.vocab.predicates.get("p")?.retired).toBe(true);
    expect(edgeOf(run.drawn.edges, AB).retired).toBe(false);
  });
});
