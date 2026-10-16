import { profile } from "@qdic-topology/contract";
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
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];

describe("S33 prototype names as types, ids and predicates", () => {
  it("gives finite positions and leaves Object.prototype unchanged", () => {
    const names = Object.getOwnPropertyNames(Object.prototype);
    const input = {
      nodes: [
        { id: "n0", type: "__proto__", label: "A" },
        { id: "constructor", type: "constructor", label: "B" },
        { id: "n2", type: "toString", label: "C" },
      ],
      edges: [
        ["n0", "__proto__", "constructor"],
        ["constructor", "relatedTo", "n2"],
      ],
      predicates: JSON.parse('{"__proto__":{"role":"containment"}}') as object,
      view: { approach: "passive", budget: "all" },
    };
    const metrics = JSON.parse(
      '{"__proto__":{"w":40,"h":40,"tier":"asset"},"toString":{"w":30,"h":30,"tier":"leaf"}}',
    ) as IconMetrics;
    const result = normalize(input, { now: "2026-10-14" });
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { graph, payload, hash } = result;
    const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
    const state: CanvasState = {
      ...firstView(graph, vocab, payload, hash),
      grouping: "off",
    };
    const drawn = frontier(state, graph, vocab);
    expect(drawn.nodes).toHaveLength(3);
    for (const name of LAYOUTS) {
      const out = layout(state, drawn, vocab, name, metrics, hash);
      expect(out.positions).toHaveLength(3);
      for (const [, p] of out.positions)
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      if (name.startsWith("tree"))
        expect(out.treeRows?.rows.map(([, key]) => key)).toEqual([0, 0, 0]);
      if (name === "bubbles")
        expect(out.bubbles.map(({ key, r }) => [key, r])).toEqual([
          ["__proto__", 70],
          ["toString", 55],
          ["constructor", 50],
        ]);
    }
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(names);
    expect(({} as { w?: unknown }).w).toBeUndefined();
    expect(({} as { role?: unknown }).role).toBeUndefined();
  });
});
