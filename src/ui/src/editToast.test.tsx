// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { describe, expect, it, vi } from "vitest";

// why: STORY-003-04 fake clock, LEARNINGS 36, 64 — the clock fakes `setTimeout` and `clearTimeout`
// before `d3-timer` loads, so the 10 s of the toast are fake time
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
const { act } = await import("preact/test-utils");
const f = await import("./cellEditFrame");
const { mountApp } = await import("./testFrame");
const { appInput } = await import("./fixtureModel");
const { datasets } = await import("@qdic-topology/fixtures");
const state = await import("./state");

const catalog = () => f.opened(mountApp, appInput(datasets.catalog.graph));
const toast = (root: Element) => root.querySelector(".undo-toast");
const toastText = (root: Element) =>
  f.text(toast(root)?.querySelector(".ut-txt"));
const toastButton = (root: Element) =>
  toast(root)?.querySelector<HTMLElement>("button") ?? null;
const nameOf = (id: string) =>
  state.editedGraph.value?.records.find((r) => r.id === id)?.label;
const SNOWFLAKE = (() => {
  const input = appInput(datasets.catalog.graph);
  if (!input.ok) throw new Error("fatal");
  return input.model.graph.records.filter(
    (r) => r.attrs.service_name === "snowflake",
  ).length;
})();

function save(root: Element, column: string, value: string) {
  f.dblclick(f.cellOf(root, "t_SF_ACCOUNT", column));
  f.type(f.input(root), value);
  f.key(f.input(root), "Enter");
}

describe("S7 the save toast", () => {
  it("says Cell changed, then c cells changed, and closes after 10 s", async () => {
    const { root } = await catalog();
    save(root, "Name", "SF_ACCOUNT_EU");
    expect(toastText(root)).toBe("Cell changed");
    expect(f.text(toastButton(root))).toBe("Undo");
    expect(toast(root)?.getAttribute("aria-live")).toBe("polite");
    save(root, "System", "snowflake_eu");
    f.click(f.choice(root)[1]);
    expect(root.querySelectorAll(".undo-toast")).toHaveLength(1);
    expect(toastText(root)).toBe(`${SNOWFLAKE} cells changed`);
    // why: the pick of `f.click` already ran 120 frames of 16 ms after the save (1,920 ms)
    void act(() => {
      vi.advanceTimersByTime(10_000 - 1_920 - 100);
    });
    expect(toast(root)).not.toBeNull();
    void act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(toast(root)).toBeNull();
  });
});

describe("S8 the toast Undo", () => {
  it("is the Undo of the button; the save toast closes for Change undone", async () => {
    const { root } = await catalog();
    save(root, "Name", "SF_ACCOUNT_EU");
    f.click(toastButton(root));
    expect(nameOf("t_SF_ACCOUNT")).toBe("SF_ACCOUNT");
    expect(state.editHistory.value.history.done).toHaveLength(0);
    expect(state.editHistory.value.history.undone).toHaveLength(1);
    expect(toastText(root)).toBe("Change undone");
    expect(toastButton(root)).toBeNull();
    const redo = f.button(root.querySelector(".wb-bar") as Element, "Redo");
    f.click(redo);
    expect(toastText(root)).toBe("Cell changed");
    expect(f.text(toastButton(root))).toBe("Undo");
  });
});

describe("S9 a view reset replaces the edit toast", () => {
  it("shows View reset; its Undo gives the view back and keeps the edit", async () => {
    const { root } = await catalog();
    save(root, "Name", "SF_ACCOUNT_EU");
    expect(toastText(root)).toBe("Cell changed");
    const button = root.querySelector(".controls .ctl-btn") as HTMLElement;
    f.click(button);
    const menu = button.nextElementSibling as HTMLElement;
    const before = state.canvasState.value?.budget;
    f.click(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')[2]);
    expect(state.canvasState.value?.budget).not.toEqual(before);
    expect(root.querySelectorAll(".undo-toast")).toHaveLength(1);
    expect(toastText(root)).toBe("View reset");
    void act(() => toastButton(root)?.click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    f.run(() => undefined);
    expect(state.canvasState.value?.budget).toEqual(before);
    expect(state.editHistory.value.history.active()).toHaveLength(1);
    expect(nameOf("t_SF_ACCOUNT")).toBe("SF_ACCOUNT_EU");
  });
});
