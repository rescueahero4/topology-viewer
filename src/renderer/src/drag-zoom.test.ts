// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { DrawnId, Hex, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BubbleHandlers,
  Camera,
  DragHandlers,
  RendererText,
  Scene,
  SceneNode,
} from "./index";

// why: STORY-003-04 "Fake clock" and build-time item B11 — the clear functions are faked too
vi.useFakeTimers({
  toFake: [
    "performance",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "Date",
  ],
});
vi.resetModules();
const { createRenderer } = await import("./index");

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
  canvasName: "Topology canvas",
  bubbleCount: (n: number) => ` · ${n}`,
} as RendererText;
// why: ISSUE-010 V1 — camera `k` 2, the node at layout (0, 0) is at client (400, 300)
const CAMERA: Camera = { k: 2, x: 400, y: 300 };

const node = (id: string, x: number, type = "table"): SceneNode => ({
  id,
  kind: "entity",
  type,
  label: "n",
  fullLabel: "n",
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
  group: null,
  room: 30,
  x,
  y: 0,
});
const SCENE: Scene = {
  nodes: [node("e:a", 0), node("e:b", 60)],
  edges: [],
  selection: { node: null, edge: null },
  layout: "bubbles",
  types: [["table", { label: "Table", colour: "#864627" as Hex }]],
};

type Positions = [DrawnId, Point][];
function mount(drag: DragHandlers, bubble: BubbleHandlers) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, {
    text: TEXT,
    camera: CAMERA,
    drag,
    bubble,
  });
  renderer.draw(SCENE);
  return { div, renderer };
}

const mouse = (type: string, x: number, y = 300, buttons = 1) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons,
  });
  // why: STORY-003-06a decisions item 1 — the test gives `view` as an own property
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const frame = () => vi.advanceTimersByTime(16);
const move = (x: number) => {
  window.dispatchEvent(mouse("mousemove", x));
  frame();
};
// why: ISSUE-010 V1 — a wheel zoom about client (420, 300): `deltaY` −300 gives the factor
// 2^0.6, so `k` 2 → 3.031 and `translate(389.69,300)`
function wheel(div: HTMLElement) {
  const svg = div.querySelector("svg") as SVGSVGElement;
  svg.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: -300,
      clientX: 420,
      clientY: 300,
      cancelable: true,
      bubbles: true,
    }),
  );
}
const layoutX = (c: number, t: Camera) => (c - t.x) / t.k;

afterEach(() => {
  vi.advanceTimersByTime(1000);
  document.body.replaceChildren();
});

const NO_BUBBLE: BubbleHandlers = {
  start: () => true,
  move: () => [],
  end: () => {},
};

describe("S19 ISSUE-010 V1: a node drag after a wheel zoom", () => {
  it("puts the drag point under the pointer through the transform after the wheel", () => {
    const pointers: Point[] = [];
    const drag: DragHandlers = {
      start: () => true,
      frame: (p) => (pointers.push(p), [["e:a", p]]),
      end: () => [],
    };
    const m = mount(drag, NO_BUBBLE);
    const el = m.div.querySelector("g.qt-node") as Element;
    el.dispatchEvent(mouse("mousedown", 400));
    move(420);
    expect(pointers).toEqual([{ x: 10, y: 0 }]);
    wheel(m.div);
    const t = m.renderer.transform();
    expect(t.k).toBeCloseTo(3.031, 3);
    expect(t.x).toBeCloseTo(389.69, 2);
    move(520);
    const last = pointers[pointers.length - 1];
    expect(Math.abs(last.x - layoutX(520, t))).toBeLessThan(1e-9);
    expect(last.x).toBeCloseTo(42.99, 2);
    expect(last.y).toBe(0);
    expect(el.getAttribute("transform")).toBe(`translate(${last.x},0)`);
    window.dispatchEvent(mouse("mouseup", 520, 300, 0));
  });
});

describe("S20 a pill drag after a wheel zoom", () => {
  it("sums the vectors to the pointer move through the transform after the wheel", () => {
    const vectors: Point[] = [];
    let at: Positions = SCENE.nodes.map((n) => [n.id, { x: n.x, y: n.y }]);
    const bubble: BubbleHandlers = {
      start: () => true,
      move(_type, v) {
        vectors.push(v);
        at = at.map(([id, p]) => [id, { x: p.x + v.x, y: p.y + v.y }]);
        return at;
      },
      end: () => {},
    };
    const drag: DragHandlers = {
      start: () => true,
      frame: () => [],
      end: () => [],
    };
    const m = mount(drag, bubble);
    const pill = m.div.querySelector("g.qt-blabel") as Element;
    const pillX = () =>
      Number(
        /translate\(([^,]+),/.exec(pill.getAttribute("transform") ?? "")?.[1],
      );
    const before = pillX() - layoutX(400, CAMERA);
    pill.dispatchEvent(mouse("mousedown", 400));
    move(420);
    expect(vectors).toEqual([{ x: 10, y: 0 }]);
    wheel(m.div);
    const t = m.renderer.transform();
    move(520);
    const sum = vectors.reduce((s, v) => s + v.x, 0);
    const want = layoutX(520, t) - (400 - 400) / 2;
    expect(Math.abs(sum - want)).toBeLessThan(1e-9);
    expect(sum).toBeCloseTo(42.99, 2);
    expect(vectors.every((v) => v.y === 0)).toBe(true);
    const nodes = [...m.div.querySelectorAll("g.qt-node")];
    expect(nodes.map((g) => g.getAttribute("transform"))).toEqual([
      `translate(${0 + vectors[0].x + vectors[1].x},0)`,
      `translate(${60 + vectors[0].x + vectors[1].x},0)`,
    ]);
    expect(Math.abs(pillX() - layoutX(520, t) - before)).toBeLessThan(1e-9);
    window.dispatchEvent(mouse("mouseup", 520, 300, 0));
  });
});
