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
const { memoryStorage, mountApp } = await import("./testFrame");
const { appInput } = await import("./fixtureModel");

const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 60; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const click = (el: Element) =>
  run(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const button = (root: Element, name: string) => {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => text(b) === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};
const heads = (root: Element) =>
  [...root.querySelectorAll(".wb-table thead th")].map((th) =>
    text(th).replace(/ [▲▼]$/, ""),
  );
const afterAttributes = (root: Element) =>
  heads(root).slice(heads(root).indexOf("Attributes") + 1);
const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".wb-table tbody tr.row"),
];
const cell = (root: Element, row: Element, column: string) =>
  text(row.children[heads(root).indexOf(column)]);
const rowById = (root: Element, id: string) =>
  rows(root).find((row) => text(row.querySelector("code")) === id) as Element;
const menu = (root: Element) =>
  button(root, "Columns").nextElementSibling as HTMLElement;
const items = (root: Element) =>
  [...menu(root).querySelectorAll("[role=menuitemcheckbox]")].map((item) => [
    text(item),
    item.getAttribute("aria-checked"),
  ]);
const item = (root: Element, name: string) =>
  [...menu(root).querySelectorAll("[role=menuitemcheckbox]")].find(
    (el) => text(el) === name,
  ) as Element;

function type(input: HTMLInputElement, value: string, wait = 0): void {
  void act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  void act(() => {
    vi.advanceTimersByTime(wait);
  });
}

async function opened(raw: unknown, storage?: Storage) {
  const frame = await mountApp(appInput(raw), storage ? { storage } : {});
  click(button(frame.root, "Dataset"));
  return frame;
}

const PERMIT = { subject: "u", predicate: "permissionedTo", object: "t" };
const S24 = {
  nodes: [
    { id: "u", type: "user_group", label: "U" },
    { id: "t", type: "table", label: "T" },
  ],
  edges: [
    { ...PERMIT, attrs: { permission: "read" } },
    { ...PERMIT, attrs: { permission: "write" }, valid_from: "2026-01-01" },
    { ...PERMIT, attrs: { permission: "admin" }, isActive: false },
  ],
};
const EDGE = "u · permissionedTo · t";

describe("S24 the edge-row ID and the Attributes column", () => {
  it("numbers a repeat triple and lists its attributes", async () => {
    const { root } = await opened(S24);
    const edges = rows(root).slice(2);
    expect(edges.map((row) => cell(root, row, "ID"))).toEqual([
      EDGE,
      `${EDGE} · 2`,
      `${EDGE} · 3`,
    ]);
    expect(edges.map((row) => cell(root, row, "Attributes"))).toEqual([
      "permission: read",
      "permission: write, valid_from: 2026-01-01",
      "permission: admin, isActive: No",
    ]);
    expect(cell(root, rowById(root, "u"), "Attributes")).toBe("");
    const search = root.querySelector(".wb-search") as HTMLInputElement;
    type(search, "· 3", 200);
    expect(rows(root).map((row) => cell(root, row, "ID"))).toEqual([
      `${EDGE} · 3`,
    ]);
    type(search, "", 200);
    const id = () =>
      [...root.querySelectorAll(".wb-table thead th button")].find((b) =>
        text(b).startsWith("ID"),
      ) as Element;
    click(id());
    click(id());
    expect(rows(root).map((row) => cell(root, row, "ID"))).toEqual([
      `${EDGE} · 3`,
      `${EDGE} · 2`,
      EDGE,
      "u",
      "t",
    ]);
  });
});

const S25: unknown = {
  nodes: [
    { id: "n1", type: "table", attrs: { a: 1, b: 2, constructor: "c" } },
    { id: "n2", type: "table", attrs: { b: 3, c: 4, toString: "t" } },
    {
      id: "n3",
      type: "table",
      attrs: {
        b: 5,
        constructor: "c3",
        _x: 1,
        description: "d",
        service_name: "s",
      },
    },
  ],
  edges: [],
};

describe("S25 the attribute columns in coverage order", () => {
  it("counts own keys only, most first, then by first appearance", async () => {
    const { root } = await opened(S25);
    expect(afterAttributes(root)).toEqual([
      "b",
      "constructor",
      "a",
      "c",
      "toString",
    ]);
    const n1 = rowById(root, "n1");
    expect(
      ["b", "a", "constructor", "c", "toString"].map((key) =>
        cell(root, n1, key),
      ),
    ).toEqual(["2", "1", "c", "", ""]);
    expect(cell(root, rowById(root, "n3"), "System")).toBe("s");
    expect(cell(root, rowById(root, "n3"), "Description")).toBe("d");
    expect(text(root.querySelector(".wb-table"))).not.toContain("function");
  });
});

describe("S26 the Columns menu hides a column for the session", () => {
  it("toggles at once, stays open and is never stored", async () => {
    const storage = memoryStorage();
    const frame = await opened(S25, storage);
    const { root } = frame;
    click(button(root, "Columns"));
    expect(items(root).map(([name]) => name)).toEqual([
      ...["Canvas", "ID", "Type", "Kind", "Name", "System", "Description"],
      ...["Predicate", "Subject", "Object", "Family", "Attributes"],
      ...["b", "constructor", "a", "c", "toString"],
    ]);
    for (const name of ["System", "b", "constructor"]) {
      click(item(root, name));
      expect(heads(root)).not.toContain(name);
      expect(menu(root).hidden).toBe(false);
    }
    expect(afterAttributes(root)).toEqual(["a", "c", "toString"]);
    click(rowById(root, "n2").children[3]);
    expect(afterAttributes(root)).toEqual(["a", "c", "toString"]);
    click(button(root, "Columns"));
    click(button(root, "Columns"));
    expect(item(root, "constructor").getAttribute("aria-checked")).toBe(
      "false",
    );
    const handle = root.querySelector(".wb-handle") as HTMLElement;
    void act(
      () =>
        void handle.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
        ),
    );
    await frame.update({ input: appInput(S25) });
    expect(heads(root)).toContain("System");
    expect(afterAttributes(root)).toEqual([
      "b",
      "constructor",
      "a",
      "c",
      "toString",
    ]);
    expect(
      [...Array(storage.length).keys()].map((i) => storage.key(i)),
    ).toEqual(["qt.splitRatio"]);
  });
});

// why: S27 — key kNN is in 26 - NN of the 25 records
const S27 = {
  nodes: Array.from({ length: 25 }, (_, i) => ({
    id: `n${i + 1}`,
    type: "table",
    attrs: Object.fromEntries(
      Array.from({ length: 25 - i }, (_, j) => [
        `k${String(j + 1).padStart(2, "0")}`,
        j,
      ]),
    ),
  })),
  edges: [],
};
const K = (n: number) => `k${String(n).padStart(2, "0")}`;

describe("S27 the first 20 attribute columns", () => {
  it("shows k01 to k20 and the menu turns k21 on", async () => {
    const { root } = await opened(S27);
    expect(afterAttributes(root)).toEqual(
      Array.from({ length: 20 }, (_, i) => K(i + 1)),
    );
    click(button(root, "Columns"));
    expect(items(root).slice(12)).toEqual(
      Array.from({ length: 25 }, (_, i) => [K(i + 1), String(i < 20)]),
    );
    click(item(root, "k21"));
    expect(afterAttributes(root)).toEqual(
      Array.from({ length: 21 }, (_, i) => K(i + 1)),
    );
  });
});

describe("S32 the Columns menu with 20,000 keys", () => {
  it("lists 200 keys and a more line, and the search finds the rest", async () => {
    const attrs = Object.fromEntries(
      Array.from({ length: 20_000 }, (_, i) => [`k${i + 1}`, 1]),
    );
    const raw = { nodes: [{ id: "n", type: "table", attrs }], edges: [] };
    expect(JSON.stringify(raw).length).toBeLessThan(262_144);
    const { root } = await opened(raw);
    expect(afterAttributes(root)).toEqual(
      Array.from({ length: 20 }, (_, i) => `k${i + 1}`),
    );
    click(button(root, "Columns"));
    const names = items(root).map(([name]) => name);
    expect(names).toHaveLength(12 + 200);
    expect(names.slice(12)).toEqual(
      Array.from({ length: 200 }, (_, i) => `k${i + 1}`),
    );
    const more = () => text(menu(root).querySelector(".pick-empty"));
    expect(more()).toBe("19,800 more keys — type to filter");
    type(menu(root).querySelector("input") as HTMLInputElement, "k1999");
    expect(
      items(root)
        .slice(12)
        .map(([name]) => name),
    ).toEqual(["k1999", ...Array.from({ length: 10 }, (_, i) => `k1999${i}`)]);
    expect(menu(root).querySelector(".pick-empty")).toBeNull();
  });
});
