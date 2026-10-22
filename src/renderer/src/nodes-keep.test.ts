// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
import { describe, expect, it, vi } from "vitest";
import { drawNodes, type NodeContext } from "./nodes";
import { createRenderer } from "./renderer";
import type { Scene, SceneNode } from "./scene";
import type { RendererText } from "./text";

// why: jsdom has no ResizeObserver; the STORY-003-04 camera observes the root
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

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

function node(id: string, over: Partial<SceneNode> = {}): SceneNode {
  return {
    id,
    kind: "entity",
    type: "table",
    label: id,
    fullLabel: `${id} full`,
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
    faded: false,
    lost: false,
    room: 0,
    group: null,
    x: 10,
    y: 20,
    ...over,
  };
}

const sceneOf = (nodes: SceneNode[], selected: string | null = null) =>
  ({
    nodes,
    edges: [],
    selection: { node: selected, edge: null },
    layout: "force",
    types: [],
  }) satisfies Scene;

function mount() {
  const doc = document.implementation.createHTMLDocument("t");
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  return { doc, div };
}

const nodeEl = (root: ParentNode, id: string) =>
  [...root.querySelectorAll<SVGGElement>("g.qt-node")].find(
    (el) => (el as unknown as { __data__: SceneNode }).__data__.id === id,
  ) as SVGGElement;

const inside = (el: Element) => [...el.querySelectorAll("*")];

const attributes = (el: Element) =>
  [el, ...inside(el)].map((e) => e.getAttributeNames().sort());

describe("S1 a select paint keeps the node children", () => {
  const RAW = node("raw", { more: 2 });
  const scene = sceneOf([RAW, node("other", { x: 90 })]);

  it("keeps each child element, connected, with no new attribute", () => {
    const { doc, div } = mount();
    const renderer = createRenderer(div, { text: TEXT });
    renderer.draw(scene);
    const el = nodeEl(div, "raw");
    const before = inside(el);
    const symbolOf = () =>
      doc.getElementById(
        (el.querySelector("use")?.getAttribute("href") ?? "").slice(1),
      );
    const symbol = symbolOf();
    expect(symbol?.localName).toBe("symbol");
    const names = attributes(el);
    expect(before.map((e) => e.localName)).toEqual(
      expect.arrayContaining(["use", "text", "g", "rect"]),
    );
    expect(el.querySelector("g.qt-more")).not.toBeNull();
    renderer.draw(sceneOf(scene.nodes, "raw"));
    expect(nodeEl(div, "raw")).toBe(el);
    expect(el.getAttribute("class")).toContain("qt-selected");
    expect(before.map((e) => e.isConnected)).not.toContain(false);
    const after = inside(el);
    expect(after).toHaveLength(before.length);
    after.forEach((e, i) => expect(e).toBe(before[i]));
    expect(symbolOf()).toBe(symbol);
    expect(symbol?.isConnected).toBe(true);
    expect(attributes(el)).toEqual(names);
    for (const e of [el, ...inside(el)])
      expect(e.getAttributeNames().some((n) => n.startsWith("data-"))).toBe(
        false,
      );
  });
});

const GROUP = node("x", {
  kind: "group",
  count: 5,
  label: "5 Table",
  fullLabel: "5 Table",
  sub: "Collapsed",
});
const LOST = node("x", { lost: true });
const BASE = node("x", { more: 2 });

const text = (el: Element, selector: string) =>
  el.querySelector(selector)?.textContent;

type Row = {
  input: string;
  before: SceneNode[];
  after: SceneNode[];
  then: (el: SVGGElement, doc: Document) => void;
};

// why: rule 2 (a) — one row per input that `fillNode` reads, and the symbol-id shift
const ROWS: Row[] = [
  {
    input: "kind",
    before: [node("x", { count: 5 })],
    after: [node("x", { kind: "group", count: 5 })],
    then: (el) => {
      expect(el.querySelectorAll(":scope > circle")).toHaveLength(2);
      expect(text(el, "g.qt-badge text")).toBe("5");
    },
  },
  {
    input: "r",
    before: [GROUP],
    after: [{ ...GROUP, r: 20 }],
    then: (el) =>
      expect(el.querySelector(":scope > circle")?.getAttribute("r")).toBe(
        String(20 * 1.55),
      ),
  },
  {
    input: "colour",
    before: [GROUP],
    after: [{ ...GROUP, colour: "#123456" as Hex }],
    then: (el) =>
      expect(el.querySelector(":scope > circle")?.getAttribute("fill")).toBe(
        "#123456",
      ),
  },
  {
    input: "href",
    before: [node("a"), BASE],
    after: [node("a"), { ...BASE, visual: { icon: "column" } }],
    then: (el, doc) => {
      const href = el.querySelector("use")?.getAttribute("href") ?? "";
      expect(href).toBe("#qt1-s-1");
      expect(doc.getElementById(href.slice(1))?.localName).toBe("symbol");
    },
  },
  {
    input: "w",
    before: [BASE],
    after: [{ ...BASE, w: 30 }],
    then: (el) =>
      expect(el.querySelector("use")?.getAttribute("width")).toBe("30"),
  },
  {
    input: "h",
    before: [BASE],
    after: [{ ...BASE, h: 30 }],
    then: (el) =>
      expect(el.querySelector("use")?.getAttribute("height")).toBe("30"),
  },
  {
    input: "label",
    before: [BASE],
    after: [{ ...BASE, label: "renamed" }],
    then: (el) => expect(text(el, "text.qt-name")).toBe("renamed"),
  },
  {
    input: "sub",
    before: [BASE],
    after: [{ ...BASE, sub: "View" }],
    then: (el) => expect(text(el, "text.qt-sub")).toBe("View"),
  },
  {
    input: "fullLabel",
    before: [BASE],
    after: [{ ...BASE, fullLabel: "a new name" }],
    then: (el) => expect(text(el, "text.qt-a11y")).toBe("a new name"),
  },
  {
    input: "count",
    before: [GROUP],
    after: [{ ...GROUP, count: 7 }],
    then: (el) => expect(text(el, "g.qt-badge text")).toBe("7"),
  },
  {
    input: "lost",
    before: [BASE],
    after: [{ ...BASE, lost: true }],
    then: (el) => expect(text(el, "g.qt-lost text")).toBe("lost"),
  },
  {
    input: "more",
    before: [BASE],
    after: [{ ...BASE, more: 3 }],
    then: (el) => expect(text(el, "g.qt-more text")).toBe("+3"),
  },
  {
    input: "opened",
    before: [BASE],
    after: [{ ...BASE, opened: 1 }],
    then: (el) => expect(text(el, "g.qt-more text")).toBe("−"),
  },
  {
    input: "symbol id shift",
    before: [BASE],
    after: [node("n", { visual: { icon: "column" } }), BASE],
    then: (el, doc) => {
      expect(el.querySelector("use")?.getAttribute("href")).toBe("#qt1-s-1");
      expect(doc.getElementById("qt1-s-1")?.localName).toBe("symbol");
    },
  },
];

describe("S2 a changed input draws the node again", () => {
  it.each(ROWS)("$input", ({ before, after, then }) => {
    const { doc, div } = mount();
    const renderer = createRenderer(div, { text: TEXT });
    renderer.draw(sceneOf(before));
    const el = nodeEl(div, "x");
    const old = inside(el);
    renderer.draw(sceneOf(after));
    expect(nodeEl(div, "x")).toBe(el);
    then(el, doc);
    expect(old.some((o) => el.contains(o))).toBe(false);
  });

  const ctxOf = (over: Partial<NodeContext>): NodeContext => ({
    hrefOf: () => "#qt1-s-0",
    labelId: (id) => `qt1-l-${id === "x" ? 0 : 1}`,
    big: false,
    lostMark: "lost",
    ...over,
  });

  // why: rule 2 (a) test form — `lostMark` is fixed per renderer (`renderer.ts`), and `big` needs
  // more than 1,200 nodes through a renderer, so these rows call `drawNodes` with two contexts
  it.each([
    {
      input: "ctx.big",
      d: BASE,
      from: ctxOf({ big: false }),
      to: ctxOf({ big: true }),
      then: (el: SVGGElement) => {
        expect(el.querySelector("text.qt-sub")).toBeNull();
        expect(text(el, "text.qt-name")).toBe("x");
      },
    },
    {
      input: "ctx.lostMark",
      d: LOST,
      from: ctxOf({ lostMark: "lost" }),
      to: ctxOf({ lostMark: "gone" }),
      then: (el: SVGGElement) =>
        expect(text(el, "g.qt-lost text")).toBe("gone"),
    },
  ])("$input", ({ d, from, to, then }) => {
    const { doc } = mount();
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    const layer = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(layer);
    doc.body.appendChild(svg);
    drawNodes(layer, [d], from);
    const el = layer.querySelector<SVGGElement>("g.qt-node") as SVGGElement;
    const old = inside(el);
    expect(old.length).toBeGreaterThan(0);
    drawNodes(layer, [d], to);
    expect(layer.querySelector("g.qt-node")).toBe(el);
    then(el);
    expect(old.some((o) => el.contains(o))).toBe(false);
  });
});
