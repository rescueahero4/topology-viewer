// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { packEnclose } from "d3-hierarchy";
import type { Hex } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BubbleHandlers,
  Camera,
  Intent,
  Report,
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
const CAMERA: Camera = { k: 1, x: 400, y: 300 };

type Part = Partial<SceneNode> & { id: string; type: string | null };
const node = (p: Part): SceneNode => ({
  kind: "entity",
  label: p.id,
  fullLabel: p.id,
  typeLabel: "T",
  sub: "T",
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
  x: 0,
  y: 0,
  ...p,
});
const sceneOf = (nodes: SceneNode[], types: Scene["types"]): Scene => ({
  nodes,
  edges: [],
  selection: { node: null, edge: null },
  layout: "bubbles",
  types,
});
const type = (key: string | null, label: string, colour = "#5b6b8c") =>
  [key, { label, colour: colour as Hex }] as Scene["types"][number];

function mount(scene: Scene, bubble?: BubbleHandlers) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, { text: TEXT, camera: CAMERA, bubble });
  const intents: Intent[] = [];
  const reports: Report[] = [];
  renderer.onIntent((i) => intents.push(i));
  renderer.onReport((r) => reports.push(r));
  renderer.draw(scene);
  return { div, renderer, intents, reports };
}

const mouse = (type: string, x: number, buttons = 1) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 300,
    buttons,
  });
  // why: STORY-003-06a decisions item 1 — the test gives `view` as an own property
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const num = (el: Element | null, name: string) =>
  Number(el?.getAttribute(name));
const circles = (div: HTMLElement) => [
  ...div.querySelectorAll("g.qt-bubble circle"),
];
const pills = (div: HTMLElement) => [...div.querySelectorAll("g.qt-blabel")];
const texts = (pill: Element) =>
  [...pill.querySelectorAll("text:not(.qt-a11y) tspan")].map(
    (t) => t.textContent,
  );

afterEach(() => {
  vi.advanceTimersByTime(1000);
  document.body.replaceChildren();
});

describe("S5 a press on the body pans; a click on it clears the selection", () => {
  it("pans by 100 px, moves no node, calls no bubble.move, then one select null", () => {
    const calls = { start: 0, move: 0, end: 0 };
    const bubble: BubbleHandlers = {
      start: () => (calls.start++, true),
      move: () => (calls.move++, []),
      end: () => void calls.end++,
    };
    const scene = sceneOf(
      [node({ id: "e:a", type: "t" }), node({ id: "e:b", type: "t", x: 70 })],
      [type("t", "T")],
    );
    const m = mount(scene, bubble);
    const body = circles(m.div)[0];
    const viewport = m.div.querySelector("g.qt-viewport") as Element;
    const before = viewport.getAttribute("transform");
    body.dispatchEvent(mouse("mousedown", 300));
    window.dispatchEvent(mouse("mousemove", 400));
    window.dispatchEvent(mouse("mouseup", 400, 0));
    expect(before).toBe("translate(400,300) scale(1)");
    expect(viewport.getAttribute("transform")).toBe(
      "translate(500,300) scale(1)",
    );
    expect(
      [...m.div.querySelectorAll("g.qt-node")].map((g) =>
        g.getAttribute("transform"),
      ),
    ).toEqual(["translate(0,0)", "translate(70,0)"]);
    vi.advanceTimersByTime(1);
    body.dispatchEvent(mouse("click", 400, 0));
    expect(calls).toEqual({ start: 0, move: 0, end: 0 });
    expect(m.intents).toEqual([{ kind: "select", node: null }]);
  });
});

describe("S8 faded nodes are in no circle", () => {
  it("draws no circle and no pill for a type with all members faded; counts the shown members", () => {
    const scene = sceneOf(
      [
        node({ id: "e:a1", type: "a", faded: true }),
        node({ id: "e:a2", type: "a", faded: true, x: 50 }),
        node({ id: "e:b1", type: "b", x: 200 }),
        node({ id: "e:b2", type: "b", x: 260, faded: true }),
        node({ id: "e:b3", type: "b", x: 320, room: 40 }),
      ],
      [type("a", "Alpha"), type("b", "Beta")],
    );
    const m = mount(scene);
    expect(circles(m.div)).toHaveLength(1);
    expect(pills(m.div)).toHaveLength(1);
    expect(texts(pills(m.div)[0])).toEqual(["Beta", " · 2"]);
    const e = packEnclose([
      { x: 200, y: 0, r: 30 },
      { x: 320, y: 0, r: 40 },
    ]);
    const c = circles(m.div)[0];
    expect([num(c, "cx"), num(c, "cy"), num(c, "r")]).toEqual([e.x, e.y, e.r]);
  });
});

// why: S11 (built scenes), Security notes "User safety; CPU drain" — only finite members inside
// the bound 1e100 go into `packEnclose`; the draw ends (test time-out 5 s)
describe("S11 members that are not finite or out of the bound", () => {
  it("leaves them out of the circles; the 1e120 type has no circle and no pill; no throw, no report", () => {
    const good = (id: string, t: string, x: number) =>
      node({ id, type: t, x, room: 20 });
    const scene = sceneOf(
      [
        good("e:n1", "nan", 0),
        node({ id: "e:n2", type: "nan", room: NaN }),
        good("e:i1", "inf", 300),
        node({ id: "e:i2", type: "inf", x: Infinity }),
        good("e:b1", "big", 600),
        node({ id: "e:b2", type: "big", x: 1e154 }),
        node({ id: "e:h1", type: "huge", x: 1e120, room: 1e119 }),
        node({ id: "e:h2", type: "huge", x: 0, y: 1e120, room: 2e119 }),
        node({ id: "e:h3", type: "huge", x: -1e120, y: -5e119, room: 3e119 }),
      ],
      [type("nan", "N"), type("inf", "I"), type("big", "B"), type("huge", "H")],
    );
    const m = mount(scene);
    const cs = circles(m.div).map((c) => [
      num(c, "cx"),
      num(c, "cy"),
      num(c, "r"),
    ]);
    expect(cs).toEqual([
      [0, 0, 20],
      [300, 0, 20],
      [600, 0, 20],
    ]);
    expect(pills(m.div).map((p) => texts(p)[0])).toEqual(["N", "I", "B"]);
    expect(m.reports).toEqual([]);
  }, 5000);
});

describe("the pill and its accessible name (S3, S21 on a built scene)", () => {
  it("draws the mockup parts, a name by aria-labelledby and its own id, with no title", () => {
    const scene = sceneOf(
      [node({ id: "e:a", type: "t", x: 10, y: 20, room: 30 })],
      [type("t", "Supplier", "#5b6b8c")],
    );
    const m = mount(scene);
    const pill = pills(m.div)[0];
    const rect = pill.querySelector("rect") as Element;
    const line = pill.querySelector("text:not(.qt-a11y)") as Element;
    const w = ("Supplier".length + " · 1".length) * 6.6 + 20;
    expect([
      num(rect, "x"),
      num(rect, "y"),
      num(rect, "width"),
      num(rect, "height"),
      num(rect, "rx"),
    ]).toEqual([-w / 2, -10, w, 20, 10]);
    expect(rect.getAttribute("stroke")).toBe("#5b6b8c");
    expect(rect.hasAttribute("fill")).toBe(false);
    expect([line.getAttribute("y"), line.getAttribute("fill")]).toEqual([
      "0.5",
      "#5b6b8c",
    ]);
    const spans = [...line.querySelectorAll("tspan")];
    expect(spans.map((s) => s.getAttribute("class"))).toEqual([null, "qt-bn"]);
    const id = pill.getAttribute("aria-labelledby") as string;
    expect(id).toMatch(/^qt[0-9]+-b-[0-9a-f]+$/);
    const name = m.div.querySelector(`[id="${id}"]`) as Element;
    expect(name.getAttribute("class")).toBe("qt-a11y");
    expect(pill.contains(name)).toBe(true);
    expect(name.textContent).toBe("Supplier · 1");
    expect(pill.hasAttribute("tabindex")).toBe(false);
    expect(m.div.querySelector("title")).toBeNull();
    expect(pill.getAttribute("transform")).toBe("translate(10,-10) scale(1)");
  });
});
