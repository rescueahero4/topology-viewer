import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { profile } from "@qdic-topology/contract";
import { datasets, generate } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState, LayoutName } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { layout } from "./layout";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const LAYOUTS: LayoutName[] = ["atomic", "bubbles", "tree-h", "tree-v"];
const NODES = 2000;
const EDGES = 4000;
// why: NF-1 is measured in EPIC-005 under a 4x throttle; with no throttle this limit only catches
// work that grows faster than the input (lead decision D90 L-3). Force is bounded by its tick cap
// (S5), and its time at the caps is in the build memo
const LIMIT_MS = 250;
// why: ISSUE-006 — the median of 3 timed calls after one warm-up call
const RUNS = 3;

type Compact = { nodes: string[][]; edges: string[][] };

const ids = (n: number, type: (k: number) => string) =>
  Array.from({ length: n }, (_, k) => [`n${k}`, type(k)]);

function random(): Compact {
  const graph = generate.random(NODES, EDGES, 7);
  return {
    nodes: graph.nodes.map((node) => [node.id, node.type]),
    edges: graph.edges.map((edge) => [edge.subject, "p", edge.object]),
  };
}

function hub(): Compact {
  const edges: string[][] = [];
  for (let k = 1; k < NODES; k++) edges.push(["n0", "p", `n${k}`]);
  for (let k = 1; edges.length < EDGES; k++)
    edges.push([`n${k}`, "q", `n${k + 1}`]);
  return { nodes: ids(NODES, () => "t"), edges };
}

function star(): Compact {
  const edges: string[][] = [];
  for (let k = 1; k < NODES; k++) edges.push(["n0", "p", `n${k}`]);
  for (let k = 0; edges.length < EDGES; k++) edges.push(["n0", `s${k}`, "n0"]);
  return { nodes: ids(NODES, (k) => `t${k}`), edges };
}

function dense(): Compact {
  const core = generate.random(100, EDGES, 11);
  return {
    nodes: ids(NODES, (k) => (k < 100 ? "core" : "rest")),
    edges: core.edges.map((edge) => [edge.subject, "p", edge.object]),
  };
}

function deepTree(): Compact {
  const edges: string[][] = [];
  for (let k = 1; k < NODES; k++)
    edges.push([`n${k - 1}`, "contains", `n${k}`]);
  for (let k = 2; edges.length < EDGES; k++)
    edges.push([`n${k}`, "derivedFrom", `n${k - 2}`]);
  return { nodes: ids(NODES, () => "d"), edges };
}

function cycles(): Compact {
  const edges: string[][] = [];
  for (let k = 0; k + 1 < NODES; k += 2)
    edges.push(
      [`n${k}`, "contains", `n${k + 1}`],
      [`n${k + 1}`, "contains", `n${k}`],
    );
  for (let k = 0; edges.length < EDGES; k++)
    edges.push([`n${k}`, "derivedFrom", `n${(k * 7 + 3) % NODES}`]);
  return { nodes: ids(NODES, () => "c"), edges };
}

const CASES: [string, () => Compact][] = [
  ["random", random],
  ["hub", hub],
  ["star of 2,000 types", star],
  ["dense core", dense],
  ["deep containment tree", deepTree],
  ["containment cycles", cycles],
];

function load(input: object) {
  const sent = { ...input, view: { approach: "passive", budget: "all" } };
  const result = normalize(sent, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const state: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping: "off",
  };
  return { state, vocab, drawn: frontier(state, graph, vocab) };
}

function timed(input: object) {
  const { state, vocab, drawn } = load(input);
  return LAYOUTS.map((name) => {
    const run = () =>
      layout(state, drawn, vocab, name, METRICS, state.graphHash);
    const out = run();
    const times = Array.from({ length: RUNS }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    }).sort((a, b) => a - b);
    const ms = times[Math.floor(RUNS / 2)];
    for (const [, p] of out.positions)
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(out.positions).toHaveLength(drawn.nodes.length);
    return [name, Math.round(ms * 10) / 10, out.ticks] as const;
  });
}

function within(name: string, input: object) {
  const times = timed(input);
  console.log(name, JSON.stringify(times));
  for (const [, ms, ticks] of times) {
    expect(ms).toBeLessThan(LIMIT_MS);
    expect(ticks).toBe(0);
  }
}

describe("each static layout is bounded at the caps", () => {
  it.each(CASES)(
    "%s ends within the limit",
    (name, make) => {
      const input = make();
      expect(input.nodes).toHaveLength(NODES);
      expect(input.edges).toHaveLength(EDGES);
      within(name, input);
    },
    30_000,
  );

  it("catalog ends within the limit", () => {
    within("catalog", datasets.catalog.graph);
  });
});
