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
  type CanvasState,
  type Graph,
  type Hex,
  type LayoutName,
  type Vocab,
} from "@qdic-topology/engine";
import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type SceneEdge,
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
// why: STORY-003-04 — hit paths exist only in a viewport, and jsdom gives each element 0 × 0;
// the tests that use hit paths stub an 800 × 600 container
HTMLElement.prototype.getBoundingClientRect = () =>
  ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
  }) as DOMRect;

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

type Run = { graph: Graph; vocab: Vocab; state: CanvasState };

function firstOf(input: unknown, name: LayoutName | null = null): Run {
  const result = normalize(input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
  const first = firstView(graph, vocab, payload, hash);
  const state = setLayout(
    first,
    frontier(first, graph, vocab),
    vocab,
    name ?? first.layout,
    iconMetrics,
  );
  return { graph, vocab, state };
}

function draw(run: Run, doc: Document = document) {
  const view = frontier(run.state, run.graph, run.vocab);
  const scene = sceneOf(
    { state: run.state, frontier: view, vocab: run.vocab, canvas: CANVAS },
    TEXT,
  );
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  createRenderer(div, { text: TEXT }).draw(scene);
  const keyOf = (el: Element) =>
    (el as unknown as { __data__: SceneEdge }).__data__.key;
  const all = (selector: string) => [...div.querySelectorAll(selector)];
  const byPredicate = (predicate: string) =>
    view.edges
      .filter((e) => e.predicate === predicate)
      .map((e) => all("path.qt-edge").find((el) => keyOf(el) === e.key))
      .filter((el): el is Element => el !== undefined);
  return { div, view, scene, keyOf, all, byPredicate };
}

const CASES = Object.keys(fixtures)
  .filter((key) => !NOT_DRAWN.includes(key))
  .sort()
  .flatMap((key) => LAYOUTS.map((name) => [key, name] as const));

describe("S1 one edge and one hit path per frontier edge", () => {
  it("has 28 drawing fixtures in 5 layouts", () => {
    expect(CASES).toHaveLength(140);
  });

  it.each(CASES)("%s in %s", (key, name) => {
    const d = draw(firstOf(loadFixture(key).input, name));
    const keys = d.view.edges.map((e) => e.key);
    expect(d.all("path.qt-edge").map(d.keyOf)).toEqual(keys);
    expect(d.all("path.qt-ehit").map(d.keyOf)).toEqual(keys);
    d.div.remove();
  });
});

function greyDashedArrow(el: Element): void {
  expect(el.getAttribute("stroke")).toBe("#71717a");
  expect(el.classList.contains("qt-dashed")).toBe(true);
  expect(el.getAttribute("marker-end")).toBe("url(#qt1-a-71717a)");
}

describe("S5 s-designed: family Custom only", () => {
  it("draws 9 grey dashed edges with an arrow", () => {
    const run = firstOf(loadFixture("s-designed").input);
    const doc = document.implementation.createHTMLDocument("t");
    const d = draw(run, doc);
    expect(d.view.edges).toHaveLength(9);
    expect(new Set(d.view.edges.map((e) => e.predicate))).toEqual(
      new Set(["supplies", "shipsTo", "manufactures", "regulatedBy"]),
    );
    for (const el of d.all("path.qt-edge")) greyDashedArrow(el);
  });
});

describe("S6 Other and custom categories", () => {
  it("q-full-vocabulary budget all: precededBy and produces are grey, dashed, with an arrow", () => {
    const input = loadFixture("q-full-vocabulary").input as { view?: object };
    const run = firstOf({ ...input, view: { ...input.view, budget: "all" } });
    const doc = document.implementation.createHTMLDocument("t");
    const d = draw(run, doc);
    expect([d.view.nodes.length, d.view.edges.length]).toEqual([39, 47]);
    const other = [
      ...d.byPredicate("precededBy"),
      ...d.byPredicate("produces"),
    ];
    expect(other).toHaveLength(4);
    for (const el of other) greyDashedArrow(el);
  });

  it("q-spec-scenarios passive, budget all: hasSteward, classifiedAs and contains", () => {
    const input = loadFixture("q-spec-scenarios").input as object;
    const run = firstOf({
      ...input,
      view: { approach: "passive", budget: "all" },
    });
    const doc = document.implementation.createHTMLDocument("t");
    const d = draw(run, doc);
    expect([d.view.nodes.length, d.view.edges.length]).toEqual([4, 3]);
    const [steward] = d.byPredicate("hasSteward");
    greyDashedArrow(steward);
    const [classified] = d.byPredicate("classifiedAs");
    expect(classified.getAttribute("stroke")).toBe("#7e5925");
    expect(classified.getAttribute("class")).toBe("qt-edge");
    const [contains] = d.byPredicate("contains");
    expect(contains.getAttribute("stroke")).toBe("#25437e");
    expect(contains.hasAttribute("marker-end")).toBe(false);
  });
});

const LOOP = '["e:t1","relatedTo","e:t1"]';
const STRAIGHT = /^M(-?[0-9.e-]+),(-?[0-9.e-]+)L(-?[0-9.e-]+),(-?[0-9.e-]+)$/;

describe("S7 s-dirty self-loop", () => {
  it("is zero length in Force and a curve in tree-h", () => {
    const run = firstOf(loadFixture("s-dirty").input);
    expect(run.state.layout).toBe("force");
    const force = draw(run);
    expect(force.view.edges).toHaveLength(5);
    const d = (r: typeof force, key: string) =>
      r
        .all("path.qt-edge")
        .find((el) => r.keyOf(el) === key)
        ?.getAttribute("d") as string;
    const match = STRAIGHT.exec(d(force, LOOP)) as RegExpExecArray;
    expect([match[1], match[2]]).toEqual([match[3], match[4]]);
    for (const e of force.view.edges) expect(d(force, e.key)).toMatch(STRAIGHT);
    const tree = draw({
      ...run,
      state: setLayout(run.state, force.view, run.vocab, "tree-h", iconMetrics),
    });
    for (const e of tree.view.edges) expect(d(tree, e.key)).toMatch(/^M.+C.+$/);
    expect(d(tree, LOOP)).not.toMatch(STRAIGHT);
  });
});

describe("epic build-time item B10: the scene edge count (FR-QDIC-5)", () => {
  it("gives the s-star group edge the scene count 300, equal to the engine count", () => {
    const d = draw(firstOf(loadFixture("s-star").input));
    const scene = new Map(d.scene.edges.map((e) => [e.key, e]));
    const group = d.view.edges.find((e) => e.count === 300);
    const groups = d.scene.nodes.filter((n) => n.kind === "group");
    const ends = [group?.subject, group?.object];
    expect(groups.some((n) => ends.includes(n.id))).toBe(true);
    expect(scene.get(group?.key ?? "")?.count).toBe(300);
    for (const e of d.view.edges) expect(scene.get(e.key)?.count).toBe(e.count);
    d.div.remove();
  });
});

describe("S19 determinism with the selection", () => {
  it("serialises s-access in two documents to the same bytes", () => {
    const svgOf = () => {
      const doc = document.implementation.createHTMLDocument("t");
      const d = draw(firstOf(loadFixture("s-access").input), doc);
      expect(d.all("g.qt-elabel")).toHaveLength(5);
      expect(d.all("marker")).toHaveLength(2);
      expect(d.all("g.qt-focus")).toHaveLength(1);
      return new XMLSerializer().serializeToString(
        d.div.querySelector("svg") as Element,
      );
    };
    const one = svgOf();
    expect(one).toBe(svgOf());
    expect(one).toContain("url(#qt1-a-2e9d6a)");
  });
});
