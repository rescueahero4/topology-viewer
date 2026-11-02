// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "#engine";
import { describe, expect, it, vi } from "vitest";
import { createRenderer } from "./renderer";
import type { Scene, SceneEdge, SceneNode } from "./scene";
import type { RendererText } from "./text";

// why: jsdom has no ResizeObserver; the STORY-003-04 camera observes the root
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
// why: STORY-003-04 — hit paths exist only in a viewport, so the tests stub an 800 × 600 container
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
  tipEdgeAction: (label, muted, count, retired) =>
    `action(${label}, ${muted}, ${count}, ${retired})`,
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
    faded: false,
    lost: false,
    room: 0,
    group: null,
    x: 0,
    y: 0,
    ...over,
  };
}

function edge(key: string, over: Partial<SceneEdge> = {}): SceneEdge {
  return {
    key,
    subject: "e:a",
    object: "e:b",
    label: "derivedFrom",
    colour: "#2c5aa0" as Hex,
    muted: false,
    retired: false,
    structure: false,
    dashed: false,
    count: 1,
    ...over,
  };
}

function draw(scene: Partial<Scene>) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  createRenderer(div, { text: TEXT }).draw({
    nodes: [],
    edges: [],
    selection: { node: null, edge: null },
    layout: "force",
    types: [],
    ...scene,
  });
  const root = div.firstElementChild as Element;
  const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
  const byId = (selector: string, id: string) =>
    [...root.querySelectorAll(selector)].find((el) => {
      const d = datum<{ id?: string; key?: string }>(el);
      return d.id === id || d.key === id;
    }) as Element;
  return { root, byId };
}

const BADGE = ["-16.9", "-7.5", "33.8", "15", "7.5"];
const rectOf = (g: Element) =>
  ["x", "y", "width", "height", "rx"].map((a) =>
    g.querySelector("rect")?.getAttribute(a),
  );

describe("S10 the lost badge in a built scene", () => {
  const m = draw({
    nodes: [
      node("e:lost", { lost: true, x: -100 }),
      node("e:more", { lost: true, more: 3 }),
      node("g:group", {
        kind: "group",
        lost: true,
        count: 4,
        label: "4 Table",
        fullLabel: "4 Table",
        x: 100,
      }),
      node("e:plain", { x: 200 }),
    ],
  });

  it("draws the badge at the top right with the count-badge values", () => {
    for (const id of ["e:lost", "e:more"]) {
      const g = m.byId("g.qt-node", id).querySelector(":scope > g.qt-lost");
      expect(g?.getAttribute("transform")).toBe("translate(6,-18)");
      expect(rectOf(g as Element)).toEqual(BADGE);
      const text = g?.querySelector("text");
      expect([text?.textContent, text?.getAttribute("y")]).toEqual([
        "lost",
        "0.5",
      ]);
    }
  });

  it("keeps the +N chip at the top left of a lost entity", () => {
    const chip = m.byId("g.qt-node", "e:more").querySelector("g.qt-more");
    expect(chip?.getAttribute("transform")).toBe("translate(-10,-18)");
  });

  it("draws no lost badge on a group node and on an entity that is not lost", () => {
    for (const id of ["g:group", "e:plain"])
      expect(m.byId("g.qt-node", id).querySelector("g.qt-lost")).toBeNull();
    expect(m.root.querySelectorAll("g.qt-lost")).toHaveLength(2);
  });
});

describe("S9 the retired edge in a built scene", () => {
  const nodes = [node("e:a"), node("e:b", { x: 200 })];

  it("adds qt-retired to the dashed and to the muted forms", () => {
    const m = draw({
      nodes,
      edges: [
        edge("plain"),
        edge("old", { retired: true }),
        edge("other", { retired: true, dashed: true }),
        edge("muted", { retired: true, muted: true }),
      ],
    });
    const cls = (key: string) =>
      m.byId("path.qt-edge", key).getAttribute("class");
    expect(cls("plain")).toBe("qt-edge");
    expect(cls("old")).toBe("qt-edge qt-retired");
    expect(cls("other")).toBe("qt-edge qt-retired qt-dashed");
    expect(cls("muted")).toBe("qt-edge qt-retired qt-muted");
    const old = m.byId("path.qt-edge", "old");
    expect(old.getAttribute("stroke")).toBe("#2c5aa0");
    expect(old.getAttribute("marker-end")).toMatch(/^url\(#qt[0-9]+-a-/);
    const muted = m.byId("path.qt-edge", "muted");
    expect(muted.hasAttribute("stroke")).toBe(false);
    expect(muted.hasAttribute("marker-end")).toBe(false);
  });

  it("gives the pill text and width of pillRetired, not cut", () => {
    const long = "supplies parts under contract";
    const m = draw({
      nodes,
      edges: [edge("old", { retired: true, label: long })],
      selection: { node: "e:a", edge: null },
    });
    const pill = m.root.querySelector("g.qt-elabel") as Element;
    expect(pill.querySelector("text")?.textContent).toBe(`${long} (retired)`);
    expect(pill.querySelector("rect")?.getAttribute("width")).toBe("263.6");
  });

  it("gives the fourth tipEdgeAction argument from SceneEdge.retired", () => {
    const m = draw({
      nodes,
      edges: [edge("old", { retired: true, count: 2 }), edge("new")],
    });
    const sub = (key: string) => {
      m.byId("path.qt-ehit", key).dispatchEvent(new MouseEvent("mouseenter"));
      return m.root.querySelector("div.qt-tip-sub")?.textContent;
    };
    expect(sub("old")).toBe("action(derivedFrom, false, 2, true)");
    expect(sub("new")).toBe("action(derivedFrom, false, 1, false)");
  });
});
