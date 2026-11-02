// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "#engine";
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
let size = { w: 695, h: 100 };
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: size.w, height: size.h }) as DOMRect;

const TEXT = {
  groupLabel: () => "",
  collapsed: "",
  unknownType: "",
  canvasName: "Topology canvas",
  tipGroup: () => "",
  tipOpened: () => "",
  tipMore: () => "",
  tipMember: () => "",
  tipEdge: () => "",
  tipEdgeAction: () => "",
  bubbleCount: (n: number) => ` · ${n}`,
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
} satisfies RendererText;

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
  w: 20,
  h: 20,
  r: 10,
  tier: "asset",
  count: 0,
  more: 0,
  opened: 0,
  faded: false,
  lost: false,
  group: null,
  x: 100 * i,
  y: 0,
  room: 0,
});

const edge = (i: number): SceneEdge => ({
  key: `e${i}`,
  subject: `n${i}`,
  object: `n${i + 1}`,
  label: "next",
  colour: "#2e9e6a" as Hex,
  muted: false,
  retired: false,
  structure: false,
  dashed: false,
  count: 1,
});

const CHAIN: Scene = {
  nodes: Array.from({ length: 14 }, (_, i) => node(i)),
  edges: Array.from({ length: 13 }, (_, i) => edge(i)),
  selection: { node: null, edge: null },
  layout: "force",
  types: [],
};

const keys = (div: HTMLElement, selector: string) =>
  [...div.querySelectorAll(selector)].map(
    (el) => (el as unknown as { __data__: SceneEdge }).__data__.key,
  );

describe("S10 viewport hit paths", () => {
  it("draws hit paths only for edges that meet the container widened by 12 px", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const camera = { k: 1, x: 0, y: 0 };
    const renderer = createRenderer(div, { text: TEXT, camera });
    renderer.draw(CHAIN);
    const all = CHAIN.edges.map((e) => e.key);
    expect(keys(div, "path.qt-edge")).toEqual(all);
    expect(keys(div, "path.qt-ehit")).toEqual(all.slice(0, 8));
    const svg = div.querySelector("svg") as SVGSVGElement;
    const zoom = zooms[zooms.length - 1];
    zoom.transform(
      select(svg),
      zoomIdentity.translate(-700, 0),
      null,
      new MouseEvent("mousemove"),
    );
    expect(renderer.transform()).toEqual({ k: 1, x: -700, y: 0 });
    expect(keys(div, "path.qt-ehit")).toEqual(all.slice(6));
    expect(keys(div, "path.qt-edge")).toEqual(all);
    div.remove();
  });

  it("gives the hit path the d of its edge", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    createRenderer(div, { text: TEXT, camera: { k: 1, x: 0, y: 0 } }).draw(
      CHAIN,
    );
    const d = (selector: string) =>
      div.querySelector(selector)?.getAttribute("d");
    expect(d("path.qt-ehit")).toBe(d("path.qt-edge"));
    div.remove();
  });

  it("draws no hit path in a 0 × 0 container", () => {
    size = { w: 0, h: 0 };
    const div = document.createElement("div");
    document.body.appendChild(div);
    createRenderer(div, { text: TEXT }).draw(CHAIN);
    expect(keys(div, "path.qt-ehit")).toEqual([]);
    expect(keys(div, "path.qt-edge")).toHaveLength(13);
    size = { w: 695, h: 100 };
    div.remove();
  });
});
