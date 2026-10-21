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
const { mountApp } = await import("./testFrame");
const { appInput, fixtureModel } = await import("./fixtureModel");
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

const click = (el: Element, shiftKey = false) =>
  run(
    () =>
      void el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey }),
      ),
  );
const button = (root: Element, name: string) => {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find((b) =>
    text(b).startsWith(name),
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};
const seg = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".seg button")].find((b) =>
    text(b).startsWith(name),
  ) as HTMLElement;
const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".wb-table tbody tr.row"),
];
const tick = (row: Element, shift = false) =>
  click(row.querySelector("td.sel .check") as Element, shift);
const ticked = (root: Element) =>
  rows(root).filter((row) => row.getAttribute("aria-selected") === "true");
const idOf = (row: Element) => text(row.querySelector("code"));
const bulk = (root: Element) => text(root.querySelector(".bulk-sel"));
const bulkButton = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".wb-bulk .btn")].find((b) =>
    text(b).startsWith(name),
  ) as HTMLElement;
const countOf = (el: HTMLElement) => text(el.querySelector(".bulk-n"));
const headBox = (root: Element) =>
  root.querySelector(".wb-table thead th.sel .check") as HTMLElement;
const tipOf = (root: Element, el: Element) => {
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
  const tip = text(root.querySelector(".wb-bulk .tip"));
  void act(() => void el.dispatchEvent(new MouseEvent("mouseleave")));
  return tip;
};

function type(root: Element, value: string): void {
  const input = root.querySelector(".wb-search") as HTMLInputElement;
  void act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  void act(() => {
    vi.advanceTimersByTime(200);
  });
}

async function opened() {
  const input = fixtureModel("s-access");
  if (!input.ok) throw new Error("fatal");
  const frame = await mountApp(input);
  click(button(frame.root, "Dataset"));
  return { ...frame, input };
}

async function rangeOf2To6() {
  const frame = await opened();
  tick(rows(frame.root)[1]);
  tick(rows(frame.root)[5], true);
  return frame;
}

describe("S9 a Shift range and Show on canvas", () => {
  it("ticks 5 rows and reveals the 4 entities that are not drawn, in tick order", async () => {
    const { root } = await rangeOf2To6();
    expect(ticked(root).map(idOf)).toEqual([
      "db_ANALYTICS",
      "sc_MARTS",
      "t_FCT_REVENUE",
      "c_FCT_REVENUE.REVENUE_ID",
      "c_FCT_REVENUE.CUSTOMER_ID",
    ]);
    expect(bulk(root)).toBe("5 of 1,262 selected");
    const show = bulkButton(root, "Show on canvas");
    expect(countOf(show)).toBe("4");
    const reveal = vi.spyOn(canvas(), "reveal");
    click(show);
    expect(reveal.mock.calls).toEqual([
      [
        [
          "db_ANALYTICS",
          "sc_MARTS",
          "c_FCT_REVENUE.REVENUE_ID",
          "c_FCT_REVENUE.CUSTOMER_ID",
        ],
      ],
    ]);
  });
});

describe("S10 Select all and Clear", () => {
  it("ticks every row, then none", async () => {
    const { root } = await rangeOf2To6();
    click(button(root, "Select all 1,262"));
    expect(bulk(root)).toBe("1,262 of 1,262 selected");
    expect(headBox(root).getAttribute("aria-checked")).toBe("true");
    expect(root.querySelector(".wb-bulk .link-btn")?.textContent).toBe("Clear");
    click(button(root, "Clear"));
    expect(ticked(root)).toHaveLength(0);
    expect(root.querySelector(".wb-bulk")).toBeNull();
    expect(
      root.querySelectorAll(".wb-table thead th[aria-sort]").length,
    ).toBeGreaterThan(10);
    expect(headBox(root).getAttribute("aria-checked")).toBe("false");
  });
});

// why: QA Done gate item 4 — the mockup header box (app.js lines 1114, 1140) is named "Clear
// selection" while rows are ticked, and a press then clears them
describe("S10 the header box with some rows ticked", () => {
  it("is named Clear selection and clears", async () => {
    const { root } = await rangeOf2To6();
    expect(headBox(root).getAttribute("aria-checked")).toBe("mixed");
    expect(text(headBox(root))).toBe("Clear selection");
    click(headBox(root));
    expect(ticked(root)).toHaveLength(0);
    expect(root.querySelector(".wb-bulk")).toBeNull();
    expect(text(headBox(root))).toBe("Select all rows");
  });
});

describe("S11 Hide from canvas keeps one node drawn", () => {
  it("counts the drawn nodes less one and sends the 7 drawn ids once", async () => {
    const { root } = await opened();
    click(seg(root, "Nodes"));
    click(seg(root, "On canvas"));
    click(headBox(root));
    expect(ticked(root)).toHaveLength(14);
    expect(bulk(root)).toBe("14 of 14 selected");
    const hide = bulkButton(root, "Hide from canvas");
    expect(countOf(hide)).toBe("6");
    const call = vi.spyOn(canvas(), "hide");
    click(hide);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0]).toHaveLength(7);
    expect(state.frontier.value?.nodes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("S12 a filter takes the tick of a row that it removes", () => {
  it("keeps 3 of the 5 ticks for the search revenue, and not after", async () => {
    const { root } = await rangeOf2To6();
    type(root, "revenue");
    expect(text(root.querySelector(".wb-count"))).toBe(
      "70 of 1,262 rows · 7 of 483 nodes on canvas",
    );
    expect(bulk(root)).toBe("3 of 70 selected");
    expect(ticked(root).map(idOf)).toEqual([
      "t_FCT_REVENUE",
      "c_FCT_REVENUE.REVENUE_ID",
      "c_FCT_REVENUE.CUSTOMER_ID",
    ]);
    type(root, "");
    expect(bulk(root)).toBe("3 of 1,262 selected");
  });
});

describe("S13 a header sort button", () => {
  it("cycles ascending, descending and none with a numeric compare", async () => {
    const ids = ["c_10", "c_2", "c_1"];
    const nodes = ids.map((id) => ({ id, type: "column", label: id }));
    const frame = await mountApp(appInput({ nodes, edges: [] }));
    const { root } = frame;
    click(button(root, "Dataset"));
    const th = [...root.querySelectorAll(".wb-table thead th")].find(
      (el) => text(el) === "ID",
    ) as HTMLElement;
    const order = () => rows(root).map(idOf);
    const sortOf = () =>
      [...root.querySelectorAll(".wb-table thead th")]
        .find((el) => text(el).startsWith("ID"))
        ?.getAttribute("aria-sort");
    expect([order(), sortOf()]).toEqual([ids, "none"]);
    click(th.querySelector("button") as Element);
    expect([order(), sortOf()]).toEqual([["c_1", "c_2", "c_10"], "ascending"]);
    const again = () =>
      click(
        [...root.querySelectorAll(".wb-table thead th button")].find((b) =>
          text(b).startsWith("ID"),
        ) as Element,
      );
    again();
    expect([order(), sortOf()]).toEqual([["c_10", "c_2", "c_1"], "descending"]);
    again();
    expect([order(), sortOf()]).toEqual([ids, "none"]);
  });
});

describe("S28 a ticked hidden row comes back with Show", () => {
  it("reveals the hidden entity and the not-drawn entity in tick order", async () => {
    const { root, input } = await opened();
    if (!input.ok) throw new Error("fatal");
    run(() => canvas().hide(["e:u_0"]));
    click(seg(root, "Nodes"));
    const record =
      input.model.graph.entities.find((e) => e.id === "u_0")?.records[0] ?? "";
    type(root, record);
    tick(rows(root).find((row) => idOf(row) === record) as Element);
    type(root, "");
    tick(rows(root).find((row) => idOf(row) === "db_ANALYTICS") as Element);
    const show = bulkButton(root, "Show on canvas");
    expect(countOf(show)).toBe("2");
    expect(tipOf(root, show)).toBe(
      "Bring onto the canvas. Hidden items come back with the neighbours that left with them",
    );
    const hide = bulkButton(root, "Hide from canvas");
    expect(hide.getAttribute("aria-disabled")).toBe("true");
    expect(countOf(hide)).toBe("");
    expect(tipOf(root, hide)).toBe("No selected node is on the canvas");
    const call = vi.spyOn(canvas(), "hide");
    click(hide);
    expect(call).not.toHaveBeenCalled();
    const reveal = vi.spyOn(canvas(), "reveal");
    click(show);
    expect(reveal.mock.calls).toEqual([[["u_0", "db_ANALYTICS"]]]);
  });
});
