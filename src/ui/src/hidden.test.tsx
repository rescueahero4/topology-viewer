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
const { typeMark } = await import("@qdic-topology/renderer");
const { groupParts } = await import("@qdic-topology/engine");
const { rendererText } = await import("./rendererText");
const { rangeSelect } = await import("./rangeSelect");
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

const panel = (root: Element) => root.querySelector(".hidden-panel");
const chip = (root: Element) =>
  root.querySelector<HTMLElement>(".hidden-panel .hid-toggle");
const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".hid-row"),
];
const named = (root: Element, el: Element) =>
  text(
    root.ownerDocument.getElementById(el.getAttribute("aria-labelledby") ?? ""),
  );
const ticked = (root: Element) =>
  rows(root).map((row) => row.getAttribute("aria-selected"));
const bar = (root: Element) => root.querySelector(".hid-bar") as HTMLElement;
const showButton = (root: Element) =>
  bar(root).querySelector<HTMLElement>(".btn") as HTMLElement;
const press = (el: Element, shiftKey = false) =>
  void act(
    () =>
      void el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey }),
      ),
  );
const key = (el: Element, name: string, shiftKey = false) =>
  void act(
    () =>
      void el.dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true, shiftKey }),
      ),
  );

const HIDE = "Hide from canvas";

function hide(root: Element, id: string): void {
  run(() => canvas().select(id));
  const button = [
    ...root.querySelectorAll<HTMLElement>(".inspector .insp-bar .icon-btn"),
  ].find((el) => el.getAttribute("aria-label") === HIDE);
  if (button === undefined) throw new Error(`no Hide button for ${id}`);
  run(() => button.click());
}

async function threeHidden() {
  const input = fixtureModel("s-access");
  if (!input.ok) throw new Error("fatal");
  const frame = await mountApp(input);
  for (const id of ["e:u_0", "e:u_7", "e:u_12"]) hide(frame.root, id);
  void act(() => chip(frame.root)?.click());
  const label = (id: string) => input.model.vocab.entities.get(id)?.label;
  return { ...frame, input, label };
}

describe("S1 the Hidden chip", () => {
  it("shows only after a hide, with the count", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    expect(panel(root)).toBeNull();
    hide(root, "e:u_0");
    expect(chip(root)?.childNodes[1]?.textContent).toBe("Hidden");
    expect(text(chip(root)?.querySelector(".hid-count"))).toBe("1");
    expect(chip(root)?.querySelector(".hid-count.bump")).not.toBeNull();
    expect(panel(root)?.getAttribute("data-state")).toBe("collapsed");
    expect(root.querySelector(".hid-body")).toBeNull();
  });
});

describe("S2 the rows of the card", () => {
  it("lists three hides newest first with the user mark and type", async () => {
    const { root, input, label } = await threeHidden();
    const { vocab } = input.ok ? input.model : ({} as never);
    const mark = typeMark(vocab.types.get("user")?.visual ?? null, 18, null);
    expect(panel(root)?.getAttribute("data-state")).toBe("expanded");
    expect(rows(root).map((row) => text(row.querySelector(".name")))).toEqual([
      label("u_12"),
      label("u_7"),
      label("u_0"),
    ]);
    for (const row of rows(root)) {
      expect(row.querySelector(".glyph svg")?.outerHTML).toBe(mark.outerHTML);
      expect(text(row.querySelector(".sub")).split(" · ")[0]).toBe("User");
    }
  });
});

describe("S3 a Shift range and its restore", () => {
  it("ticks the range, restores it once and moves no drawn node", async () => {
    const { root } = await threeHidden();
    press(rows(root)[0]);
    press(rows(root)[2], true);
    expect(ticked(root)).toEqual(["true", "true", "true"]);
    expect(text(bar(root).querySelector(".check"))).toBe("3 of 3 selected");
    const drawn = new Set(state.frontier.value?.nodes.map((n) => n.id));
    const at = (id: string) =>
      new Map(state.canvasState.value?.positions).get(id);
    const before = [...drawn].map((id) => [id, at(id)]);
    const restore = vi.spyOn(canvas(), "restore");
    run(() => showButton(root).click());
    expect(restore.mock.calls).toEqual([[["e:u_12", "e:u_7", "e:u_0"]]]);
    expect(panel(root)).toBeNull();
    expect(before.length).toBeGreaterThan(0);
    expect([...drawn].map((id) => [id, at(id)])).toEqual(before);
    const now = state.frontier.value?.nodes.map((n) => n.id) ?? [];
    expect(now.filter((id) => !drawn.has(id))).toEqual(
      expect.arrayContaining(["e:u_12", "e:u_7", "e:u_0"]),
    );
  });

  it("gives the new state of the pressed row to the range (rangeSelect)", () => {
    const keys = ["a", "b", "c", "d"];
    const one = rangeSelect(
      keys,
      { ticked: new Set(), anchor: null },
      "b",
      true,
    );
    expect([...one.ticked]).toEqual(["b"]);
    const range = rangeSelect(keys, one, "d", true);
    expect([...range.ticked].sort()).toEqual(["b", "c", "d"]);
    const off = rangeSelect(keys, range, "c", true);
    expect([...off.ticked]).toEqual(["b"]);
  });
});

describe("S4 the keyboard", () => {
  it("moves the active row, ticks it and restores it with Enter", async () => {
    const { root } = await threeHidden();
    expect(rows(root).map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    void act(() => rows(root)[0].focus());
    key(rows(root)[0], "ArrowDown");
    expect(rows(root).map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
    expect(root.ownerDocument.activeElement).toBe(rows(root)[1]);
    key(rows(root)[1], " ");
    expect(ticked(root)).toEqual(["false", "true", "false"]);
    key(rows(root)[1], "ArrowDown");
    key(rows(root)[2], " ", true);
    expect(ticked(root)).toEqual(["false", "true", "true"]);
    key(rows(root)[2], " ", true);
    expect(ticked(root)).toEqual(["false", "true", "false"]);
    const restore = vi.spyOn(canvas(), "restore");
    key(rows(root)[1], "Enter");
    expect(restore.mock.calls).toEqual([[["e:u_7"]]]);
  });
});

describe("S5 a strand", () => {
  it("names the neighbour that left with the node", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    hide(root, "e:u_12");
    void act(() => chip(root)?.click());
    expect(rows(root)).toHaveLength(1);
    expect(text(rows(root)[0].querySelector(".sub"))).toBe(
      "User · +1 neighbour",
    );
  });
});

describe("S6 select all and Show all", () => {
  it("restores all three, then brings the chip back collapsed", async () => {
    const { root } = await threeHidden();
    expect(text(showButton(root))).toBe("Show all on canvas");
    expect(text(bar(root).querySelector(".check"))).toBe("Select all");
    void act(() => bar(root).querySelector<HTMLElement>(".check")?.click());
    expect(ticked(root)).toEqual(["true", "true", "true"]);
    const all = bar(root).querySelector(".check");
    expect([all?.getAttribute("aria-checked"), text(all)]).toEqual([
      "true",
      "3 of 3 selected",
    ]);
    expect(text(showButton(root))).toBe("Show 3 on canvas");
    const restore = vi.spyOn(canvas(), "restore");
    run(() => showButton(root).click());
    expect(restore.mock.calls).toEqual([[["e:u_12", "e:u_7", "e:u_0"]]]);
    expect(panel(root)).toBeNull();
    hide(root, "e:u_0");
    expect(panel(root)?.getAttribute("data-state")).toBe("collapsed");
    expect(root.querySelector(".hid-body")).toBeNull();
    expect(text(chip(root)?.querySelector(".hid-count"))).toBe("1");
  });

  it("restores every row with nothing ticked, and shows the partial box", async () => {
    const { root } = await threeHidden();
    press(rows(root)[1]);
    const all = bar(root).querySelector(".check");
    expect([all?.getAttribute("aria-checked"), text(all)]).toEqual([
      "mixed",
      "1 of 3 selected",
    ]);
    press(rows(root)[1]);
    const restore = vi.spyOn(canvas(), "restore");
    run(() => showButton(root).click());
    expect(restore.mock.calls).toEqual([[["e:u_12", "e:u_7", "e:u_0"]]]);
  });
});

describe("S7 the row eye button", () => {
  it("restores its row only", async () => {
    const { root, label } = await threeHidden();
    const eye = rows(root)[1].querySelector(".icon-btn") as HTMLElement;
    expect(eye.tabIndex).toBe(-1);
    expect(named(root, eye)).toBe(`Show ${label("u_7")} on canvas`);
    const restore = vi.spyOn(canvas(), "restore");
    run(() => eye.click());
    expect(restore.mock.calls).toEqual([[["e:u_7"]]]);
    expect(rows(root)).toHaveLength(2);
    expect(ticked(root)).toEqual(["false", "false"]);
  });
});

describe("S8 a hidden group", () => {
  it("names the row by its type and member count", async () => {
    const input = fixtureModel("s-star");
    if (!input.ok) throw new Error("fatal");
    const { root } = await mountApp(input);
    const group = state.frontier.value?.nodes.find(
      (n) => "members" in n && n.type === "table",
    );
    if (group === undefined) throw new Error("no table group");
    hide(root, group.id);
    void act(() => chip(root)?.click());
    const [row] = rows(root);
    const key = state.canvasState.value?.hidden[0]?.key ?? "";
    expect(key.startsWith("g:")).toBe(true);
    expect(groupParts(key)?.type).toBe("table");
    const vocab = input.model.vocab;
    const mark = typeMark(vocab.types.get("table")?.visual ?? null, 18, null);
    expect(rows(root)).toHaveLength(1);
    expect(text(row.querySelector(".name"))).toBe(
      rendererText("en").groupLabel("Table", 300),
    );
    expect(row.querySelector(".glyph svg")?.outerHTML).toBe(mark.outerHTML);
    expect(text(row.querySelector(".sub"))).toBe("Table · 300 hidden together");
    expect(text(row)).not.toContain("g:");
  });
});
