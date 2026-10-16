import { profile } from "@qdic-topology/contract";
import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnIdOf } from "./frontier";
import { firstView } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;

const CONTEXT_LIST = {
  "s-access": ["active", "t_FCT_REVENUE"],
  "s-lineage": ["active", "db_revenue"],
  "s-root-only": ["active", "t_FCT_REVENUE"],
  "s-vague": ["passive", null],
  "s-nohint": ["passive", null],
  "s-badroot": ["active", "t_SF_ACCOUNT"],
  "s-single": ["active", "t_FCT_REVENUE"],
  "s-islands": ["passive", null],
  "s-chain": ["passive", null],
  "s-star": ["active", "tag_pii"],
  "s-custom-active": ["active", "reg_eu_battery"],
  "s-mixed": ["active", "t_DIM_CUSTOMER"],
  "s-vocab-meta": ["active", "tb"],
} as const;

function drawing(key: string) {
  const result = normalize(loadFixture(key).input, { now: "2026-10-14" });
  return result.ok ? result : null;
}

const drawingKeys = Object.keys(fixtures).filter((key) => drawing(key));

describe("S1 first paint of every fixture that draws", () => {
  it("covers the 13 fixtures of the Context list", () => {
    for (const [key, [approach, selected]] of Object.entries(CONTEXT_LIST)) {
      expect(drawingKeys).toContain(key);
      expect(fixtures[key].expect.firstPaint).toEqual({ approach, selected });
    }
  });

  it.each(drawingKeys)("%s gives its expect.firstPaint", (key) => {
    const result = drawing(key);
    if (result === null) throw new Error("fatal");
    const { graph, payload, hash } = result;
    const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
    const state = firstView(graph, vocab, payload, hash);
    const paint = fixtures[key].expect.firstPaint;
    expect(state.approach).toBe(paint.approach);
    const selected =
      paint.selected === null
        ? null
        : drawnIdOf(state, graph, vocab, paint.selected);
    expect(state.selection).toEqual(
      selected === null ? null : { node: selected },
    );
    if (paint.selected !== null) expect(selected).not.toBeNull();
  });
});
