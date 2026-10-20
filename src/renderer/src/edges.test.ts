// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex, LayoutName } from "@qdic-topology/engine";
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

const hex = (value: string) => value as Hex;

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
    colour: hex("#864627"),
    w: 24,
    h: 24,
    r: 12,
    tier: "asset",
    count: 0,
    more: 0,
    opened: 0,
    faded: false,
    group: null,
    x,
    y,
  };
}

function edge(
  key: string,
  subject: string,
  object: string,
  over: Partial<SceneEdge> = {},
): SceneEdge {
  return {
    key,
    subject,
    object,
    label: key,
    colour: hex("#2e9e6a"),
    muted: false,
    structure: false,
    dashed: false,
    count: 1,
    ...over,
  };
}

const NODES = [node("A", 0, 0), node("B", 200, 50), node("C", -150, 120)];
const EDGES = [
  edge("structure", "A", "B", { structure: true, colour: hex("#25437e") }),
  edge("plain", "A", "C"),
  edge("dashed", "B", "C", { dashed: true, colour: hex("#71717a") }),
  edge("muted", "C", "A", { muted: true, colour: hex("#9e702e") }),
  edge("loop", "B", "B"),
];

function draw(layout: LayoutName, over: Partial<Scene> = {}) {
  const doc = document.implementation.createHTMLDocument("t");
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  const scene: Scene = {
    nodes: NODES,
    edges: EDGES,
    selection: { node: null, edge: null },
    layout,
    ...over,
  };
  createRenderer(div, { text: TEXT }).draw(scene);
  const path = (key: string) =>
    [...div.querySelectorAll<SVGPathElement>("path.qt-edge")].find(
      (el) => (el as unknown as { __data__: SceneEdge }).__data__.key === key,
    ) as SVGPathElement;
  const d = (key: string) => path(key).getAttribute("d") as string;
  return { doc, div, path, d };
}

const NUMBER = String.raw`(-?[0-9.]+(?:e-?[0-9]+)?)`;
const LINE = new RegExp(`^M${NUMBER},${NUMBER}L${NUMBER},${NUMBER}$`);
const CURVE = new RegExp(
  `^M${NUMBER},${NUMBER}C${NUMBER},${NUMBER} ${NUMBER},${NUMBER} ${NUMBER},${NUMBER}$`,
);

function numbers(d: string, form: RegExp): number[] {
  const match = form.exec(d);
  if (match === null) throw new Error(`not in the form: ${d}`);
  return match.slice(1).map(Number);
}

describe("S4 force: straight lines", () => {
  const r = draw("force");

  it("draws M…L… for every edge", () => {
    for (const { key } of EDGES) expect(r.d(key)).toMatch(LINE);
  });

  it("ends the plain edge r + 2 before the object centre", () => {
    const [, , x, y] = numbers(r.d("plain"), LINE);
    expect(Math.hypot(x - -150, y - 120)).toBeCloseTo(14, 2);
  });

  it("ends the Structure edge at the object centre", () => {
    const [, , x, y] = numbers(r.d("structure"), LINE);
    expect(Math.hypot(x - 200, y - 50)).toBeCloseTo(0, 2);
  });

  it("gives the self-loop zero length", () => {
    const [x1, y1, x2, y2] = numbers(r.d("loop"), LINE);
    expect([x1, y1]).toEqual([200, 50]);
    expect([x2, y2]).toEqual([200, 50]);
  });
});

describe("S4 tree layouts: curves out of the side that faces the object", () => {
  it("tree-h: the plain edge leaves A to the left and ends w/2 + 3 before C", () => {
    const r = draw("tree-h");
    for (const { key } of EDGES) expect(r.d(key)).toMatch(CURVE);
    const [x1, y1, mx, , , , x2, y2] = numbers(r.d("plain"), CURVE);
    expect([x1, y1]).toEqual([-12, 0]);
    expect([x2, y2]).toEqual([-150 + 12 + 3, 120]);
    expect(mx).toBe((x1 + x2) / 2);
    const [, , , , , , sx] = numbers(r.d("structure"), CURVE);
    expect(sx).toBe(200 - 12);
  });

  it("tree-h: the self-loop is the mockup side-to-side curve", () => {
    expect(draw("tree-h").d("loop")).toBe("M212,50C198.5,50 198.5,50 185,50");
  });

  it("tree-v: the plain edge leaves A downward and ends h/2 + 3 before C", () => {
    const r = draw("tree-v");
    for (const { key } of EDGES) expect(r.d(key)).toMatch(CURVE);
    const [x1, y1, , , , , x2, y2] = numbers(r.d("plain"), CURVE);
    expect([x1, y1]).toEqual([0, 12]);
    expect([x2, y2]).toEqual([-150, 120 - 12 - 3]);
    expect(draw("tree-v").d("loop")).toBe("M200,62C200,48.5 200,48.5 200,35");
  });
});

describe("S4 style, markers and hit paths", () => {
  const r = draw("force");
  const markers = () => [...r.div.querySelectorAll("defs > marker")];

  it("puts qt-dashed only on the dashed edge", () => {
    const dashed = [...r.div.querySelectorAll("path.qt-edge.qt-dashed")];
    expect(dashed).toEqual([r.path("dashed")]);
  });

  it("draws the muted edge with qt-muted, no stroke and no marker-end", () => {
    const muted = r.path("muted");
    expect(muted.getAttribute("class")).toBe("qt-edge qt-muted");
    expect(muted.hasAttribute("stroke")).toBe(false);
    expect(muted.hasAttribute("marker-end")).toBe(false);
  });

  it("gives the Structure edge its stroke and no marker-end", () => {
    expect(r.path("structure").getAttribute("stroke")).toBe("#25437e");
    expect(r.path("structure").hasAttribute("marker-end")).toBe(false);
  });

  it("makes one marker per distinct colour, each marker-end resolves to its own colour", () => {
    expect(markers().map((m) => m.getAttribute("id"))).toEqual([
      "qt1-a-2e9e6a",
      "qt1-a-71717a",
    ]);
    for (const key of ["plain", "dashed", "loop"]) {
      const path = r.path(key);
      const url = path.getAttribute("marker-end") as string;
      const marker = r.doc.getElementById(url.slice(5, -1)) as Element;
      expect(url).toMatch(/^url\(#qt1-a-[0-9a-f]{6}\)$/);
      expect(marker.querySelector("path")?.getAttribute("fill")).toBe(
        path.getAttribute("stroke"),
      );
    }
  });

  it("draws the mockup marker constants", () => {
    const marker = markers()[0];
    expect(
      Object.fromEntries(
        [...marker.attributes].map((a) => [a.name, a.value] as const),
      ),
    ).toEqual({
      id: "qt1-a-2e9e6a",
      viewBox: "0 -4 8 8",
      refX: "8",
      refY: "0",
      markerUnits: "userSpaceOnUse",
      markerWidth: "8",
      markerHeight: "8",
      orient: "auto",
    });
    expect(marker.querySelector("path")?.getAttribute("d")).toBe(
      "M0,-3.5L8,0L0,3.5",
    );
  });

  it("draws one hit path per edge with the same d, in scene order", () => {
    const hits = [...r.div.querySelectorAll("path.qt-ehit")];
    expect(hits.map((h) => h.getAttribute("d"))).toEqual(
      EDGES.map((e) => r.d(e.key)),
    );
  });

  it("leaves no unused marker after the next draw", () => {
    const doc = document.implementation.createHTMLDocument("t");
    const div = doc.createElement("div");
    doc.body.appendChild(div);
    const renderer = createRenderer(div, { text: TEXT });
    const scene: Scene = {
      nodes: NODES,
      edges: EDGES,
      selection: { node: null, edge: null },
      layout: "force",
    };
    renderer.draw(scene);
    renderer.draw({ ...scene, edges: [EDGES[2]] });
    expect([...div.querySelectorAll("defs > marker")].map((m) => m.id)).toEqual(
      ["qt1-a-71717a"],
    );
  });
});

describe("S4 a bad scene Hex sets nothing", () => {
  const bad = edge("bad", "A", "C", { colour: hex("#ZZZ") });

  it("sets no stroke, no marker-end and makes no marker", () => {
    const r = draw("force", { edges: [bad] });
    expect(r.path("bad").hasAttribute("stroke")).toBe(false);
    expect(r.path("bad").hasAttribute("marker-end")).toBe(false);
    expect(r.div.querySelectorAll("marker")).toHaveLength(0);
  });

  it("gives the pill of the selected bad edge no fill", () => {
    const r = draw("force", {
      edges: [bad],
      selection: { node: "A", edge: "bad" },
    });
    const rect = r.div.querySelector("g.qt-elabel rect") as Element;
    expect(rect.hasAttribute("fill")).toBe(false);
  });

  it("gives a selected node with a bad colour halo circles with no fill and no stroke", () => {
    const nodes = [{ ...NODES[0], colour: hex("#ZZZ") }, ...NODES.slice(1)];
    const r = draw("force", { nodes, selection: { node: "A", edge: null } });
    const circles = [...r.div.querySelectorAll("g.qt-focus circle")];
    expect(circles).toHaveLength(4);
    for (const circle of circles) {
      expect(circle.hasAttribute("fill")).toBe(false);
      expect(circle.hasAttribute("stroke")).toBe(false);
    }
  });
});
