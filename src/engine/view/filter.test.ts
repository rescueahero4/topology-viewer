import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it, vi } from "vitest";
import { normalize } from "../data/normalize";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import type { Action, CanvasState, LayoutName } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { entityType, resolveVocab } from "../vocab/resolve";
import { stats } from "./filter";
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

const shape = (drawn: Frontier) => ({
  nodes: drawn.nodes,
  edges: drawn.edges.map((edge) => [edge.key, edge.count]),
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
