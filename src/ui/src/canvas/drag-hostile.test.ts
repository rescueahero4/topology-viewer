// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { DrawnId, Frontier, Hex, Point } from "@qdic-topology/engine";
import type { RendererText } from "@qdic-topology/renderer";
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
const engine = await import("@qdic-topology/engine");
const { profile } = await import("@qdic-topology/contract");
const { createCanvas } = await import("./index");
const { auditStrings, domAudit } = await import("./domAudit");
const { sceneOf } = await import("./scene");

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
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

const mouse = (type: string, x: number, buttons: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 100,
    buttons,
  });
  // why: QA round 2 (c) — `d3-drag` adds its listeners on `event.view` (see `drag-fixtures.test.ts`)
  Object.defineProperty(event, "view", { value: window });
  return event;
};
const datumId = (g: Element) =>
  (g as unknown as { __data__: { id: string } }).__data__.id;
function dom(div: HTMLElement): Map<DrawnId, Point> {
  return new Map(
    [...div.querySelectorAll("g.qt-node")].map((g) => {
      const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
        g.getAttribute("transform") ?? "",
      );
      return [datumId(g), { x: Number(m?.[1]), y: Number(m?.[2]) }];
    }),
  );
}
const drawnOf = (positions: [DrawnId, Point][], f: Frontier) => {
  const all = new Map(positions);
  return new Map(f.nodes.map((n) => [n.id, all.get(n.id) as Point]));
};

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

describe("S16 HOSTILE: a drag of each node on a touch-capable device", () => {
  it("frames and playback equal the engine; drag-end is the release state; no audit finding", async () => {
    vi.stubGlobal("navigator", { ...navigator, maxTouchPoints: 1 });
    const result = engine.normalize(HOSTILE, { now: "2026-10-19" });
    if (!result.ok) throw new Error("fatal");
    const { graph, payload, hash } = result;
    const { vocab } = engine.resolveVocab(graph, payload, profile, CANVAS);
    const model = { graph, payload, hash, vocab, canvas: CANVAS };
    const div = document.createElement("div");
    document.body.appendChild(div);
    const canvas = createCanvas(div, { text: TEXT, model });
    const log: { [K in "drag-end" | "settle"]: CanvasEvent[K][] } = {
      "drag-end": [],
      settle: [],
    };
    canvas.on("drag-end", (e) => log["drag-end"].push(e));
    canvas.on("settle", (e) => log.settle.push(e));
    await Promise.resolve();
    const { frontier, camera } = log.settle[0];
    let state = log.settle[0].state;
    expect(frontier.nodes).toHaveLength(4);
    expect(frontier.edges).toHaveLength(3);
    const root = div.firstElementChild as Element;
    for (const [i, node] of frontier.nodes.entries()) {
      const g = [...div.querySelectorAll("g.qt-node")].find(
        (n) => datumId(n) === node.id,
      ) as Element;
      const p0 = new Map(state.positions).get(node.id) as Point;
      const pointer = {
        x: p0.x + (100 + 100 * camera.k - 100) / camera.k,
        y: p0.y,
      };
      let ctx = engine.beginDrag(state, frontier, node.id);
      if (ctx === null) throw new Error("no drag");
      expect(() => {
        g.dispatchEvent(mouse("mousedown", 100, 1));
        window.dispatchEvent(mouse("mousemove", 100 + 100 * camera.k, 1));
      }).not.toThrow();
      for (let f = 0; f < 11; f++) {
        const step = engine.dragStep(ctx, pointer);
        ctx = step.ctx;
        vi.advanceTimersByTime(16);
        expect(dom(div)).toEqual(drawnOf(step.positions, frontier));
      }
      const r = engine.release(ctx);
      window.dispatchEvent(mouse("mouseup", 100 + 100 * camera.k, 0));
      for (const step of r.steps) {
        vi.advanceTimersByTime(16);
        expect(dom(div)).toEqual(drawnOf(step, frontier));
      }
      expect(log["drag-end"]).toHaveLength(i + 1);
      expect(log["drag-end"][i].state).toEqual(r.state);
      state = r.state;
      const scene = sceneOf({ state, frontier, vocab, canvas: CANVAS }, TEXT);
      const strings = auditStrings(graph, vocab, scene);
      expect(strings).toEqual(
        expect.arrayContaining(frontier.edges.map((e) => e.key)),
      );
      expect(domAudit(root, strings, TEXT.canvasName)).toEqual([]);
      // why: STORY-003-02 DA-5 — jsdom keeps `touch-action: none` and drops the tap highlight (T1)
      for (const n of div.querySelectorAll("g.qt-node"))
        expect([null, "touch-action: none;"]).toContain(
          n.getAttribute("style"),
        );
    }
    expect(log.settle).toHaveLength(5);
  });
});
