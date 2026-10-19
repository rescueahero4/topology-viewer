// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "@qdic-topology/contract";
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
  type CanvasState,
  type Designed,
  type Frontier,
  type Graph,
  type Hex,
  type Vocab,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type SceneNode,
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
const GLYPH = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/;

type Run = {
  graph: Graph;
  vocab: Vocab;
  state: CanvasState;
  view: Frontier;
};

function firstOf(key: string): Run {
  const result = normalize(loadFixture(key).input, { now: NOW });
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
  return { graph, vocab, state, view: frontier(state, graph, vocab) };
}

function draw(run: Run, doc: Document = document) {
  const scene = sceneOf(
    { state: run.state, frontier: run.view, vocab: run.vocab, canvas: CANVAS },
    TEXT,
  );
  const div = doc.createElement("div");
  doc.body.appendChild(div);
  createRenderer(div, { text: TEXT }).draw(scene);
  const nodes = [...div.querySelectorAll<SVGGElement>("g.qt-node")];
  const datum = (el: Element) =>
    (el as unknown as { __data__: SceneNode }).__data__;
  const node = (id: string) => {
    const el = nodes.find((n) => datum(n).id === id);
    if (el === undefined) throw new Error(`no node ${id}`);
    return el;
  };
  const symbolOf = (id: string) =>
    doc.getElementById(
      (node(id).querySelector("use")?.getAttribute("href") ?? "").slice(1),
    ) as Element;
  return { div, scene, nodes, datum, node, symbolOf };
}

const chipOf = (el: Element) => el.querySelector("g.qt-more");
const subOf = (el: Element) => el.querySelector("text.qt-sub")?.textContent;

describe("S7 s-access first view", () => {
  const d = draw(firstOf("s-access"));
  const order = [
    "e:t_FCT_REVENUE",
    "e:ug_analytics",
    "e:ug_fin_admin",
    "e:ug_exec",
    "e:u_0",
    "e:u_7",
    "e:u_12",
  ];

  it("draws 7 nodes in frontier order with 3 symbols", () => {
    expect(d.nodes.map((el) => d.datum(el).id)).toEqual(order);
    expect(d.div.querySelectorAll("defs > symbol")).toHaveLength(3);
  });

  it("draws the chips and their widths", () => {
    const chips = d.nodes.map(chipOf);
    expect(chips.map((c) => c?.querySelector("text")?.textContent)).toEqual([
      "+34",
      "+11",
      "+8",
      "+8",
      "+4",
      "+2",
      "+3",
    ]);
    expect(
      chips.map((c) => c?.querySelector("rect")?.getAttribute("width")),
    ).toEqual(["26", "26", "20", "20", "20", "20", "20"]);
  });

  it("draws the subtitles", () => {
    expect(subOf(d.node("e:t_FCT_REVENUE"))).toBe("Snowflake · Table");
    for (const id of order.slice(1, 4))
      expect(subOf(d.node(id))).toBe("User group");
    for (const id of order.slice(4)) expect(subOf(d.node(id))).toBe("User");
  });
});

describe("S8 s-access after an explore and place", () => {
  it("draws 16 nodes with the open chip and the newcomer chips", () => {
    const run = firstOf("s-access");
    const action: Action = { kind: "explore", id: "t_FCT_REVENUE" };
    const next = transition(run.state, action, run.graph, run.vocab);
    const after = frontier(next, run.graph, run.vocab);
    const placed = place(
      next,
      { action, before: run.view, after },
      run.vocab,
      iconMetrics,
    );
    const d = draw({ ...run, state: placed.state, view: after });
    expect(d.nodes).toHaveLength(16);
    const root = chipOf(d.node("e:t_FCT_REVENUE"));
    expect(root?.getAttribute("class")).toBe("qt-more qt-open");
    expect(root?.querySelector("text")?.textContent).toBe("−");
    expect(d.datum(d.node("e:t_FCT_REVENUE")).opened).toBe(34);
    const before = new Set(run.view.nodes.map((n) => n.id));
    const fresh = d.nodes.filter((el) => !before.has(d.datum(el).id));
    const chips = Object.fromEntries(
      fresh
        .filter((el) => d.datum(el).kind === "entity")
        .map((el) => [
          d.datum(el).id,
          chipOf(el)?.querySelector("text")?.textContent,
        ]),
    );
    expect(chips).toEqual({
      "e:sc_MARTS": "+8",
      "e:tag_Sales": "+10",
      "e:ag_finance": "+9",
      "e:ag_reg": "+7",
      "e:ag_exec": "+7",
      "e:ug_fin_read": "+6",
    });
    const groups = fresh.filter((el) => d.datum(el).kind === "group");
    expect(groups.map(chipOf)).toEqual([null, null, null]);
    expect(
      groups.map((el) => el.querySelector("g.qt-badge text")?.textContent),
    ).toEqual(["24", "2", "2"]);
  });
});

describe("S10 s-star groups", () => {
  it("draws two groups with badges, labels, the collapsed sub and the guarded halo", () => {
    const d = draw(firstOf("s-star"));
    expect(d.nodes).toHaveLength(4);
    const table = d.node('g:["tag_pii","taggedWith","<","table"]');
    const column = d.node('g:["tag_pii","taggedWith","<","column"]');
    expect(table.querySelector("g.qt-badge text")?.textContent).toBe("300");
    expect(column.querySelector("g.qt-badge text")?.textContent).toBe("12");
    expect(table.querySelector("text.qt-name")?.textContent).toBe(
      TEXT.groupLabel("Table", 300),
    );
    expect(column.querySelector("text.qt-name")?.textContent).toBe(
      TEXT.groupLabel("Column", 12),
    );
    expect(subOf(table)).toBe(TEXT.collapsed);
    expect(subOf(column)).toBe(TEXT.collapsed);
    expect(table.querySelector(":scope > circle")?.getAttribute("fill")).toBe(
      "#864627",
    );
  });
});

describe("S11 s-designed marks from the fixture", () => {
  it("draws the regulation hexagon, the supplier diamond, the factory square and the product triangle", () => {
    const d = draw(firstOf("s-designed"));
    expect(d.nodes).toHaveLength(8);
    const regulation = d.symbolOf("e:reg_eu_battery");
    const hexagon = regulation.querySelector("polygon") as Element;
    expect(hexagon.getAttribute("points")).toBe(
      "22.00,1.50 39.75,11.75 39.75,32.25 22.00,42.50 4.25,32.25 4.25,11.75",
    );
    expect(hexagon.getAttribute("fill")).toBe("#8a4b4b");
    expect(hexagon.getAttribute("class")).toBe("qt-mark");
    const letters = regulation.querySelector("text") as Element;
    expect(letters.textContent).toBe("RG");
    expect(letters.getAttribute("fill")).toBe("#ffffff");
    expect(letters.getAttribute("font-size")).toBe("15.3");
    const byType = (type: string) =>
      d.nodes.map(d.datum).find((n) => n.type === type) as SceneNode;
    const designed = (type: string) => byType(type).visual as Designed;
    expect([designed("supplier").shape, designed("supplier").size]).toEqual([
      "diamond",
      32,
    ]);
    expect(
      d
        .symbolOf(byType("factory").id)
        .querySelector("rect")
        ?.getAttribute("rx"),
    ).toBe("3.84");
    expect([designed("product").shape, designed("product").size]).toEqual([
      "triangle",
      26,
    ]);
  });
});

describe("S12 s-designed-glyph marks", () => {
  it("draws the engine glyph as one path, and letters for supplier and site", () => {
    const run = firstOf("s-designed-glyph");
    const d = draw(run);
    expect(d.nodes).toHaveLength(20);
    const byType = (type: string) =>
      d.nodes.find((el) => d.datum(el).type === type) as SVGGElement;
    for (const type of [
      "regulation",
      "kpi",
      "factory",
      "product",
      "shipment",
    ]) {
      const glyph = (run.vocab.types.get(type)?.visual as Designed).glyph;
      const symbol = d.symbolOf(d.datum(byType(type)).id);
      const paths = symbol.querySelectorAll("path");
      expect(paths, type).toHaveLength(1);
      expect(paths[0].getAttribute("d")).toBe(glyph);
      expect(glyph).toMatch(GLYPH);
      expect(symbol.querySelector("text"), type).toBeNull();
    }
    const supplier = d.node('g:["sup_cell","supplies","<","supplier"]');
    expect(d.datum(supplier).kind).toBe("group");
    expect(
      d.symbolOf(d.datum(supplier).id).querySelector("text")?.textContent,
    ).toBe("SU");
    const site = d.symbolOf(d.datum(byType("site")).id);
    expect(site.querySelector("text")?.textContent).toBe("CO");
  });
});

describe("S16 determinism", () => {
  it("serialises two loads in two documents to the same bytes with prefix qt1", () => {
    const svgOf = () => {
      const doc = document.implementation.createHTMLDocument("t");
      const d = draw(firstOf("s-access"), doc);
      const svg = d.div.querySelector("svg") as Element;
      return new XMLSerializer().serializeToString(svg);
    };
    const one = svgOf();
    const two = svgOf();
    expect(one).toBe(two);
    expect(one).toContain('id="qt1-s-0"');
    expect(one).not.toContain("qt2-");
  });
});
