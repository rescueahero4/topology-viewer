// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  firstView,
  frontier,
  normalize,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type Hex,
} from "@qdic-topology/engine";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type SceneEdge,
} from "@qdic-topology/renderer";
import { describe, expect, it } from "vitest";
import { auditStrings, domAudit } from "./domAudit";
import { sceneOf } from "./scene";

const NOW = "2026-10-19";
const CANVAS = canvasColor("#F4F4F5") as Hex;
// The edge action line is the label alone, so S18 reads the label in the tooltip.
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

// Payload HOSTILE of STORY-003-02 (`attributes.test.ts`).
const HOSTILE = {
  nodes: [
    { id: "h1", type: "table", label: '"><script>x</script>' },
    {
      id: "javascript:alert(1)",
      type: 'x" onload="y',
      label: "A".repeat(10000),
    },
    { id: "__proto__", type: "__proto__", label: "__proto__" },
    { id: "constructor", type: "constructor", label: "" },
  ],
  edges: [
    ["h1", "<img src=x>", "javascript:alert(1)"],
    ["h1", "toString", "__proto__"],
    ["h1", "ownedBy", "constructor"],
  ],
  types: { 'x" onload="y': { label: "Hostile", glyph: 'M0 0"/><script>' } },
  view: { approach: "passive", budget: "all" },
};

function canvas(input: unknown) {
  const result = normalize(input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
  const first = firstView(graph, vocab, payload, hash);
  let state = setLayout(
    first,
    frontier(first, graph, vocab),
    vocab,
    first.layout,
    iconMetrics,
  );
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, { text: TEXT });
  const root = div.firstElementChild as Element;
  const tip = root.querySelector("div.qt-tip") as Element;
  const act = (action: Action) => {
    state = transition(state, action, graph, vocab);
    const view = frontier(state, graph, vocab);
    const scene = sceneOf(
      { state, frontier: view, vocab, canvas: CANVAS },
      TEXT,
    );
    renderer.draw(scene);
    return { view, scene, strings: auditStrings(graph, vocab, scene) };
  };
  const hits = () => [...root.querySelectorAll("path.qt-ehit")];
  const pills = () =>
    [...root.querySelectorAll("g.qt-elabel")].map((g) => ({
      text: g.querySelector("text")?.textContent,
      width: g.querySelector("rect")?.getAttribute("width"),
    }));
  return { div, root, tip, act, hits, pills };
}

const lines = (tip: Element) => [...tip.children].map((l) => l.textContent);

function check(root: Element, tip: Element, strings: string[]): void {
  const all = [...strings, ...lines(tip).filter((t): t is string => !!t)];
  expect(domAudit(root, all, TEXT.canvasName)).toEqual([]);
  const prefix = /^(qt[0-9]+)-/.exec(
    root.querySelector("[id]")?.getAttribute("id") ?? "",
  )?.[1];
  for (const el of root.querySelectorAll("[stroke], [fill]"))
    for (const name of ["stroke", "fill"]) {
      const value = el.getAttribute(name);
      if (value !== null) expect(value).toMatch(/^(#[0-9a-f]{6}|none)$/);
    }
  for (const el of root.querySelectorAll("[marker-end]")) {
    const url = el.getAttribute("marker-end") as string;
    expect(url).toMatch(new RegExp(`^url\\(#${prefix}-a-[0-9a-f]{6}\\)$`));
    expect(
      root.querySelector(`marker[id="${url.slice(5, -1)}"]`),
    ).not.toBeNull();
  }
  for (const part of [root.querySelector("svg"), tip])
    expect(part?.querySelectorAll("script, img, foreignObject")).toHaveLength(
      0,
    );
}

describe("S17 hostile payload with selection and hover", () => {
  const c = canvas(HOSTILE);

  it("selects e:h1: no audit finding, and the pills read as text", () => {
    const r = c.act({ kind: "select", node: "e:h1" });
    expect(r.view.edges).toHaveLength(3);
    check(c.root, c.tip, r.strings);
    expect(
      c
        .pills()
        .map((p) => p.text)
        .sort(),
    ).toEqual(["<img src=x>", "toString", "ownedBy"].sort());
    expect(c.root.querySelectorAll("marker[id]").length).toBeGreaterThan(0);
  });

  it("an edge selection and a hover of each edge and of a node give no finding", () => {
    const first = c.act({ kind: "select", node: "e:h1" });
    const key = first.view.edges[0].key;
    const r = c.act({ kind: "selectEdge", edge: key, anchor: "e:h1" });
    check(c.root, c.tip, r.strings);
    for (const hit of c.hits()) {
      hit.dispatchEvent(new MouseEvent("mouseenter"));
      expect(c.tip.classList.contains("qt-on")).toBe(true);
      check(c.root, c.tip, r.strings);
      hit.dispatchEvent(new MouseEvent("mouseleave"));
    }
    const node = c.root.querySelector("g.qt-node") as Element;
    node.dispatchEvent(new MouseEvent("mouseenter"));
    expect(lines(c.tip)[0]).toBe('"><script>x</script>');
    check(c.root, c.tip, r.strings);
    const edge = (c.hits()[0] as unknown as { __data__: SceneEdge }).__data__;
    expect(r.strings).toEqual(expect.arrayContaining([edge.key, edge.label]));
  });
});

describe("S18 empty, CJK and 10,000-character predicate labels", () => {
  const LONG = "p".repeat(10000);
  const c = canvas({
    nodes: [{ id: "s" }, { id: "o1" }, { id: "o2" }, { id: "o3" }],
    edges: [
      ["s", "p1", "o1"],
      ["s", "p2", "o2"],
      ["s", "p3", "o3"],
    ],
    predicates: {
      p1: { label: "" },
      p2: { label: "所有者" },
      p3: { label: LONG },
    },
    view: { approach: "passive", budget: "all" },
  });

  it("draws the pills with the exact text and width", () => {
    c.act({ kind: "select", node: "e:s" });
    const byText = new Map(c.pills().map((p) => [p.text, p.width]));
    expect(byText).toEqual(
      new Map([
        ["", "14"],
        ["所有者", "33.2"],
        [LONG, "64014"],
      ]),
    );
  });

  it("shows the same text in the tooltip", () => {
    const shown = c.hits().map((hit) => {
      hit.dispatchEvent(new MouseEvent("mouseenter"));
      return lines(c.tip)[1];
    });
    expect(shown.sort()).toEqual(["", "所有者", LONG].sort());
  });
});
