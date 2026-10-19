// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  firstView,
  frontier,
  guardColor,
  layout,
  normalize,
  place,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type Hex,
  type IconMetrics,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
} from "@qdic-topology/renderer";
import { describe, expect, it } from "vitest";
import { sceneOf } from "./scene";

const NOW = "2026-10-19";
const CANVAS = canvasColor("#F4F4F5") as Hex;
const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
};
const TABLE_GROUP = 'g:["tag_pii","taggedWith","<","table"]';

function pipeline(input: unknown) {
  const result = normalize(input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
  const first = firstView(graph, vocab, payload, hash);
  const state = setLayout(
    first,
    frontier(first, graph, vocab),
    vocab,
    first.layout,
    iconMetrics,
  );
  const view = frontier(state, graph, vocab);
  const scene = () =>
    sceneOf({ state, frontier: view, vocab, canvas: CANVAS }, TEXT);
  return { graph, vocab, state, view, scene };
}

const fixture = (key: string) => pipeline(loadFixture(key).input);
const nodeIn = (run: ReturnType<typeof pipeline>, id: string) => {
  const found = run.scene().nodes.find((n) => n.id === id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
};
const tables = (nodes: object[]) => ({
  nodes: nodes.map((n, i): Record<string, unknown> => ({
    id: `n${i}`,
    type: "table",
    ...n,
  })),
  view: { approach: "passive", budget: "all" },
});

describe("S17 icon metrics in the layout", () => {
  it("gives the same force positions as icon-metrics.test.json", () => {
    const file = path.resolve(
      import.meta.dirname,
      "../../../engine/src/layout/icon-metrics.test.json",
    );
    const json = JSON.parse(readFileSync(file, "utf8")) as IconMetrics;
    const run = fixture("s-access");
    const seed = run.state.graphHash;
    const at = (metrics: IconMetrics) =>
      layout(run.state, run.view, run.vocab, "force", metrics, seed).positions;
    expect(at(iconMetrics)).toEqual(at(json));
    expect(at(iconMetrics).length).toBe(7);
  });
});

describe("S18 sceneOf branches", () => {
  it("(a) throws for a frontier node with no position", () => {
    const run = fixture("s-access");
    const state = { ...run.state, positions: run.state.positions.slice(1) };
    const input = {
      state,
      frontier: run.view,
      vocab: run.vocab,
      canvas: CANVAS,
    };
    expect(() => sceneOf(input, TEXT)).toThrow(Error);
  });

  it("(b) custom_category has no visual and draws the qt-nomark circle", () => {
    const input = loadFixture("q-full-vocabulary").input as { view?: object };
    input.view = { ...input.view, budget: "all" };
    const run = pipeline(input);
    expect(run.view.nodes).toHaveLength(39);
    const node = nodeIn(run, "e:cat-finance");
    expect(node.visual).toBeNull();
    expect([node.w, node.h, node.tier]).toEqual([20, 20, "leaf"]);
    expect(node.colour).toBe(guardColor([0x71, 0x71, 0x7a], CANVAS));
    const div = document.createElement("div");
    document.body.appendChild(div);
    createRenderer(div, { text: TEXT }).draw({ nodes: [node] });
    const circle = div.querySelector("g.qt-node > circle.qt-nomark");
    expect(circle?.getAttribute("r")).toBe("8.5");
    expect(div.querySelector("g.qt-node use")).toBeNull();
  });

  it("(c) a node with no type takes vocab.untyped and the unknown label", () => {
    const run = fixture("s-dirty");
    const node = nodeIn(run, "e:t4");
    expect(node.type).toBeNull();
    expect(node.visual).toEqual(run.vocab.untyped);
    expect(node.visual).not.toBe(run.vocab.untyped);
    expect(node.visual).toMatchObject({ color: "#6b7280" });
    expect(node.visual).not.toHaveProperty("letters");
    expect([node.w, node.h, node.tier]).toEqual([20, 20, "leaf"]);
    expect(node.typeLabel).toBe(TEXT.unknownType);
  });

  it("(d) a declared table type keeps its Figma icon", () => {
    const run = pipeline({
      nodes: [{ id: "t1", type: "table", label: "T1" }],
      types: {
        table: {
          label: "Table",
          glyph: "M3 12h18",
          color: "#ff0000",
          shape: "hexagon",
        },
      },
    });
    expect(nodeIn(run, "e:t1").visual).toEqual({ icon: "table" });
  });

  it("(e) cuts a label at 22 UTF-16 units and never splits a surrogate pair", () => {
    const l22 = "a".repeat(22);
    const l23 = "b".repeat(23);
    const emoji = `${"c".repeat(20)}\u{1F600}de`;
    const run = pipeline(
      tables([{ label: l22 }, { label: l23 }, { label: "" }, { label: emoji }]),
    );
    expect(nodeIn(run, "e:n0").label).toBe(l22);
    expect(nodeIn(run, "e:n1").label).toBe(`${"b".repeat(21)}…`);
    expect(nodeIn(run, "e:n1").fullLabel).toBe(l23);
    expect(nodeIn(run, "e:n2").label).toBe("");
    expect(nodeIn(run, "e:n3").label).toBe(`${"c".repeat(20)}…`);
  });

  it("(f) takes the subtitle from the first service_name entry", () => {
    const long = "a".repeat(10000);
    const values: unknown[] = [
      "snowflake",
      "",
      42,
      true,
      ["a", "b"],
      "ßeta",
      "東京",
      long,
    ];
    const input = tables(values.map((v) => ({ attrs: { service_name: v } })));
    input.nodes.push(
      { id: "m", type: "table", attrs: { service_name: "first" } },
      { id: "m", type: "table", attrs: { service_name: "second" } },
    );
    const run = pipeline(input);
    const subs = values.map((_, i) => nodeIn(run, `e:n${i}`).sub);
    expect(subs).toEqual([
      "Snowflake · Table",
      "Table",
      "42 · Table",
      "True · Table",
      "A · Table",
      "SSeta · Table",
      "東京 · Table",
      `A${"a".repeat(9999)} · Table`,
    ]);
    expect(nodeIn(run, "e:m").sub).toBe("First · Table");
  });

  it("(g) reads own values only for __proto__, constructor and toString", () => {
    const names = ["__proto__", "constructor", "toString"];
    const run = pipeline({
      nodes: names.map((n) => ({ id: n, type: n, label: n })),
      view: { approach: "passive", budget: "all" },
    });
    const scene = run.scene();
    expect(scene.nodes).toHaveLength(3);
    for (const node of scene.nodes) {
      expect(typeof node.typeLabel).toBe("string");
      expect(typeof node.sub).toBe("string");
      expect(node.label).toBe(node.id.slice(2));
      expect(Number.isFinite(node.w) && Number.isFinite(node.h)).toBe(true);
      expect(node.visual === null || typeof node.visual === "object").toBe(
        true,
      );
      expect(Object.getPrototypeOf(node.visual)).toBe(Object.prototype);
    }
  });

  it("(h) gives the member group of STORY-003-01", () => {
    const run = fixture("s-star");
    const action: Action = { kind: "expandGroup", group: TABLE_GROUP };
    const next = transition(run.state, action, run.graph, run.vocab);
    const after = frontier(next, run.graph, run.vocab);
    const placed = place(
      next,
      { action, before: run.view, after },
      run.vocab,
      iconMetrics,
    );
    const scene = sceneOf(
      {
        state: placed.state,
        frontier: after,
        vocab: run.vocab,
        canvas: CANVAS,
      },
      TEXT,
    );
    const byId = (id: string) => scene.nodes.find((n) => n.id === id);
    expect(byId("e:t_0")?.group).toBe(TABLE_GROUP);
    expect(byId("e:tag_pii")?.group).toBeNull();
  });
});
