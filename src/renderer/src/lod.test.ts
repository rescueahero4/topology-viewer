// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
import { select, type Selection } from "d3-selection";
import { zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { describe, expect, it, vi } from "vitest";
import { createRenderer } from "./renderer";
import type { Scene, SceneEdge, SceneNode } from "./scene";
import type { RendererText } from "./text";

// why: the test reads the zoom instance of `camera.ts` through a pass-through mock; production
// code has no test hook (Implementer round 3 item (1)). d3-zoom 3.0.0 takes a source event as
// the fourth `transform` argument (a gesture); @types/d3-zoom 3.0.8 does not declare it
type Zoom = ZoomBehavior<SVGSVGElement, unknown> & {
  transform(
    s: Selection<SVGSVGElement, unknown, null, undefined>,
    t: ZoomTransform,
    p: null,
    e: Event,
  ): void;
};
const zooms = vi.hoisted(() => [] as Zoom[]);
vi.mock("d3-zoom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("d3-zoom")>();
  return {
    ...mod,
    zoom: () => {
      const z = mod.zoom<SVGSVGElement, unknown>();
      zooms.push(z as Zoom);
      return z;
    },
  };
});

// why: jsdom has no ResizeObserver; the camera observes the root
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

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
  tipEdgeAction: (label) => label,
};

const node = (i: number): SceneNode => ({
  id: `n${i}`,
  kind: "entity",
  type: "table",
  label: `n${i}`,
  fullLabel: `n${i}`,
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
  x: (i % 40) * 50,
  y: Math.floor(i / 40) * 50,
});

const edge = (s: number, o: number): SceneEdge => ({
  key: `e${s}-${o}`,
  subject: `n${s}`,
  object: `n${o}`,
  label: "next",
  colour: "#2e9e6a" as Hex,
  muted: false,
  structure: false,
  dashed: false,
  count: 1,
});

const sceneOf = (count: number, extra: Partial<Scene> = {}): Scene => ({
  nodes: Array.from({ length: count }, (_, i) => node(i)),
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
  ...extra,
});

function mount(scene: Scene) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, {
    text: TEXT,
    camera: { k: 1, x: 0, y: 0 },
  });
  renderer.draw(scene);
  const zoom = zooms[zooms.length - 1];
  const root = div.firstElementChild as HTMLDivElement;
  const svg = select(div.querySelector("svg") as SVGSVGElement);
  return {
    div,
    root,
    renderer,
    k: () => root.style.getPropertyValue("--k"),
    zoomTo: (k: number) => zoom.transform(svg, zoomIdentity.scale(k)),
    end: (k: number) =>
      zoom.transform(svg, zoomIdentity.scale(k), null, new WheelEvent("wheel")),
    level: () => {
      if (root.classList.contains("qt-lod-low")) return "low";
      return root.classList.contains("qt-lod-mid") ? "mid" : "full";
    },
  };
}

describe("S7 --k steps by 8 % in log scale", () => {
  it("writes 1.2 but not 1.05, and keeps 1.2 after the end", () => {
    const m = mount(sceneOf(7));
    expect(m.k()).toBe("");
    m.zoomTo(1.05);
    expect(m.k()).toBe("");
    m.zoomTo(1.2);
    expect(m.k()).toBe("1.2");
    m.end(1.2);
    expect(m.k()).toBe("1.2");
    expect(m.root.getAttribute("style")).toBe("--k: 1.2;");
    m.div.remove();
  });

  it("writes the k of a small step at the end of a gesture", () => {
    const m = mount(sceneOf(7));
    m.zoomTo(1.05);
    expect(m.k()).toBe("");
    m.end(1.05);
    expect(m.k()).toBe("1.05");
    m.div.remove();
  });
});

const ZOOMS = [0.3, 0.4, 0.9, 1.0, 1.4, 1.5];

describe("S8 levels and big mode", () => {
  it("7 nodes: low, mid, mid, mid, full, full, with --k", () => {
    const m = mount(sceneOf(7));
    const levels = ZOOMS.map((k) => (m.zoomTo(k), m.level()));
    expect(levels).toEqual(["low", "mid", "mid", "mid", "full", "full"]);
    expect(m.k()).not.toBe("");
    expect(m.root.classList.contains("qt-big")).toBe(false);
    expect(m.div.querySelectorAll("text.qt-sub")).toHaveLength(7);
    m.div.remove();
  });

  it("1,300 nodes: big, low, low, low, mid, full, full, no subtitle, no --k", () => {
    const m = mount(sceneOf(1300));
    expect(m.root.classList.contains("qt-big")).toBe(true);
    const levels = ZOOMS.map((k) => (m.zoomTo(k), m.level()));
    expect(levels).toEqual(["low", "low", "low", "mid", "full", "full"]);
    m.end(1.5);
    expect(m.div.querySelectorAll("text.qt-sub")).toHaveLength(0);
    expect(m.div.querySelectorAll("text.qt-name")).toHaveLength(1300);
    expect(m.k()).toBe("");
    expect(m.root.hasAttribute("style")).toBe(false);
    m.renderer.draw(sceneOf(1200));
    expect(m.root.classList.contains("qt-big")).toBe(false);
    expect(m.div.querySelectorAll("text.qt-sub")).toHaveLength(1200);
    expect(m.k()).toBe("1.5");
    m.renderer.draw(sceneOf(1201));
    expect(m.root.classList.contains("qt-big")).toBe(true);
    expect(m.div.querySelectorAll("text.qt-sub")).toHaveLength(0);
    m.div.remove();
  });
});

describe("S18 pills keep their screen size; the tooltip hides on zoom", () => {
  it("scales each pill by 1/k and hides the tooltip", () => {
    const scene = sceneOf(3, {
      edges: [edge(0, 1), edge(0, 2)],
      selection: { node: "n0", edge: null },
    });
    const m = mount(scene);
    const pills = () =>
      [...m.div.querySelectorAll("g.qt-elabel")].map(
        (el) => el.getAttribute("transform") ?? "",
      );
    expect(pills()).toHaveLength(2);
    for (const t of pills()) expect(t).toMatch(/ scale\(1\)$/);
    const tip = m.div.querySelector("div.qt-tip") as HTMLDivElement;
    const n1 = [...m.div.querySelectorAll("g.qt-node")][1];
    n1.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tip.classList.contains("qt-on")).toBe(true);
    m.zoomTo(2);
    for (const t of pills()) expect(t).toMatch(/ scale\(0\.5\)$/);
    expect(tip.classList.contains("qt-on")).toBe(false);
    m.div.remove();
  });
});
