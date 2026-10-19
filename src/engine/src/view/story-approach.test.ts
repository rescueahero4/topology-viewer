import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { frontier } from "./frontier";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;

function load(key: string) {
  const result = normalize(loadFixture(key).input, { now: "2026-10-19" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const laid = setLayout(
    first,
    frontier(first, graph, vocab),
    vocab,
    first.layout,
    METRICS,
  );
  return {
    laid,
    act: (state: CanvasState, action: Action) =>
      transition(state, action, graph, vocab),
  };
}

// why: S23 — only `approach` and `selection` may change
function others(state: CanvasState) {
  const rest: Partial<CanvasState> = { ...state };
  delete rest.approach;
  delete rest.selection;
  return rest;
}

describe("S23 the engine action approach (gap G1, FR-CANVAS-13)", () => {
  it("s-access: Passive selects nothing, Reset keeps it, Active selects the root", () => {
    const run = load("s-access");
    expect(run.laid.approach).toBe("active");
    const passive = run.act(run.laid, {
      kind: "approach",
      approach: "passive",
    });
    expect(passive.approach).toBe("passive");
    expect(passive.selection).toBeNull();
    expect(others(passive)).toEqual(others(run.laid));
    expect(passive.positions).toBe(run.laid.positions);
    const reset = run.act(passive, { kind: "reset" });
    expect(reset.selection).toBeNull();
    const active = run.act(reset, { kind: "approach", approach: "active" });
    expect(active.approach).toBe("active");
    expect(active.selection).toEqual({ node: "e:t_FCT_REVENUE" });
    expect(others(active)).toEqual(others(reset));
  });

  it("s-chain: Active with no scope root selects the most connected drawn node", () => {
    const run = load("s-chain");
    expect(run.laid.approach).toBe("passive");
    expect(run.laid.scope.root).toBeNull();
    const active = run.act(run.laid, { kind: "approach", approach: "active" });
    expect(active.selection).toEqual({ node: "e:t1" });
    expect(others(active)).toEqual(others(run.laid));
    expect(active.positions).toBe(run.laid.positions);
  });

  it("the same approach keeps every field and gives the story selection again", () => {
    const run = load("s-access");
    const moved = run.act(run.laid, { kind: "select", node: "e:u_0" });
    const again = run.act(moved, { kind: "approach", approach: "active" });
    expect(again.selection).toEqual({ node: "e:t_FCT_REVENUE" });
    expect(others(again)).toEqual(others(moved));
  });
});
