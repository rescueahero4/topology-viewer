import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { CUSTOM } from "../vocab/predicates";
import { entityType, resolveVocab } from "../vocab/resolve";
import { filterMode, stats } from "./filter";
import { frontier } from "./frontier";
import { onCanvas } from "./hidden";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return {
    graph,
    vocab,
    first: () => firstView(graph, vocab, payload, hash),
    act: (state: CanvasState, action: Action) =>
      transition(state, action, graph, vocab),
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
  };
}

const fixture = (key: string) => load(loadFixture(key).input);

function chainOf(predicates: number) {
  const nodes = Array.from({ length: predicates + 1 }, (_, k) => [`n${k}`]);
  const edges = Array.from({ length: predicates }, (_, k) => [
    `n${k}`,
    `p${k}`,
    `n${k + 1}`,
  ]);
  return load({ nodes, edges });
}

describe("S1 q-full-vocabulary stats", () => {
  it("gives families, predicates and the five Types menu groups", () => {
    const run = fixture("q-full-vocabulary");
    const rows = stats(run.vocab, run.first());
    const order = [...profile.categoryOrder];
    const keys = rows.families.map((row) => row.family);
    expect(keys).toEqual(order.filter((key) => keys.includes(key)));
    for (const row of rows.families)
      expect(row.count).toBe(
        run.graph.triples.filter(
          (t) => run.vocab.predicates.get(t.predicate)?.family === row.family,
        ).length,
      );
    for (const row of rows.predicates)
      expect(row.count).toBe(
        run.graph.triples.filter((t) => t.predicate === row.predicate).length,
      );
    expect(rows.types).toHaveLength(26);
    const groups = [...profile.typeMenuCategories.order, CUSTOM];
    const sizes = groups.map(
      (group) => rows.types.filter((row) => row.group === group).length,
    );
    expect(sizes).toEqual([10, 3, 5, 6, 2]);
    expect(
      rows.types.filter((row) => row.group === CUSTOM).map((row) => row.type),
    ).toEqual(expect.arrayContaining(["keyword", "bk"]));
    expect(rows.types.some((row) => row.group === "Extend")).toBe(false);
    for (const row of rows.types) {
      expect(row.type).not.toBeNull();
      const type = run.vocab.types.get(row.type ?? "");
      expect(row.provenance).toBe(type?.provenance);
      expect(row.on).toBe(true);
    }
  });
});

describe("S2 q-spec-scenarios stats", () => {
  it("folds the category case and puts steward under Custom", () => {
    const run = fixture("q-spec-scenarios");
    const rows = stats(run.vocab, run.first());
    expect(rows.families).toStrictEqual([
      { family: "Structure", count: 1, on: true },
      { family: "Annotation", count: 1, on: true },
      { family: "governance", count: 1, on: true },
    ]);
    const steward = rows.types.find((row) => row.type === "steward");
    expect(steward).toMatchObject({ group: CUSTOM, provenance: "custom" });
  });
});

describe("S3 s-custom-passive stats", () => {
  it("gives one row per undeclared type name, all under Custom", () => {
    const run = fixture("s-custom-passive");
    const rows = stats(run.vocab, run.first());
    expect(rows.families.map((row) => row.family)).toEqual([CUSTOM]);
    const counts = Object.fromEntries(
      rows.types.map((row): [string, number] => [row.type ?? "", row.count]),
    );
    expect(counts).toStrictEqual({
      regulation: 2,
      kpi: 2,
      supplier: 6,
      site: 6,
      factory: 2,
      product: 3,
      shipment: 8,
    });
    for (const row of rows.types)
      expect(row).toMatchObject({ group: CUSTOM, provenance: "custom" });
  });
});

describe("S4 basic and advanced rows", () => {
  it("follows the dataset totals only", () => {
    const runs = [chainOf(10), chainOf(11), fixture("s-many-preds")];
    const modes = runs.map((run) => filterMode(stats(run.vocab, run.first())));
    expect(modes.map((mode) => mode.predicates)).toEqual([
      "basic",
      "advanced",
      "advanced",
    ]);
    expect(modes.map((mode) => mode.families)).toEqual([
      "basic",
      "basic",
      "basic",
    ]);
    const many = runs[2];
    let state = many.first();
    const rows = stats(many.vocab, state);
    expect(rows.predicates).toHaveLength(20);
    const off: Action[] = [
      ...rows.predicates.slice(0, 9).map((row): Action => ({
        kind: "togglePredicate",
        predicate: row.predicate,
        on: false,
      })),
      ...rows.families.slice(0, 3).map((row): Action => ({
        kind: "toggleFamily",
        family: row.family,
        on: false,
      })),
      ...rows.types.slice(0, 2).map((row): Action => ({
        kind: "toggleType",
        type: row.type,
        on: false,
      })),
    ];
    for (const action of off) {
      state = many.act(state, action);
      expect(filterMode(stats(many.vocab, state))).toStrictEqual(modes[2]);
    }
    expect(state.filters.familiesOff).toHaveLength(3);
    expect(state.filters.typesOff).toHaveLength(2);
  });
});

describe("S25 the row of the entities with no type (D93 (1))", () => {
  it("is one row with key null that the type toggle turns off and on", () => {
    const run = fixture("s-dirty");
    const state = run.first();
    const untyped = run.graph.entities
      .map((entity) => entity.id)
      .filter((id) => entityType(run.vocab, id) === null);
    expect(untyped).toContain("t4");
    const rows = stats(run.vocab, state).types;
    expect(rows.filter((row) => row.type === null)).toStrictEqual([
      {
        type: null,
        count: untyped.length,
        group: CUSTOM,
        provenance: "custom",
        on: true,
      },
    ]);
    for (const id of untyped)
      expect(onCanvas(state, run.graph, run.vocab, id)).toBe("drawn");
    const off = run.act(state, { kind: "toggleType", type: null, on: false });
    expect(off.filters.typesOff).toEqual([null]);
    const row = stats(run.vocab, off).types.find((item) => item.type === null);
    expect(row?.on).toBe(false);
    for (const id of untyped)
      expect(onCanvas(off, run.graph, run.vocab, id)).toBe("not-drawn");
    const back = run.act(off, { kind: "toggleType", type: null, on: true });
    expect(run.drawn(back)).toStrictEqual(run.drawn(state));
    const entities = (drawn: ReturnType<typeof run.drawn>) =>
      drawn.nodes.flatMap((node) =>
        "members" in node ? node.members : [node.entity],
      );
    for (const id of untyped) {
      expect(entities(run.drawn(state))).toContain(id);
      expect(entities(run.drawn(off))).not.toContain(id);
      expect(entities(run.drawn(back))).toContain(id);
    }
  });

  it("keeps a row for each type name, declared or not", () => {
    const run = load({
      nodes: [["a"], ["b", "t1"], ["c", "steward"], ["d"]],
      edges: [
        ["a", "p", "b"],
        ["b", "p", "c"],
        ["c", "p", "d"],
      ],
      types: { steward: { label: "Steward" } },
    });
    const rows = stats(run.vocab, run.first()).types;
    expect(rows.map((row) => [row.type, row.count])).toEqual(
      [
        ["t1", 1],
        ["steward", 1],
        [null, 2],
      ].sort((x, y) => Number(y[1]) - Number(x[1])),
    );
  });

  it("puts a tied row at its first appearance, like any type (QA F-7)", () => {
    const rows = (nodes: string[][]) => {
      const run = load({ nodes, edges: [] });
      return stats(run.vocab, run.first()).types.map((row) => row.type);
    };
    expect(rows([["a"], ["b", "t1"], ["c"], ["d", "t1"]])).toEqual([
      null,
      "t1",
    ]);
    expect(rows([["b", "t1"], ["a"], ["d", "t1"], ["c"]])).toEqual([
      "t1",
      null,
    ]);
    expect(rows([["b", "t1"], ["a"], ["c", "t2"]])).toEqual(["t1", null, "t2"]);
  });
});
