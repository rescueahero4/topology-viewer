import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState, Point } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { bubbleRoom } from "./bubbles";
import { drawnOf, type IconMetrics } from "./drawn";
import { layout } from "./layout";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const ALL = { approach: "passive", budget: "all" } as const;

function run(input: unknown, off = false) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const state: CanvasState = off ? { ...first, grouping: "off" } : first;
  const drawn = frontier(state, graph, vocab);
  return {
    drawn,
    vocab,
    result: layout(state, drawn, vocab, "bubbles", METRICS, hash),
  };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function noOverlap(input: unknown, off = false) {
  const { drawn, vocab, result } = run(input, off);
  const laid = drawnOf(drawn, vocab, METRICS);
  const where = new Map(result.positions);
  const bubbleOf = new Map(laid.nodes.map((node) => [node.id, node.type]));
  for (const a of laid.nodes)
    for (const b of laid.nodes) {
      if (a.id >= b.id || bubbleOf.get(a.id) !== bubbleOf.get(b.id)) continue;
      const gap = bubbleRoom(a) + bubbleRoom(b) + 8;
      const d = distance(where.get(a.id) as Point, where.get(b.id) as Point);
      expect(d).toBeGreaterThanOrEqual(gap - 0.01);
    }
  for (const a of result.bubbles)
    for (const b of result.bubbles) {
      if (a === b) continue;
      expect(distance(a, b)).toBeGreaterThanOrEqual(a.r + b.r + 52 - 0.01);
    }
  return result;
}

const summary = (bubbles: { key: string | null; r: number }[]) =>
  bubbles.map(({ key, r }) => [key, Math.round(r * 100) / 100]);

describe("S8 s-designed in Bubbles", () => {
  it("gives 4 bubbles in pack order with the computed radii", () => {
    const result = noOverlap(loadFixture("s-designed").input);
    expect(result.positions).toHaveLength(8);
    expect(result.bubbles.map(({ key }) => key)).toEqual([
      "product",
      "supplier",
      "factory",
      "regulation",
    ]);
    const radii = [184.89, 165.6, 158, 117.6];
    result.bubbles.forEach((bubble, i) =>
      expect(Math.abs(bubble.r - radii[i])).toBeLessThanOrEqual(0.01),
    );
    expect(result.ticks).toBe(0);
    expect(result.treeRows).toBeNull();
  });
});

describe("S9 equal count and equal radius", () => {
  it("orders the bubbles by type code point", () => {
    const input = {
      nodes: [
        { id: "a", type: "zeta" },
        { id: "b", type: "Zeta" },
        { id: "c", type: "alpha" },
      ],
      edges: [],
      view: ALL,
    };
    const { result } = run(input, true);
    expect(result.bubbles.map(({ key }) => key)).toEqual([
      "Zeta",
      "alpha",
      "zeta",
    ]);
    expect(new Set(result.bubbles.map(({ r }) => r)).size).toBe(1);
  });
});

describe("S32 s-custom-passive in Bubbles", () => {
  it("gives one bubble per undeclared type", () => {
    const input = {
      ...(loadFixture("s-custom-passive").input as object),
      view: ALL,
    };
    const result = noOverlap(input, true);
    expect(result.positions).toHaveLength(29);
    expect(summary(result.bubbles)).toEqual([
      ["shipment", 118.79],
      ["site", 110.04],
      ["supplier", 110.04],
      ["product", 80.02],
      ["factory", 76],
      ["kpi", 76],
      ["regulation", 76],
    ]);
  });
});

describe("Bubbles with mixed forms", () => {
  it("packs a group node, untyped nodes and a self-loop", () => {
    const input = {
      nodes: [
        { id: "h", type: "hub" },
        ...Array.from({ length: 6 }, (_, k) => ({ id: `l${k}`, type: "leaf" })),
        { id: "u1" },
        { id: "u2" },
      ],
      edges: [
        ...Array.from({ length: 6 }, (_, k) => ["h", "has", `l${k}`]),
        ["u1", "loops", "u1"],
      ],
      view: ALL,
    };
    const { drawn, result } = run(input);
    expect(drawn.nodes.filter((node) => "members" in node)).toHaveLength(1);
    expect(result.bubbles.map(({ key }) => key)).toEqual([null, "leaf", "hub"]);
    for (const [, p] of result.positions)
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it("puts the untyped bubble after a type on a full tie", () => {
    const input = { nodes: [{ id: "u" }, { id: "a", type: "a" }], edges: [] };
    const { result } = run({ ...input, view: ALL });
    expect(result.bubbles.map(({ key }) => key)).toEqual(["a", null]);
    expect(result.bubbles[0].r).toBe(result.bubbles[1].r);
  });

  it("packs 1 bubble for an all-same-type graph", () => {
    const nodes = Array.from({ length: 40 }, (_, k) => ({
      id: `n${k}`,
      type: "t",
    }));
    const result = noOverlap({ nodes, edges: [], view: ALL }, true);
    expect(result.bubbles).toHaveLength(1);
    expect(result.positions).toHaveLength(40);
  });
});
