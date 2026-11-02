import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { profile } from "#contract";
import { generate } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState } from "../state/canvasState";
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
const TARGET_MS = 250;
const RUNS = 5;

describe("S27 Force time at 500 nodes", () => {
  it("prints the median of 5 timed calls after one warm-up", () => {
    const input = {
      ...generate.random(500, 1000, 42),
      view: { approach: "passive", budget: "all" },
    };
    const result = normalize(input, { now: "2026-10-14" });
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { graph, payload, hash } = result;
    const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
    const state: CanvasState = {
      ...firstView(graph, vocab, payload, hash),
      grouping: "off",
    };
    const drawn = frontier(state, graph, vocab);
    expect(drawn.nodes).toHaveLength(500);
    const once = () => {
      const start = performance.now();
      layout(state, drawn, vocab, "force", METRICS, hash);
      return performance.now() - start;
    };
    once();
    const times = Array.from({ length: RUNS }, once).sort((a, b) => a - b);
    const median = times[Math.floor(RUNS / 2)];
    console.log(
      `S27 Force 500 nodes: median ${median.toFixed(1)} ms (target ${TARGET_MS} ms; Node ${process.version})`,
    );
    expect(Number.isFinite(median)).toBe(true);
  }, 60_000);
});
