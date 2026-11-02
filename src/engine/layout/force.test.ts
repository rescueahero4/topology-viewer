import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { datasets, generate, loadFixture } from "#fixtures";
import { forceSimulation } from "d3-force";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState, LayoutName } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnOf, type IconMetrics } from "./drawn";
import {
  bodiesOf,
  forceConfig,
  forceLayout,
  forcesOf,
  springsOf,
} from "./force";
import { layout } from "./layout";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const ALL = { approach: "passive", budget: "all" } as const;

type Input = { nodes: unknown[] };

function run(input: object, all = true) {
  const sent = all ? { ...input, view: ALL } : input;
  const result = normalize(sent, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const state: CanvasState = all ? { ...first, grouping: "off" } : first;
  const drawn = frontier(state, graph, vocab);
  const lay = (name: LayoutName, seed = hash) =>
    layout(state, drawn, vocab, name, METRICS, seed);
  return { hash, state, drawn, vocab, lay };
}

const finite = (points: [string, { x: number; y: number }][]) =>
  points.every(([, p]) => Number.isFinite(p.x) && Number.isFinite(p.y));

afterEach(() => {
  vi.useRealTimers();
});

describe("S2 the seed", () => {
  it("repeats each Force run, and the static layouts read no seed", () => {
    const input = loadFixture("s-access").input as Input;
    const extra = {
      ...input,
      nodes: [...input.nodes, { id: "zz", type: "user" }],
    };
    const a = run(input, false);
    const b = run(extra, false);
    expect(a.hash).not.toBe(b.hash);
    expect(a.lay("force")).toStrictEqual(run(input, false).lay("force"));
    expect(b.lay("force")).toStrictEqual(run(extra, false).lay("force"));
    for (const name of ["atomic", "bubbles", "tree-h", "tree-v"] as const)
      expect(a.lay(name, 1)).toStrictEqual(a.lay(name, 0xdeadbeef));
  });
});

describe("S3 no timer", () => {
  it("leaves no timer after Force on catalog", () => {
    vi.useFakeTimers();
    const result = run(datasets.catalog.graph).lay("force");
    expect(result.positions).toHaveLength(198);
    expect(vi.getTimerCount()).toBe(0);
    forceSimulation([{}, {}]).stop();
    expect(vi.getTimerCount()).toBe(3);
  });
});

const S4_METRICS: IconMetrics = {
  table: { w: 24, h: 24, tier: "asset" },
  column: { w: 24, h: 24, tier: "leaf" },
  user: { w: 20, h: 20, tier: "leaf" },
};

function forcesFor(n: number) {
  const { drawn: shown, vocab } = run({
    nodes: [
      { id: "t", type: "table" },
      { id: "c", type: "column" },
      { id: "u", type: "user" },
    ],
    edges: [
      ["t", "contains", "c"],
      ["t", "ownedBy", "u"],
    ],
  });
  const drawn = drawnOf(shown, vocab, S4_METRICS);
  const bodies = bodiesOf(drawn, new Map());
  const springs = springsOf(drawn, vocab);
  const config = forceConfig(n);
  const forces = forcesOf(springs, config);
  forces.link.initialize(bodies, () => 0.5);
  forces.collide.initialize(bodies, () => 0.5);
  const byPredicate = new Map(
    drawn.links.map((link, i) => [link.predicate, springs[i]]),
  );
  const body = (id: string) => {
    const found = bodies.find((item) => item.id === `e:${id}`);
    if (found === undefined) throw new Error(id);
    return found;
  };
  return { bodies, springs, config, forces, byPredicate, body };
}

describe("S4 forceConfig", () => {
  it("gives the normal constants at 100 nodes", () => {
    const { bodies, springs, config, forces, byPredicate, body } =
      forcesFor(100);
    const distance = forces.link.distance();
    const strength = forces.link.strength();
    const contains = byPredicate.get("contains");
    const owned = byPredicate.get("ownedBy");
    if (contains === undefined || owned === undefined) throw new Error("links");
    expect(distance(contains, 0, springs)).toBe(76);
    expect(strength(contains, 0, springs)).toBe(0.8);
    expect(distance(owned, 1, springs)).toBe(132);
    expect(strength(owned, 1, springs)).toBe(0.3);
    const radius = forces.collide.radius();
    expect(radius(body("t"), 0, bodies)).toBe(38);
    expect(radius(body("c"), 1, bodies)).toBe(24);
    expect(forces.charge.strength()(bodies[0], 0, bodies)).toBe(-260);
    expect(forces.charge.theta()).toBe(0.9);
    expect(forces.charge.distanceMax()).toBe(700);
    expect(forces.collide.iterations()).toBe(2);
    expect(forces.x.strength()(bodies[0], 0, bodies)).toBe(0.03);
    expect(forces.y.strength()(bodies[0], 0, bodies)).toBe(0.03);
    expect(config).toMatchObject({
      alphaDecay: 0.0228,
      velocityDecay: 0.45,
      alphaMin: 0.001,
      maxTicks: 400,
    });
  });

  it("gives the big-graph constants above 1,200 nodes", () => {
    const { bodies, config, forces, body } = forcesFor(1300);
    expect(forces.charge.strength()(bodies[0], 0, bodies)).toBe(-50);
    expect(forces.charge.theta()).toBe(1.2);
    expect(forces.charge.distanceMax()).toBe(300);
    expect(forces.collide.radius()(body("t"), 0, bodies)).toBe(18);
    expect(forces.collide.iterations()).toBe(1);
    expect(config.alphaDecay).toBe(0.05);
  });
});

describe("S5 the stop rule", () => {
  it("stops catalog at 300 ticks from alpha 1", () => {
    const catalog = run(datasets.catalog.graph);
    expect(catalog.drawn.nodes).toHaveLength(198);
    expect(catalog.lay("force").ticks).toBe(300);
  });

  it("stops 2,000 nodes and 4,000 edges at 135 ticks", () => {
    const big = run(generate.random(2000, 4000, 42));
    expect(big.drawn.nodes).toHaveLength(2000);
    const result = big.lay("force");
    expect(result.ticks).toBe(135);
    expect(finite(result.positions)).toBe(true);
  }, 30_000);

  it("stops at the 400-tick cap when alphaMin is 0", () => {
    const { drawn: shown, vocab, hash } = run(datasets.catalog.graph);
    const drawn = drawnOf(shown, vocab, METRICS);
    const config = { ...forceConfig(198), alphaMin: 0 };
    const result = forceLayout(drawn, vocab, new Map(), 1, hash, config);
    expect(result.ticks).toBe(400);
    expect(finite(result.positions)).toBe(true);
  });
});
