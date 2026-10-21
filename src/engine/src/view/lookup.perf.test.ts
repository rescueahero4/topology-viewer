import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { generate } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import {
  canvasColor,
  canvasLookup,
  drawnIdOf,
  firstView,
  frontier,
  groupAround,
  hiddenOf,
  matchEntities,
  normalize,
  onCanvas,
  resolveVocab,
  setLayout,
  type Hex,
  type IconMetrics,
} from "../index";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const RUNS = 5;
// why: LEARNINGS 24, ISSUE-006 — each limit is more than 2 × the loaded median of 5 runs on the
// build machine (story build memo 2026-10-21-implementer-story-01-build.md)
const LOOKUP_LIMIT_MS = 25;
const MATCH_LIMIT_MS = 5;
const SLOW = 120_000;

function median(work: () => void): number {
  work();
  const times = Array.from({ length: RUNS }, () => {
    const start = performance.now();
    work();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return times[RUNS >> 1];
}

function world() {
  const result = normalize(generate.random(2000, 4000, 1), {
    now: "2026-10-20",
  });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return { graph, payload, hash, vocab };
}

describe("S6 canvasLookup at 2,000 entities with Group around root on", () => {
  it(
    "answers all 2,000 entities below the limit, more than 10 × faster than the per-call form",
    () => {
      const { graph, payload, hash, vocab } = world();
      const first = firstView(graph, vocab, payload, hash);
      const laid = setLayout(
        first,
        frontier(first, graph, vocab),
        vocab,
        first.layout,
        METRICS,
      );
      const root = drawnIdOf(laid, graph, vocab, laid.scope.root ?? "");
      expect(root).not.toBeNull();
      const state = groupAround(
        laid,
        frontier(laid, graph, vocab),
        root as string,
        METRICS,
      );
      expect(state.around).not.toBeNull();
      const ids = graph.entities.map((e) => e.id);
      expect(ids).toHaveLength(2000);
      const lookupMs = median(() => {
        const look = canvasLookup(state, graph, vocab);
        for (const id of ids) {
          look.onCanvas(id);
          look.hiddenOf(id);
          look.drawnIdOf(id);
        }
      });
      const start = performance.now();
      for (const id of ids) {
        onCanvas(state, graph, vocab, id);
        hiddenOf(state, graph, id);
        drawnIdOf(state, graph, vocab, id);
      }
      const perCallMs = performance.now() - start;
      console.log(
        `S6 canvasLookup, 2,000 entities: median ${lookupMs.toFixed(2)} ms (limit ${LOOKUP_LIMIT_MS} ms); per-call form ${perCallMs.toFixed(0)} ms (Node ${process.version})`,
      );
      expect(lookupMs).toBeLessThan(LOOKUP_LIMIT_MS);
      expect(perCallMs).toBeGreaterThan(10 * lookupMs);
    },
    SLOW,
  );
});

describe("S9 matchEntities at 2,000 entities", () => {
  it("finds the 2,000 hits of 'n' below the limit", () => {
    const { graph } = world();
    let hits: string[] = [];
    const ms = median(() => {
      hits = matchEntities(graph, "n");
    });
    console.log(
      `S9 matchEntities("n"), 2,000 entities: median ${ms.toFixed(2)} ms (limit ${MATCH_LIMIT_MS} ms)`,
    );
    expect(hits).toHaveLength(2000);
    expect(ms).toBeLessThan(MATCH_LIMIT_MS);
  });
});
