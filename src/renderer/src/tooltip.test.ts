// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
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

// Each function marks its arguments, so a line shows which key made it.
const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  tipGroup: (count, typeLabel) => `group(${count}, ${typeLabel})`,
  tipOpened: (sub) => `opened(${sub})`,
  tipMore: (sub, more) => `more(${sub}, ${more})`,
  tipMember: (sub) => `member(${sub})`,
  tipEdge: (subject, object) => `edge(${subject}, ${object})`,
  tipEdgeAction: (label, muted, count) =>
    `action(${label}, ${muted}, ${count})`,
  bubbleCount: (n: number) => ` · ${n}`,
};

const SUB = "Snowflake · Table";
const full = (id: string) => `${id}-${"x".repeat(29 - id.length)}`;
const cut = (label: string) => `${label.slice(0, 21)}…`;

function node(id: string, over: Partial<SceneNode> = {}): SceneNode {
  const fullLabel = full(id);
  return {
    id,
    kind: "entity",
    type: "table",
    label: cut(fullLabel),
    fullLabel,
    typeLabel: "Table",
    sub: SUB,
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
    x: 0,
    y: 0,
    ...over,
  };
}

const NODES = [
  node("group", {
    kind: "group",
    count: 300,
    sub: "Collapsed",
    x: 100,
  }),
  node("member", { group: "group", x: 200 }),
  node("more", { more: 34, x: 300 }),
  node("opened", { opened: 1, more: 3, x: 400 }),
  node("plain", { x: 500 }),
];

function edge(key: string, over: Partial<SceneEdge>): SceneEdge {
  return {
    key,
    subject: "plain",
    object: "group",
    label: "ownedBy",
    colour: "#2e9d6a" as Hex,
    muted: false,
    structure: false,
    dashed: false,
    count: 1,
    ...over,
  };
}

const EDGES = [
  edge("on", { count: 1 }),
  edge("off", { subject: "more", object: "member", muted: true, count: 300 }),
];

function mount() {
  const doc = document.implementation.createHTMLDocument("t");
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  const scene: Scene = {
    nodes: NODES,
    edges: EDGES,
    selection: { node: null, edge: null },
    layout: "force",
    types: [],
  };
  createRenderer(div, { text: TEXT }).draw(scene);
  const root = div.firstElementChild as HTMLDivElement;
  const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
  const hover = (selector: string, key: string) => {
    const el = [...root.querySelectorAll(selector)].find(
      (e) =>
        datum<{ id?: string; key?: string }>(e).id === key ||
        datum<{ key?: string }>(e).key === key,
    ) as Element;
    el.dispatchEvent(new MouseEvent("mouseenter"));
  };
  const tip = root.querySelector("div.qt-tip") as HTMLDivElement;
  return { root, tip, hover };
}

function lines(tip: HTMLDivElement): [string, string] {
  expect(tip.children).toHaveLength(2);
  expect(tip.childNodes).toHaveLength(2);
  const [main, sub] = [...tip.children];
  expect([main.localName, main.getAttribute("class")]).toEqual([
    "div",
    "qt-tip-main",
  ]);
  expect([sub.localName, sub.getAttribute("class")]).toEqual([
    "div",
    "qt-tip-sub",
  ]);
  for (const line of [main, sub]) {
    expect(line.childNodes).toHaveLength(1);
    expect(line.firstChild?.nodeType).toBe(3);
    expect(line.children).toHaveLength(0);
  }
  return [main.textContent ?? "", sub.textContent ?? ""];
}

describe("S15 tooltip lines", () => {
  const m = mount();
  const label = (id: string) => full(id);

  it("has full labels of 30 characters and labels of a 22-unit cut", () => {
    for (const n of NODES) {
      expect(n.fullLabel).toHaveLength(30);
      expect(n.label).toHaveLength(22);
      expect(n.label).not.toBe(n.fullLabel);
    }
  });

  const nodeCases: [string, string][] = [
    ["group", "group(300, Table)"],
    ["member", `member(${SUB})`],
    ["more", `more(${SUB}, 34)`],
    ["opened", `opened(${SUB})`],
    ["plain", SUB],
  ];

  it.each(nodeCases)("node %s", (id, sub) => {
    m.hover("g.qt-node", id);
    expect(lines(m.tip)).toEqual([label(id), sub]);
    expect(m.tip.classList.contains("qt-on")).toBe(true);
  });

  it("edge not muted with count 1", () => {
    m.hover("path.qt-ehit", "on");
    expect(lines(m.tip)).toEqual([
      `edge(${label("plain")}, ${label("group")})`,
      "action(ownedBy, false, 1)",
    ]);
  });

  it("edge muted with count 300", () => {
    m.hover("path.qt-ehit", "off");
    expect(lines(m.tip)).toEqual([
      `edge(${label("more")}, ${label("member")})`,
      "action(ownedBy, true, 300)",
    ]);
  });

  it("places the tooltip by left and top in px only", () => {
    m.hover("g.qt-node", "plain");
    expect(m.tip.getAttribute("style")).toMatch(
      /^left: -?[0-9.]+px; top: -?[0-9.]+px;$/,
    );
  });
});
