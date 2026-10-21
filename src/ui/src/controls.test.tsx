// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi, type MockInstance } from "vitest";
import type { Canvas } from "./canvas/index";

type Method = "setBudget" | "resetView" | "setLayout" | "setFilters";

// why: S1-S10 — the real canvas, with a spy on each method that the controls call
const spy = vi.hoisted(() => ({
  canvases: [] as Canvas[],
  calls: [] as Record<Method, MockInstance>[],
}));
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      const made = mod.createCanvas(...args);
      const calls = {} as Record<Method, MockInstance>;
      for (const name of [
        "setBudget",
        "resetView",
        "setLayout",
        "setFilters",
      ] as const)
        calls[name] = vi.spyOn(made, name);
      spy.canvases.push(made);
      spy.calls.push(calls);
      return made;
    },
  };
});

// why: STORY-003-04 fake clock, STORY-004-02 rule 15 — the clock comes before `d3-timer` loads
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
const { mountApp } = await import("./testFrame");
const { fixtureModel } = await import("./fixtureModel");
const { TypeGlyph } = await import("./TypeGlyph");
const state = await import("./state");

const canvas = () => spy.canvases[spy.canvases.length - 1];
const calls = () => spy.calls[spy.calls.length - 1];
const click = (el: Element) => void act(() => (el as HTMLElement).click());

// why: a method or a press, then the frames until the next `settle` (the camera of each `settle`
// is a new object); the result says if a `settle` came
function step(work: () => void): boolean {
  const before = state.camera.value;
  void act(work);
  for (let i = 0; i < 1000 && state.camera.value === before; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
  return state.camera.value !== before;
}

async function controls(key: string) {
  const frame = await mountApp(fixtureModel(key));
  const buttons = [...frame.root.querySelectorAll(".controls .ctl-btn")];
  const menuOf = (button: Element) => button.nextElementSibling as HTMLElement;
  const open = (index: number) => {
    const button = buttons[index];
    if (menuOf(button).hidden) click(button);
    return menuOf(button);
  };
  return { frame, buttons, open };
}

const text = (el: Element | null | undefined) => el?.textContent ?? "";
const radios = (menu: Element) => [
  ...menu.querySelectorAll('[role="menuitemradio"]'),
];
const checkedText = (menu: Element) =>
  text(menu.querySelector('[role="menuitemradio"][aria-checked="true"]'));
const resetItem = (menu: Element) =>
  menu.querySelector<HTMLButtonElement>('[role="menuitem"]');
const ids = () =>
  (state.frontier.value?.nodes ?? []).map((node) => node.id).sort();

describe("S1 to S5 the scope control", () => {
  it("S1 reads 7 / 483 with its name, summary, budget and Reset", async () => {
    const { buttons, open } = await controls("s-access");
    expect(text(buttons[0].querySelector(".mono"))).toBe("7 / 483");
    expect(buttons[0].getAttribute("aria-label")).toBe("7 of 483 nodes drawn");
    const menu = open(0);
    const summary = text(menu.querySelector(".scope-summary"));
    expect(summary.startsWith("7 of 483 nodes drawn.")).toBe(true);
    expect(summary).not.toContain("Starting from");
    expect(summary).not.toContain("Some nodes were hidden");
    expect(summary).toContain(
      "Double-click a node marked +N to draw its next hop, and again to collapse it. Every row stays in the Dataset table.",
    );
    expect(text(menu.querySelector(".menu-label"))).toBe(
      "Start big results with",
    );
    expect(radios(menu).map(text)).toEqual([
      "10 nodes",
      "20 nodesDefault",
      "50 nodes",
      "EverythingSlow above ~1,200",
    ]);
    expect(checkedText(menu)).toBe("20 nodesDefault");
    expect(resetItem(menu)?.disabled).toBe(true);
    expect(text(resetItem(menu))).toBe("Reset to first viewfirst view");
    expect(step(() => click(radios(menu)[3]))).toBe(true);
    expect(buttons[0].getAttribute("aria-label")).toBe("All 483 nodes drawn");
    expect(text(open(0).querySelector(".scope-summary"))).toBe(
      "All 483 nodes are drawn.",
    );
  });

  it("S2 a budget of 50 is one setBudget call and re-selects under Active", async () => {
    const { buttons, open } = await controls("s-access");
    expect(step(() => click(radios(open(0))[2]))).toBe(true);
    expect(calls().setFilters).not.toHaveBeenCalled();
    expect(calls().setBudget).toHaveBeenCalledTimes(1);
    expect(calls().setBudget).toHaveBeenCalledWith(50);
    const menu = open(0);
    expect(checkedText(menu)).toBe("50 nodes");
    expect(text(buttons[0].querySelector(".mono"))).toBe("50 / 483");
    expect(state.selection.value).toEqual({ node: "e:t_FCT_REVENUE" });
    expect(resetItem(menu)?.disabled).toBe(false);
  });

  // why: S18 plant (g), LEARNINGS 42 — with a view hint the engine reset and `firstView` give the
  // same ids at any budget (s-access), so the compare with the engine reset is shown where they
  // differ: an auto scope keeps the new budget in the reset, and the note names that budget
  it("S2 with no view hint the reset keeps the budget, so Reset stays disabled", async () => {
    const { open } = await controls("q-full-vocabulary");
    const first = ids().length;
    expect(step(() => click(radios(open(0))[2]))).toBe(true);
    expect(ids().length).toBeGreaterThan(first);
    const menu = open(0);
    expect(resetItem(menu)?.disabled).toBe(true);
    expect(text(resetItem(menu)?.querySelector("small"))).toBe("50 nodes");
  });

  it("S3 Reset after an explore goes back to the first view", async () => {
    const { open } = await controls("s-access");
    const first = ids();
    expect(step(() => canvas().expand("e:u_0"))).toBe(true);
    expect(state.frontier.value?.nodes).toHaveLength(11);
    const reset = resetItem(open(0));
    expect(reset?.disabled).toBe(false);
    expect(step(() => click(reset as Element))).toBe(true);
    expect(calls().resetView).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(first);
    expect(resetItem(open(0))?.disabled).toBe(true);
  });

  it("S4 Passive with an auto root names the root as a text node", async () => {
    const { open } = await controls("q-full-vocabulary");
    const menu = open(0);
    const summary = menu.querySelector(".scope-summary");
    expect(text(summary)).toContain(
      "Starting from ORDERS, the most connected node.",
    );
    const root = [...(summary?.querySelectorAll("strong") ?? [])].find(
      (el) => el.textContent === "ORDERS",
    );
    expect(root?.childNodes).toHaveLength(1);
    expect(root?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(text(resetItem(menu)?.querySelector("small"))).toBe("20 nodes");
  });

  it("S5 Everything draws all with grouping and shows 483 nodes", async () => {
    const { buttons, open } = await controls("s-access");
    expect(step(() => click(radios(open(0))[3]))).toBe(true);
    expect(calls().setBudget).toHaveBeenCalledTimes(1);
    expect(calls().setBudget).toHaveBeenCalledWith("all");
    expect(checkedText(open(0))).toBe("EverythingSlow above ~1,200");
    expect(state.frontier.value?.nodes).toHaveLength(159);
    expect(state.canvasState.value?.scope.mode).toBe("all");
    expect(text(buttons[0].querySelector(".mono"))).toBe("483 nodes");
  });
});

type Line = { name: string; count: string; prov: string; on: string | null };
function blocksOf(menu: Element) {
  return [...menu.querySelectorAll(".fam-head")].map((head) => ({
    group: text(head),
    rows: [...(head.nextElementSibling?.querySelectorAll("li") ?? [])].map(
      (li): Line => ({
        name: text(li.querySelector(".name")),
        count: text(li.querySelector(".n")),
        prov: text(li.querySelector(".prov")),
        on:
          li.querySelector('[role="checkbox"]')?.getAttribute("aria-checked") ??
          null,
      }),
    ),
  }));
}
const rowsOf = (block: { rows: Line[] }) =>
  block.rows.map((row) => `${row.name} ${row.count}`);

describe("S6 to S8 the Types menu", () => {
  it("S6 shows the groups in the typeGroups order with the stats rows", async () => {
    const { open } = await controls("s-access");
    const menu = open(1);
    expect(text(menu.querySelector(".menu-label"))).toBe("Node types");
    const blocks = blocksOf(menu);
    expect(blocks.map((block) => block.group)).toEqual([
      "Catalog structure",
      "People & access",
      "Tagging",
    ]);
    expect(blocks.map(rowsOf)).toEqual([
      ["Column 378", "Table 29", "Schema 6", "Database 2", "Data source 1"],
      ["User 22", "User group 8", "Asset group 6"],
      ["Tag 18", "Property 8", "Tag group 3", "Property set 2"],
    ]);
    for (const row of blocks.flatMap((block) => block.rows)) {
      expect(row.on).toBe("true");
      expect(row.prov).toBe("system");
    }
    expect(menu.querySelectorAll(".type-list .glyph svg")).toHaveLength(12);
  });

  it("S7 the Unknown row has the untyped mark and turns off with type null", async () => {
    const { frame, open } = await controls("s-dirty");
    const custom = blocksOf(open(1)).at(-1);
    expect(custom?.group).toBe("Custom");
    expect(rowsOf(custom ?? { rows: [] })).toContain("Unknown 1");
    const line = [...open(1).querySelectorAll(".type-list li")].find(
      (li) => text(li.querySelector(".name")) === "Unknown",
    );
    const input = fixtureModel("s-dirty");
    if (!input.ok) throw new Error("fatal");
    const mark = document.createElement("div");
    void act(() =>
      render(
        <TypeGlyph
          visual={null}
          size={20}
          untyped={input.model.vocab.untyped}
        />,
        mark,
      ),
    );
    expect(line?.querySelector(".glyph")?.innerHTML).toBe(mark.innerHTML);
    expect(mark.querySelector("svg")).not.toBeNull();
    step(() => click(line?.querySelector('[role="checkbox"]') as Element));
    expect(calls().setFilters).toHaveBeenCalledTimes(1);
    expect(calls().setFilters).toHaveBeenCalledWith({
      kind: "toggleType",
      type: null,
      on: false,
    });
    expect(frame.root.querySelector(".type-list .off .name")?.textContent).toBe(
      "Unknown",
    );
  });

  it("S8 q-full-vocabulary has 26 rows, custom Annotation concepts and Custom", async () => {
    const { open } = await controls("q-full-vocabulary");
    const blocks = blocksOf(open(1));
    expect(blocks.flatMap((block) => block.rows)).toHaveLength(26);
    const concepts = blocks.find((b) => b.group === "Annotation concepts");
    expect(concepts?.rows).toHaveLength(6);
    for (const row of concepts?.rows ?? []) expect(row.prov).toBe("custom");
    const custom = blocks.find((b) => b.group === "Custom");
    expect(rowsOf(custom ?? { rows: [] })).toEqual([
      "Keyword 6",
      "Source file 1",
    ]);
  });
});

describe("S9 the Layout menu", () => {
  it("the info icon explains and picks nothing; each press of Atomic calls setLayout", async () => {
    const { frame, buttons, open } = await controls("s-access");
    const items = () => radios(open(2));
    expect(items().map((item) => text(item))).toEqual([
      "Force",
      "Atomic",
      "Bubbles",
      "Horizontal",
      "Vertical",
    ]);
    const info = items()[1].querySelector(".info") as HTMLElement;
    void act(() => {
      info.dispatchEvent(new MouseEvent("mouseenter"));
      info.focus();
    });
    expect(text(frame.root.querySelector('[role="tooltip"]'))).toBe(
      "Rings around a central node",
    );
    click(info);
    expect(calls().setLayout).not.toHaveBeenCalled();
    expect(open(2).hidden).toBe(false);
    expect(step(() => click(items()[1]))).toBe(true);
    expect(calls().setLayout).toHaveBeenCalledTimes(1);
    step(() => click(items()[1]));
    expect(calls().setLayout).toHaveBeenCalledTimes(2);
    expect(calls().setLayout).toHaveBeenNthCalledWith(2, "atomic");
    expect(text(buttons[2])).toBe("Atomic");
    expect(text(open(2).querySelector('[aria-checked="true"]'))).toBe("Atomic");
  });
});

describe("S10 the Grouping menu", () => {
  it("picks 5 or more, then Off, each as one grouping filter", async () => {
    const { buttons, open } = await controls("s-star");
    expect(text(buttons[3])).toBe("Group 2+");
    expect(radios(open(3)).map(text)).toEqual([
      "2 or moreDefault",
      "5 or more",
      "10 or more",
      "OffShow every node",
    ]);
    step(() => click(radios(open(3))[1]));
    expect(calls().setFilters).toHaveBeenLastCalledWith({
      kind: "grouping",
      grouping: 5,
    });
    expect(text(buttons[3])).toBe("Group 5+");
    step(() => click(radios(open(3))[3]));
    expect(calls().setFilters).toHaveBeenLastCalledWith({
      kind: "grouping",
      grouping: "off",
    });
    expect(calls().setFilters).toHaveBeenCalledTimes(2);
    expect(text(buttons[3])).toBe("Group off");
  });
});
