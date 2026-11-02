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
const scrollOf = (root: Element) =>
  root.querySelector(".wb-scroll") as HTMLElement;
const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".wb-table tbody tr.row"),
];
const heads = (root: Element) =>
  [...root.querySelectorAll(".wb-table thead th")].map((th) => text(th));
const cell = (root: Element, row: Element, column: string) =>
  row.children[heads(root).indexOf(column)] as HTMLElement;
const idOf = (root: Element, row: Element) => text(cell(root, row, "ID"));
const rowById = (root: Element, id: string) =>
  rows(root).find((row) => idOf(root, row) === id) as HTMLElement;
const press = (el: Element) =>
  run(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const hover = (el: Element) =>
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));

function key(target: EventTarget, name: string, mods: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...mods,
  });
  void act(() => void target.dispatchEvent(event));
  return event;
}

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

describe("S8 a canvas selection marks and scrolls to its row", () => {
  it("scrolls once for the canvas, not for the table press", async () => {
    const frame = await opened();
    const { root } = frame;
    const scroll = scrollOf(root);
    frame.sizeOf(scroll, { width: 800, height: 600 });
    void act(() => void scroll.dispatchEvent(new Event("scroll")));
    expect(scroll.scrollTop).toBe(0);
    run(() => canvas().select("e:ug_exec"));
    expect(scroll.scrollTop).toBe(16_324);
    const row = rowById(root, "ug_exec");
    expect(row.classList.contains("is-focus")).toBe(true);
    press(cell(root, row, "Name"));
    expect(scroll.scrollTop).toBe(16_324);
    expect(state.selection.value).toEqual({ node: "e:ug_exec" });
  });

  it("does not scroll for a press on a row at the bottom edge (plant x3)", async () => {
    const frame = await opened();
    const { root, input } = frame;
    if (!input.ok) throw new Error("fatal");
    const scroll = scrollOf(root);
    frame.sizeOf(scroll, { width: 800, height: 600 });
    run(() => canvas().select("e:ug_exec"));
    expect(scroll.scrollTop).toBe(16_324);
    const id = input.model.graph.records[469].id;
    press(cell(root, rowById(root, id), "Name"));
    expect(state.selection.value).not.toEqual({ node: "e:ug_exec" });
    expect(scroll.scrollTop).toBe(16_324);
  });

  // why: QA Done gate item 1 — a press that changes no selection must not hold back the next
  // canvas selection
  it("scrolls after a press on the row of the selected entity", async () => {
    const frame = await opened();
    const { root } = frame;
    const scroll = scrollOf(root);
    frame.sizeOf(scroll, { width: 800, height: 600 });
    expect(state.selection.value).toEqual({ node: "e:t_FCT_REVENUE" });
    press(cell(root, rowById(root, "t_FCT_REVENUE"), "Name"));
    expect(state.selection.value).toEqual({ node: "e:t_FCT_REVENUE" });
    run(() => canvas().select("e:ug_exec"));
    expect(scroll.scrollTop).toBe(16_324);
  });

  it("scrolls after a press on a hidden row", async () => {
    const frame = await opened();
    const { root } = frame;
    const scroll = scrollOf(root);
    frame.sizeOf(scroll, { width: 800, height: 600 });
    run(() => canvas().hide(["e:u_0"]));
    const before = state.selection.value;
    press(cell(root, find(root, "t_FCT_REVENUE · ownedBy · u_0"), "Name"));
    expect(state.selection.value).toBe(before);
    type(root, "");
    run(() => canvas().select("e:ug_exec"));
    expect(scroll.scrollTop).toBe(16_324);
  });
});

describe("Ctrl+. with a fatal input (QA Done gate item 5)", () => {
  it("keeps the canvas-only layout when there is no table", async () => {
    const input = fixtureModel("s-invalid");
    expect(input.ok).toBe(false);
    const frame = await mountApp(input);
    const { root } = frame;
    key(document.body, ".", { ctrlKey: true });
    const split = root.querySelector(".split");
    expect(split?.getAttribute("data-layout")).toBe("canvas-only");
    expect(
      (root.querySelector("main.canvas") as HTMLElement).style.height,
    ).toBe("600px");
    expect(root.querySelector(".workbench")).toBeNull();
    await frame.update({ input: fixtureModel("s-access") });
    expect(split?.getAttribute("data-layout")).toBe("canvas-only");
    expect(root.querySelector(".workbench")?.hasAttribute("inert")).toBe(true);
  });

  it("gives the canvas the whole split after an open table gets a fatal input", async () => {
    const frame = await opened();
    await frame.update({ input: fixtureModel("s-invalid") });
    const { root } = frame;
    expect(root.querySelector(".split")?.getAttribute("data-layout")).toBe(
      "canvas-only",
    );
    expect(
      (root.querySelector("main.canvas") as HTMLElement).style.height,
    ).toBe("600px");
  });
});

describe("S16 the three layouts and the keys", () => {
  it("expands, restores, closes and toggles", async () => {
    const frame = await opened();
    const { root, calls } = frame;
    const layout = () =>
      root.querySelector(".split")?.getAttribute("data-layout");
    press(button(root, "Expand table"));
    expect(layout()).toBe("table-full");
    expect(calls).toEqual([{ name: "requestDisplayMode", arg: "fullscreen" }]);
    press(button(root, "Restore split view"));
    expect(layout()).toBe("split");
    press(button(root, "Close table"));
    expect(layout()).toBe("canvas-only");
    expect(section(root).hasAttribute("inert")).toBe(true);
    expect(section(root).getAttribute("aria-label")).toBe("Dataset table");
    key(document.body, ".", { ctrlKey: true });
    expect(layout()).toBe("split");
    expect(section(root).hasAttribute("inert")).toBe(false);
    key(document.body, ".", { ctrlKey: true });
    expect(layout()).toBe("canvas-only");
    key(document.body, ".", { metaKey: true });
    expect(layout()).toBe("split");
    type(root, "abc");
    const search = root.querySelector(".wb-search") as HTMLInputElement;
    const typed = key(search, ".", { ctrlKey: true });
    expect(typed.defaultPrevented).toBe(false);
    expect(search.value).toBe("abc");
    expect(layout()).toBe("split");
    expect(calls).toHaveLength(1);
  });
});

describe("S17 the Dataset tip names the key of the platform", () => {
  it.each([
    ["MacIntel", "View dataset (⌘.)"],
    ["Win32", "View dataset (Ctrl+.)"],
  ])("%s gives %s", async (platform, tip) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { root } = await mountApp(fixtureModel("s-access"));
    hover(button(root, "Dataset"));
    expect(text(root.querySelector(".tip"))).toBe(tip);
  });
});
