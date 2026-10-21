import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import {
  canvasColor,
  canvasLookup,
  drawnIdOf,
  entityType,
  firstView,
  frontier,
  groupAround,
  hide,
  hiddenOf,
  normalize,
  onCanvas,
  resolveVocab,
  setLayout,
  transition,
  type CanvasState,
  type Graph,
  type Hex,
  type IconMetrics,
  type Vocab,
} from "../index";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;

function load(name: string) {
  const result = normalize(loadFixture(name).input, { now: "2026-10-20" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const state = setLayout(
    first,
    frontier(first, graph, vocab),
    vocab,
    first.layout,
    METRICS,
  );
  return { graph, vocab, state };
}

type World = { graph: Graph; vocab: Vocab; state: CanvasState };

const allIds = (graph: Graph) => [
  ...new Set(graph.entities.flatMap((e) => [e.id, ...e.records])),
];

function rows({ graph, vocab, state }: World, ids: string[]) {
  const look = canvasLookup(state, graph, vocab);
  const fast = ids.map((id) => [
    id,
    look.onCanvas(id),
    look.hiddenOf(id),
    look.drawnIdOf(id),
  ]);
  const slow = ids.map((id) => [
    id,
    onCanvas(state, graph, vocab, id),
    hiddenOf(state, graph, id),
    drawnIdOf(state, graph, vocab, id),
  ]);
  return { fast, slow };
}

const ODD = ["nope", "", "__proto__"];

describe("S1 s-access first view", () => {
  it("answers each id as the per-call functions do", () => {
    const world = load("s-access");
    const ids = ["t_FCT_REVENUE", "u_0", "u_20", "c_DIM_PRODUCT.PHONE", ...ODD];
    const { fast, slow } = rows(world, ids);
    expect(fast).toEqual([
      ["t_FCT_REVENUE", "drawn", null, "e:t_FCT_REVENUE"],
      ["u_0", "drawn", null, "e:u_0"],
      ["u_20", "drawn", null, "e:u_0"],
      ["c_DIM_PRODUCT.PHONE", "not-drawn", null, null],
      ...ODD.map((id) => [id, "not-drawn", null, null]),
    ]);
    expect(fast).toEqual(slow);
  });
});

describe("S2 s-access after a hide of e:u_0", () => {
  it("gives hidden, the Hidden key and no drawn id for u_0 and its record u_40", () => {
    const world = load("s-access");
    const state = hide(
      world.state,
      { kind: "hide", node: "e:u_0" },
      world.graph,
      world.vocab,
    ).state;
    const { fast, slow } = rows({ ...world, state }, ["u_0", "u_40"]);
    expect(fast).toEqual([
      ["u_0", "hidden", "e:u_0", null],
      ["u_40", "hidden", "e:u_0", null],
    ]);
    expect(fast).toEqual(slow);
  });
});

describe("S3 s-access with Group around root on e:t_FCT_REVENUE", () => {
  it("equals onCanvas for all 483 entities, with one faded entity ug_exec", () => {
    const world = load("s-access");
    const { graph, vocab } = world;
    const view = frontier(world.state, graph, vocab);
    const state = groupAround(world.state, view, "e:t_FCT_REVENUE", METRICS);
    expect(state.around).not.toBeNull();
    const look = canvasLookup(state, graph, vocab);
    const ids = graph.entities.map((e) => e.id);
    expect(ids).toHaveLength(483);
    const fast = ids.map((id) => look.onCanvas(id));
    expect(fast).toEqual(ids.map((id) => onCanvas(state, graph, vocab, id)));
    expect(ids.filter((_, k) => fast[k] === "faded")).toEqual(["ug_exec"]);
  });
});

describe("S4 an entity with no type, and a type that is off", () => {
  it("s-dirty first view: every entity and record id equals the per-call functions", () => {
    const world = load("s-dirty");
    expect(
      world.graph.entities.some((e) => entityType(world.vocab, e.id) === null),
    ).toBe(true);
    const { fast, slow } = rows(world, allIds(world.graph));
    expect(fast).toEqual(slow);
  });

  it("s-star with table off: equal to the per-call functions; table entities are not drawn", () => {
    const world = load("s-star");
    const { graph, vocab } = world;
    const state = transition(
      world.state,
      { kind: "toggleType", type: "table", on: false },
      graph,
      vocab,
    );
    const { fast, slow } = rows({ ...world, state }, allIds(graph));
    expect(fast).toEqual(slow);
    const look = canvasLookup(state, graph, vocab);
    const tables = graph.entities.filter(
      (e) => entityType(vocab, e.id) === "table",
    );
    expect(tables).toHaveLength(300);
    for (const { id } of tables) expect(look.onCanvas(id)).toBe("not-drawn");
  });
});
