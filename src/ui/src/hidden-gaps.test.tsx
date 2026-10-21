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

// why: ISSUE-012 C5 — the STORY-004-06 QA plants y14, y15, y16, y18 and y32 (memo
// 2026-10-21-qa-story-06-done-gate.md item 2), and the C1 tips and C4 names of the chip and pill

const canvas = () => spy.canvases[spy.canvases.length - 1];
const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const chip = (root: Element) =>
  root.querySelector<HTMLElement>(".hidden-panel .hid-toggle");
const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".hid-row"),
];
const ticked = (root: Element) =>
  rows(root).map((row) => row.getAttribute("aria-selected"));
const box = (root: Element) =>
  root.querySelector<HTMLElement>(".hid-bar .check") as HTMLElement;
const key = (el: Element, name: string, shiftKey = false) =>
  void act(
    () =>
      void el.dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true, shiftKey }),
      ),
  );
const hover = (el: Element) =>
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
const tip = (root: Element) => text(root.querySelector('[role="tooltip"]'));

function shellAction(root: Element, id: string, name: string): void {
  run(() => canvas().select(id));
  const button = [
    ...root.querySelectorAll<HTMLElement>(".inspector .insp-bar .icon-btn"),
  ].find((el) => el.getAttribute("aria-label") === name);
  if (button === undefined) throw new Error(`no ${name} for ${id}`);
  run(() => button.click());
}
const hide = (root: Element, id: string) =>
  shellAction(root, id, "Hide from canvas");

async function threeHidden() {
  const frame = await mountApp(fixtureModel("s-access"));
  for (const id of ["e:u_0", "e:u_7", "e:u_12"]) hide(frame.root, id);
  void act(() => chip(frame.root)?.click());
  return frame;
}

describe("y14, y15 the keyboard of the Hidden list", () => {
  it("moves up with ArrowUp and ticks a range of three rows with Shift+Space", async () => {
    const { root } = await threeHidden();
    void act(() => rows(root)[0].focus());
    key(rows(root)[0], " ");
    key(rows(root)[0], "ArrowDown");
    key(rows(root)[1], "ArrowDown");
    expect(root.ownerDocument.activeElement).toBe(rows(root)[2]);
    key(rows(root)[2], " ", true);
    expect(ticked(root)).toEqual(["true", "true", "true"]);
    key(rows(root)[2], "ArrowUp");
    expect(rows(root).map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
    expect(root.ownerDocument.activeElement).toBe(rows(root)[1]);
  });
});

describe("y16 the select-all box", () => {
  it("unticks every row on a second press", async () => {
    const { root } = await threeHidden();
    void act(() => box(root).click());
    expect(ticked(root)).toEqual(["true", "true", "true"]);
    void act(() => box(root).click());
    expect(ticked(root)).toEqual(["false", "false", "false"]);
    expect(text(box(root))).toBe("Select all");
  });
});

describe("y32 the bump of the count", () => {
  it("bumps when the count grows and not when it goes down", async () => {
    const { root } = await threeHidden();
    const count = () => chip(root)?.querySelector(".hid-count");
    expect(count()?.classList.contains("bump")).toBe(true);
    const eye = rows(root)[0].querySelector(".icon-btn") as HTMLElement;
    run(() => eye.click());
    expect(text(count())).toBe("2");
    expect(count()?.classList.contains("bump")).toBe(false);
  });
});

describe("y18 a search pick of a stranded hidden hit", () => {
  it("restores the Hidden entry that holds the strand", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    hide(root, "e:u_12");
    const input = root.querySelector(".search input") as HTMLInputElement;
    void act(() => {
      input.value = "ug_exec";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    void act(() => {
      vi.advanceTimersByTime(120);
    });
    const [hit] = root.querySelectorAll<HTMLElement>(
      ".search-results [role=option]",
    );
    expect(text(hit.querySelector(".meta"))).toBe("User group · hidden");
    const restore = vi.spyOn(canvas(), "restore");
    run(() => hit.click());
    expect(restore.mock.calls).toEqual([[["e:u_12"]]]);
  });
});

describe("C1 and C4 the Hidden chip, its rows and the focus pill", () => {
  it("gives the mockup tips and names with a separator", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    hide(root, "e:u_0");
    expect(text(chip(root))).toBe("Hidden, 1");
    hover(chip(root) as HTMLElement);
    expect(tip(root)).toBe("Show hidden items");
    void act(() => chip(root)?.click());
    hover(chip(root) as HTMLElement);
    expect(tip(root)).toBe("Collapse hidden items");
    hover(rows(root)[0]);
    expect(tip(root)).toBe("Shift-click to select a range");
    shellAction(
      root,
      "e:t_FCT_REVENUE",
      "Group neighbours by type around this node",
    );
    expect(text(root.querySelector(".focus-pill"))).toBe(
      "Focused on FCT_REVENUE · 1 faded, Show all",
    );
  });

  it("uses the ja separator", async () => {
    const { root } = await mountApp(fixtureModel("s-access"), { lang: "ja" });
    run(() => canvas().hide(["e:u_0"]));
    expect(text(chip(root))).toBe("非表示、1");
    hover(chip(root) as HTMLElement);
    expect(tip(root)).toBe("非表示の項目を表示");
  });
});
