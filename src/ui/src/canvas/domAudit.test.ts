// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Designed, Hex } from "@qdic-topology/engine";
import {
  createRenderer,
  type RendererText,
  type SceneNode,
} from "@qdic-topology/renderer";
import { describe, expect, it } from "vitest";
import { CLASS_NAMES, domAudit } from "./domAudit";

const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
};
const GLYPH = "M3 12h18";
const LABEL = "Revenue";

const glyphVisual: Designed = {
  rank: 2,
  shape: "square",
  size: 32,
  color: "#2f6f8f" as Hex,
  ink: "#ffffff" as Hex,
  adjusted: false,
  glyph: GLYPH,
};

function node(id: string, over: Partial<SceneNode>): SceneNode {
  return {
    id,
    kind: "entity",
    type: "table",
    label: LABEL,
    fullLabel: LABEL,
    typeLabel: "Table",
    sub: "Table",
    visual: { icon: "table" },
    colour: "#864627" as Hex,
    w: 24,
    h: 24,
    r: 12,
    tier: "asset",
    count: 0,
    more: 3,
    opened: 0,
    group: null,
    x: 0,
    y: 0,
    ...over,
  };
}

// A canvas made by the renderer, so each case changes one thing of a clean tree.
function canvas() {
  const doc = document.implementation.createHTMLDocument("t");
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  createRenderer(div, { text: TEXT }).draw({
    nodes: [
      node("e:t", {}),
      node("g:t", { kind: "group", count: 5, more: 0 }),
      node("e:d", { visual: glyphVisual, w: 32, h: 32, r: 16, tier: "node" }),
    ],
  });
  const root = div.firstElementChild as HTMLDivElement;
  const q = <T extends Element>(selector: string) =>
    root.querySelector(selector) as T;
  return { doc, root, q };
}

type Canvas = ReturnType<typeof canvas>;
const audit = (c: Canvas, strings: string[] = []) =>
  domAudit(c.root, strings, TEXT.canvasName);
const ruleOf = (line: string) => line.slice(0, 4);

function tip(c: Canvas, style: string): void {
  const el = c.doc.createElement("div");
  el.setAttribute("class", "qt-tip");
  el.setAttribute("style", style);
  c.root.appendChild(el);
}

const BAD: [string, string, (c: Canvas) => string[] | void][] = [
  [
    "DA-1",
    "foreignObject under the svg",
    (c) => {
      c.q("svg").appendChild(
        c.doc.createElementNS("http://www.w3.org/2000/svg", "foreignObject"),
      );
    },
  ],
  [
    "DA-1",
    "onclick on a node",
    (c) => c.q("g.qt-node").setAttribute("onclick", "x()"),
  ],
  [
    "DA-1",
    "div under a g",
    (c) => {
      c.q("g.qt-node").appendChild(c.doc.createElement("div"));
    },
  ],
  [
    "DA-1",
    "href to a missing symbol",
    (c) => c.q("use").setAttribute("href", "#qt1-s-99"),
  ],
  [
    "DA-1",
    "id qt1-s-table",
    (c) => c.q("symbol").setAttribute("id", "qt1-s-table"),
  ],
  ["DA-1", "numeric attribute NaN", (c) => c.q("use").setAttribute("x", "NaN")],
  [
    "DA-1",
    "aria-labelledby that does not resolve",
    (c) => c.q("g.qt-node").setAttribute("aria-labelledby", "qt1-l-99"),
  ],
  [
    "DA-1",
    "svg aria-label from a node label",
    (c) => c.q("svg").setAttribute("aria-label", LABEL),
  ],
  [
    "DA-2",
    'fill="white"',
    (c) => c.q("symbol path").setAttribute("fill", "white"),
  ],
  [
    "DA-2",
    'stroke="#ABCDEF"',
    (c) => c.q("symbol path").setAttribute("stroke", "#ABCDEF"),
  ],
  [
    "DA-3",
    'class="qt-node x"',
    (c) => c.q("g.qt-node").setAttribute("class", "qt-node x"),
  ],
  [
    "DA-3",
    "class made from the type",
    (c) => c.q("g.qt-node").setAttribute("class", "qt-node qt-table"),
  ],
  [
    "DA-4",
    "aria-labelledby equal to a model string",
    (c) => {
      c.q("g.qt-node").setAttribute("aria-labelledby", "abcde");
      return ["abcde"];
    },
  ],
  ["DA-4", "an attribute that contains a model string", () => ["pology"]],
  [
    "DA-4",
    "the subtitle in an attribute",
    (c) => {
      c.q("use").setAttribute("href", "#Table");
      return ["Table"];
    },
  ],
  [
    "DA-5",
    "root --k: url(x)",
    (c) => c.root.setAttribute("style", "--k: url(x)"),
  ],
  ["DA-5", "root --k: 9", (c) => c.root.setAttribute("style", "--k: 9")],
  ["DA-5", "root --k: 0.04", (c) => c.root.setAttribute("style", "--k: 0.04")],
  ["DA-5", "root --k: 0", (c) => c.root.setAttribute("style", "--k: 0")],
  [
    "DA-5",
    "root --k: 1; color: red",
    (c) => c.root.setAttribute("style", "--k: 1; color: red"),
  ],
  [
    "DA-5",
    "root --k: 1 !important",
    (c) => c.root.setAttribute("style", "--k: 1 !important"),
  ],
  [
    "DA-5",
    "root --k two times",
    (c) => c.root.setAttribute("style", "--k: 1; --k: 2"),
  ],
  [
    "DA-5",
    "root part with no colon",
    (c) => c.root.setAttribute("style", "--k 1"),
  ],
  ["DA-5", "root --K: 1", (c) => c.root.setAttribute("style", "--K: 1")],
  [
    "DA-5",
    "svg tap highlight red",
    (c) => c.q("svg").setAttribute("style", "-webkit-tap-highlight-color: red"),
  ],
  [
    "DA-5",
    "svg touch-action: none",
    (c) => c.q("svg").setAttribute("style", "touch-action: none"),
  ],
  [
    "DA-5",
    "node touch-action: auto",
    (c) => c.q("g.qt-node").setAttribute("style", "touch-action: auto"),
  ],
  [
    "DA-5",
    "node tap highlight red",
    (c) =>
      c
        .q("g.qt-node")
        .setAttribute("style", "-webkit-tap-highlight-color: red"),
  ],
  ["DA-5", "tooltip left: 1em", (c) => tip(c, "left: 1em")],
  ["DA-5", "tooltip top: 1em", (c) => tip(c, "top: 1em")],
  ["DA-5", "tooltip --k: 1", (c) => tip(c, "--k: 1")],
  [
    "DA-5",
    "path style opacity",
    (c) => c.q("symbol path").setAttribute("style", "opacity: 1"),
  ],
];

describe("S24 planted cases", () => {
  it("gives no finding on the clean canvas", () => {
    expect(audit(canvas())).toEqual([]);
  });

  it.each(BAD)("%s: %s", (rule, _name, plant) => {
    const c = canvas();
    const strings = plant(c) ?? [];
    const findings = audit(c, strings);
    expect(findings.map(ruleOf)).toContain(rule);
  });
});

const ALLOWED: [string, (c: Canvas) => string[] | void][] = [
  ["root --k: 0.05", (c) => c.root.setAttribute("style", "--k: 0.05")],
  ["root --k: 6", (c) => c.root.setAttribute("style", "--k: 6")],
  [
    "svg tap highlight",
    (c) =>
      c
        .q("svg")
        .setAttribute("style", "-webkit-tap-highlight-color: rgba(0, 0, 0, 0)"),
  ],
  [
    "node touch-action and tap highlight",
    (c) =>
      c
        .q("g.qt-node")
        .setAttribute(
          "style",
          "touch-action: none; -webkit-tap-highlight-color: rgba(0,0,0,0)",
        ),
  ],
  ["class qt-viewport with the model string view", () => ["view"]],
  ["a model string of 3 characters inside a value", () => ["can"]],
  ["the empty string", () => [""]],
  ["a glyph d that is also a model string", () => [GLYPH]],
];

describe("S24 allowed forms", () => {
  it.each(ALLOWED)("%s gives no finding", (_name, plant) => {
    const c = canvas();
    const strings = plant(c) ?? [];
    expect(audit(c, strings)).toEqual([]);
  });

  it("tooltip left: 12.5px; top: -3px gives no DA-5 finding", () => {
    const c = canvas();
    tip(c, "left: 12.5px; top: -3px");
    // why: STORY-003-03 adds the class `qt-tip` to CLASS_NAMES and tokens.css (DA-3)
    expect(audit(c).filter((line) => ruleOf(line) !== "DA-3")).toEqual([]);
  });

  it("the glyph sits in the d of the designed symbol", () => {
    const c = canvas();
    const ds = [...c.root.querySelectorAll("symbol path")].map((p) =>
      p.getAttribute("d"),
    );
    expect(ds).toContain(GLYPH);
  });
});

describe("B7 class names and tokens.css", () => {
  it("has each CLASS_NAMES entry in tokens.css, and each tokens.css class in CLASS_NAMES", () => {
    const css = readFileSync(
      path.resolve(import.meta.dirname, "../tokens.css"),
      "utf8",
    );
    const inCss = new Set(
      css.match(/\.qt-[a-z0-9-]+/g)?.map((c) => c.slice(1)),
    );
    expect([...inCss].sort()).toEqual([...CLASS_NAMES].sort());
  });
});
