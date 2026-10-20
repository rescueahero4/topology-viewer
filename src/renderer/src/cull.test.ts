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
  structure: false,
  dashed: false,
  count: 1,
});

const GRID = Array.from({ length: 100 }, (_, i) =>
  node({
    id: `g${Math.floor(i / 10)}-${i % 10}`,
    label: "Node",
    tier: "leaf",
    h: 20,
    x: 5000 + 30 * (i % 10),
    y: 5000 + 30 * Math.floor(i / 10),
  }),
);

// An overlap pair (a group and a leaf), a control pair, a tie pair (degrees 1 and 3, the
// degree-1 node first) with far neighbours, and a 10 × 10 grid of leaves 30 units apart.
const SCENE: Scene = {
  nodes: [
    node({ id: "G", kind: "group", count: 5, x: 0, y: 0 }),
    node({ id: "L", tier: "leaf", x: 10, y: 0 }),
    node({ id: "A", tier: "leaf", x: 2000, y: 0 }),
    node({ id: "B", tier: "leaf", x: 2000, y: 300 }),
    node({ id: "T1", x: 0, y: 2000 }),
    node({ id: "T3", x: 10, y: 2000 }),
    ...[1, 2, 3, 4].map((i) =>
      node({ id: `X${i}`, x: 3000 + 200 * i, y: 3000 }),
    ),
    ...GRID,
  ],
  edges: [
    edge("T1", "X1"),
    edge("T3", "X2"),
    edge("T3", "X3"),
    edge("X4", "T3"),
  ],
  selection: { node: null, edge: null },
  layout: "force",
  types: [],
};

function mount() {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const camera = { k: 1.5, x: 0, y: 0 };
  createRenderer(div, { text: TEXT, camera }).draw(SCENE);
  const zoom = zooms[zooms.length - 1];
  const svg = select(div.querySelector("svg") as SVGSVGElement);
  const culled = () =>
    [...div.querySelectorAll("g.qt-node.qt-culled")].map(
      (el) => (el as unknown as { __data__: SceneNode }).__data__.id,
    );
  const endAt = (k: number) =>
    zoom.transform(svg, zoomIdentity.scale(k), null, new WheelEvent("wheel"));
  return { div, culled, endAt };
}

describe("S9 label culling", () => {
  it("at full: culls the leaf of the overlap pair, the degree-1 node of the tie pair and 50 grid labels", () => {
    const m = mount();
    const culled = m.culled();
    expect(culled.filter((id) => !id.startsWith("g"))).toEqual(["L", "T1"]);
    const grid = culled.filter((id) => id.startsWith("g"));
    expect(grid).toHaveLength(50);
    const kept = GRID.filter((n) => !grid.includes(n.id)).map((n) => n.id);
    expect(kept.filter((id) => id.startsWith("g0-"))).toEqual([
      "g0-0",
      "g0-2",
      "g0-4",
      "g0-6",
      "g0-8",
    ]);
    for (const id of kept) expect(Number(id.slice(-1)) % 2).toBe(0);
    m.div.remove();
  });

  it("at mid: leaves take no part and are not culled", () => {
    const m = mount();
    m.endAt(1.0);
    expect(m.culled()).toEqual(["T1"]);
    m.div.remove();
  });

  it("at low: no label is culled", () => {
    const m = mount();
    m.endAt(0.3);
    expect(m.culled()).toEqual([]);
    m.div.remove();
  });
});
