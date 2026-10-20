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
import { loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type Scene,
} from "@qdic-topology/renderer";
import { describe, expect, it, vi } from "vitest";
import { auditStrings, domAudit } from "./domAudit";
import { CLASS_NAMES } from "./domAllowList";
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
    `${label}${muted ? " (filtered out)" : ""}${retired ? " (retired)" : ""} · ${count}`,
  bubbleCount: (n: number) => ` · ${n}`,
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
};

const ZWJ = "\u{1F469}‍\u{1F4BB}";
const SCRIPT = '"><script>x</script>';
// why: S14 — the S7 labels with a lone surrogate that comes from JSON, not from the source text
const LONE = JSON.parse(`"${"a".repeat(5)}\\uD800${"b".repeat(25)}"`) as string;
const CUT_LABELS = [
  "z".repeat(10000),
  LONE,
  `${"a".repeat(13)}${ZWJ}${"x".repeat(9)}${ZWJ}bbbbbb`,
  `${"a".repeat(13)}\u{1F600}${"x".repeat(9)}\u{1F600}bbbbbb`,
  `${"a".repeat(10)}…${"b".repeat(20)}`,
  SCRIPT.repeat(3),
];

// Payload HOSTILE of STORY-003-02 with the S14 nodes, a lost node and a retired edge.
const PAYLOAD = {
  nodes: [
    { id: "h1", type: "table", label: SCRIPT },
    {
      id: "javascript:alert(1)",
      type: 'x" onload="y',
      label: "A".repeat(10000),
    },
    { id: "__proto__", type: "__proto__", label: "__proto__" },
    { id: "constructor", type: "constructor", label: "" },
    ...CUT_LABELS.map((label, i) => ({ id: `c${i}`, type: "table", label })),
    {
      id: "lost",
      type: "table",
      label: `${SCRIPT}lost`,
      attrs: { is_lost: true },
    },
  ],
  edges: [
    ["h1", "<img src=x>", "javascript:alert(1)"],
    ["h1", "toString", "__proto__"],
    ["h1", "ownedBy", "constructor"],
    ...CUT_LABELS.map((_, i) => ["h1", `q${i}`, `c${i}`]),
    { subject: "h1", predicate: "gone", object: "lost", isActive: false },
  ],
  types: { 'x" onload="y': { label: "Hostile", glyph: 'M0 0"/><script>' } },
  predicates: { gone: { label: `${SCRIPT}gone` } },
  view: { approach: "passive", budget: "all" },
};

function canvas(input: unknown) {
  const r = normalize(input, { now: NOW });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const { graph } = r;
  const { vocab } = resolveVocab(graph, r.payload, profile, CANVAS);
  const first = firstView(graph, vocab, r.payload, r.hash);
  const view = frontier(first, graph, vocab);
  let state = setLayout(first, view, vocab, first.layout, iconMetrics);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, { text: TEXT });
  const root = div.firstElementChild as Element;
  const draw = (action: Action | null = null) => {
    if (action !== null) state = transition(state, action, graph, vocab);
    const drawn = frontier(state, graph, vocab);
    const scene = sceneOf(
      { state, frontier: drawn, vocab, canvas: CANVAS },
      TEXT,
    );
    renderer.draw(scene);
    return { scene, strings: auditStrings(graph, vocab, scene) };
  };
  return { root, draw };
}

type Canvas = ReturnType<typeof canvas>;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// why: build-time item B1 — the head and the tail of each cut join the DA-4 strings
function cutParts(scene: Scene): string[] {
  return scene.nodes
    .filter((n) => n.label !== n.fullLabel)
    .flatMap((n) => {
      const parts = Array.from(graphemes.segment(n.label), (g) => g.segment);
      return [parts.slice(0, 14).join(""), parts.slice(15).join("")];
    });
}

function texts(c: Canvas): string[] {
  const shown = c.root.querySelectorAll(
    "div.qt-tip > div, g.qt-elabel text, g.qt-lost text",
  );
  return [...shown].map((el) => el.textContent ?? "").filter((t) => t !== "");
}

function audit(c: Canvas, r: { scene: Scene; strings: string[] }): void {
  const strings = [...r.strings, ...cutParts(r.scene), ...texts(c)];
  expect(domAudit(c.root, strings, TEXT.canvasName)).toEqual([]);
  expect(
    c.root.querySelectorAll("script, img, foreignObject, iframe"),
  ).toHaveLength(0);
}

const nodeEl = (c: Canvas, id: string) =>
  [...c.root.querySelectorAll("g.qt-node")].find(
    (el) => (el as unknown as { __data__: { id: string } }).__data__.id === id,
  ) as Element;
const edgeHit = (c: Canvas, key: string) =>
  [...c.root.querySelectorAll("path.qt-ehit")].find(
    (el) =>
      (el as unknown as { __data__: { key: string } }).__data__.key === key,
  ) as Element;
const GONE = '["e:h1","gone","e:lost"]';

describe("S14 (a) hostile labels through the middle cut", () => {
  it(
    "gives no audit finding; each cut label is only the text of its qt-name",
    { timeout: 5000 },
    () => {
      const c = canvas(PAYLOAD);
      const r = c.draw();
      const cut = r.scene.nodes.filter((n) => n.label !== n.fullLabel);
      expect(cut.map((n) => n.id).sort()).toEqual(
        [
          "e:javascript:alert(1)",
          "e:c0",
          "e:c1",
          "e:c2",
          "e:c3",
          "e:c4",
          "e:c5",
          "e:lost",
        ].sort(),
      );
      expect(cutParts(r.scene)).toEqual(
        expect.arrayContaining(['"><script>x</s', "script>"]),
      );
      audit(c, r);
      const attributes = [c.root, ...c.root.querySelectorAll("*")].flatMap(
        (el) => [...el.attributes].map((a) => a.value),
      );
      for (const n of cut) {
        expect(nodeEl(c, n.id).querySelector("text.qt-name")?.textContent).toBe(
          n.label,
        );
        for (const value of attributes)
          expect(value.includes(n.label)).toBe(false);
      }
    },
  );
});

describe("S14 (b) the lost badge and the retired style", () => {
  it("gives no finding after a selection and a hover of the retired edge and the lost node", () => {
    const c = canvas(PAYLOAD);
    const r = c.draw({ kind: "select", node: "e:h1" });
    expect(r.scene.edges.find((e) => e.key === GONE)?.retired).toBe(true);
    expect(r.scene.nodes.find((n) => n.id === "e:lost")?.lost).toBe(true);
    edgeHit(c, GONE).dispatchEvent(new MouseEvent("mouseenter"));
    const sub = c.root.querySelector("div.qt-tip-sub") as Element;
    expect(sub.textContent).toBe(`${SCRIPT}gone (retired) · 1`);
    audit(c, r);
    nodeEl(c, "e:lost").dispatchEvent(new MouseEvent("mouseenter"));
    audit(c, r);
    const pill = [...c.root.querySelectorAll("g.qt-elabel text")].find(
      (t) => t.textContent === `${SCRIPT}gone (retired)`,
    );
    expect(pill?.children).toHaveLength(0);
    for (const line of c.root.querySelectorAll(
      "div.qt-tip-main, div.qt-tip-sub",
    ))
      expect(line.children).toHaveLength(0);
  });

  it("the badge uses only g, rect and text, with no style, and its text has no element", () => {
    const c = canvas(PAYLOAD);
    c.draw();
    const badge = nodeEl(c, "e:lost").querySelector("g.qt-lost") as Element;
    expect([...badge.querySelectorAll("*")].map((el) => el.localName)).toEqual([
      "rect",
      "text",
    ]);
    expect(badge.querySelector("text")?.children).toHaveLength(0);
    expect(
      c.root.querySelectorAll(
        "g.qt-lost [style], g.qt-lost[style], path.qt-retired[style]",
      ),
    ).toHaveLength(0);
    expect(c.root.querySelectorAll("path.qt-edge.qt-retired")).toHaveLength(1);
    expect(CLASS_NAMES).toEqual(
      expect.arrayContaining(["qt-lost", "qt-retired"]),
    );
  });

  it("q-full-vocabulary and s-vague with the S9 and S10 Givens give no finding", () => {
    const full = canvas(loadFixture("q-full-vocabulary").input);
    const r = full.draw({ kind: "select", node: "e:tbl-orders-archive" });
    edgeHit(
      full,
      '["e:tbl-orders-archive","derivedFrom","e:tbl-orders"]',
    ).dispatchEvent(new MouseEvent("mouseenter"));
    audit(full, r);
    const vague = canvas(loadFixture("s-vague").input);
    const v = vague.draw();
    nodeEl(vague, "e:t_SF_CONTACT").dispatchEvent(new MouseEvent("mouseenter"));
    audit(vague, v);
    expect(vague.root.querySelectorAll("g.qt-lost")).toHaveLength(1);
  });
});
