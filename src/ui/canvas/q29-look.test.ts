// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import {
  canvasColor,
  firstView,
  frontier,
  normalize,
  place,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type Hex,
} from "#engine";
import { loadFixture } from "#fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type SceneEdge,
  type SceneNode,
} from "#renderer";
import { describe, expect, it, vi } from "vitest";
import { sceneOf } from "./scene";

// why: jsdom has no ResizeObserver; the STORY-003-04 camera observes the root
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
// why: STORY-003-04 — hit paths exist only in a viewport, so the tests stub an 800 × 600 container
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
  tipEdgeAction: (label, muted, count, retired) =>
    `action(${label}, ${muted}, ${count}, ${retired})`,
  bubbleCount: (n: number) => ` · ${n}`,
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
};
const RETIRED = '["e:tbl-orders-archive","derivedFrom","e:tbl-orders"]';
const KEPT = '["e:clmn-archive-order-id","derivedFrom","e:clmn-order-id"]';
const ARCHIVE_CONTAINS =
  '["e:tbl-orders-archive","contains","e:clmn-archive-order-id"]';
const LOST = "e:t_SF_CONTACT";

// One renderer on one canvas; each step runs an engine action, places it and draws again.
function canvas(input: unknown) {
  const r = normalize(input, { now: NOW });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const { graph } = r;
  const { vocab } = resolveVocab(graph, r.payload, profile, CANVAS);
  const first = firstView(graph, vocab, r.payload, r.hash);
  let view = frontier(first, graph, vocab);
  let state = setLayout(first, view, vocab, first.layout, iconMetrics);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, { text: TEXT });
  const scene = () =>
    sceneOf({ state, frontier: view, vocab, canvas: CANVAS }, TEXT);
  const draw = () => renderer.draw(scene());
  const act = (action: Action) => {
    const next = transition(state, action, graph, vocab);
    const after = frontier(next, graph, vocab);
    state = place(
      next,
      { action, before: view, after },
      vocab,
      iconMetrics,
    ).state;
    view = after;
    draw();
    return scene();
  };
  const root = () => div.firstElementChild as Element;
  return { scene, draw, act, root };
}

type Canvas = ReturnType<typeof canvas>;
const fixture = (key: string) => canvas(loadFixture(key).input);
const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
const find = (c: Canvas, selector: string, key: string) =>
  [...c.root().querySelectorAll(selector)].find((el) => {
    const d = datum<{ id?: string; key?: string }>(el);
    return d.id === key || d.key === key;
  }) as Element;
function hover(c: Canvas, selector: string, key: string): string[] {
  find(c, selector, key).dispatchEvent(new MouseEvent("mouseenter"));
  const tip = c.root().querySelector("div.qt-tip") as Element;
  return [...tip.children].map((line) => line.textContent ?? "");
}
const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(" ");
const pills = (c: Canvas) =>
  [...c.root().querySelectorAll("g.qt-elabel")].map((g) => [
    datum<SceneEdge>(g).key,
    g.querySelector("text")?.textContent,
    g.querySelector("rect")?.getAttribute("width"),
  ]);
const TABLES = [
  { id: "a", type: "table" },
  { id: "b", type: "table" },
];
const ALL = { approach: "passive", budget: "all" };

describe("S9 the retired style on q-full-vocabulary", () => {
  it("(a), (b) the class, stroke and arrow; muted keeps qt-retired", () => {
    const c = fixture("q-full-vocabulary");
    c.draw();
    const el = find(c, "path.qt-edge", RETIRED);
    expect(datum<SceneEdge>(el).label).toBe("derivedFrom");
    expect(tokens(el)).toEqual(["qt-edge", "qt-retired"]);
    expect(el.getAttribute("stroke")).toBe(
      find(c, "path.qt-edge", KEPT).getAttribute("stroke"),
    );
    expect(el.getAttribute("stroke")).toMatch(/^#[0-9a-f]{6}$/);
    expect(el.getAttribute("marker-end")).toMatch(/^url\(#qt[0-9]+-a-/);
    const others = [...c.root().querySelectorAll("path.qt-edge")].filter(
      (p) => p !== el,
    );
    expect(others).toHaveLength(24);
    for (const p of others) expect(tokens(p)).not.toContain("qt-retired");
    expect(hover(c, "path.qt-ehit", RETIRED)[1]).toBe(
      TEXT.tipEdgeAction("derivedFrom", false, 1, true),
    );
    c.act({ kind: "togglePredicate", predicate: "derivedFrom", on: false });
    expect(c.root().querySelectorAll("path.qt-edge")).toHaveLength(25);
    expect(find(c, "path.qt-edge", RETIRED)).toBe(el);
    expect(tokens(el)).toEqual(["qt-edge", "qt-retired", "qt-muted"]);
    expect(el.hasAttribute("stroke")).toBe(false);
    expect(el.hasAttribute("marker-end")).toBe(false);
    expect(hover(c, "path.qt-ehit", RETIRED)[1]).toBe(
      TEXT.tipEdgeAction("derivedFrom", true, 1, true),
    );
  });

  it("(c) the pills of the two archive nodes", () => {
    const c = fixture("q-full-vocabulary");
    c.act({ kind: "select", node: "e:tbl-orders-archive" });
    expect(pills(c)).toEqual(
      expect.arrayContaining([
        [RETIRED, "derivedFrom (retired)", "148.4"],
        [ARCHIVE_CONTAINS, "contains", "65.2"],
      ]),
    );
    expect(pills(c)).toHaveLength(2);
    c.act({ kind: "select", node: "e:clmn-archive-order-id" });
    expect(pills(c)).toEqual(
      expect.arrayContaining([
        [ARCHIVE_CONTAINS, "contains", "65.2"],
        [KEPT, "derivedFrom", "84.4"],
      ]),
    );
    expect(pills(c)).toHaveLength(2);
    expect(tokens(find(c, "path.qt-edge", KEPT))).not.toContain("qt-retired");
  });

  it("(d) a predicate label of 29 characters stays whole in its pill", () => {
    const c = canvas({
      nodes: TABLES,
      edges: [{ subject: "a", predicate: "p", object: "b", isActive: false }],
      predicates: { p: { label: "supplies parts under contract" } },
      view: ALL,
    });
    c.act({ kind: "select", node: "e:a" });
    expect(pills(c)).toEqual([
      ['["e:a","p","e:b"]', "supplies parts under contract (retired)", "263.6"],
    ]);
  });

  it("tokens.css: the retired dash after the Other dash and before muted", () => {
    // why: QA re-work R1 — each rule is found as a whole rule at a line start, so a longer
    // selector does not match; the "\n" in front covers a rule on the first line
    const css = `\n${readFileSync(
      path.resolve(import.meta.dirname, "../tokens.css"),
      "utf8",
    )}`;
    const at = [
      "\n.qt-edge.qt-dashed {\n  stroke-dasharray: 4 3;\n}",
      "\n.qt-edge.qt-retired {\n  stroke-dasharray: 3 3;\n}",
      "\n.qt-edge.qt-muted {\n",
    ].map((rule) => css.indexOf(rule));
    expect(at.every((i) => i > -1)).toBe(true);
    expect(at[0]).toBeLessThan(at[1]);
    expect(at[1]).toBeLessThan(at[2]);
  });
});

describe("S10 the lost badge on s-vague", () => {
  const c = fixture("s-vague");
  c.draw();

  it("draws one g.qt-lost on e:t_SF_CONTACT with the badge values", () => {
    const badges = c.root().querySelectorAll("g.qt-lost");
    expect(badges).toHaveLength(1);
    const node = find(c, "g.qt-node", LOST);
    expect(datum<SceneNode>(node)).toMatchObject({
      type: "table",
      w: 24,
      h: 24,
    });
    const g = node.querySelector(":scope > g.qt-lost") as Element;
    expect(g).toBe(badges[0]);
    expect(g.getAttribute("transform")).toBe("translate(6,-18)");
    const rect = g.querySelector("rect") as Element;
    const attrs = ["x", "y", "width", "height", "rx"].map((a) =>
      rect.getAttribute(a),
    );
    expect(attrs).toEqual(["-16.9", "-7.5", "33.8", "15", "7.5"]);
    const text = g.querySelector("text") as Element;
    expect([text.textContent, text.getAttribute("y")]).toEqual(["lost", "0.5"]);
  });

  it("gives the node tooltip of STORY-003-03 with no lost line", () => {
    const lost = datum<SceneNode>(find(c, "g.qt-node", LOST));
    const shown = hover(c, "g.qt-node", LOST);
    const plain = canvas(loadFixture("s-vague").input);
    const scene = plain.scene();
    const div = document.createElement("div");
    document.body.appendChild(div);
    createRenderer(div, { text: TEXT }).draw({
      ...scene,
      nodes: scene.nodes.map((n) => ({ ...n, lost: false })),
    });
    const el = [...div.querySelectorAll("g.qt-node")].find(
      (n) => datum<SceneNode>(n).id === LOST,
    ) as Element;
    el.dispatchEvent(new MouseEvent("mouseenter"));
    const tip = div.querySelector("div.qt-tip") as Element;
    expect(shown).toEqual([...tip.children].map((l) => l.textContent));
    expect(shown[0]).toBe(lost.fullLabel);
    expect(shown).toHaveLength(2);
  });

  it("tokens.css holds the lost tokens and the .qt-lost rules", () => {
    const css = readFileSync(
      path.resolve(import.meta.dirname, "../tokens.css"),
      "utf8",
    ).replace(/var\(--tv-[\w-]+, ([^;]+?)\);/g, "$1;");
    for (const text of [
      "--lost-fill: #fee2e2;",
      "--lost-ink: #b91c1c;",
      ".qt-lost rect {\n  fill: var(--lost-fill);\n  stroke: var(--node-outline);\n  stroke-width: 1;\n}",
      ".qt-lost text {\n  fill: var(--lost-ink);\n  font-size: 10px;\n  font-weight: 500;\n  text-anchor: middle;\n  dominant-baseline: central;\n}",
    ])
      expect(css).toContain(text);
  });
});
