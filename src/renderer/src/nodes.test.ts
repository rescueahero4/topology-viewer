// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Designed, Hex } from "@qdic-topology/engine";
import { describe, expect, it, vi } from "vitest";
import { badgeText } from "./badges";
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
};

// why: STORY-003-03 — a scene of nodes only: no edge, no selection
const BARE: Omit<Scene, "nodes"> = {
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
};

function mount() {
  const doc = document.implementation.createHTMLDocument("t");
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  return { doc, div };
}

function designed(shape: Designed["shape"], over: Partial<Designed> = {}) {
  return {
    rank: 3,
    shape,
    size: 38,
    color: "#2f6f8f" as Hex,
    ink: "#ffffff" as Hex,
    adjusted: false,
    letters: "AB",
    ...over,
  } satisfies Designed;
}

function node(id: string, over: Partial<SceneNode> = {}): SceneNode {
  return {
    id,
    kind: "entity",
    type: "table",
    label: id,
    fullLabel: `${id} full`,
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
    x: 10,
    y: 20,
    ...over,
  };
}

const SHAPES = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "pentagon",
  "hexagon",
  "heptagon",
  "octagon",
] as const;

const S5: Scene = {
  ...BARE,
  nodes: [
    node("e:t"),
    ...SHAPES.map((shape) =>
      node(`e:${shape}`, { visual: designed(shape), w: 38, h: 38, r: 19 }),
    ),
    node("g:t", {
      kind: "group",
      count: 300,
      label: "300 Table",
      fullLabel: "300 Table",
      sub: "Collapsed",
    }),
    node("e:more", { more: 34, tier: "leaf" }),
    node("e:open", { more: 3, opened: 1 }),
  ],
};

const nodesOf = (root: ParentNode) =>
  [...root.querySelectorAll<SVGGElement>("g.qt-node")].map((el) => ({
    el,
    datum: (el as unknown as { __data__: SceneNode }).__data__,
  }));

describe("S5 node drawing", () => {
  const { doc, div } = mount();
  createRenderer(div, { text: TEXT }).draw(S5);
  const drawn = nodesOf(div);
  const byId = (id: string) => drawn.find((d) => d.datum.id === id)?.el;

  it("draws one g.qt-node per scene node, in scene order", () => {
    expect(drawn.map((d) => d.datum.id)).toEqual(S5.nodes.map((n) => n.id));
    expect(div.querySelectorAll("div.qt-root")).toHaveLength(1);
  });

  it("gives one symbol per distinct visual in first-use order, and each use resolves", () => {
    const ids = [...div.querySelectorAll("defs > symbol")].map((s) => s.id);
    expect(ids).toEqual(Array.from({ length: 9 }, (_, n) => `qt1-s-${n}`));
    for (const use of div.querySelectorAll("use")) {
      const id = (use.getAttribute("href") ?? "").slice(1);
      expect(doc.getElementById(id)?.localName).toBe("symbol");
    }
    expect(byId("e:t")?.querySelector("use")?.getAttribute("href")).toBe(
      "#qt1-s-0",
    );
    expect(byId("g:t")?.querySelector("use")?.getAttribute("href")).toBe(
      "#qt1-s-0",
    );
    expect(doc.getElementById("qt1-s-0")?.getAttribute("fill")).toBe("none");
  });

  it("draws the chips with their widths and the qt-open class", () => {
    const more = byId("e:more")?.querySelector("g.qt-more");
    expect(more?.getAttribute("class")).toBe("qt-more");
    expect(more?.querySelector("text")?.textContent).toBe("+34");
    expect(more?.querySelector("rect")?.getAttribute("width")).toBe("26");
    const open = byId("e:open")?.querySelector("g.qt-more");
    expect(open?.getAttribute("class")).toBe("qt-more qt-open");
    expect(open?.querySelector("text")?.textContent).toBe("−");
    expect(open?.querySelector("rect")?.getAttribute("width")).toBe("17");
    expect(byId("e:t")?.querySelector("g.qt-more")).toBeNull();
  });

  it("draws the group halo and the badge", () => {
    const group = byId("g:t") as SVGGElement;
    const halo = [...group.querySelectorAll(":scope > circle")];
    expect(halo.map((c) => c.getAttribute("r"))).toEqual([
      String(12 * 1.55),
      String(12 * 1.28),
    ]);
    expect(halo.map((c) => c.getAttribute("opacity"))).toEqual(["0.1", "0.12"]);
    expect(halo.map((c) => c.getAttribute("fill"))).toEqual([
      "#864627",
      "#864627",
    ]);
    const badge = group.querySelector("g.qt-badge");
    expect(badge?.querySelector("text")?.textContent).toBe("300");
    expect(badge?.querySelector("rect")?.getAttribute("width")).toBe("27.6");
    expect(badge?.getAttribute("transform")).toBe("translate(6,-18)");
  });

  it("sets the classes qt-grouped and qt-leaf", () => {
    // why: the nodes of this scene overlap, so the STORY-003-04 culling adds `qt-culled`
    const drawing = (id: string) =>
      (byId(id)?.getAttribute("class") ?? "").replace(" qt-culled", "");
    expect(drawing("g:t")).toBe("qt-node qt-grouped");
    expect(drawing("e:more")).toBe("qt-node qt-leaf");
    expect(drawing("e:t")).toBe("qt-node");
  });

  it("makes each node focusable with a name from a hidden text", () => {
    for (const { el, datum } of drawn) {
      expect(el.getAttribute("tabindex")).toBe("0");
      const label = doc.getElementById(
        el.getAttribute("aria-labelledby") ?? "",
      );
      expect(label?.getAttribute("class")).toBe("qt-a11y");
      expect(label?.textContent).toBe(datum.fullLabel);
    }
    const svg = div.querySelector("svg.qt-svg");
    expect(svg?.getAttribute("role")).toBe("group");
    expect(svg?.getAttribute("aria-label")).toBe(TEXT.canvasName);
  });

  it("names a node with no full label by its subtitle", () => {
    const { doc: d2, div: div2 } = mount();
    const scene: Scene = {
      ...BARE,
      nodes: [node("e:x", { fullLabel: "", sub: "Constructor" })],
    };
    createRenderer(div2, { text: TEXT }).draw(scene);
    const el = div2.querySelector("g.qt-node") as SVGGElement;
    const label = d2.getElementById(el.getAttribute("aria-labelledby") ?? "");
    expect(label?.textContent).toBe("Constructor");
  });
});

describe("S6 badgeText", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1k"],
    [1234, "1.2k"],
    [9999, "10k"],
    [10000, "10k"],
    [12345, "12k"],
  ])("%i gives %s", (n, text) => {
    expect(badgeText(n)).toBe(text);
  });
});

describe("S22 (c) colour re-check", () => {
  it("sets no fill or stroke from a bad scene Hex", () => {
    const { div } = mount();
    const bad = (value: string) => value as Hex;
    const scene: Scene = {
      ...BARE,
      nodes: [
        ...["#GGGGGG", "red", "#ABCDEF"].map((colour, i) =>
          node(`g:${i}`, { kind: "group", count: 2, colour: bad(colour) }),
        ),
        node("e:d", {
          visual: designed("square", {
            color: bad("red"),
            ink: bad("#ABCDEF"),
          }),
        }),
      ],
    };
    createRenderer(div, { text: TEXT }).draw(scene);
    const halos = div.querySelectorAll("g.qt-grouped > circle");
    expect(halos).toHaveLength(6);
    for (const circle of halos) {
      expect(circle.hasAttribute("fill")).toBe(false);
      expect(circle.hasAttribute("stroke")).toBe(false);
    }
    const shape = div.querySelector("symbol .qt-mark") as Element;
    expect(shape.getAttribute("class")).toBe("qt-mark");
    expect(shape.hasAttribute("fill")).toBe(false);
    expect(shape.hasAttribute("stroke")).toBe(false);
    const letters = div.querySelector("symbol text") as Element;
    expect(letters.textContent).toBe("AB");
    expect(letters.hasAttribute("fill")).toBe(false);
    for (const el of div.querySelectorAll("[fill], [stroke]"))
      for (const name of ["fill", "stroke"])
        if (el.hasAttribute(name))
          expect(el.getAttribute(name)).toMatch(/^(#[0-9a-f]{6}|none)$/);
  });
});

describe("S23 end rule (H8)", () => {
  it("ends renderer A when its root leaves the page, and A stays ended", () => {
    const { doc, div } = mount();
    const scene2: Scene = {
      ...BARE,
      nodes: [node("e:other"), node("e:more")],
    };
    const a = createRenderer(div, { text: TEXT });
    a.draw(S5);
    const rootA = div.firstElementChild as Element;
    const b = createRenderer(div, { text: TEXT });
    b.draw(S5);
    const before = rootA.outerHTML;
    expect(() => a.draw(scene2)).not.toThrow();
    expect(div.children).toHaveLength(1);
    expect(div.firstElementChild).not.toBe(rootA);
    expect(rootA.outerHTML).toBe(before);
    doc.body.appendChild(rootA);
    expect(rootA.isConnected).toBe(true);
    a.draw(scene2);
    expect(rootA.outerHTML).toBe(before);
  });
});

describe("T1 jsdom options", () => {
  it("runs no script element (runScripts outside-only)", () => {
    const script = document.createElement("script");
    script.textContent = "document.body.setAttribute('data-ran', '1')";
    document.body.appendChild(script);
    expect(document.body.hasAttribute("data-ran")).toBe(false);
  });
});
