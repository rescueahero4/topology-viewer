// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
import { select, type Selection } from "d3-selection";
import { zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { describe, expect, it, vi } from "vitest";
import { createRenderer } from "./renderer";
import type { Scene, SceneEdge, SceneNode } from "./scene";
import type { RendererText } from "./text";

// why: the test reads the zoom instance of `camera.ts` through a pass-through mock, as
// `cull.test.ts`; d3-zoom 3.0.0 takes a source event as the fourth `transform` argument
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

// why: jsdom has no ResizeObserver and gives each element 0 × 0
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

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

type Part = Partial<SceneNode> & { id: string; x: number; y: number };
const node = (p: Part): SceneNode => ({
  kind: "entity",
  type: "table",
  label: p.id,
  fullLabel: p.id,
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
  ...p,
});
const edge = (subject: string, object: string): SceneEdge => ({
  key: `${subject}|${object}`,
  subject,
  object,
  label: "rel",
  colour: "#2e9e6a" as Hex,
  muted: false,
  retired: false,
  structure: false,
  dashed: false,
  count: 1,
});

function mount(scene: Scene, camera = { k: 1, x: 400, y: 300 }) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  createRenderer(div, { text: TEXT, camera }).draw(scene);
  const zoom = zooms[zooms.length - 1];
  const svg = select(div.querySelector("svg") as SVGSVGElement);
  const endAt = (k: number) =>
    zoom.transform(svg, zoomIdentity.scale(k), null, new WheelEvent("wheel"));
  const off = (selector: string) =>
    [...div.querySelectorAll(selector)]
      .filter((el) => el.classList.contains("qt-off"))
      .map((el) => {
        const d = (el as unknown as { __data__: { id?: string; key?: string } })
          .__data__;
        return d.key ?? d.id;
      })
      .sort();
  const keys = (selector: string) =>
    [...div.querySelectorAll(selector)].map(
      (el) => (el as unknown as { __data__: SceneEdge }).__data__.key,
    );
  return { div, endAt, off, keys };
}

// why: S14 — two faded nodes; an edge with a faded end that has a pill (the selected faded node
// B); a shown edge; a faded edge whose ends are both off screen until the zoom out
const S14: Scene = {
  nodes: [
    node({ id: "A", x: -100, y: 0, faded: true }),
    node({ id: "B", x: 0, y: -100, faded: true }),
    node({ id: "C", x: 0, y: 0 }),
    node({ id: "D", x: 100, y: 0 }),
    node({ id: "E", x: 3000, y: 0 }),
    node({ id: "F", x: 3100, y: 0, faded: true }),
  ],
  edges: [edge("A", "C"), edge("B", "C"), edge("C", "D"), edge("E", "F")],
  selection: { node: "B", edge: null },
  layout: "force",
  types: [],
};

describe("S14 the fade classes", () => {
  it("faded nodes, the paths, hit paths and pills of edges with a faded end and the halo get qt-off", () => {
    const m = mount(S14);
    expect(m.off("g.qt-node")).toEqual(["A", "B", "F"]);
    expect(m.off("path.qt-edge")).toEqual(["A|C", "B|C", "E|F"]);
    expect(m.keys("path.qt-ehit").sort()).toEqual(["A|C", "B|C", "C|D"]);
    expect(m.off("path.qt-ehit")).toEqual(["A|C", "B|C"]);
    expect(m.keys("g.qt-elabel")).toEqual(["B|C"]);
    expect(m.off("g.qt-elabel")).toEqual(["B|C"]);
    const halo = m.div.querySelectorAll("g.qt-focus");
    expect(halo).toHaveLength(1);
    expect(halo[0].classList.contains("qt-off")).toBe(true);
    const all = [...m.div.querySelectorAll(".qt-off")];
    expect(all).toHaveLength(3 + 3 + 2 + 1 + 1);
    m.div.remove();
  });

  it("a hit path that the viewport update makes after a zoom gets qt-off too", () => {
    const m = mount(S14);
    m.endAt(0.1);
    expect(m.keys("path.qt-ehit").sort()).toEqual(["A|C", "B|C", "C|D", "E|F"]);
    expect(m.off("path.qt-ehit")).toEqual(["A|C", "B|C", "E|F"]);
    m.div.remove();
  });

  it("writes no inline style for the fade", () => {
    const m = mount(S14);
    for (const el of m.div.querySelectorAll(".qt-off"))
      expect(el.getAttribute("style")).toBeNull();
    m.div.remove();
  });
});

// why: S16 (b) — the STORY-003-04 S9 overlap pair at level `full` (k 1.5) below big mode; the
// named group ranks first; no edge, so the rank comes from "named first" only (c3)
const pair = (faded: boolean): Scene => ({
  nodes: [
    node({ id: "G", kind: "group", count: 5, x: 0, y: 0, faded }),
    node({ id: "L", tier: "leaf", x: 10, y: 0 }),
  ],
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
  types: [],
});
const culled = (div: HTMLElement) =>
  [...div.querySelectorAll("g.qt-node.qt-culled")].map(
    (el) => (el as unknown as { __data__: SceneNode }).__data__.id,
  );

describe("S16 (b) culling ranks the shown nodes only", () => {
  it("run 2 (control, no faded node): the leaf is culled", () => {
    const m = mount(pair(false), { k: 1.5, x: 400, y: 300 });
    expect(culled(m.div)).toEqual(["L"]);
    m.div.remove();
  });

  it("run 1 (the group faded): the leaf keeps its label; the group has qt-off and no qt-culled", () => {
    const m = mount(pair(true), { k: 1.5, x: 400, y: 300 });
    expect(culled(m.div)).toEqual([]);
    expect(m.off("g.qt-node")).toEqual(["G"]);
    m.div.remove();
  });
});
