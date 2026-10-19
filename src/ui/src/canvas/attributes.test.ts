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
  type Hex,
  type LayoutName,
} from "@qdic-topology/engine";
import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type SceneNode,
} from "@qdic-topology/renderer";
import { describe, expect, it } from "vitest";
import { auditStrings, domAudit } from "./domAudit";
import { sceneOf } from "./scene";

const NOW = "2026-10-19";
const CANVAS = canvasColor("#F4F4F5") as Hex;
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
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const NOT_DRAWN = ["s-invalid", "s-not-graph", "s-noid-all", "s-stress"];

// Payload HOSTILE (STORY-003-02; used again by STORY-003-03 S17).
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

function render(input: unknown, name: LayoutName | null) {
  const result = normalize(input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
  const first = firstView(graph, vocab, payload, hash);
  const state = setLayout(
    first,
    frontier(first, graph, vocab),
    vocab,
    name ?? first.layout,
    iconMetrics,
  );
  const view = frontier(state, graph, vocab);
  const scene = sceneOf({ state, frontier: view, vocab, canvas: CANVAS }, TEXT);
  const div = document.createElement("div");
  document.body.appendChild(div);
  createRenderer(div, { text: TEXT }).draw(scene);
  const root = div.firstElementChild as Element;
  const strings = auditStrings(graph, vocab, scene);
  return { result, view, scene, div, root, strings };
}

describe("S13 hostile payload", () => {
  const r = render(HOSTILE, null);
  const node = (id: string) =>
    [...r.div.querySelectorAll("g.qt-node")].find(
      (el) => (el as unknown as { __data__: SceneNode }).__data__.id === id,
    ) as Element;
  const symbolText = (id: string) => {
    const href = node(id).querySelector("use")?.getAttribute("href") ?? "";
    return document.getElementById(href.slice(1))?.querySelector("text")
      ?.textContent;
  };

  it("draws 4 nodes and 3 edges with glyph-rejected and constraint-violation", () => {
    expect(r.result.ok && r.result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["glyph-rejected", "constraint-violation"]),
    );
    expect(r.view.nodes).toHaveLength(4);
    expect(r.view.edges).toHaveLength(3);
  });

  it("gives no audit finding and no script, img, foreignObject or iframe", () => {
    expect(domAudit(r.root, r.strings, TEXT.canvasName)).toEqual([]);
    expect(
      r.div.querySelectorAll("script, img, foreignObject, iframe"),
    ).toHaveLength(0);
    expect(r.strings).toEqual(
      expect.arrayContaining([
        '"><script>x</script>',
        'x" onload="y',
        "Hostile",
      ]),
    );
  });

  it("draws the cut label and the letters of the hostile type", () => {
    const hostile = node("e:javascript:alert(1)");
    expect(hostile.querySelector("text.qt-name")?.textContent).toBe(
      `${"A".repeat(21)}…`,
    );
    expect(symbolText("e:javascript:alert(1)")).toBe("HS");
  });

  it("draws __proto__ and constructor safely", () => {
    expect(symbolText("e:__proto__")).toBe("PR");
    const proto = node("e:__proto__");
    expect(
      (proto as unknown as { __data__: SceneNode }).__data__.typeLabel,
    ).toBe(" proto ");
    expect(symbolText("e:constructor")).toBe("CN");
    const ctor = node("e:constructor");
    expect(ctor.querySelector("text.qt-name")?.textContent).toBe("");
    expect(ctor.querySelector("text.qt-a11y")?.textContent).toBe("Constructor");
  });
});

const CASES = Object.keys(fixtures)
  .filter((key) => !NOT_DRAWN.includes(key))
  .sort()
  .flatMap((key) => LAYOUTS.map((name) => [key, name] as const));

describe("S14 no model string in an attribute", () => {
  it.each(CASES)("%s in %s", (key, name) => {
    const r = render(loadFixture(key).input, name);
    expect(domAudit(r.root, r.strings, TEXT.canvasName)).toEqual([]);
    r.div.remove();
  });
});
