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
const escape = () => {
  const target = document.activeElement ?? document.body;
  void act(
    () =>
      void target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
  );
};
const selected = () => state.selection.value;

describe("S5 Escape closes the open layer first (NF-5, f-0019)", () => {
  it("closes a menu, then clears; closes a picker and a tooltip and clears nothing", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const { root } = frame;
    expect(selected()).toEqual({ node: "e:t_FCT_REVENUE" });
    const select = vi.spyOn(canvas(), "select");
    const types = button(root, "Types");
    void act(() => types.click());
    const menu = types.nextElementSibling as HTMLElement;
    expect(menu.hidden).toBe(false);
    expect(menu.contains(document.activeElement)).toBe(true);
    escape();
    expect(menu.hidden).toBe(true);
    expect(selected()).toEqual({ node: "e:t_FCT_REVENUE" });
    expect(select).not.toHaveBeenCalled();
    escape();
    expect(select.mock.calls).toEqual([[null]]);
    expect(selected()).toBeNull();

    await frame.update({ input: fixtureModel("s-many-preds") });
    expect(selected()).toBeNull();
    const node = root.querySelector(".qt-node") as Element;
    run(() => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const picked = selected();
    expect(picked).not.toBeNull();
    const again = vi.spyOn(canvas(), "select");
    const picker = root.querySelector(".pill-row .pick-btn") as HTMLElement;
    void act(() => picker.click());
    const list = picker.nextElementSibling as HTMLElement;
    expect(list.hidden).toBe(false);
    escape();
    expect(list.hidden).toBe(true);
    expect(again).not.toHaveBeenCalled();
    expect(selected()).toBe(picked);

    const info = root.querySelector(".inspector .insp-tabs .info");
    void act(() => (info as HTMLElement).focus());
    expect(root.querySelector(".tip")).not.toBeNull();
    escape();
    expect(root.querySelector(".tip")).toBeNull();
    expect(again).not.toHaveBeenCalled();
    expect(selected()).toBe(picked);
  });

  it("closes a tip that shows on hover while the focus is elsewhere", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const select = vi.spyOn(canvas(), "select");
    void act(() => {
      button(root, "Dataset").dispatchEvent(new MouseEvent("mouseenter"));
    });
    expect(root.querySelector(".tip")).not.toBeNull();
    escape();
    expect(root.querySelector(".tip")).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  // why: QA Done gate item 1 — a user key press runs the microtasks (the Preact render) between the
  // anchor listener and the document listener; the test sends the same event to each, with the
  // render between them
  it.each([
    ["the relationships info icon", ".inspector .insp-tabs .info"],
    ["the Dataset button", ".controls [aria-controls]"],
  ])(
    "hides the tip of %s with the focus on it and clears nothing",
    async (_, at) => {
      const { root } = await mountApp(fixtureModel("s-access"));
      const select = vi.spyOn(canvas(), "select");
      const anchor = root.querySelector(at) as HTMLElement;
      void act(() => anchor.focus());
      expect(root.querySelector(".tip")).not.toBeNull();
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        cancelable: true,
      });
      void act(() => void anchor.dispatchEvent(event));
      expect(root.querySelector(".tip")).toBeNull();
      void act(() => void document.dispatchEvent(event));
      expect(select).not.toHaveBeenCalled();
      expect(selected()).toEqual({ node: "e:t_FCT_REVENUE" });
      expect(document.activeElement).toBe(anchor);
      escape();
      expect(select.mock.calls).toEqual([[null]]);
    },
  );
});

describe("S6 Escape in the search box", () => {
  it("clears and closes the search and keeps the selection", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const select = vi.spyOn(canvas(), "select");
    const input = root.querySelector(".tools input") as HTMLInputElement;
    void act(() => input.focus());
    void act(() => {
      input.value = "rev";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    void act(() => void vi.advanceTimersByTime(120));
    expect(root.querySelector(".search-results")).not.toBeNull();
    escape();
    expect(input.value).toBe("");
    expect(root.querySelector(".search-results")).toBeNull();
    expect(select).not.toHaveBeenCalled();
    expect(selected()).toEqual({ node: "e:t_FCT_REVENUE" });
  });
});

const REGIONS = [
  ".catbar",
  ".tools",
  ".graph",
  ".controls",
  ".status-stack",
  ".inspector",
  ".hidden-panel",
  ".wb-handle",
  ".workbench",
];
const NATIVE = "button, input, select, textarea, a[href]";

// why: jsdom has no Tab key; with no positive tabindex the tab order is the DOM order of the
// elements that take the focus
function tabbable(el: Element): boolean {
  if (el.closest("[inert], [hidden]") !== null) return false;
  if ((el as HTMLButtonElement).disabled === true) return false;
  const index = el.getAttribute("tabindex");
  return index === null ? el.matches(NATIVE) : Number(index) >= 0;
}

describe("S7 the focus order is the visual order (SA §5)", () => {
  it("visits the shell parts in the order of rule 6", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    run(() => canvas().select("e:u_12"));
    run(() => button(root, "Hide from canvas").click());
    run(() => canvas().select("e:t_FCT_REVENUE"));
    run(() =>
      button(root, "Group neighbours by type around this node").click(),
    );
    run(() => button(root, "Dataset").click());
    for (const part of [".hidden-panel", ".focus-pill", ".data-notice"])
      expect(root.querySelector(part), part).not.toBeNull();
    const positive = [...root.querySelectorAll("[tabindex]")].filter(
      (el) => Number(el.getAttribute("tabindex")) > 0,
    );
    expect(positive).toEqual([]);
    const parts = [...root.querySelectorAll("*")]
      .filter(tabbable)
      .map((el) => REGIONS.find((region) => el.closest(region)) ?? "other");
    expect(parts.filter((part, i) => part !== parts[i - 1])).toEqual(REGIONS);
  });
});
