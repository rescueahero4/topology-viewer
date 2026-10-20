// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Hex } from "@qdic-topology/engine";
import type { Scene, SceneNode } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: STORY-003-04 "Fake clock", build-time item B11 — the clock comes before `d3-timer` loads
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
const engine = await import("@qdic-topology/engine");
const { profile } = await import("@qdic-topology/contract");
const { loadFixture } = await import("@qdic-topology/fixtures");
const { createRenderer, iconMetrics } = await import("@qdic-topology/renderer");
const { createCanvas } = await import("./index");
const { drawnOf } = await import("./bubbles-reference");
const { auditStrings, domAudit } = await import("./domAudit");
const { sceneOf } = await import("./scene");

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const LIGHT = engine.canvasColor("#F4F4F5") as Hex;
const TEXT = {
  groupLabel: (typeLabel: string, count: number) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  tipGroup: (count: number, typeLabel: string) => `${count} × ${typeLabel}`,
  tipOpened: (sub: string) => sub,
  tipMore: (sub: string) => sub,
  tipMember: (sub: string) => sub,
  tipEdge: (subject: string, object: string) => `${subject} → ${object}`,
  tipEdgeAction: (label: string) => label,
  bubbleCount: (n: number) => ` · ${n}`,
};

function modelOf(input: unknown): CanvasModel {
  const r = engine.normalize(input, { now: "2026-10-19" });
  if (!r.ok) throw new Error("fatal");
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, LIGHT);
  return { ...r, vocab, canvas: LIGHT };
}

type Settle = CanvasEvent["settle"];
// why: story Test plan — the standard pipeline and `createCanvas`, then `setLayout("bubbles")`
// from the Force first view, run to its end (the layout motion and the fit)
async function open(key: string | object) {
  const input = typeof key === "string" ? loadFixture(key).input : key;
  const model = modelOf(input);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model });
  const settles: Settle[] = [];
  const notices: CanvasEvent["notice"][] = [];
  canvas.on("settle", (e) => settles.push(e));
  canvas.on("notice", (e) => notices.push(e));
  await Promise.resolve();
  canvas.setLayout("bubbles");
  vi.advanceTimersByTime(3000);
  const last = () => settles[settles.length - 1];
  return { div, canvas, model, last, notices };
}
type Open = Awaited<ReturnType<typeof open>>;
const pillsOf = (div: Element) => [...div.querySelectorAll("g.qt-blabel")];
const audit = (o: Open) => {
  const { state, frontier } = o.last();
  const { vocab, canvas, graph } = o.model;
  const scene = sceneOf({ state, frontier, vocab, canvas }, TEXT);
  const root = o.div.firstElementChild as Element;
  return domAudit(root, auditStrings(graph, vocab, scene), TEXT.canvasName);
};

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

const S1 = [
  ["Regulation", 1],
  ["Supplier", 2],
  ["Factory", 2],
  ["Product", 3],
] as const;

// why: S11, LEARNINGS 21 — type keys `__proto__`, `constructor`, `a"<b>`, the string "null" and
// "e:n1" (the drawn id of node `n1`), two untyped nodes, a declared label "" and a 10,000-character
// label; a computed key keeps `__proto__` as an own key
const LONG = "L".repeat(10000);
const HOSTILE = {
  nodes: [
    { id: "p1", type: "__proto__", label: "p" },
    { id: "c1", type: "constructor", label: "c" },
    { id: "a1", type: 'a"<b>', label: "a" },
    { id: "s1", type: "null", label: "s" },
    { id: "n1", type: "e:n1", label: "n" },
    { id: "u1", label: "u" },
    { id: "u2", label: "v" },
    { id: "d1", type: "empty", label: "d" },
    { id: "l1", type: "long", label: "l" },
  ],
  edges: [],
  types: {
    ["__proto__"]: { label: " proto " },
    'a"<b>': { label: 'A"<b>' },
    empty: { label: "" },
    long: { label: LONG },
  },
  view: { approach: "passive", budget: "all" },
};
const KEYS = [
  "__proto__",
  "constructor",
  'a"<b>',
  "null",
  "e:n1",
  null,
  "empty",
  "long",
];

function hostile(o: Open) {
  const got = drawnOf(o.div);
  expect(got.map((c) => c.type)).toEqual(KEYS);
  const { vocab } = o.model;
  for (const c of got) {
    const label =
      c.type === null ? "Unknown" : (vocab.types.get(c.type)?.label as string);
    expect(c.texts).toEqual([label, ` · ${c.type === null ? 2 : 1}`]);
  }
  expect(got.find((c) => c.type === null)?.texts.join("")).toBe("Unknown · 2");
  const long = pillsOf(o.div)[KEYS.indexOf("long")].querySelector("rect");
  const width = Number(long?.getAttribute("width"));
  expect(Math.abs(width - 66046.4)).toBeLessThan(1e-9);
  const ids = [...o.div.querySelectorAll("[id]")].map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  const labels = [...o.div.querySelectorAll("g.qt-node")].map((g) =>
    g.getAttribute("aria-labelledby"),
  );
  for (const p of pillsOf(o.div)) {
    const id = p.getAttribute("aria-labelledby") as string;
    expect(id).toMatch(/^qt[0-9]+-b-[0-9a-f]+$/);
    expect(labels).not.toContain(id);
  }
  expect(audit(o)).toEqual([]);
  expect(o.notices).toEqual([]);
}

describe("S11 the hostile payload in Bubbles", () => {
  it("draws one circle per type key, safe ids and texts, no audit finding", async () => {
    hostile(await open(HOSTILE));
  });

  it("touch run: the pills and nodes have only the d3-drag touch style", async () => {
    vi.stubGlobal("navigator", { ...navigator, maxTouchPoints: 1 });
    const o = await open(HOSTILE);
    hostile(o);
    for (const el of o.div.querySelectorAll("g.qt-blabel, g.qt-node"))
      expect([null, "touch-action: none;"]).toContain(el.getAttribute("style"));
  });
});

describe("S25 the audit of colours that are not #rrggbb", () => {
  it("gives no finding for a built scene with the colours red and #12345g", () => {
    const node = (id: string, type: string, x: number): SceneNode => ({
      id,
      kind: "entity",
      type,
      label: id,
      fullLabel: id,
      typeLabel: type,
      sub: type,
      visual: { icon: "table" },
      colour: "#864627" as Hex,
      ...iconMetrics.table,
      r: 12,
      count: 0,
      more: 0,
      opened: 0,
      faded: false,
      group: null,
      room: 30,
      x,
      y: 0,
    });
    const scene: Scene = {
      nodes: [node("e:a", "t", 0), node("e:b", "u", 200)],
      edges: [],
      selection: { node: null, edge: null },
      layout: "bubbles",
      types: [
        ["t", { label: "T", colour: "red" as Hex }],
        ["u", { label: "U", colour: "#12345g" as Hex }],
      ],
    };
    const div = document.createElement("div");
    document.body.appendChild(div);
    createRenderer(div, { text: TEXT }).draw(scene);
    expect(div.querySelectorAll("g.qt-bubble circle")).toHaveLength(2);
    const strings = ["e:a", "e:b", "T", "U", "red", "#12345g"];
    const root = div.firstElementChild as Element;
    expect(domAudit(root, strings, TEXT.canvasName)).toEqual([]);
  });
});

describe("S12 s-unsafe-colors in Bubbles", () => {
  it("each tint has saturation ≤ 55.5 % and contrast ≥ 3:1 against #f4f4f5", async () => {
    const o = await open("s-unsafe-colors");
    const fills = drawnOf(o.div).map((c) => c.fill as string);
    expect(fills.length).toBeGreaterThan(0);
    const ch = (h: string) =>
      [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    for (const f of fills) {
      const [r, g, b] = ch(f);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const s =
        max === min
          ? 0
          : l > 0.5
            ? (max - min) / (2 - max - min)
            : (max - min) / (max + min);
      expect(s * 100, f).toBeLessThanOrEqual(55.5);
      const lum = (h: string) => {
        const [x, y, z] = ch(h).map((c) =>
          c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
        );
        return 0.2126 * x + 0.7152 * y + 0.0722 * z;
      };
      const [a, c] = [lum(f), lum("#f4f4f5")];
      expect(
        (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05),
        f,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("S13 NF-3", () => {
  it("S1 in two documents gives byte-equal SVG", async () => {
    const svg = async () => {
      const o = await open("s-designed");
      const text = o.div.querySelector("svg")?.outerHTML ?? "";
      document.body.replaceChildren();
      return text.replace(/qt[0-9]+-/g, "qt-");
    };
    const a = await svg();
    const b = await svg();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toBe(b);
  });
});

describe("S21 accessible names, no title, and the token rules", () => {
  it("names each pill by its visible text, has no title and the mockup declarations", async () => {
    const o = await open("s-designed");
    for (const [i, p] of pillsOf(o.div).entries()) {
      const id = p.getAttribute("aria-labelledby") ?? "";
      const name = o.div.querySelector(`[id="${id}"]`);
      expect(name?.getAttribute("class")).toBe("qt-a11y");
      expect(p.contains(name)).toBe(true);
      expect(name?.textContent).toBe(`${S1[i][0]} · ${S1[i][1]}`);
    }
    expect(o.div.querySelector("title")).toBeNull();
    for (const c of o.div.querySelectorAll("g.qt-bubble circle"))
      expect([...c.attributes].some((a) => a.name.startsWith("aria-"))).toBe(
        false,
      );
    const css = readFileSync(
      path.resolve(import.meta.dirname, "../tokens.css"),
      "utf8",
    ).replace(/\s+/g, " ");
    const RULES: [string, string][] = [
      [
        ".qt-bubble circle {",
        "fill-opacity: 0.07; stroke-opacity: 0.4; stroke-width: 1.2; vector-effect: non-scaling-stroke; pointer-events: visiblePainted; cursor: grab; transition: fill-opacity 0.15s, stroke-opacity 0.15s; }",
      ],
      [
        ".qt-bubble:hover circle, .qt-bubble.qt-bdrag circle {",
        "fill-opacity: 0.12; stroke-opacity: 0.75; }",
      ],
      [".qt-blabel {", "cursor: grab; }"],
      [
        ".qt-root.qt-bdragging, .qt-root.qt-bdragging * {",
        "cursor: grabbing !important; }",
      ],
      [".qt-blabel rect {", "fill: var(--label-halo); stroke-width: 1; }"],
      [
        ".qt-blabel text {",
        "font-size: 11px; font-weight: 600; text-anchor: middle; dominant-baseline: central; }",
      ],
      [".qt-blabel .qt-bn {", "font-weight: 500; fill: var(--chip-line); }"],
    ];
    for (const [rule, body] of RULES) expect(css).toContain(`${rule} ${body}`);
    expect(css).toContain("--label-halo: #ffffff;");
    expect(css).toContain("--chip-line: #71717a;");
  });
});
