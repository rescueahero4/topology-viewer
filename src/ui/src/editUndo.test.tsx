// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
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
const f = await import("./cellEditFrame");
const { mountApp } = await import("./testFrame");
const { appInput } = await import("./fixtureModel");
const { datasets } = await import("@qdic-topology/fixtures");
const state = await import("./state");

const history = () => state.editHistory.value.history;
// why: LEARNINGS 24, 75 — 41 saves and presses take about 6 s alone; the limit is above 2 × that
// time under full-suite load
const TIME_OUT = 40_000;
const catalog = () => f.opened(mountApp, appInput(datasets.catalog.graph));
const bar = (root: Element) => root.querySelector(".wb-bar") as HTMLElement;
const undo = (root: Element) => f.button(bar(root), "Undo");
const redo = (root: Element) => f.button(bar(root), "Redo");
const off = (el: HTMLElement) => (el as HTMLButtonElement).disabled;
const nameOf = (id: string) =>
  state.editedGraph.value?.records.find((r) => r.id === id)?.label;

function rename(root: Element, value: string) {
  f.dblclick(f.cellOf(root, "t_SF_ACCOUNT", "Name"));
  f.type(f.input(root), value);
  f.key(f.input(root), "Enter");
}

// why: S4 — the first save leaves the history and its value stays (SA addendum 0.32)
describe("S1 S4 twenty steps", () => {
  it(
    "keeps the last 20 of 21 saves; Undo goes off after 20 presses",
    async () => {
      const { root } = await catalog();
      expect([off(undo(root)), off(redo(root))]).toEqual([true, true]);
      for (let i = 1; i <= 21; i++) rename(root, `N${i}`);
      expect(history().done).toHaveLength(20);
      expect(nameOf("t_SF_ACCOUNT")).toBe("N21");
      let presses = 0;
      while (!off(undo(root)) && presses < 25) {
        f.click(undo(root));
        presses++;
      }
      expect(presses).toBe(20);
      expect(history().done).toHaveLength(0);
      expect(history().undone).toHaveLength(20);
      expect(nameOf("t_SF_ACCOUNT")).toBe("N1");
      expect([off(undo(root)), off(redo(root))]).toEqual([true, false]);
    },
    TIME_OUT,
  );
});

describe("S2 S5 Undo, Redo and a new save", () => {
  it("S2 gives the old name back and again; the buttons follow", async () => {
    const { root } = await catalog();
    rename(root, "SF_ACCOUNT_EU");
    expect([off(undo(root)), off(redo(root))]).toEqual([false, true]);
    f.click(undo(root));
    expect(nameOf("t_SF_ACCOUNT")).toBe("SF_ACCOUNT");
    expect(f.text(f.cellOf(root, "t_SF_ACCOUNT", "Name"))).toBe("SF_ACCOUNT");
    expect([off(undo(root)), off(redo(root))]).toEqual([true, false]);
    f.click(redo(root));
    expect(nameOf("t_SF_ACCOUNT")).toBe("SF_ACCOUNT_EU");
    expect([off(undo(root)), off(redo(root))]).toEqual([false, true]);
  });

  it("S5 a new save after an Undo turns Redo off", async () => {
    const { root } = await catalog();
    rename(root, "A1");
    rename(root, "A2");
    f.click(undo(root));
    expect(off(redo(root))).toBe(false);
    rename(root, "A3");
    expect(off(redo(root))).toBe(true);
    expect(history().done).toHaveLength(2);
  });
});

describe("S3 the canvas effect of a moved edge", () => {
  it("undraws the drawn new end on Undo and draws it again on Redo", async () => {
    const { root } = await catalog();
    const drawn = () =>
      new Map(state.canvasState.value?.positions).has("e:t_STRIPE_CUSTOMERS");
    const before = new Map(state.canvasState.value?.positions);
    expect(drawn()).toBe(false);
    f.search(root, "t_FCT_PIPELINE · derivedFrom · t_DIM_CUSTOMER");
    const row = "t_FCT_PIPELINE · derivedFrom · t_DIM_CUSTOMER";
    f.dblclick(f.cellOf(root, row, "Object"));
    f.type(f.input(root), "STRIPE_CUSTOMERS");
    f.key(f.input(root), "ArrowDown");
    f.key(f.input(root), "Enter");
    f.thisRow(root);
    expect(drawn()).toBe(true);
    f.click(undo(root));
    expect(drawn()).toBe(false);
    const back = new Map(state.canvasState.value?.positions);
    for (const [id, point] of before) expect(back.get(id), id).toEqual(point);
    f.click(redo(root));
    expect(drawn()).toBe(true);
    f.click(undo(root));
    expect(drawn()).toBe(false);
  });
});

describe("S6 the keys in the Workbench (jsdom twin)", () => {
  const press = (el: Element, shift: boolean) => {
    const event = new KeyboardEvent("keydown", {
      key: shift ? "Z" : "z",
      ctrlKey: true,
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    });
    f.run(() => el.dispatchEvent(event));
    return event;
  };

  it("undoes and redoes on a cell, stops the event, and leaves a cell in edit alone", async () => {
    const { root } = await catalog();
    rename(root, "K1");
    const seen: string[] = [];
    const doc = root.ownerDocument;
    const listen = (event: KeyboardEvent) => seen.push(event.key);
    doc.addEventListener("keydown", listen);
    const cell = f.cellOf(root, "t_SF_ACCOUNT", "Name");
    expect(press(cell, false).defaultPrevented).toBe(true);
    expect(nameOf("t_SF_ACCOUNT")).toBe("SF_ACCOUNT");
    press(cell, true);
    expect(nameOf("t_SF_ACCOUNT")).toBe("K1");
    expect(seen).toEqual([]);
    f.dblclick(f.cellOf(root, "t_SF_ACCOUNT", "Name"));
    press(f.input(root) as HTMLElement, false);
    expect(nameOf("t_SF_ACCOUNT")).toBe("K1");
    expect(history().done).toHaveLength(1);
    press(root.querySelector(".graph") as HTMLElement, false);
    expect(nameOf("t_SF_ACCOUNT")).toBe("K1");
    doc.removeEventListener("keydown", listen);
  });
});
