// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Designed, Hex } from "#engine";
import { describe, expect, it, vi } from "vitest";
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

// why: STORY-003-03 — a scene of nodes only: no edge, no selection
const BARE: Omit<Scene, "nodes"> = {
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
  types: [],
};

function symbolOf(visual: Designed): Element {
  const doc = document.implementation.createHTMLDocument("t");
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  const node: SceneNode = {
    id: "e:x",
    kind: "entity",
    type: "x",
    label: "x",
    fullLabel: "x",
    typeLabel: "X",
    sub: "X",
    visual,
    colour: visual.color,
    w: visual.size,
    h: visual.size,
    r: visual.size / 2,
    tier: "node",
    count: 0,
    more: 0,
    opened: 0,
    faded: false,
    lost: false,
    group: null,
    x: 0,
    y: 0,
    room: 0,
  };
  createRenderer(div, { text: TEXT }).draw({ ...BARE, nodes: [node] });
  return div.querySelector("defs > symbol") as Element;
}

const hex = (value: string) => value as Hex;
const base = (over: Partial<Designed>): Designed => ({
  rank: 0,
  shape: "circle",
  size: 20,
  color: hex("#2f6f8f"),
  ink: hex("#ffffff"),
  adjusted: false,
  ...over,
});

describe("S11 designed marks (scene from the test)", () => {
  it("draws the regulation hexagon with letters", () => {
    const symbol = symbolOf(
      base({
        rank: 4,
        shape: "hexagon",
        size: 44,
        color: hex("#8a4b4b"),
        letters: "RG",
      }),
    );
    expect(symbol.getAttribute("viewBox")).toBe("0 0 44 44");
    const shape = symbol.querySelector("polygon") as Element;
    expect(shape.getAttribute("points")).toBe(
      "22.00,1.50 39.75,11.75 39.75,32.25 22.00,42.50 4.25,32.25 4.25,11.75",
    );
    expect(shape.getAttribute("fill")).toBe("#8a4b4b");
    expect(shape.getAttribute("class")).toBe("qt-mark");
    const text = symbol.querySelector("text") as Element;
    expect(text.textContent).toBe("RG");
    expect(text.getAttribute("fill")).toBe("#ffffff");
    expect(text.getAttribute("font-size")).toBe("15.3");
  });

  it("draws a diamond, a square with rx and a triangle", () => {
    const diamond = symbolOf(base({ rank: 2, shape: "diamond", size: 32 }));
    expect(diamond.querySelector("polygon")?.getAttribute("points")).toBe(
      "16.00,1.50 30.50,16.00 16.00,30.50 1.50,16.00",
    );
    const square = symbolOf(base({ rank: 2, shape: "square", size: 32 }));
    expect(square.querySelector("rect")?.getAttribute("rx")).toBe("3.84");
    const triangle = symbolOf(base({ rank: 1, shape: "triangle", size: 26 }));
    expect(triangle.getAttribute("viewBox")).toBe("0 0 26 26");
    expect(
      triangle.querySelector("polygon")?.getAttribute("points")?.split(" "),
    ).toHaveLength(3);
    const circle = symbolOf(base({}));
    expect(circle.querySelector("circle")?.getAttribute("r")).toBe("8.5");
    for (const [shape, n] of [
      ["pentagon", 5],
      ["heptagon", 7],
      ["octagon", 8],
    ] as const) {
      const symbol = symbolOf(base({ shape, size: 38 }));
      expect(
        symbol.querySelector("polygon")?.getAttribute("points")?.split(" "),
      ).toHaveLength(n);
    }
  });
});

describe("S22 glyph re-check", () => {
  it("(a) a glyph that fails the pattern gives the letters and no path", () => {
    const symbol = symbolOf(base({ glyph: 'M0 0"/><script>', letters: "HS" }));
    expect(symbol.querySelector("path")).toBeNull();
    expect(symbol.querySelector("text")?.textContent).toBe("HS");
  });

  it("(b) a glyph of 513 characters gives no mark", () => {
    const symbol = symbolOf(base({ glyph: `M${"1".repeat(512)}` }));
    expect(symbol.querySelector("circle")?.getAttribute("class")).toBe(
      "qt-mark",
    );
    expect(symbol.querySelector("path")).toBeNull();
    expect(symbol.querySelector("text")).toBeNull();
  });

  it("(b2) a glyph of 512 characters gives one path with that d", () => {
    const glyph = `M${"1".repeat(511)}`;
    const symbol = symbolOf(base({ glyph }));
    const paths = symbol.querySelectorAll("path");
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute("d")).toBe(glyph);
    expect(paths[0].getAttribute("stroke")).toBe("#ffffff");
    expect(symbol.querySelector("text")).toBeNull();
  });
});
