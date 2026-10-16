import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it, vi } from "vitest";
import { normalize } from "../data/normalize";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import type { Action, CanvasState, LayoutName } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { CUSTOM } from "../vocab/predicates";
import { entityType, resolveVocab } from "../vocab/resolve";
import { filterMode, stats } from "./filter";
import { frontier, type Frontier } from "./frontier";
import { onCanvas } from "./hidden";
import { firstView, transition } from "./story";

// why: guardrail 5 — every layout entry point counts its calls, so a test sees that none runs
const spy = vi.hoisted(() => {
  const counter = { calls: 0 };
  const wrap = (actual: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(actual).map(([name, value]) => [
        name,
        typeof value === "function" && name.endsWith("Layout")
          ? (...args: unknown[]) => {
              counter.calls++;
              return (value as (...items: unknown[]) => unknown)(...args);
            }
          : value,
      ]),
    );
  return { counter, wrap };
});
vi.mock("../layout/force", async (original) => spy.wrap(await original()));
vi.mock("../layout/atomic", async (original) => spy.wrap(await original()));
vi.mock("../layout/bubbles", async (original) => spy.wrap(await original()));
vi.mock("../layout/tree", async (original) => spy.wrap(await original()));

const LIGHT = canvasColor("#F4F4F5") as Hex;
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const drawn = (state: CanvasState) => frontier(state, graph, vocab);
  return {
    graph,
    vocab,
    first: () => firstView(graph, vocab, payload, hash),
    act: (state: CanvasState, action: Action) =>
      transition(state, action, graph, vocab),
    drawn,
    laid: (state: CanvasState, name: LayoutName) =>
      setLayout(state, drawn(state), vocab, name, METRICS),
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

const shape = (drawn: Frontier) => ({
  nodes: drawn.nodes,
  edges: drawn.edges.map((edge) => [edge.key, edge.count]),
});

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
      expect(row.provenance).toBe(run.vocab.types.get(row.type)?.provenance);
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
      rows.types.map((row) => [row.type, row.count]),
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

function relationshipToggles(
  run: ReturnType<typeof load>,
  state: CanvasState,
  family: string,
  predicate: string,
) {
  const before = run.drawn(state);
  const familyOf = (name: string) => run.vocab.predicates.get(name)?.family;
  const steps: [Action, (name: string) => boolean][] = [
    [
      { kind: "toggleFamily", family, on: false },
      (p) => familyOf(p) === family,
    ],
    [
      { kind: "togglePredicate", predicate, on: false },
      (p) => familyOf(p) === family || p === predicate,
    ],
    [{ kind: "toggleFamily", family, on: true }, (p) => p === predicate],
    [{ kind: "togglePredicate", predicate, on: true }, () => false],
  ];
  let next = state;
  for (const [action, muted] of steps) {
    next = run.act(next, action);
    const after = run.drawn(next);
    expect(shape(after)).toStrictEqual(shape(before));
    expect(next.positions).toStrictEqual(state.positions);
    expect(next.revealed).toStrictEqual(state.revealed);
    for (const edge of after.edges)
      expect(edge.muted).toBe(muted(edge.predicate));
  }
  return next;
}

describe("S5 family and predicate filters change style only", () => {
  it("keeps positions, drawn set, groups and +N in s-access (5 layouts)", () => {
    const run = fixture("s-access");
    const users = (id: string) =>
      entityType(run.vocab, id.replace(/^e:/, "")) === "user";
    for (const name of LAYOUTS) {
      const off = run.act(run.first(), {
        kind: "toggleType",
        type: "user",
        on: false,
      });
      const state = run.laid(off, name);
      const drawn = run.drawn(state);
      for (const edge of drawn.edges)
        expect(users(edge.subject) || users(edge.object)).toBe(false);
      relationshipToggles(run, state, "Ownership & Access", "memberOf");
    }
  });

  it("keeps everything but the style in s-many-preds (Force)", () => {
    const run = fixture("s-many-preds");
    const state = run.laid(run.first(), "force");
    const rows = stats(run.vocab, state);
    const family = rows.families[0].family;
    const predicate = rows.predicates.find((row) => row.family !== family);
    relationshipToggles(run, state, family, predicate?.predicate ?? "");
  });
});

describe("S6 a type turned off", () => {
  it("leaves the drawn set and the +N counts; drawn nodes keep positions", () => {
    const run = fixture("s-access");
    const state = run.laid(run.first(), "force");
    const next = run.act(state, {
      kind: "toggleType",
      type: "user",
      on: false,
    });
    const typeOf = (id: string) => entityType(run.vocab, id);
    const revealed = new Set(next.revealed ?? []);
    for (const entity of run.graph.entities)
      if (typeOf(entity.id) === "user")
        expect(onCanvas(next, run.graph, run.vocab, entity.id)).toBe(
          "not-drawn",
        );
    const drawn = run.drawn(next);
    expect(drawn.nodes.some((node) => node.type === "user")).toBe(false);
    for (const node of drawn.nodes) {
      if (!("entity" in node)) continue;
      const near = new Set(
        run.graph.triples.flatMap((t) =>
          t.subject === node.entity
            ? [t.object]
            : t.object === node.entity
              ? [t.subject]
              : [],
        ),
      );
      near.delete(node.entity);
      const off = [...near].filter(
        (id) => !revealed.has(id) && typeOf(id) !== "user",
      );
      expect(node.more).toBe(off.length);
    }
    expect(next.positions).toStrictEqual(state.positions);
  });
});

describe("S7 Show all types", () => {
  it("draws both types again and keeps the relationship filters", () => {
    const run = fixture("s-access");
    let state = run.laid(run.first(), "force");
    const shown = run.drawn(state).nodes.map((node) => node.id);
    for (const action of [
      { kind: "toggleType", type: "user", on: false },
      { kind: "toggleType", type: "user_group", on: false },
      { kind: "togglePredicate", predicate: "memberOf", on: false },
    ] as Action[])
      state = run.act(state, action);
    expect(run.drawn(state).nodes.length).toBeLessThan(shown.length);
    const all = run.act(state, { kind: "showAllTypes" });
    expect(all.filters).toStrictEqual({
      typesOff: [],
      familiesOff: [],
      predicatesOff: ["memberOf"],
    });
    expect(run.drawn(all).nodes.map((node) => node.id)).toEqual(shown);
    expect(all.positions).toStrictEqual(state.positions);
  });
});

describe("S21 Grouping 2 → Off in s-star", () => {
  it("runs no layout and keeps the positions of the nodes that stay", () => {
    const run = fixture("s-star");
    spy.counter.calls = 0;
    const state = run.laid(run.first(), "force");
    expect(spy.counter.calls).toBe(1);
    const before = new Map(state.positions);
    const groups = run.drawn(state).nodes.filter((node) => "members" in node);
    expect(groups.map((node) => ("members" in node ? node.count : 0))).toEqual(
      expect.arrayContaining([300, 12]),
    );
    spy.counter.calls = 0;
    const next = run.act(state, { kind: "grouping", grouping: "off" });
    const drawn = run.drawn(next);
    expect(spy.counter.calls).toBe(0);
    for (const id of ["e:tag_pii", "e:tg_class"])
      expect(new Map(next.positions).get(id)).toStrictEqual(before.get(id));
    const members = groups.flatMap((node) =>
      "members" in node ? node.members : [],
    );
    expect(members).toHaveLength(312);
    const ids = new Set(drawn.nodes.map((node) => node.id));
    for (const id of members) expect(ids.has(`e:${id}`)).toBe(true);
    expect(drawn.nodes.some((node) => "members" in node)).toBe(false);
  });
});
