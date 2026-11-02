// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { AroundInfo, Hex } from "#engine";
import type { RendererText } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent } from "./index";

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
const engine = await import("#engine");
const { profile } = await import("#contract");
const { createCanvas } = await import("./index");
const { auditStrings, domAudit } = await import("./domAudit");
const { showAround } = await import("./harness-around");
const { sceneOf } = await import("./scene");

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const CANVAS = engine.canvasColor("#F4F4F5") as Hex;
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
  bubbleCount: (n: number) => ` · ${n}`,
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
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
const IMG = '["e:h1","<img src=x>","e:javascript:alert(1)"]';
const OWNED = '["e:h1","ownedBy","e:constructor"]';

async function open() {
  const result = engine.normalize(HOSTILE, { now: "2026-10-19" });
  if (!result.ok) throw new Error("fatal");
  const { graph, payload, hash } = result;
  const { vocab } = engine.resolveVocab(graph, payload, profile, CANVAS);
  const model = { graph, payload, hash, vocab, canvas: CANVAS };
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model });
  const settles: CanvasEvent["settle"][] = [];
  canvas.on("settle", (e) => settles.push(e));
  await Promise.resolve();
  const last = () => settles[settles.length - 1];
  expect(last().frontier.nodes).toHaveLength(4);
  expect(last().frontier.edges).toHaveLength(3);
  expect(last().state.selection).toBeNull();
  // why: build-time item B1 (Security s3) — the full DA-4 list: the source strings and every text
  // field of the scene, with the drawn ids and the edge keys
  const audit = () => {
    const { state, frontier } = last();
    const scene = sceneOf({ state, frontier, vocab, canvas: CANVAS }, TEXT);
    const strings = auditStrings(graph, vocab, scene);
    expect(strings).toEqual(
      expect.arrayContaining([
        ...frontier.nodes.map((n) => n.id),
        ...frontier.edges.map((e) => e.key),
        '"><script>x</script>',
        'x" onload="y',
      ]),
    );
    return domAudit(div.firstElementChild as Element, strings, TEXT.canvasName);
  };
  const info = () => engine.aroundInfo(last().state, last().frontier);
  return { div, canvas, last, audit, info };
}

const off = (div: HTMLElement, selector: string) =>
  [...div.querySelectorAll(`${selector}.qt-off`)]
    .map((el) => {
      const d = (el as unknown as { __data__: { id?: string; key?: string } })
        .__data__;
      return d.key ?? d.id;
    })
    .sort();
const keysOf = (div: HTMLElement, selector: string) =>
  [...div.querySelectorAll(selector)].map(
    (el) => (el as unknown as { __data__: { key: string } }).__data__.key,
  );
const noSinks = (div: HTMLElement) =>
  expect(
    div.querySelectorAll("script, img, foreignObject, iframe"),
  ).toHaveLength(0);

afterEach(() => {
  vi.runOnlyPendingTimers();
  document.body.replaceChildren();
});

describe("S21 (a) grouped around e:__proto__", () => {
  it("fades the two other nodes and their edges; no audit finding while grouped and after off", async () => {
    const o = await open();
    o.canvas.select("e:__proto__");
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    expect(o.div.querySelectorAll(".qt-off").length).toBeGreaterThan(0);
    expect(off(o.div, "g.qt-node")).toEqual(
      ["e:constructor", "e:javascript:alert(1)"].sort(),
    );
    expect(off(o.div, "path.qt-edge")).toEqual([IMG, OWNED].sort());
    const hits = keysOf(o.div, "path.qt-ehit").filter(
      (k) => k === IMG || k === OWNED,
    );
    expect(off(o.div, "path.qt-ehit")).toEqual(hits.sort());
    expect(o.audit()).toEqual([]);
    noSinks(o.div);
    o.canvas.groupAroundRoot(false);
    vi.advanceTimersByTime(3000);
    expect(o.last().state.around).toBeNull();
    expect(o.div.querySelectorAll(".qt-off")).toHaveLength(0);
    expect(o.audit()).toEqual([]);
    noSinks(o.div);
  });
});

describe("S21 (b) grouped around e:javascript:alert(1)", () => {
  it("fades e:__proto__ and e:constructor; no audit finding", async () => {
    const o = await open();
    o.canvas.select("e:javascript:alert(1)");
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    expect(off(o.div, "g.qt-node")).toEqual(
      ["e:__proto__", "e:constructor"].sort(),
    );
    expect(o.audit()).toEqual([]);
    noSinks(o.div);
  });
});

const HOSTILE_STRINGS = [
  '"><script>x</script>',
  'x" onload="y',
  "javascript:alert(1)",
  "__proto__",
  "<img src=x>",
  "A".repeat(10000),
];

describe("S21 (c) the harness readout", () => {
  it.each([
    ["e:__proto__", ["e:__proto__", "__proto__", "__proto__"], [2, 4]],
    [
      "e:javascript:alert(1)",
      ["e:javascript:alert(1)", "A".repeat(10000), 'x" onload="y'],
      [2, 4],
    ],
    ["e:h1", ["e:h1", '"><script>x</script>', "table"], [4, 4]],
  ] as const)(
    "%s: text only, in one element, with no attribute",
    async (root, texts, [shown, total]) => {
      const o = await open();
      o.canvas.select(root);
      o.canvas.groupAroundRoot(true);
      vi.advanceTimersByTime(3000);
      const info = o.info() as AroundInfo;
      expect([info.id, info.label, info.type]).toEqual(texts);
      const parent = document.createElement("div");
      const el = document.createElement("pre");
      parent.appendChild(el);
      document.body.appendChild(parent);
      showAround(el, info);
      expect(el.children).toHaveLength(0);
      expect(el.childNodes).toHaveLength(1);
      expect(el.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      for (const t of texts) expect(el.textContent).toContain(t);
      expect(el.textContent).toContain(`shown ${shown}, total ${total}`);
      for (const node of [parent, el])
        for (const attr of node.attributes)
          for (const s of HOSTILE_STRINGS)
            expect(attr.value.includes(s)).toBe(false);
      showAround(el, null);
      expect(el.textContent).toBe("");
    },
  );
});
