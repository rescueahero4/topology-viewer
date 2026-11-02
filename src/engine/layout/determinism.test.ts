import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { fixtures, loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { LayoutName } from "../state/canvasState";
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
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const NOT_DRAWING = new Set([
  "s-empty",
  "s-edges-only",
  "s-invalid",
  "s-not-graph",
  "s-noid-all",
  "s-stress",
]);
const DRAWING = Object.keys(fixtures).filter((key) => !NOT_DRAWING.has(key));

function fresh(key: string, name: LayoutName): string {
  const result = normalize(loadFixture(key).input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const state = firstView(graph, vocab, payload, hash);
  const drawn = frontier(state, graph, vocab);
  const out = layout(state, drawn, vocab, name, METRICS, state.graphHash);
  expect(out.positions).toHaveLength(drawn.nodes.length);
  for (const [, p] of out.positions)
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  return JSON.stringify(out);
}

describe("S1 same input, same positions", () => {
  it("covers the 32 fixtures that draw", () => {
    expect(Object.keys(fixtures)).toHaveLength(38);
    expect(DRAWING).toHaveLength(32);
  });

  it.each(DRAWING)("%s gives byte-equal results in the 5 layouts", (key) => {
    for (const name of LAYOUTS) expect(fresh(key, name)).toBe(fresh(key, name));
  });
});
