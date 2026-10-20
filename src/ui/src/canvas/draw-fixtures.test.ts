// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  firstView,
  frontier,
  normalize,
  resolveVocab,
  setLayout,
  type Hex,
  type LayoutName,
} from "@qdic-topology/engine";
import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type SceneNode,
} from "@qdic-topology/renderer";
import { describe, expect, it, vi } from "vitest";
import { sceneOf } from "./scene";

// why: jsdom has no ResizeObserver; the STORY-003-04 camera observes the root
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

const NOW = "2026-10-19";
const CANVAS = canvasColor("#F4F4F5") as Hex;
const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  tipGroup: (count, typeLabel) => `${count} × ${typeLabel}`,
  tipOpened: (sub) => `${sub} · expanded`,
  tipMore: (sub, more) => `${sub} · ${more} more`,
  tipMember: (sub) => `${sub} · member`,
  tipEdge: (subject, object) => `${subject} → ${object}`,
  tipEdgeAction: (label, muted, count) =>
    `${label}${muted ? " (filtered out)" : ""} · ${count}`,
  bubbleCount: (n: number) => ` · ${n}`,
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
};
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
// why: EPIC-003 success metric 1 — the 32 fixtures less the four with no first view to draw
const NOT_DRAWN = ["s-invalid", "s-not-graph", "s-noid-all", "s-stress"];
const DRAWING = Object.keys(fixtures)
  .filter((key) => !NOT_DRAWN.includes(key))
  .sort();
const CASES = DRAWING.flatMap((key) =>
  LAYOUTS.map((name) => [key, name] as const),
);

describe("S9 one element per frontier node", () => {
  it("has the 28 drawing fixtures", () => {
    expect(Object.keys(fixtures)).toHaveLength(32);
    expect(DRAWING).toHaveLength(28);
  });

  it.each(CASES)("%s in %s", (key, name) => {
    const result = normalize(loadFixture(key).input, { now: NOW });
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { graph, payload, hash } = result;
    const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
    const first = firstView(graph, vocab, payload, hash);
    const state = setLayout(
      first,
      frontier(first, graph, vocab),
      vocab,
      name,
      iconMetrics,
    );
    const view = frontier(state, graph, vocab);
    const scene = sceneOf(
      { state, frontier: view, vocab, canvas: CANVAS },
      TEXT,
    );
    const div = document.createElement("div");
    document.body.appendChild(div);
    createRenderer(div, { text: TEXT }).draw(scene);
    const drawn = [...div.querySelectorAll("g.qt-node")].map(
      (el) => (el as unknown as { __data__: SceneNode }).__data__.id,
    );
    expect(drawn).toEqual(view.nodes.map((n) => n.id));
    if (key === "s-empty" || key === "s-edges-only") expect(drawn).toEqual([]);
    div.remove();
  });
});
