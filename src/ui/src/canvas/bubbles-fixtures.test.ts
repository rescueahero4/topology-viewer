// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CanvasState, Hex, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Drawn, Enclose, Shape } from "./bubbles-reference";
import type { Camera, CanvasEvent, CanvasModel } from "./index";

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
const { createCanvas } = await import("./index");
const { domSpots, drawnOf, shapesOf } = await import("./bubbles-reference");
// why: the reference circle is the `packEnclose` of the renderer's own `d3-hierarchy` copy
const renderer = path.resolve(
  import.meta.dirname,
  "../../../renderer/package.json",
);
const hierarchy = createRequire(renderer).resolve("d3-hierarchy");
const { packEnclose } = (await import(pathToFileURL(hierarchy).href)) as {
  packEnclose: Enclose;
};

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
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
};

function modelOf(key: string): CanvasModel {
  const r = engine.normalize(loadFixture(key).input, { now: "2026-10-19" });
  if (!r.ok) throw new Error("fatal");
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, LIGHT);
  return { ...r, vocab, canvas: LIGHT };
}

type Settle = CanvasEvent["settle"];
// why: story Test plan — the standard pipeline and `createCanvas`, then `setLayout("bubbles")`
// from the Force first view, run to its end (the layout motion and the fit)
async function open(
  key: string,
  saved?: { state: CanvasState; camera: Camera },
) {
  const model = modelOf(key);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model, ...saved });
  const settles: Settle[] = [];
  canvas.on("settle", (e) => settles.push(e));
  // why: an `explore` event carries the final state at the call (NF-8), before the motion frames
  let now: Pick<Settle, "state" | "frontier"> | null = null;
  canvas.on("settle", (e) => (now = e));
  canvas.on("explore", ({ state }) => {
    now = { state, frontier: engine.frontier(state, model.graph, model.vocab) };
  });
  await Promise.resolve();
  if (saved === undefined) {
    canvas.setLayout("bubbles");
    vi.advanceTimersByTime(3000);
  }
  const last = () => settles[settles.length - 1];
  const want = (at?: Map<string, Point>) => {
    const { state, frontier } = now ?? last();
    return shapesOf(state, frontier, model.vocab, packEnclose, at);
  };
  return { div, canvas, model, last, want };
}
type Open = Awaited<ReturnType<typeof open>>;

const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;
function sameCircles(o: Open, want: Shape[], e = 1e-9) {
  const got = drawnOf(o.div);
  expect(got.map((c) => c.type)).toEqual(want.map((c) => c.type));
  for (const [i, c] of got.entries()) {
    const w = want[i];
    expect([near(c.x, w.x, e), near(c.y, w.y, e), near(c.r, w.r, e)]).toEqual([
      true,
      true,
      true,
    ]);
  }
}
const pillsOf = (div: Element) => [...div.querySelectorAll("g.qt-blabel")];
const num = (el: Element | null, name: string) =>
  Number(el?.getAttribute(name));

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

const S1 = [
  ["regulation", -1.0323, -324.1175, 103.6, 1, "#8a4b4b", "Regulation"],
  ["supplier", 183.6865, -44.4069, 151.6, 2, "#5b6b8c", "Supplier"],
  ["factory", 0.9036, 283.7177, 144, 2, "#4b5d73", "Factory"],
  ["product", -218.8003, -44.4069, 170.8868, 3, "#3f7a5a", "Product"],
] as const;

describe("S1 s-designed in Bubbles", () => {
  it("draws 4 circles in the traced order, centres, radii, counts and fills", async () => {
    const o = await open("s-designed");
    const got = drawnOf(o.div);
    expect(got.map((c) => c.type)).toEqual(S1.map((r) => r[0]));
    for (const [i, [, x, y, r, , fill]] of S1.entries()) {
      expect([near(got[i].x, x, 1e-4), near(got[i].y, y, 1e-4)]).toEqual([
        true,
        true,
      ]);
      expect(near(got[i].r, r, 1e-4)).toBe(true);
      expect(got[i].fill).toBe(fill);
    }
    const want = o.want();
    expect(want.map((s) => s.count)).toEqual([1, 2, 2, 3]);
    for (const [i, s] of want.entries()) {
      const reach = s.members.map(
        (m) => Math.hypot(m.x - got[i].x, m.y - got[i].y) + m.r,
      );
      expect(reach.every((d) => d <= got[i].r + 1e-9)).toBe(true);
      expect(reach.some((d) => d >= got[i].r - 1e-9)).toBe(true);
    }
    sameCircles(o, want);
  });
});

describe("S2 s-star in Bubbles", () => {
  it("counts a group by its count: Table · 300; column 12; tag r 39.5; tag_group r 73.2", async () => {
    const o = await open("s-star");
    const got = new Map(drawnOf(o.div).map((c) => [c.type, c]));
    const table = got.get("table");
    expect(near(table?.r ?? 0, 103.6)).toBe(true);
    expect(table?.texts).toEqual(["Table", " · 300"]);
    expect(table?.fill).toBe("#864627");
    const pill = pillsOf(o.div).find((p) => p.textContent?.startsWith("Table"));
    expect(near(num(pill?.querySelector("rect") ?? null, "width"), 92.6)).toBe(
      true,
    );
    expect(got.get("column")?.texts[1]).toBe(" · 12");
    expect(near(got.get("tag")?.r ?? 0, 39.5)).toBe(true);
    expect(near(got.get("tag_group")?.r ?? 0, 73.2)).toBe(true);
    sameCircles(o, o.want());
  });
});

describe("S3 the pills of S1", () => {
  it("has the texts, rect values, colours, transforms and zoom scale", async () => {
    const o = await open("s-designed");
    const pills = pillsOf(o.div);
    const k = o.last().camera.k;
    const widths = [112.4, 99.2, 92.6, 92.6];
    const tops = [-427.7175, -196.0069, 139.7177, -215.2937];
    for (const [i, [, x, , , n, colour, label]] of S1.entries()) {
      const p = pills[i];
      const rect = p.querySelector("rect");
      const line = p.querySelector("text:not(.qt-a11y)");
      expect(
        [...(line?.querySelectorAll("tspan") ?? [])].map((t) => t.textContent),
      ).toEqual([label, ` · ${n}`]);
      expect([num(rect, "height"), num(rect, "rx"), num(rect, "y")]).toEqual([
        20, 10, -10,
      ]);
      expect(near(num(rect, "width"), widths[i])).toBe(true);
      expect(near(num(rect, "x"), -widths[i] / 2)).toBe(true);
      expect([
        rect?.getAttribute("stroke"),
        line?.getAttribute("fill"),
      ]).toEqual([colour, colour]);
      expect(rect?.hasAttribute("fill")).toBe(false);
      const m = /^translate\(([^,]+),([^)]+)\) scale\(([^)]+)\)$/.exec(
        p.getAttribute("transform") ?? "",
      );
      expect([
        near(Number(m?.[1]), x, 1e-4),
        near(Number(m?.[2]), tops[i], 1e-4),
      ]).toEqual([true, true]);
      expect(Number(m?.[3])).toBe(1 / k);
      expect(p.textContent).not.toMatch(
        /(Regulations|Suppliers|Factories|Products)/,
      );
    }
    // why: a zoom event to `k` 2: a saved state and camera `k` 1, then a wheel of factor 2^1
    const z = await open("s-designed", {
      state: o.last().state,
      camera: { k: 1, x: 400, y: 300 },
    });
    const before = pillsOf(z.div).map(
      (p) => p.getAttribute("transform")?.split(" scale")[0],
    );
    z.div.querySelector("svg")?.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -500,
        clientX: 400,
        clientY: 300,
        cancelable: true,
      }),
    );
    const after = pillsOf(z.div).map((p) => p.getAttribute("transform") ?? "");
    expect(after.every((t) => t.endsWith(" scale(0.5)"))).toBe(true);
    expect(after.map((t) => t.split(" scale")[0])).toEqual(before);
  });
});

const EXPANDS = ["e:sup_cell", "e:sup_pack", "e:fac_osaka", "e:fac_brno"];
const ADDS: Record<string, string[]> = {
  "e:sup_cell": ['g:["sup_cell","supplies","<","supplier"]', "e:site_JP"],
  "e:sup_pack": ["e:site_DE"],
  "e:fac_osaka": ["shipment"],
  "e:fac_brno": ["shipment"],
};

// why: SA §6 row 16 — in each frame of the motion each circle encloses its members
function framesEnclose(o: Open) {
  for (let f = 0; f < 70; f++) {
    sameCircles(o, o.want(domSpots(o.div)));
    vi.advanceTimersByTime(16);
  }
}

describe("S6 expands in Bubbles, each from a fresh S1", () => {
  it.each(EXPANDS)(
    "%s moves no drawn node and adds the traced newcomers",
    async (id) => {
      const o = await open("s-designed");
      const s1 = drawnOf(o.div);
      const before = new Map(o.last().state.positions);
      const drawn = new Set(o.last().frontier.nodes.map((n) => n.id));
      o.canvas.expand(id);
      framesEnclose(o);
      const after = new Map(o.last().state.positions);
      for (const d of drawn) expect(after.get(d)).toEqual(before.get(d));
      const fresh = o.last().frontier.nodes.filter((n) => !drawn.has(n.id));
      const keys = fresh.map((n) =>
        ADDS[id][0] === "shipment" ? n.type : n.id,
      );
      expect(keys).toEqual(ADDS[id]);
      const types = new Set(s1.map((c) => c.type));
      for (const n of fresh)
        if (types.has(n.type)) {
          const c = s1.find((x) => x.type === n.type) as Drawn;
          const p = after.get(n.id) as Point;
          expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThan(c.r);
        } else expect(["site", "shipment"]).toContain(n.type);
    },
  );
});

describe("S7 the same 4 expands one after the other", () => {
  it("moves no drawn node; e:site_DE lands 72 from the site centre; site grows to r 91", async () => {
    const o = await open("s-designed");
    let site: Shape | undefined;
    for (const id of EXPANDS) {
      const before = new Map(o.last().state.positions);
      const drawn = o.last().frontier.nodes.map((n) => n.id);
      o.canvas.expand(id);
      vi.advanceTimersByTime(2000);
      const after = new Map(o.last().state.positions);
      for (const d of drawn) expect(after.get(d)).toEqual(before.get(d));
      if (id === "e:sup_pack" && site !== undefined) {
        const p = after.get("e:site_DE") as Point;
        expect(Math.hypot(p.x - site.x, p.y - site.y)).toBeCloseTo(72, 3);
        expect(site.r).toBeCloseTo(55, 9);
        expect(o.want().find((s) => s.type === "site")?.r).toBeCloseTo(91, 9);
      }
      site = o.want().find((s) => s.type === "site");
      sameCircles(o, o.want());
    }
  });
});

describe("S9 grouped around e:reg_eu_battery", () => {
  it("draws only regulation and product; a product pill drag moves only the shown members", async () => {
    const o = await open("s-designed");
    o.canvas.select("e:reg_eu_battery");
    o.canvas.groupAroundRoot(true);
    vi.advanceTimersByTime(3000);
    expect(drawnOf(o.div).map((c) => [c.type, c.texts.join("")])).toEqual([
      ["regulation", "Regulation · 1"],
      ["product", "Product · 3"],
    ]);
    sameCircles(o, o.want());
    const before = new Map(o.last().state.positions);
    const k = o.last().camera.k;
    const pill = pillsOf(o.div)[1];
    const press = (type: string, x: number, buttons = 1) => {
      const e = new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: 300,
        buttons,
      });
      Object.defineProperty(e, "view", { value: window });
      return e;
    };
    pill.dispatchEvent(press("mousedown", 100));
    window.dispatchEvent(press("mousemove", 100 + 50 * k));
    vi.advanceTimersByTime(16);
    window.dispatchEvent(press("mouseup", 100 + 50 * k, 0));
    const v = (100 + 50 * k - 100) / k;
    const faded = new Set(
      engine.fadeSet(o.last().state, o.last().frontier).map((f) => f.id),
    );
    const product = o
      .last()
      .frontier.nodes.filter((n) => n.type === "product")
      .map((n) => n.id);
    for (const [id, p] of o.last().state.positions) {
      const b = before.get(id) as Point;
      expect(p).toEqual(product.includes(id) ? { x: b.x + v, y: b.y } : b);
    }
    expect(product.filter((id) => faded.has(id))).toEqual([]);
  });
});

describe("S10 layout changes, a node drag and the layer order", () => {
  it("removes the bubbles in Force, draws them again in Bubbles, follows a node drag", async () => {
    const o = await open("s-designed");
    o.canvas.setLayout("force");
    vi.advanceTimersByTime(3000);
    expect(o.div.querySelectorAll("g.qt-bubble, g.qt-blabel")).toHaveLength(0);
    o.canvas.setLayout("bubbles");
    vi.advanceTimersByTime(3000);
    expect(drawnOf(o.div)).toHaveLength(4);
    const g = o.div.querySelector("g.qt-node") as Element;
    const ev = (type: string, x: number, buttons = 1) => {
      const e = new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: 300,
        buttons,
      });
      Object.defineProperty(e, "view", { value: window });
      return e;
    };
    g.dispatchEvent(ev("mousedown", 100));
    for (let i = 1; i <= 8; i++) {
      window.dispatchEvent(ev("mousemove", 100 + 15 * i));
      vi.advanceTimersByTime(16);
      sameCircles(o, o.want(domSpots(o.div)));
    }
    window.dispatchEvent(ev("mouseup", 220, 0));
    const layers = [...(o.div.querySelector("g.qt-viewport")?.children ?? [])];
    const at = (sel: string) =>
      layers.findIndex((l) => l.querySelector(sel) !== null);
    const order = [
      "g.qt-bubble",
      "path.qt-edge",
      "g.qt-blabel",
      "path.qt-ehit",
      "g.qt-node",
    ].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(5);
  });
});
