// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { describe, expect, it, vi } from "vitest";

// why: STORY-003-04 fake clock, LEARNINGS 36, 64 — the clock fakes `setTimeout` and `clearTimeout`
// before `d3-timer` loads
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
const split = await import("./split");

// why: LEARNINGS 24, 75 — 21 saves take about 3 s alone; the limit is above 2 × that under load
const TIME_OUT = 40_000;
const catalog = (lang: "en" | "ja" = "en") =>
  f.opened(mountApp, appInput(datasets.catalog.graph), lang);
const history = () => state.editHistory.value.history;
const bar = (root: Element) => root.querySelector<HTMLElement>(".change-bar");
const press = (root: Element, name: string) =>
  f.click(f.button(bar(root) as HTMLElement, name));
const off = (root: Element, name: string) =>
  (f.button(bar(root) as HTMLElement, name) as HTMLButtonElement).disabled;
const news = (root: Element) =>
  f.text(root.querySelector(".workbench > .sr-only[aria-live=polite]"));
const nameOf = (id: string) =>
  state.editedGraph.value?.records.find((r) => r.id === id)?.label;

function rename(root: Element, value: string, column = "Name") {
  f.dblclick(f.cellOf(root, "t_SF_ACCOUNT", column));
  f.type(f.input(root), value);
  f.key(f.input(root), "Enter");
}

function ctrlZ(el: Element) {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  f.run(() => el.dispatchEvent(event));
}

describe("S1 S2 the bar shows only with unsaved edits", () => {
  it("is hidden with no edit, then shows after a save with its four buttons", async () => {
    const { root } = await catalog();
    expect(bar(root)).toBeNull();
    rename(root, "SF_ACCOUNT_EU");
    expect(f.text(bar(root)?.querySelector(".change-label"))).toBe("Change");
    const names = [...(bar(root)?.querySelectorAll("button") ?? [])].map((b) =>
      f.text(b),
    );
    expect(names).toEqual(["Undo", "Redo", "Cancel change", "Save changes"]);
    expect([off(root, "Undo"), off(root, "Redo")]).toEqual([false, true]);
    expect(root.querySelector(".undo-toast")).toBeNull();
    const wb = root.querySelector(".wb-bar") as Element;
    const toolbar = [...wb.querySelectorAll("button")].map((b) => f.text(b));
    expect(toolbar).not.toContain("Undo");
    expect(toolbar).not.toContain("Redo");
    expect(news(root)).toBe("Cell changed");
  });
});

describe("S3 Undo and Redo on the bar", () => {
  it("takes back and does again one edit; each button is off with no step", async () => {
    const { root } = await catalog();
    rename(root, "A1");
    rename(root, "A2");
    press(root, "Undo");
    expect(nameOf("t_SF_ACCOUNT")).toBe("A1");
    expect(news(root)).toBe("Change undone");
    press(root, "Undo");
    expect(nameOf("t_SF_ACCOUNT")).toBe("SF_ACCOUNT");
    expect([off(root, "Undo"), off(root, "Redo")]).toEqual([true, false]);
    press(root, "Redo");
    press(root, "Redo");
    expect(nameOf("t_SF_ACCOUNT")).toBe("A2");
    expect([off(root, "Undo"), off(root, "Redo")]).toEqual([false, true]);
  });
});

describe("S4 Cancel change (jsdom twin)", () => {
  it("takes back all edits and the drawn new end in one step; other nodes stay", async () => {
    const { root } = await catalog();
    const positions = () => new Map(state.canvasState.value?.positions);
    const drawn = () => positions().has("e:t_STRIPE_CUSTOMERS");
    const before = positions();
    rename(root, "C1");
    const row = "t_FCT_PIPELINE · derivedFrom · t_DIM_CUSTOMER";
    f.search(root, row);
    f.dblclick(f.cellOf(root, row, "Object"));
    f.type(f.input(root), "STRIPE_CUSTOMERS");
    f.key(f.input(root), "ArrowDown");
    f.key(f.input(root), "Enter");
    f.thisRow(root);
    expect(drawn()).toBe(true);
    press(root, "Cancel change");
    expect(drawn()).toBe(false);
    for (const [id, point] of before)
      expect(positions().get(id), id).toEqual(point);
    expect(nameOf("t_SF_ACCOUNT")).toBe("SF_ACCOUNT");
    expect(history().active()).toHaveLength(0);
    expect(bar(root)).toBeNull();
    expect(news(root)).toBe("Changes cancelled");
  });

  it(
    "also takes back the edits that the 20-step history dropped",
    async () => {
      const { root } = await catalog();
      for (let i = 1; i <= 21; i++) rename(root, `N${i}`);
      expect(history().done).toHaveLength(20);
      press(root, "Cancel change");
      expect(nameOf("t_SF_ACCOUNT")).toBe("SF_ACCOUNT");
      expect(bar(root)).toBeNull();
    },
    TIME_OUT,
  );
});

describe("S5 S6 S7 Save changes", () => {
  it("S6 keeps the values, empties the history and hides the bar; Ctrl+Z does nothing", async () => {
    const { root } = await catalog();
    rename(root, "S1");
    rename(root, "S2");
    press(root, "Save changes");
    expect(nameOf("t_SF_ACCOUNT")).toBe("S2");
    expect(f.text(f.cellOf(root, "t_SF_ACCOUNT", "Name"))).toBe("S2");
    expect(history().active()).toHaveLength(0);
    expect(history().undone).toHaveLength(0);
    expect(bar(root)).toBeNull();
    expect(news(root)).toBe("Changes saved");
    ctrlZ(f.cellOf(root, "t_SF_ACCOUNT", "Name"));
    expect(nameOf("t_SF_ACCOUNT")).toBe("S2");
  });

  it("S7 a new edit after a save shows the bar; one Undo takes back only it", async () => {
    const { root } = await catalog();
    rename(root, "S1");
    press(root, "Save changes");
    rename(root, "S3");
    expect([off(root, "Undo"), off(root, "Redo")]).toEqual([false, true]);
    press(root, "Undo");
    expect(nameOf("t_SF_ACCOUNT")).toBe("S1");
    expect(off(root, "Undo")).toBe(true);
  });

  it("S5 Cancel after a save takes back only the edits after the save", async () => {
    const { root } = await catalog();
    rename(root, "S1");
    press(root, "Save changes");
    rename(root, "S4");
    rename(root, "S5");
    press(root, "Cancel change");
    expect(nameOf("t_SF_ACCOUNT")).toBe("S1");
    expect(f.text(f.cellOf(root, "t_SF_ACCOUNT", "Name"))).toBe("S1");
    expect(bar(root)).toBeNull();
  });
});

describe("S9 a view reset", () => {
  it("still shows the View reset toast and keeps the edits", async () => {
    const { root } = await catalog();
    rename(root, "V1");
    const button = root.querySelector(".controls .ctl-btn") as HTMLElement;
    f.click(button);
    const menu = button.nextElementSibling as HTMLElement;
    f.click(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')[2]);
    expect(f.text(root.querySelector(".undo-toast .ut-txt"))).toBe(
      "View reset",
    );
    expect(history().active()).toHaveLength(1);
    expect(nameOf("t_SF_ACCOUNT")).toBe("V1");
    expect(bar(root)).not.toBeNull();
  });
});

describe("S10 the ja texts", () => {
  it("gives every bar text and the result in ja", async () => {
    const { root } = await catalog("ja");
    rename(root, "J1", "名前");
    expect(f.text(bar(root)?.querySelector(".change-label"))).toBe("変更");
    const names = [...(bar(root)?.querySelectorAll("button") ?? [])].map((b) =>
      f.text(b),
    );
    expect(names).toEqual([
      "元に戻す",
      "やり直す",
      "変更を取り消す",
      "変更を保存",
    ]);
    expect(news(root)).toBe("セルを変更しました");
    press(root, "変更を保存");
    expect(news(root)).toBe("変更を保存しました");
  });
});

describe("S1 S2 the expanded view", () => {
  it("has no bar with no edit and shows it after a save", async () => {
    const { root } = await catalog();
    f.click(f.button(root, "Expand table"));
    expect(split.layout.value).toBe("table-full");
    expect(bar(root)).toBeNull();
    rename(root, "X1");
    expect(bar(root)).not.toBeNull();
    press(root, "Cancel change");
    expect(bar(root)).toBeNull();
  });
});
