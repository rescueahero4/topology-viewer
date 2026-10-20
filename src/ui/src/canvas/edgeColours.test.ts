// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  firstView,
  frontier,
  guardColor,
  normalize,
  resolveVocab,
  setLayout,
  transition,
  type Designed,
  type Hex,
  type Rgb,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  spriteColours,
  type RendererText,
} from "@qdic-topology/renderer";
import { describe, expect, it, vi } from "vitest";
import { edgeStyles } from "./edgeColours";
import { sceneOf } from "./scene";

// why: jsdom has no ResizeObserver; the STORY-003-04 camera observes the root
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

const record = vi.hoisted(() => ({ calls: [] as [Rgb, string][] }));

vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@qdic-topology/engine")>();
  return {
    ...real,
    guardColor: (rgb: Rgb, canvas: Hex) => {
      record.calls.push([[...rgb] as unknown as Rgb, canvas]);
      return real.guardColor(rgb, canvas);
    },
  };
});

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
const HUES: Record<string, number> = {
  Structure: 220,
  Lineage: 214,
  Reference: 250,
  Annotation: 35,
  "Ownership & Access": 152,
};

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// The hue and saturation of a hex, read as the CSS HSL model reads it.
function hsl(hex: string): [number, number] {
  const [r, g, b] = channels(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s * 100];
}

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b2] = channels(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// why: TL-1 — the saturation bound on a hex is 55.5 % (one 8-bit rounding step above 55 %)
function guardedOk(hex: string): void {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  expect(hsl(hex)[1], hex).toBeLessThanOrEqual(55.5);
  expect(contrast(hex, "#f4f4f5"), hex).toBeGreaterThanOrEqual(3);
}

function first(key: string, selectFirst = false) {
  const result = normalize(loadFixture(key).input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
  const start = firstView(graph, vocab, payload, hash);
  let state = setLayout(
    start,
    frontier(start, graph, vocab),
    vocab,
    start.layout,
    iconMetrics,
  );
  if (selectFirst && state.selection === null) {
    const node = frontier(state, graph, vocab).edges[0].subject;
    state = transition(state, { kind: "select", node }, graph, vocab);
  }
  const view = frontier(state, graph, vocab);
  record.calls = [];
  const scene = sceneOf({ state, frontier: view, vocab, canvas: CANVAS }, TEXT);
  return { vocab, view, scene, calls: record.calls };
}

const S2: Record<string, [string, string]> = {
  broader: ["Structure", "#25437e"],
  contains: ["Structure", "#2e539e"],
  definedBy: ["Lineage", "#254b7e"],
  dependsOn: ["Lineage", "#2e5e9e"],
  derivedFrom: ["Lineage", "#3771bd"],
  mapsTo: ["Reference", "#34257e"],
  representsConcept: ["Reference", "#412e9e"],
  sharedWith: ["Reference", "#4e37bd"],
  enrichedWith: ["Annotation", "#7e5925"],
  relatedTo: ["Annotation", "#9e702e"],
  synonymOf: ["Annotation", "#b58035"],
  taggedWith: ["Annotation", "#b68035"],
  groupedIn: ["Ownership & Access", "#257e55"],
  memberOf: ["Ownership & Access", "#2e9e6a"],
  ownedBy: ["Ownership & Access", "#2e9d6a"],
  permissionedTo: ["Ownership & Access", "#2e9e6a"],
  audits: ["Custom", "#71717a"],
  certifiedBy: ["Custom", "#71717a"],
  monitoredBy: ["Custom", "#71717a"],
  replicatedTo: ["Custom", "#71717a"],
};

describe("S2 s-many-preds colours by predicate", () => {
  const run = first("s-many-preds");
  const styles = edgeStyles(run.vocab, CANVAS);

  it("draws 20 nodes and 27 edges", () => {
    expect(run.view.nodes).toHaveLength(20);
    expect(run.view.edges).toHaveLength(27);
  });

  it.each(Object.entries(S2))("%s", (predicate, [family, colour]) => {
    expect(run.vocab.predicates.get(predicate)?.family).toBe(family);
    const style = styles.get(predicate);
    expect(style?.colour).toBe(colour);
    expect(style?.dashed).toBe(family === "Custom");
    expect(style?.structure).toBe(family === "Structure");
    guardedOk(colour);
    if (family !== "Custom") {
      const off = Math.abs(hsl(colour)[0] - HUES[family]);
      expect(Math.min(off, 360 - off)).toBeLessThanOrEqual(1);
    }
  });

  it("gives each scene edge the colour of its predicate", () => {
    for (const edge of run.scene.edges) {
      const predicate = run.view.edges.find((e) => e.key === edge.key)
        ?.predicate as string;
      expect(edge.colour).toBe(S2[predicate][1]);
    }
  });
});

const isChannel = (v: number) => Number.isInteger(v) && v >= 0 && v <= 255;
const has = (calls: [Rgb, string][], rgb: readonly number[]) =>
  calls.some(([c]) => c.every((v, i) => v === rgb[i]));

describe("S3 every colour source goes through guardColor", () => {
  const runs = ["s-many-preds", "s-access", "s-star", "s-designed"].map(
    (key) => ({ key, ...first(key, true) }),
  );
  const all = runs.flatMap((r) => r.calls);

  it("gives guardColor three integers 0-255 and the canvas #f4f4f5", () => {
    expect(runs.every((r) => r.calls.length > 0)).toBe(true);
    for (const [rgb, canvas] of all) {
      expect(rgb).toHaveLength(3);
      expect(rgb.every(isChannel)).toBe(true);
      expect(canvas).toBe("#f4f4f5");
    }
  });

  it.each(Object.entries(HUES))(
    "guards an edge of the hue family %s",
    (_f, hue) => {
      const input = channels(canvasColor(`hsl(${hue}, 58%, 32%)`) as string);
      expect(has(all, input)).toBe(true);
    },
  );

  it("guards the grey family", () => {
    expect(has(runs[0].calls, [0x71, 0x71, 0x7a])).toBe(true);
  });

  it("guards an icon halo and a group halo", () => {
    const access = runs[1];
    const table = access.scene.nodes.find((n) => n.id === "e:t_FCT_REVENUE");
    const icon = channels(spriteColours.get("table") as string);
    expect(has(access.calls, icon)).toBe(true);
    expect(table?.colour).toBe(guardColor(icon as unknown as Rgb, CANVAS));
    const star = runs[2];
    const group = star.scene.nodes.find((n) => n.kind === "group");
    const groupIcon = channels(spriteColours.get(group?.type ?? "") as string);
    expect(has(star.calls, groupIcon)).toBe(true);
    expect(group?.colour).toBe(guardColor(groupIcon as unknown as Rgb, CANVAS));
  });

  it("keeps the designed colour of a designed halo", () => {
    const designed = runs[3].scene.nodes.filter((n) => !("icon" in n.visual));
    expect(designed.length).toBeGreaterThan(0);
    for (const n of designed)
      expect(n.colour).toBe((n.visual as Designed).color);
  });

  it.each(runs.map((r) => [r.key, r] as const))(
    "%s: every drawn edge, arrow, pill and halo colour passes the guard",
    (_key, run) => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      createRenderer(div, { text: TEXT }).draw(run.scene);
      const colours = [
        ...div.querySelectorAll(
          "path.qt-edge, marker path, g.qt-elabel rect, g.qt-focus circle",
        ),
      ].flatMap((el) =>
        ["stroke", "fill"]
          .map((name) => el.getAttribute(name))
          .filter((v): v is string => v !== null),
      );
      expect(div.querySelectorAll("g.qt-focus circle")).toHaveLength(4);
      expect(div.querySelectorAll("g.qt-elabel rect").length).toBeGreaterThan(
        0,
      );
      for (const colour of colours) guardedOk(colour);
      div.remove();
    },
  );

  it("passes the guard for each of the 18 sprite colours", () => {
    expect(spriteColours.size).toBe(18);
    for (const hex of spriteColours.values())
      guardedOk(guardColor(channels(hex), CANVAS));
  });
});
