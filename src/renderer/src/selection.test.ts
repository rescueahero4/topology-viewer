// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
import { select } from "d3-selection";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Intent } from "./intents";
import { createRenderer } from "./renderer";
import type { Scene, SceneEdge, SceneNode, SceneSelection } from "./scene";
import type { RendererText } from "./text";

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

function node(id: string, x: number, y: number): SceneNode {
  return {
    id,
    kind: "entity",
    type: "table",
    label: id,
    fullLabel: id,
    typeLabel: "Table",
    sub: "Table",
    visual: { icon: "table" },
    colour: "#864627" as Hex,
    w: 24,
    h: 24,
    r: 12,
    tier: "asset",
    count: 0,
    more: 0,
    opened: 0,
    group: null,
    x,
    y,
  };
}

function edge(key: string, subject: string, object: string): SceneEdge {
  return {
    key,
    subject,
    object,
    label: key,
    colour: "#2e9e6a" as Hex,
    muted: false,
    structure: false,
    dashed: false,
    count: 1,
  };
}

// A is the object of E1 and no end of E2; B and C are the neighbours of A.
const NODES = [node("A", 0, 0), node("B", 100, 0), node("C", 0, 100)];
const EDGES = [
  edge("E1", "B", "A"),
  edge("E2", "C", "B"),
  edge("E3", "A", "C"),
];
const NONE: SceneSelection = { node: null, edge: null };

const sceneOf = (selection: SceneSelection): Scene => ({
  nodes: NODES,
  edges: EDGES,
  selection,
  layout: "force",
});

function mount(selection: SceneSelection, hidden = false) {
  const doc = document.implementation.createHTMLDocument("t");
  let isHidden = hidden;
  Object.defineProperty(doc, "hidden", { get: () => isHidden });
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  const renderer = createRenderer(div, { text: TEXT });
  const intents: Intent[] = [];
  renderer.onIntent((intent) => intents.push(intent));
  renderer.draw(sceneOf(selection));
  const root = div.firstElementChild as HTMLDivElement;
  const nodeEl = (id: string) =>
    [...root.querySelectorAll("g.qt-node")].find(
      (el) => datum<SceneNode>(el).id === id,
    ) as SVGGElement;
  const pathOf = (selector: string, key: string) =>
    [...root.querySelectorAll(selector)].find(
      (el) => datum<SceneEdge>(el).key === key,
    ) as SVGPathElement;
  const fire = (el: Element, type: string, init: KeyboardEventInit = {}) =>
    el.dispatchEvent(
      type === "keydown"
        ? new KeyboardEvent(type, { bubbles: true, ...init })
        : new MouseEvent(type, { bubbles: true }),
    );
  return {
    doc,
    div,
    root,
    renderer,
    intents,
    nodeEl,
    edgeEl: (key: string) => pathOf("path.qt-edge", key),
    hitEl: (key: string) => pathOf("path.qt-ehit", key),
    tip: root.querySelector("div.qt-tip") as HTMLDivElement,
    fire,
    hide: (value: boolean) => {
      isHidden = value;
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    setHidden: (value: boolean) => {
      isHidden = value;
    },
  };
}

type Mounted = ReturnType<typeof mount>;

const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;

// The lights: qt-dim on the root, and the nodes and edges with qt-hl.
function lights(m: Mounted) {
  const lit = (selector: string) => [...m.root.querySelectorAll(selector)];
  return {
    dim: m.root.classList.contains("qt-dim"),
    nodes: lit("g.qt-node.qt-hl").map((el) => datum<SceneNode>(el).id),
    edges: lit("path.qt-edge.qt-hl").map((el) => datum<SceneEdge>(el).key),
  };
}

function marks(m: Mounted) {
  return {
    selected: [...m.root.querySelectorAll(".qt-selected")],
    picked: [...m.root.querySelectorAll(".qt-picked")],
    pills: [...m.root.querySelectorAll("g.qt-elabel")].map(
      (g) => g.textContent,
    ),
    halo: m.root.querySelector("g.qt-focus")?.getAttribute("transform"),
  };
}

describe("S12 no selection", () => {
  it("has no qt-dim, no qt-hl, no qt-selected, no pill, no halo and no shown tooltip", () => {
    const m = mount(NONE);
    expect(m.root.classList.contains("qt-dim")).toBe(false);
    expect(m.root.querySelectorAll(".qt-hl, .qt-selected")).toHaveLength(0);
    expect(m.root.querySelectorAll("g.qt-elabel, g.qt-focus")).toHaveLength(0);
    expect(m.tip.classList.contains("qt-on")).toBe(false);
  });
});

describe("node and edge selection", () => {
  it("lights the node, its neighbours and edges, with one qt-selected, pills and halo", () => {
    const m = mount({ node: "A", edge: null });
    expect(m.root.classList.contains("qt-dim")).toBe(true);
    expect(marks(m).selected).toEqual([m.nodeEl("A")]);
    expect(
      ["A", "B", "C"].map((id) => m.nodeEl(id).classList.contains("qt-hl")),
    ).toEqual([true, true, true]);
    expect(
      ["E1", "E2", "E3"].map((k) => m.edgeEl(k).classList.contains("qt-hl")),
    ).toEqual([true, false, true]);
    expect(marks(m).pills).toEqual(["E1", "E3"]);
    expect(m.root.querySelectorAll("g.qt-focus circle")).toHaveLength(4);
    expect(m.root.querySelectorAll("g.qt-focus .qt-pulse")).toHaveLength(1);
  });

  it("lights a picked edge and its ends, with the anchor selected and one pill", () => {
    const m = mount({ node: "A", edge: "E1" });
    expect(marks(m).selected).toEqual([m.nodeEl("A")]);
    expect(marks(m).picked).toEqual([m.edgeEl("E1")]);
    expect(m.edgeEl("E1").classList.contains("qt-hl")).toBe(true);
    expect(m.nodeEl("C").classList.contains("qt-hl")).toBe(false);
    expect(marks(m).pills).toEqual(["E1"]);
  });
});

describe("S13 the pulse stops while the document is hidden", () => {
  it("sets qt-paused while hidden and not after", () => {
    const m = mount({ node: "A", edge: null });
    expect(m.root.classList.contains("qt-paused")).toBe(false);
    m.hide(true);
    expect(m.root.classList.contains("qt-paused")).toBe(true);
    m.hide(false);
    expect(m.root.classList.contains("qt-paused")).toBe(false);
  });

  it("sets qt-paused at the first draw when the document is already hidden", () => {
    const m = mount({ node: "A", edge: null }, true);
    expect(m.root.classList.contains("qt-paused")).toBe(true);
  });
});

describe("S14 hover and leave", () => {
  const cases: [string, SceneSelection][] = [
    ["a node selection", { node: "A", edge: null }],
    ["an edge selection", { node: "A", edge: "E1" }],
    ["no selection", NONE],
  ];

  it.each(cases)("with %s", (_name, selection) => {
    const m = mount(selection);
    const before = { lights: lights(m), marks: marks(m) };
    expect(m.tip.classList.contains("qt-on")).toBe(false);

    m.fire(m.nodeEl("C"), "mouseenter");
    expect(m.root.classList.contains("qt-dim")).toBe(true);
    expect(lights(m).nodes).toEqual(["A", "B", "C"]);
    expect(m.edgeEl("E2").classList.contains("qt-hl")).toBe(true);
    expect(m.edgeEl("E3").classList.contains("qt-hl")).toBe(true);
    expect(m.edgeEl("E1").classList.contains("qt-hl")).toBe(false);
    expect(m.nodeEl("C").classList.contains("qt-selected")).toBe(false);
    expect(marks(m)).toEqual(before.marks);
    expect(m.tip.classList.contains("qt-on")).toBe(true);
    m.fire(m.nodeEl("C"), "mouseleave");
    expect(lights(m)).toEqual(before.lights);
    expect(m.tip.classList.contains("qt-on")).toBe(false);

    m.fire(m.hitEl("E2"), "mouseenter");
    expect(m.root.classList.contains("qt-dim")).toBe(true);
    expect(lights(m).nodes).toEqual(["B", "C"]);
    expect(m.root.querySelectorAll("path.qt-edge.qt-hl")).toHaveLength(1);
    expect(m.edgeEl("E2").classList.contains("qt-hl")).toBe(true);
    expect(marks(m)).toEqual(before.marks);
    expect(m.tip.classList.contains("qt-on")).toBe(true);
    m.fire(m.hitEl("E2"), "mouseleave");
    expect(lights(m)).toEqual(before.lights);
    expect(m.tip.classList.contains("qt-on")).toBe(false);
    expect(m.intents).toEqual([]);
  });

  it("restores no lights at all with no selection", () => {
    const m = mount(NONE);
    m.fire(m.nodeEl("C"), "mouseenter");
    m.fire(m.nodeEl("C"), "mouseleave");
    expect(m.root.classList.contains("qt-dim")).toBe(false);
    expect(m.root.querySelectorAll(".qt-hl")).toHaveLength(0);
  });
});

describe("S16 intents", () => {
  it("reports clicks, keys and double-clicks as intents, in order", () => {
    const m = mount({ node: "A", edge: null });
    const B = m.nodeEl("B");
    m.fire(B, "click");
    m.fire(m.hitEl("E1"), "click");
    m.fire(m.hitEl("E2"), "click");
    m.fire(m.root.querySelector("svg") as Element, "click");
    m.fire(B, "keydown", { key: "Enter" });
    m.fire(B, "keydown", { key: " " });
    m.fire(B, "click");
    m.fire(B, "click");
    m.fire(B, "dblclick");
    m.fire(m.hitEl("E1"), "dblclick");
    m.fire(B, "keydown", { key: "a" });
    expect(m.intents).toEqual([
      { kind: "select", node: "B" },
      { kind: "selectEdge", edge: "E1", anchor: "A" },
      { kind: "selectEdge", edge: "E2", anchor: "C" },
      { kind: "select", node: null },
      { kind: "select", node: "B" },
      { kind: "activate", node: "B" },
      { kind: "select", node: "B" },
      { kind: "select", node: "B" },
      { kind: "activate", node: "B" },
    ]);
  });

  it("gives no select null for a click inside a node or on a hit path", () => {
    const m = mount(NONE);
    m.fire(m.nodeEl("B").querySelector("use") as Element, "click");
    m.fire(m.hitEl("E3"), "click");
    expect(m.intents).toEqual([
      { kind: "select", node: "B" },
      { kind: "selectEdge", edge: "E3", anchor: "A" },
    ]);
  });

  it("changes no scene itself", () => {
    const m = mount({ node: "A", edge: null });
    m.fire(m.nodeEl("B"), "click");
    expect(marks(m).selected).toEqual([m.nodeEl("A")]);
  });

  it("calls only the last handler", () => {
    const m = mount(NONE);
    const second: Intent[] = [];
    m.renderer.onIntent((intent) => second.push(intent));
    m.fire(m.nodeEl("B"), "click");
    expect(m.intents).toEqual([]);
    expect(second).toEqual([{ kind: "select", node: "B" }]);
  });
});

type Kind = [string, (m: Mounted) => void];

const KINDS: Kind[] = [
  ["visibilitychange", (m) => m.hide(true)],
  ["node click", (m) => m.fire(m.nodeEl("B"), "click")],
  ["node dblclick", (m) => m.fire(m.nodeEl("B"), "dblclick")],
  ["node Enter", (m) => m.fire(m.nodeEl("B"), "keydown", { key: "Enter" })],
  ["node Space", (m) => m.fire(m.nodeEl("B"), "keydown", { key: " " })],
  ["node mouseenter", (m) => m.fire(m.nodeEl("C"), "mouseenter")],
  ["node mouseleave", (m) => m.fire(m.nodeEl("C"), "mouseleave")],
  ["hit click", (m) => m.fire(m.hitEl("E2"), "click")],
  ["hit mouseenter", (m) => m.fire(m.hitEl("E2"), "mouseenter")],
  ["hit mouseleave", (m) => m.fire(m.hitEl("E2"), "mouseleave")],
  ["svg click", (m) => m.fire(m.root.querySelector("svg") as Element, "click")],
];

function classes(m: Mounted): string[] {
  return [m.root, ...m.root.querySelectorAll("*")].map((el) =>
    el === m.tip
      ? [...el.classList].filter((c) => c !== "qt-on").join(" ")
      : (el.getAttribute("class") ?? ""),
  );
}

describe("S20 the end when the root leaves the document", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(KINDS)(
    "%s ends the renderer inside that one listener",
    (_n, fire) => {
      const m = mount({ node: "A", edge: null });
      m.fire(m.nodeEl("C"), "mouseenter");
      expect(m.tip.classList.contains("qt-on")).toBe(true);
      const abort = vi.spyOn(AbortController.prototype, "abort");
      m.setHidden(false);
      m.div.remove();
      const before = classes(m);
      expect(abort).not.toHaveBeenCalled();
      expect(() => fire(m)).not.toThrow();
      expect(classes(m)).toEqual(before);
      expect(m.intents).toEqual([]);
      expect(m.tip.classList.contains("qt-on")).toBe(false);
      expect(abort).toHaveBeenCalledTimes(1);
      const svg = select(m.root.querySelector("svg") as SVGSVGElement);
      for (const type of ["click", "dblclick", "keydown", "mouseenter"]) {
        expect(select(m.nodeEl("B")).on(`${type}.qt`)).toBeUndefined();
        expect(select(m.hitEl("E2")).on(`${type}.qt`)).toBeUndefined();
      }
      expect(svg.on("click.qt")).toBeUndefined();
      m.renderer.draw(sceneOf(NONE));
      expect(classes(m)).toEqual(before);
    },
  );
});
