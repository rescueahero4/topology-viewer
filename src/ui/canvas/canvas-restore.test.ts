// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState, Hex } from "#engine";
import type { Camera, Renderer, Report } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEvent, CanvasModel } from "./index";

// why: pass-through spies; `layouts` counts the engine `setLayout` calls, `reports` records the
// renderer reports of each canvas (S24 (f))
const spy = vi.hoisted(() => ({ layouts: 0, reports: [] as Report[][] }));
vi.mock("#engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#engine")>();
  return {
    ...mod,
    setLayout: (...args: Parameters<typeof mod.setLayout>) => {
      spy.layouts++;
      return mod.setLayout(...args);
    },
  };
});
vi.mock("#renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      const list: Report[] = [];
      spy.reports.push(list);
      const onReport = r.onReport.bind(r);
      return {
        ...r,
        onReport: (h: (report: Report) => void) =>
          onReport((report) => {
            list.push(report);
            h(report);
          }),
      } satisfies Renderer;
    },
  };
});

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
const { loadFixture } = await import("#fixtures");
const { fitTransform } = await import("#renderer");
const { createCanvas } = await import("./index");

const observers: ResizeObserverCallback[] = [];
// why: jsdom has no ResizeObserver and gives each element 0 × 0; the test drives both
vi.stubGlobal(
  "ResizeObserver",
  class {
    constructor(cb: ResizeObserverCallback) {
      observers.push(cb);
    }
    observe() {}
    disconnect() {}
  },
);
let size = { w: 800, h: 600 };
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: size.w, height: size.h }) as DOMRect;

const LIGHT = engine.canvasColor("#F4F4F5") as Hex;
const DARK = engine.canvasColor("#18181b") as Hex;
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
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
};

function modelOf(key: string, canvas: Hex = LIGHT): CanvasModel {
  const r = engine.normalize(loadFixture(key).input, { now: "2026-10-19" });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, canvas);
  return { graph: r.graph, payload: r.payload, hash: r.hash, vocab, canvas };
}

type Opts = { state?: CanvasState; camera?: Camera };
async function open(model: CanvasModel, opts: Opts = {}, div?: HTMLElement) {
  const host = div ?? document.createElement("div");
  if (div === undefined) document.body.appendChild(host);
  const canvas = createCanvas(host, { text: TEXT, model, ...opts });
  const settles: CanvasEvent["settle"][] = [];
  const all: unknown[] = [];
  canvas.on("settle", (e) => settles.push(e));
  for (const name of ["select", "explore", "notice", "settle"] as const)
    canvas.on(name, (e) => all.push(e));
  await Promise.resolve();
  const last = () => settles[settles.length - 1];
  return { div: host, canvas, settles, all, last };
}
const svgOf = (div: HTMLElement) =>
  (div.querySelector("svg")?.outerHTML ?? "").replace(/qt[0-9]+(?=-)/g, "qtN");
// why: S24 (e) — the sprite icons keep their sprite fills on each canvas colour
const icons = (div: HTMLElement) =>
  [...div.querySelectorAll("symbol")]
    .filter((s) => s.querySelector(".qt-mark") === null)
    .map((s) => s.outerHTML.replace(/qt[0-9]+(?=-)/g, "qtN"));
const transforms = (div: HTMLElement) =>
  [...div.querySelectorAll("g.qt-node")].map((g) =>
    g.getAttribute("transform"),
  );

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.layouts = 0;
  size = { w: 800, h: 600 };
  document.body.replaceChildren();
});

// The hue and saturation of a hex, read as the CSS HSL model reads it.
function saturation(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (100 * (max - min)) / (l > 0.5 ? 2 - max - min : max + min);
}
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const SOURCES = [
  "path.qt-edge[stroke]",
  "marker path[fill]",
  "g.qt-elabel rect[fill]",
  "g.qt-focus circle",
  "g.qt-node.qt-grouped > circle[fill]",
];

describe("S24 a new canvas with a saved state and camera (H7, H8)", () => {
  async function explored() {
    const o = await open(modelOf("s-access"));
    o.canvas.expand("e:t_FCT_REVENUE");
    vi.advanceTimersByTime(3000);
    o.canvas.expand("e:ug_analytics");
    vi.advanceTimersByTime(3000);
    const { state, camera, frontier } = o.last();
    expect(frontier.nodes).toHaveLength(22);
    expect(frontier.nodes.filter((n) => "members" in n)).toHaveLength(4);
    return { o, state, camera };
  }

  it("(a)-(c), (f): Undo, a dark canvas, light again; the first canvas has ended", async () => {
    const { o, state, camera } = await explored();
    const saved = transforms(o.div);
    const reports = spy.reports[spy.reports.length - 1];
    spy.layouts = 0;
    const a = await open(modelOf("s-access"), { state, camera }, o.div);
    expect(spy.layouts).toBe(0);
    expect(transforms(a.div)).toEqual(saved);
    expect(a.last().state).toEqual(state);
    expect(a.last().camera).toEqual(camera);
    const light = svgOf(a.div);
    const sprite = icons(a.div);
    expect(sprite.length).toBeGreaterThan(0);
    const b = await open(modelOf("s-access", DARK), { state, camera }, o.div);
    expect(transforms(b.div)).toEqual(saved);
    expect([b.last().state, b.last().camera]).toEqual([state, camera]);
    expect(icons(b.div)).toEqual(sprite);
    for (const selector of SOURCES) {
      const els = [...b.div.querySelectorAll(selector)];
      expect(els.length, selector).toBeGreaterThan(0);
      for (const el of els)
        for (const name of ["fill", "stroke"]) {
          const hex = el.getAttribute(name);
          if (hex === null || hex === "none") continue;
          expect(saturation(hex), `${selector} ${hex}`).toBeLessThanOrEqual(
            55.5,
          );
          expect(
            contrast(hex, "#18181b"),
            `${selector} ${hex}`,
          ).toBeGreaterThanOrEqual(3);
        }
    }
    const c = await open(modelOf("s-access"), { state, camera }, o.div);
    expect(svgOf(c.div)).toBe(light);
    const before = o.all.length;
    o.canvas.expand("e:u_0");
    o.canvas.setBudget(10);
    vi.advanceTimersByTime(3000);
    expect(o.all).toHaveLength(before);
    expect(reports).toEqual([{ kind: "ended" }]);
  });

  it.each([
    [
      "another number",
      (s: CanvasState) => ({ ...s, graphHash: s.graphHash + 1 }),
    ],
    [
      "a string",
      (s: CanvasState) => ({
        ...s,
        graphHash: String(s.graphHash) as unknown as number,
      }),
    ],
  ])("(d) a state with %s as hash gives the first view", async (_n, edit) => {
    const { state } = await explored();
    const first = await open(modelOf("s-access"));
    const d = await open(modelOf("s-access"), { state: edit(state) });
    expect(d.last().state).toEqual(first.last().state);
  });

  it("(e) s-designed light, then dark: the designed fills are guarded again", async () => {
    const fills = (div: HTMLElement) =>
      [...div.querySelectorAll("symbol .qt-mark")].map((m) =>
        m.getAttribute("fill"),
      );
    const l = await open(modelOf("s-designed"));
    const d = await open(modelOf("s-designed", DARK), {
      state: l.last().state,
    });
    expect(fills(l.div)).toEqual(
      expect.arrayContaining(["#8a4b4b", "#4b5d73"]),
    );
    expect(fills(d.div)).toEqual(
      expect.arrayContaining(["#975252", "#53677f"]),
    );
  });
});

describe("S25 setData redraws a frontier with the current model (H8)", () => {
  it("(a) the same frontier: same DOM, same state, one settle, no camera change", async () => {
    const o = await open(modelOf("s-access"));
    const html = o.div.innerHTML;
    const { state, frontier, camera } = o.last();
    const count = o.settles.length;
    o.canvas.setData(frontier);
    expect(o.settles).toHaveLength(count + 1);
    expect(o.div.innerHTML).toBe(html);
    expect([o.last().state, o.last().camera]).toEqual([state, camera]);
  });

  it("(b) a node with no position: no change and one error notice", async () => {
    const o = await open(modelOf("s-access"));
    const html = o.div.innerHTML;
    const { frontier } = o.last();
    const count = o.all.length;
    const ghost = { ...frontier.nodes[1], id: "e:ghost" };
    o.canvas.setData({ ...frontier, nodes: [...frontier.nodes, ghost] });
    expect(o.all.slice(count)).toEqual([{ kind: "error" }]);
    expect(o.div.innerHTML).toBe(html);
  });
});

describe("B14 a saved camera with a first draw at 0 × 0", () => {
  it("the first-visibility fit replaces the saved camera (FR-CANVAS-17)", async () => {
    size = { w: 0, h: 0 };
    const saved: Camera = { k: 0.5, x: 10, y: 20 };
    const o = await open(modelOf("s-access"), { camera: saved });
    expect(o.all).toContainEqual({ kind: "zero-size" });
    expect(o.last().camera).toEqual(saved);
    size = { w: 800, h: 600 };
    const entry = { contentRect: { width: 800, height: 600 } };
    observers[observers.length - 1](
      [entry as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    const boxes = [...o.div.querySelectorAll("g.qt-node")].map((g) => {
      const n = (
        g as unknown as { __data__: { x: number; y: number; r: number } }
      ).__data__;
      return { x: n.x, y: n.y, r: n.r };
    });
    expect(o.last().camera).toEqual(fitTransform(boxes, 800, 600, 40, 0));
    expect(o.last().camera).not.toEqual(saved);
  });
});
