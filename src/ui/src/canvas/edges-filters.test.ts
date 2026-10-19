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
  transition,
  type Action,
  type Hex,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type Renderer,
  type RendererText,
  type SceneEdge,
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
};
const ROOT = "e:t_FCT_REVENUE";
const FIN_ADMIN = '["e:ug_fin_admin","permissionedTo","e:t_FCT_REVENUE"]';

// One renderer on one canvas; each step runs an engine action and draws again.
function canvas(key: string) {
  const result = normalize(loadFixture(key).input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
  const first = firstView(graph, vocab, payload, hash);
  let state = setLayout(
    first,
    frontier(first, graph, vocab),
    vocab,
    first.layout,
    iconMetrics,
  );
  const doc = document.implementation.createHTMLDocument("t");
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  const renderer: Renderer = createRenderer(div, { text: TEXT });
  const draw = () => {
    const view = frontier(state, graph, vocab);
    renderer.draw(
      sceneOf({ state, frontier: view, vocab, canvas: CANVAS }, TEXT),
    );
    return view;
  };
  const act = (action: Action) => {
    state = transition(state, action, graph, vocab);
    return draw();
  };
  return { graph, vocab, doc, div, draw, act, state: () => state };
}

type Canvas = ReturnType<typeof canvas>;

const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
const all = (c: Canvas, selector: string) => [
  ...c.div.querySelectorAll(selector),
];
const nodeEl = (c: Canvas, id: string) =>
  all(c, "g.qt-node").find((el) => datum<SceneNode>(el).id === id) as Element;
const edgeEl = (c: Canvas, key: string) =>
  all(c, "path.qt-edge").find(
    (el) => datum<SceneEdge>(el).key === key,
  ) as Element;
const pills = (c: Canvas) =>
  all(c, "g.qt-elabel").map((g) => [
    g.textContent,
    g.querySelector("rect")?.getAttribute("fill"),
  ]);
const hl = (c: Canvas, selector: string) =>
  all(c, `${selector}.qt-hl`).map((el) =>
    selector === "g.qt-node"
      ? datum<SceneNode>(el).id
      : datum<SceneEdge>(el).key,
  );
const rootEl = (c: Canvas) => c.div.firstElementChild as Element;

// The drawing of a canvas that a filter may not change (SA §6 row 3).
function layoutOf(c: Canvas) {
  return {
    nodes: all(c, "g.qt-node").map((el) => el.getAttribute("transform")),
    groups: all(c, "g.qt-node.qt-grouped").map((el) => datum<SceneNode>(el).id),
    chips: all(c, "g.qt-more text, g.qt-badge text").map((t) => t.textContent),
    paths: all(c, "path.qt-edge, path.qt-ehit").map((p) => p.getAttribute("d")),
  };
}

function styleOf(c: Canvas) {
  return {
    edges: all(c, "path.qt-edge").map((p) => [
      p.getAttribute("class"),
      p.getAttribute("stroke"),
      p.getAttribute("marker-end"),
    ]),
    markers: all(c, "marker").map((m) => m.id),
    pills: pills(c),
  };
}

describe("S8 s-access first view", () => {
  const c = canvas("s-access");
  const view = c.draw();

  it("selects the root, the only qt-selected, on a dimmed canvas", () => {
    expect(view.edges).toHaveLength(11);
    expect(all(c, ".qt-selected")).toEqual([nodeEl(c, ROOT)]);
    expect(rootEl(c).classList.contains("qt-dim")).toBe(true);
  });

  it("lights the root, its 5 neighbours and its 5 edges, not e:ug_exec", () => {
    expect(hl(c, "g.qt-node").sort()).toEqual(
      [
        ROOT,
        "e:u_0",
        "e:u_7",
        "e:u_12",
        "e:ug_fin_admin",
        "e:ug_analytics",
      ].sort(),
    );
    const rootEdges = view.edges
      .filter((e) => e.subject === ROOT || e.object === ROOT)
      .map((e) => e.key);
    expect(rootEdges).toHaveLength(5);
    expect(hl(c, "path.qt-edge")).toEqual(rootEdges);
  });

  it("draws 5 pills in the edge colours", () => {
    expect(pills(c).sort()).toEqual(
      [
        ["ownedBy", "#2e9d6a"],
        ["ownedBy", "#2e9d6a"],
        ["ownedBy", "#2e9d6a"],
        ["permissionedTo", "#2e9e6a"],
        ["permissionedTo", "#2e9e6a"],
      ].sort(),
    );
  });

  it("draws the halo: 3 circles and 1 pulse circle in #864627", () => {
    const circles = all(c, "g.qt-focus circle");
    expect(circles.map((el) => el.getAttribute("fill"))).toEqual([
      "#864627",
      "#864627",
      "#864627",
      null,
    ]);
    expect(circles[3].getAttribute("class")).toBe("qt-pulse");
    expect(circles[3].getAttribute("stroke")).toBe("#864627");
  });
});

describe("S9 and S10 s-access: permissionedTo off, then pick a muted edge", () => {
  const c = canvas("s-access");
  const view = c.draw();
  const before = layoutOf(c);
  const permissioned = view.edges
    .filter((e) => e.predicate === "permissionedTo")
    .map((e) => edgeEl(c, e.key));

  it("S9 mutes the 2 permissionedTo edges; their pills go, 3 ownedBy pills stay", () => {
    c.act({ kind: "togglePredicate", predicate: "permissionedTo", on: false });
    expect(permissioned).toHaveLength(2);
    for (const el of permissioned) {
      expect(el.classList.contains("qt-muted")).toBe(true);
      expect(el.hasAttribute("marker-end")).toBe(false);
    }
    expect(pills(c).map(([text]) => text)).toEqual([
      "ownedBy",
      "ownedBy",
      "ownedBy",
    ]);
    expect(layoutOf(c)).toEqual(before);
  });

  it("S10 picks the muted edge: qt-picked, its ends lit, one pill, the anchor keeps the halo", () => {
    c.act({ kind: "selectEdge", edge: FIN_ADMIN, anchor: ROOT });
    const picked = edgeEl(c, FIN_ADMIN);
    expect(all(c, ".qt-picked")).toEqual([picked]);
    expect(picked.classList.contains("qt-hl")).toBe(true);
    expect(picked.classList.contains("qt-muted")).toBe(true);
    expect(hl(c, "g.qt-node").sort()).toEqual(["e:ug_fin_admin", ROOT].sort());
    expect(all(c, ".qt-selected")).toEqual([nodeEl(c, ROOT)]);
    expect(all(c, "g.qt-focus")).toHaveLength(1);
    expect(all(c, "g.qt-focus")[0].getAttribute("transform")).toBe(
      nodeEl(c, ROOT).getAttribute("transform"),
    );
    expect(rootEl(c).classList.contains("qt-dim")).toBe(true);
    expect(pills(c)).toEqual([["permissionedTo", "#2e9e6a"]]);
  });
});

describe("S11 s-many-preds: each family off and on again", () => {
  const c = canvas("s-many-preds");
  c.act({ kind: "select", node: ROOT });
  const view = c.draw();
  const families = [
    ...new Set(
      view.edges
        .filter((e) => e.subject === ROOT || e.object === ROOT)
        .map((e) => c.vocab.predicates.get(e.predicate)?.family as string),
    ),
  ];
  const first = { layout: layoutOf(c), style: styleOf(c) };

  it("has 11 root edges in 6 families", () => {
    expect(
      view.edges.filter((e) => e.subject === ROOT || e.object === ROOT),
    ).toHaveLength(11);
    expect(families).toHaveLength(6);
  });

  it.each(families)("%s", (family) => {
    c.act({ kind: "toggleFamily", family, on: false });
    const off = view.edges.filter(
      (e) => c.vocab.predicates.get(e.predicate)?.family === family,
    );
    expect(off.length).toBeGreaterThan(0);
    for (const e of off) {
      const el = edgeEl(c, e.key);
      expect(el.classList.contains("qt-muted")).toBe(true);
      expect(el.hasAttribute("marker-end")).toBe(false);
    }
    const labels = new Set(
      off.map((e) => c.vocab.predicates.get(e.predicate)?.label),
    );
    expect(pills(c).filter(([text]) => labels.has(text ?? ""))).toEqual([]);
    expect(layoutOf(c)).toEqual(first.layout);
    c.act({ kind: "toggleFamily", family, on: true });
    expect(styleOf(c)).toEqual(first.style);
    expect(layoutOf(c)).toEqual(first.layout);
  });
});
