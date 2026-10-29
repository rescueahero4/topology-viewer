// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";

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
const { datasets } = await import("@qdic-topology/fixtures");
const state = await import("./state");

const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const click = (el: Element | null | undefined) =>
  run(() => el?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const button = (root: Element, name: string) => {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => text(b) === name || b.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};
const seg = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".seg button")].find((b) =>
    text(b).startsWith(name),
  );
const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".wb-table tbody tr.row"),
];
const heads = (root: Element) =>
  [...root.querySelectorAll(".wb-table thead th")].map((th) =>
    text(th).replace(/ [▲▼]$/, ""),
  );
const cell = (root: Element, row: Element, column: string) =>
  text(row.children[heads(root).indexOf(column)]);
const ids = (root: Element) => rows(root).map((row) => cell(root, row, "ID"));
const rowById = (root: Element, id: string) =>
  rows(root).find((row) => cell(root, row, "ID") === id);
const sortBy = (root: Element, name: string) =>
  click(
    [...root.querySelectorAll(".wb-table thead th button")].find((b) =>
      text(b).startsWith(name),
    ),
  );

function search(root: Element, value: string): void {
  const input = root.querySelector(".wb-search") as HTMLInputElement;
  void act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  void act(() => {
    vi.advanceTimersByTime(200);
  });
}

const barButton = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".wb-bar .wb-btn")].find((b) =>
    text(b).startsWith(name),
  ) as HTMLElement;

// why: a check of a Workbench menu ("Kind" or "Columns") by its label
function check(root: Element, menu: string, label: string): void {
  const toggle = barButton(root, menu);
  click(toggle);
  const item = [
    ...(toggle.nextElementSibling?.querySelectorAll<HTMLElement>(
      ".check-item .check, [role=menuitemcheckbox]",
    ) ?? []),
  ].find((el) => text(el).endsWith(label) || text(el).startsWith(label));
  if (item === undefined) throw new Error(`no ${label} in ${menu}`);
  click(item);
  click(toggle);
}

function columnKeys(root: Element): string[] {
  const toggle = barButton(root, "Columns");
  click(toggle);
  const keys = [
    ...(toggle.nextElementSibling?.querySelectorAll(
      "[role=menuitemcheckbox] .nm",
    ) ?? []),
  ].map((el) => text(el));
  click(toggle);
  return keys;
}

async function opened(input = appInput(datasets.catalog.graph)) {
  if (!input.ok) throw new Error("fatal");
  const frame = await mountApp(input);
  click(button(frame.root, "Dataset"));
  return { ...frame, input };
}

describe("S5 a Name edit of a record reaches its row and the edge ends", () => {
  it("reads RAW_EU in the node row and in each Subject or Object cell", async () => {
    const { root } = await opened();
    search(root, "db_RAW");
    const edges = () =>
      rows(root).filter((row) => cell(root, row, "Type") === "edge");
    const ends = () =>
      edges().map((row) =>
        cell(root, row, "Subject") === "RAW" ||
        cell(root, row, "Subject") === "RAW_EU"
          ? cell(root, row, "Subject")
          : cell(root, row, "Object"),
      );
    expect(cell(root, rowById(root, "db_RAW") as Element, "Name")).toBe("RAW");
    expect(edges()).toHaveLength(3);
    expect(ends()).toEqual(["RAW", "RAW", "RAW"]);
    pushEdit({
      row: { record: "db_RAW" },
      column: "name",
      before: "RAW",
      after: "RAW_EU",
    });
    expect(cell(root, rowById(root, "db_RAW") as Element, "Name")).toBe(
      "RAW_EU",
    );
    expect(ends()).toEqual(["RAW_EU", "RAW_EU", "RAW_EU"]);
  });
});

describe("S6 a Kind edit of one record of a merged node", () => {
  it("shows the record kind in its row only", async () => {
    const { root } = await opened(fixtureModel("s-merge-namesakes"));
    const kind = (id: string) =>
      cell(root, rowById(root, id) as Element, "Kind");
    expect(kind("t_orders_a")).toMatch(/^Table/);
    expect(kind("t_orders_b")).toMatch(/^Table/);
    pushEdit({
      row: { record: "t_orders_a" },
      column: "kind",
      before: "table",
      after: "view",
    });
    expect(kind("t_orders_a")).toMatch(/^View/);
    expect(kind("t_orders_b")).toMatch(/^Table/);
  });
});

// why: rule 5 — Name ascending with the Kind filter Table; the Nodes row type keeps the edge rows
// (which the Kind filter does not hold back) out of the first two places
async function sortedTables() {
  const frame = await opened();
  const { root } = frame;
  click(seg(root, "Nodes"));
  check(root, "Kind", "Table");
  sortBy(root, "Name");
  return frame;
}

describe("S7 an edit keeps the shown rows and their order", () => {
  it("keeps the ids and the order; the cells show the new values", async () => {
    const { root } = await sortedTables();
    const before = ids(root);
    expect(before).toHaveLength(12);
    expect(before.slice(0, 2)).toEqual(["t_DIM_CUSTOMER", "t_FCT_PIPELINE"]);
    const first = () => rows(root)[0];
    const second = () => rows(root)[1];
    expect(cell(root, first(), "Name")).toBe("DIM_CUSTOMER");
    expect(cell(root, second(), "Kind")).toMatch(/^Table/);
    pushEdit({
      row: { record: "t_DIM_CUSTOMER" },
      column: "name",
      before: "DIM_CUSTOMER",
      after: "zzz",
    });
    pushEdit({
      row: { record: "t_FCT_PIPELINE" },
      column: "kind",
      before: "table",
      after: "view",
    });
    expect(ids(root)).toEqual(before);
    expect(cell(root, first(), "Name")).toBe("zzz");
    expect(cell(root, second(), "Kind")).toMatch(/^View/);
  });
});

describe("S8 a sort change after the edits", () => {
  it("orders by the new values and filters the view row out", async () => {
    const { root } = await sortedTables();
    pushEdit({
      row: { record: "t_DIM_CUSTOMER" },
      column: "name",
      before: "DIM_CUSTOMER",
      after: "zzz",
    });
    pushEdit({
      row: { record: "t_FCT_PIPELINE" },
      column: "kind",
      before: "table",
      after: "view",
    });
    expect(ids(root)).toHaveLength(12);
    sortBy(root, "Name");
    expect(heads(root)).toContain("Name");
    expect(ids(root)).toHaveLength(11);
    expect(ids(root)[0]).toBe("t_DIM_CUSTOMER");
    expect(ids(root)).not.toContain("t_FCT_PIPELINE");
    sortBy(root, "Name");
    sortBy(root, "Name");
    expect(ids(root)).toHaveLength(11);
    expect(ids(root).at(-1)).toBe("t_DIM_CUSTOMER");
    expect(ids(root)).not.toContain("t_FCT_PIPELINE");
  });
});

describe("S9 the session and the columns stay through an edit and its undo", () => {
  it("keeps the filters, the column choice, the ticks and refresh_cadence", async () => {
    const { root, input } = await opened();
    if (!input.ok) throw new Error("fatal");
    const holders = input.model.graph.records.filter((record) =>
      Object.hasOwn(record.attrs, "refresh_cadence"),
    );
    expect(holders.map((record) => record.id)).toEqual(["t_FCT_REVENUE"]);
    check(root, "Kind", "Table");
    check(root, "Columns", "System");
    // why: with ticks the head row shows the bulk bar, so the columns are read before the ticks
    const columns = heads(root);
    expect(columns).toContain("refresh_cadence");
    expect(columns).not.toContain("System");
    const at = (row: Element | undefined, name: string) =>
      text(row?.children[columns.indexOf(name)]);
    const shownIds = () => rows(root).map((row) => at(row, "ID"));
    click(rows(root)[0].querySelector("td.sel .check"));
    click(rows(root)[1].querySelector("td.sel .check"));
    const choice = () => {
      const toggle = barButton(root, "Columns");
      click(toggle);
      const items = [
        ...(toggle.nextElementSibling?.querySelectorAll(
          "[role=menuitemcheckbox]",
        ) ?? []),
      ].map((el) => `${text(el)} ${el.getAttribute("aria-checked")}`);
      click(toggle);
      return items;
    };
    const session = () => ({
      kind: text(barButton(root, "Kind").querySelector(".count-badge")),
      choice: choice(),
      ticked: rows(root)
        .filter((row) => row.getAttribute("aria-selected") === "true")
        .map((row) => at(row, "ID")),
      keys: columnKeys(root),
      ids: shownIds(),
    });
    const revenue = () =>
      at(
        rows(root).find((row) => at(row, "ID") === "t_FCT_REVENUE"),
        "refresh_cadence",
      );
    const before = session();
    expect(before.kind).toBe("1");
    expect(before.choice).toContain("System false");
    expect(before.choice).toContain("refresh_cadence true");
    expect(before.keys).toContain("refresh_cadence");
    expect(before.ticked).toEqual(before.ids.slice(0, 2));
    expect(before.ids).toContain("t_FCT_REVENUE");
    expect(revenue()).toBe("hourly");
    pushEdit({
      row: { record: "t_FCT_REVENUE" },
      column: { attr: "refresh_cadence" },
      before: "hourly",
      after: undefined,
    });
    expect(revenue()).toBe("");
    expect(session()).toEqual(before);
    void act(() => state.stepEdits((history) => history.undo()));
    expect(state.editHistory.value.history.active()).toEqual([]);
    expect(revenue()).toBe("hourly");
    expect(session()).toEqual(before);
  });
});
