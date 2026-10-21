// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { readFileSync } from "node:fs";
import path from "node:path";
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
const { fixtureModel } = await import("./fixtureModel");
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

const button = (root: Element, name: string) => {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => text(b) === name || b.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};
const section = (root: Element) =>
  root.querySelector(".workbench") as HTMLElement;
const count = (root: Element) => text(root.querySelector(".wb-count"));
const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".wb-table tbody tr.row"),
];
const heads = (root: Element) =>
  [...root.querySelectorAll(".wb-table thead th")].map((th) => text(th));
const cell = (root: Element, row: Element, column: string) =>
  row.children[heads(root).indexOf(column)] as HTMLElement;
const idOf = (root: Element, row: Element) => text(cell(root, row, "ID"));
const eyeOf = (root: Element, row: Element) =>
  cell(root, row, "Canvas").querySelector(".oc") as HTMLElement;
const rowById = (root: Element, id: string) =>
  rows(root).find((row) => idOf(root, row) === id) as HTMLElement;
const press = (el: Element) =>
  run(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const hover = (el: Element) =>
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
const tipText = (root: Element) => text(root.querySelector(".wb-scroll .tip"));

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

// why: the search brings the row of an ID into the window (the search reads the ID text)
function find(root: Element, id: string): HTMLElement {
  type(root, id);
  const row = rowById(root, id);
  if (row === undefined) throw new Error(`no row ${id}`);
  return row;
}

async function opened(key = "s-access") {
  const input = fixtureModel(key);
  if (!input.ok) throw new Error("fatal");
  const frame = await mountApp(input);
  press(button(frame.root, "Dataset"));
  return { ...frame, input };
}

const seg = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".seg button")].find((b) =>
    text(b).startsWith(name),
  ) as HTMLElement;

describe("S1 the Dataset button opens the split layout", () => {
  it("shows the count with the canvas part", async () => {
    const input = fixtureModel("s-access");
    const frame = await mountApp(input);
    const { root } = frame;
    expect(section(root).hasAttribute("inert")).toBe(true);
    expect(root.querySelector(".split")?.getAttribute("data-layout")).toBe(
      "canvas-only",
    );
    const dataset = button(root, "Dataset");
    expect(dataset.getAttribute("aria-expanded")).toBe("false");
    expect(dataset.getAttribute("aria-controls")).toBe(section(root).id);
    press(dataset);
    expect(root.querySelector(".split")?.getAttribute("data-layout")).toBe(
      "split",
    );
    expect(section(root).hasAttribute("inert")).toBe(false);
    expect(count(root)).toBe("1,262 rows · 7 of 483 nodes on canvas");
    expect(dataset.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("S2 the default order and the canvas state", () => {
  it("lists the records in order with their eye", async () => {
    const frame = await opened();
    const { root, input } = frame;
    const ids = rows(root)
      .slice(0, 7)
      .map((row) => idOf(root, row));
    expect(ids).toEqual([
      "ds_snow",
      "db_ANALYTICS",
      "sc_MARTS",
      "t_FCT_REVENUE",
      "c_FCT_REVENUE.REVENUE_ID",
      "c_FCT_REVENUE.CUSTOMER_ID",
      "c_FCT_REVENUE.INVOICE_ID",
    ]);
    const eyes = rows(root)
      .slice(0, 7)
      .map((row) => eyeOf(root, row).getAttribute("aria-label"));
    expect(eyes).toEqual([
      ...Array<string>(3).fill(
        "Not drawn. Click the row to bring it onto the canvas",
      ),
      "Drawn on the canvas",
      ...Array<string>(3).fill(
        "Not drawn. Click the row to bring it onto the canvas",
      ),
    ]);
    const records = input.ok
      ? (input.model.graph.entities.find((e) => e.id === "u_0")?.records ?? [])
      : [];
    expect(records).toHaveLength(4);
    for (const id of records)
      expect(eyeOf(root, find(root, id)).getAttribute("class")).toBe("oc on");
  });
});

describe("S3 the state of an edge row and the long cell", () => {
  it("reads drawn, then hidden after the hide of an end", async () => {
    const { root } = await opened();
    const owned = "t_FCT_REVENUE · ownedBy · u_0";
    expect(eyeOf(root, find(root, owned)).getAttribute("aria-label")).toBe(
      "Drawn on the canvas",
    );
    run(() => canvas().hide(["e:u_0"]));
    expect(eyeOf(root, rowById(root, owned)).getAttribute("class")).toBe(
      "oc hid",
    );
    const contains = find(root, "ds_snow · contains · db_ANALYTICS");
    expect(eyeOf(root, contains).getAttribute("class")).toBe("oc");
    const id = cell(root, contains, "ID");
    expect(id.hasAttribute("title")).toBe(false);
    hover(id);
    expect(tipText(root)).toBe("ds_snow · contains · db_ANALYTICS");
  });

  it("reads not drawn when only one end is drawn (plant (b))", async () => {
    const { root } = await opened();
    const row = find(root, "sc_MARTS · contains · t_FCT_REVENUE");
    expect(eyeOf(root, row).getAttribute("class")).toBe("oc");
  });

  it("keeps a cell on one line (mockup styles.css line 446)", () => {
    const css = readFileSync(
      path.join(import.meta.dirname, "shell-workbench.css"),
      "utf8",
    );
    const body = /(^|\n)\.wb-table td \{([^}]*)\}/.exec(css)?.[2] ?? "";
    for (const rule of [
      "white-space: nowrap;",
      "overflow: hidden;",
      "text-overflow: ellipsis;",
    ])
      expect(body).toContain(rule);
  });
});

describe("S4 the row type, Kind, search and Family filters", () => {
  it("narrows the rows at each step and the count follows", async () => {
    const { root, input } = await opened();
    if (!input.ok) throw new Error("fatal");
    const { graph, vocab } = input.model;
    const owner = new Map(
      graph.entities.flatMap((e) => e.records.map((r) => [r, e.id] as const)),
    );
    const typeOf = (record: string) =>
      vocab.entities.get(owner.get(record) ?? "")?.type;
    const users = graph.records.filter((r) => typeOf(r.id) === "user");
    const tail = " · 7 of 483 nodes on canvas";
    press(seg(root, "Nodes"));
    expect(count(root)).toBe(`525 of 1,262 rows${tail}`);
    expect(
      rows(root).every((row) => text(cell(root, row, "Type")) === "node"),
    ).toBe(true);
    press(button(root, "Kind"));
    const user = [...root.querySelectorAll(".check-item .check")].find((el) =>
      text(el).startsWith("User"),
    ) as HTMLElement;
    press(user);
    expect(count(root)).toBe(`${users.length} of 1,262 rows${tail}`);
    type(root, "aiko");
    const aiko = users.filter((r) =>
      [r.id, r.label].some((s) => s.toLowerCase().includes("aiko")),
    );
    expect(aiko.length).toBeGreaterThan(0);
    expect(count(root)).toBe(`${aiko.length} of 1,262 rows${tail}`);
    press(button(root, "Clear"));
    type(root, "");
    expect(count(root)).toBe(`525 of 1,262 rows${tail}`);
    press(seg(root, "Edges"));
    press(button(root, "Family"));
    const access = [...root.querySelectorAll(".check-item .check")].find((el) =>
      text(el).startsWith("Ownership & Access"),
    ) as HTMLElement;
    press(access);
    const family = graph.triples.filter(
      (tr) =>
        vocab.predicates.get(tr.predicate)?.family === "Ownership & Access",
    );
    expect(count(root)).toBe(`${family.length} of 1,262 rows${tail}`);
    expect(
      rows(root).every(
        (row) => text(cell(root, row, "Family")) === "Ownership & Access",
      ),
    ).toBe(true);
  });
});

describe("S5 a row press focuses the record", () => {
  it("calls focus once with the record id", async () => {
    const { root } = await opened();
    const focus = vi.spyOn(canvas(), "focus");
    press(cell(root, rows(root)[4], "Name"));
    expect(focus.mock.calls).toEqual([["c_FCT_REVENUE.REVENUE_ID"]]);
  });
});

describe("S6 the Hidden scope and a press on a hidden row", () => {
  it("restores the Hidden entry once for each press", async () => {
    const { root } = await opened();
    run(() => canvas().hide(["e:u_0"]));
    const hiddenSeg = seg(root, "Hidden");
    expect(text(hiddenSeg.querySelector(".seg-n"))).toBe("1");
    press(hiddenSeg);
    expect(count(root)).toMatch(/ · 1 hidden$/);
    const u0 = rows(root).filter(
      (row) => text(cell(root, row, "Type")) === "node",
    );
    expect(u0).toHaveLength(4);
    for (const row of u0)
      expect(eyeOf(root, row).getAttribute("class")).toBe("oc hid");
    const restore = vi.spyOn(canvas(), "restore");
    press(cell(root, u0[0], "Name"));
    expect(restore.mock.calls).toEqual([[["e:u_0"]]]);
    run(() => canvas().hide(["e:u_0"]));
    press(seg(root, "All rows"));
    restore.mockClear();
    press(cell(root, find(root, "t_FCT_REVENUE · ownedBy · u_0"), "Name"));
    expect(restore.mock.calls).toEqual([[["e:u_0"]]]);
  });
});

async function grouped() {
  const frame = await opened();
  run(() => canvas().select("e:t_FCT_REVENUE"));
  run(() => canvas().groupAroundRoot(true));
  return frame;
}

describe("S7 a faded row", () => {
  it("has the drawn eye with the tip faded and stays under On canvas", async () => {
    const { root } = await grouped();
    const eye = eyeOf(root, find(root, "ug_exec"));
    expect(eye.getAttribute("class")).toBe("oc on");
    expect(eye.getAttribute("aria-label")).toBe("Faded by Group around root");
    hover(eye);
    expect(text(eye.parentElement?.querySelector(".tip"))).toBe("faded");
    press(seg(root, "On canvas"));
    expect(rowById(root, "ug_exec")).toBeDefined();
  });
});

describe("S30 an edge row with one faded end", () => {
  it("reads drawn", async () => {
    const { root } = await grouped();
    const row = find(root, "u_12 · memberOf · ug_exec");
    expect(eyeOf(root, row).getAttribute("aria-label")).toBe(
      "Drawn on the canvas",
    );
  });
});

describe("S29 the count and the two empty texts", () => {
  it("has no 0 hidden part and no canvas part in scope mode all", async () => {
    const { root } = await opened();
    expect(count(root)).toBe("1,262 rows · 7 of 483 nodes on canvas");
    press(seg(root, "Hidden"));
    expect(text(root.querySelector(".wb-empty"))).toBe(
      "Nothing is hidden from the canvas.",
    );
    press(seg(root, "All rows"));
    type(root, "zzzz");
    expect(text(root.querySelector(".wb-empty"))).toBe(
      "No rows match these filters.",
    );
    run(() => canvas().setBudget("all"));
    type(root, "");
    expect(state.canvasState.value?.scope.mode).toBe("all");
    expect(count(root)).toBe("1,262 rows");
    expect(root.querySelector(".wb-empty")).toBeNull();
  });
});
