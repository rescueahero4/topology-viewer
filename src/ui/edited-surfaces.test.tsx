// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "./canvas/index";

const spy = vi.hoisted(() => ({ canvases: [] as Canvas[] }));
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      const made = mod.createCanvas(...args);
      spy.canvases.push(made);
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
const { mountApp, pushEdit } = await import("./testFrame");
const { appInput, fixtureModel } = await import("./fixtureModel");
const { datasets } = await import("#fixtures");
const state = await import("./state");

const canvas = () => spy.canvases[spy.canvases.length - 1];
const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const press = (el: Element | undefined) =>
  run(() => el?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const button = (root: Element, name: string) => {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => text(b) === name || b.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};
const title = (root: Element) =>
  text(root.querySelector(".inspector .insp-title strong"));

function search(root: Element, value: string) {
  const input = root.querySelector(".search input") as HTMLInputElement;
  void act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  void act(() => {
    vi.advanceTimersByTime(120);
  });
  return [
    ...root.querySelectorAll<HTMLElement>(".search-results [role=option]"),
  ].map((row) => ({
    name: text(row.querySelector(".name")),
    meta: text(row.querySelector(".meta")),
  }));
}

// why: the Types menu rows: name, count and provenance tag
function typeRows(root: Element) {
  const control = root.querySelectorAll(".controls .ctl-btn")[1];
  const menu = control.nextElementSibling as HTMLElement;
  if (menu.hidden) void act(() => (control as HTMLElement).click());
  return [...menu.querySelectorAll(".type-list li")].map((li) => ({
    name: text(li.querySelector(".name")),
    count: text(li.querySelector(".n")),
    prov: text(li.querySelector(".prov")),
  }));
}

// why: the items of a Workbench check menu ("Kind" or "Family") by name and count
function menuItems(root: Element, name: string) {
  const toggle = button(root.querySelector(".workbench") as Element, name);
  const menu = toggle.nextElementSibling as HTMLElement | null;
  if (menu === null || menu.hidden) press(toggle);
  const open = toggle.nextElementSibling as HTMLElement;
  const items = [...open.querySelectorAll(".check-item")].map((item) => ({
    name: text(item)
      .replace(text(item.querySelector(".glyph")), "")
      .replace(text(item.querySelector(".n")), ""),
    count: text(item.querySelector(".n")),
  }));
  press(toggle);
  return items;
}

const AROUND = "Group neighbours by type around this node";
const action = (root: Element, name: string) =>
  [
    ...root.querySelectorAll<HTMLElement>(".inspector .insp-bar .icon-btn"),
  ].find((el) => el.getAttribute("aria-label") === name);

const kindFact = (root: Element) => {
  const dt = [...root.querySelectorAll(".inspector .facts dt")].find(
    (el) => el.firstChild?.textContent === "Type",
  );
  return dt?.nextElementSibling as HTMLElement | undefined;
};

async function catalog() {
  const input = appInput(datasets.catalog.graph);
  if (!input.ok) throw new Error("fatal");
  const frame = await mountApp(input);
  return { ...frame, input };
}

describe("STORY-008-09 S12 an ID edit reaches the inspector Records row", () => {
  it("lists the shown ID of each record of a merged entity", async () => {
    const input = fixtureModel("s-merge-namesakes");
    if (!input.ok) throw new Error("fatal");
    const { root } = await mountApp(input);
    const entity = input.model.graph.entities.find((e) =>
      e.records.includes("t_orders_a"),
    );
    if (entity === undefined) throw new Error("no entity");
    run(() => canvas().select(`e:${entity.id}`));
    const records = () => {
      const dt = [...root.querySelectorAll(".inspector .facts dt")].find(
        (el) => el.firstChild?.textContent === "Records",
      );
      return text(dt?.nextElementSibling ?? null);
    };
    expect(records()).toContain("t_orders_a");
    pushEdit({
      row: { record: "t_orders_a" },
      column: "id",
      before: "t_orders_a",
      after: "NEWID",
    });
    expect(records()).toContain("NEWID");
    expect(records()).not.toContain("t_orders_a");
    expect(records()).toContain("t_orders_b");
  });
});

describe("S1 a Name edit reaches the inspector and search", () => {
  it("titles the merged entity ORDERS_EU and finds it with its 2 records", async () => {
    const input = fixtureModel("s-merge-namesakes");
    if (!input.ok) throw new Error("fatal");
    const { root } = await mountApp(input);
    const entity = input.model.graph.entities.find((e) =>
      e.records.includes("t_orders_a"),
    );
    if (entity === undefined) throw new Error("no entity");
    expect(entity.records).toEqual(["t_orders_a", "t_orders_b"]);
    run(() => canvas().select(`e:${entity.id}`));
    expect(title(root)).toBe("ORDERS");
    expect(search(root, "ORDERS_EU")).toEqual([]);
    expect(
      search(root, "ORDERS").filter((hit) => hit.name === "ORDERS"),
    ).toHaveLength(2);
    pushEdit({
      row: { record: "t_orders_a" },
      column: "name",
      before: "ORDERS",
      after: "ORDERS_EU",
    });
    expect(title(root)).toBe("ORDERS_EU");
    const hits = search(root, "ORDERS_EU");
    expect(hits.map((hit) => hit.name)).toEqual(["ORDERS_EU"]);
    expect(hits[0].meta).toContain("2 records");
    const orders = search(root, "ORDERS").filter(
      (hit) => hit.name === "ORDERS",
    );
    expect(orders).toHaveLength(1);
    const graph = state.editedGraph.value;
    expect(
      graph?.entities.filter((e) => e.label === "ORDERS").map((e) => e.id),
    ).toEqual(["t_orders_f"]);
  });
});

describe("S2 a Kind edit and a Name edit of a report", () => {
  it("reach the Types menu, the Kind filter, the inspector and the focus pill", async () => {
    const { root, input } = await catalog();
    const id = "db_revenue_r0";
    expect(input.model.vocab.entities.get(id)?.type).toBe("report");
    press(button(root, "Dataset"));
    run(() => canvas().focus(id));
    expect(state.selection.value).toEqual({ node: `e:${id}` });
    run(() => action(root, AROUND)?.click());
    const pill = () => root.querySelector(".status-stack .focus-pill");
    expect(text(pill()?.querySelector(".fp-name"))).toBe("Monthly revenue");
    const before = typeRows(root);
    const report = before.find((row) => row.name === "Report");
    expect(report?.count).toBe("17");
    expect(before.some((row) => row.name === "Data contract")).toBe(false);
    const kinds = menuItems(root, "Kind");
    expect(kinds.find((item) => item.name === "Report")?.count).toBe("17");
    expect(kinds.some((item) => item.name === "Data contract")).toBe(false);
    expect(text(kindFact(root))).toContain("Report");
    pushEdit({
      row: { record: id },
      column: "kind",
      before: "report",
      after: "data_contract",
    });
    const after = typeRows(root);
    expect(after.find((row) => row.name === "Report")?.count).toBe("16");
    expect(after.find((row) => row.name === "Data contract")).toEqual({
      name: "Data contract",
      count: "1",
      prov: "custom",
    });
    const edited = menuItems(root, "Kind");
    expect(edited.find((item) => item.name === "Report")?.count).toBe("16");
    expect(edited.find((item) => item.name === "Data contract")?.count).toBe(
      "1",
    );
    expect(text(kindFact(root))).toContain("Data contract");
    expect(text(pill()?.querySelector(".fp-name"))).toBe("Monthly revenue");
    pushEdit({
      row: { record: id },
      column: "name",
      before: "Monthly revenue",
      after: "Revenue_EU",
    });
    expect(text(pill()?.querySelector(".fp-name"))).toBe("Revenue_EU");
    expect(title(root)).toBe("Revenue_EU");
  });
});

describe("S3 a Predicate edit to a custom predicate", () => {
  it("shows a Custom family tab and the Custom family in the Workbench menu", async () => {
    const { root, input } = await catalog();
    const tabs = () =>
      [...root.querySelectorAll(".catbar .fam-tab")].map((tab) => text(tab));
    press(button(root, "Dataset"));
    expect(tabs()).not.toContain("Custom");
    expect(menuItems(root, "Family").map((item) => item.name)).not.toContain(
      "Custom",
    );
    const triple = input.model.graph.triples.find(
      (tr) => tr.predicate === "taggedWith",
    );
    if (triple === undefined) throw new Error("no taggedWith");
    pushEdit({
      row: { triple: triple.key },
      column: "predicate",
      before: "taggedWith",
      after: "reviewedBy",
    });
    expect(tabs()).toContain("Custom");
    expect(
      menuItems(root, "Family").find((item) => item.name === "Custom"),
    ).toEqual({ name: "Custom", count: "1" });
  });
});

describe("S4 a Name edit of a hidden node", () => {
  it("renames its row in the Hidden list", async () => {
    const { root } = await catalog();
    const drawn = state.frontier.value?.nodes.find((node) =>
      node.id.startsWith("e:"),
    );
    if (drawn === undefined) throw new Error("no drawn entity");
    const id = drawn.id.slice(2);
    run(() => canvas().hide([drawn.id]));
    press(root.querySelector(".hidden-panel .hid-toggle") ?? undefined);
    const names = () =>
      [...root.querySelectorAll(".hidden-panel .hid-row .name")].map((el) =>
        text(el),
      );
    const label = state.editedModel.value?.vocab.entities.get(id)?.label;
    expect(names()).toEqual([label]);
    pushEdit({
      row: { record: id },
      column: "name",
      before: label,
      after: "Renamed",
    });
    expect(names()).toEqual(["Renamed"]);
  });
});

describe("S14 an edit removes the AI mark of its field", () => {
  it("shows the Description with no inferred mark after the edit", async () => {
    const { root } = await catalog();
    const id = "t_DIM_CUSTOMER";
    run(() => canvas().focus(id));
    const value = () =>
      [...root.querySelectorAll(".inspector .facts dt")].find(
        (dt) => dt.textContent === "Description",
      )?.nextElementSibling;
    expect(text(value()?.querySelector(".val"))).toContain(
      "One row per paying customer",
    );
    expect(value()?.querySelector(".ai-mark")).not.toBeNull();
    pushEdit({
      row: { record: id },
      column: "description",
      before: "One row per paying customer",
      after: "New text",
    });
    expect(value()?.querySelector(".ai-mark")).toBeNull();
    expect(text(value()?.querySelector(".val"))).toBe("New text");
  });
});
