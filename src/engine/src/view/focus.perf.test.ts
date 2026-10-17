import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import type { CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { groupAround } from "./focus";
import { frontier } from "./frontier";
import { firstView } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const RUNS = 5;

describe("S23 Group around a hub of 313 neighbours (story question 4)", () => {
  it("ends with 3 clusters and a finite spot for every neighbour", () => {
    const result = normalize(loadFixture("s-star").input, {
      now: "2026-10-14",
    });
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { graph, payload, hash } = result;
    const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
    const first: CanvasState = {
      ...firstView(graph, vocab, payload, hash),
      grouping: "off",
    };
    const state = setLayout(
      first,
      frontier(first, graph, vocab),
      vocab,
      "atomic",
      METRICS,
    );
    const view = frontier(state, graph, vocab);
    expect(view.nodes).toHaveLength(314);
    const times: number[] = [];
    let on = state;
    for (let k = 0; k < RUNS; k++) {
      const t0 = performance.now();
      on = groupAround(state, view, "e:tag_pii", METRICS);
      times.push(performance.now() - t0);
    }
    const near = (on.around?.shown ?? []).filter((id) => id !== "e:tag_pii");
    const typeOf = new Map(view.nodes.map((n) => [n.id, n.type]));
    const count = new Map<string | null, number>();
    for (const id of near)
      count.set(
        typeOf.get(id) ?? null,
        (count.get(typeOf.get(id) ?? null) ?? 0) + 1,
      );
    expect(Object.fromEntries(count)).toEqual({
      table: 300,
      column: 12,
      tag_group: 1,
    });
    const spots = new Map(on.positions);
    for (const id of near) {
      const p = spots.get(id);
      expect(Number.isFinite(p?.x) && Number.isFinite(p?.y)).toBe(true);
    }
    const sorted = [...times].sort((a, b) => a - b);
    console.log(
      `S23 groupAround(tag_pii), 313 neighbours: median ${sorted[RUNS >> 1].toFixed(2)} ms, max ${sorted[RUNS - 1].toFixed(2)} ms (Node ${process.version})`,
    );
  });
});
