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
const { mountApp } = await import("./testFrame");
const { fixtureModel } = await import("./fixtureModel");
const state = await import("./state");

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
const press = (root: Element, name: string) =>
  void act(() => button(root, name).click());
const layout = (root: Element) =>
  root.querySelector(".split")?.getAttribute("data-layout");
const inert = (root: Element) =>
  root.querySelector("section.workbench")?.hasAttribute("inert");
const card = (root: Element) =>
  root.querySelector(".inspector")?.getAttribute("data-state");
const height = (root: Element) =>
  (root.querySelector("main.canvas") as HTMLElement).style.height;

// why: H10 — the order of the two changes, from the attribute records of one width crossing
function watchOrder(root: Element) {
  const watch = new MutationObserver(() => {});
  watch.observe(root, {
    attributes: true,
    subtree: true,
    attributeFilter: ["inert", "data-state"],
  });
  return () => {
    const names = watch.takeRecords().flatMap((record) => {
      const el = record.target as Element;
      if (el.matches("section.workbench")) return ["workbench"];
      if (el.matches(".inspector")) return ["inspector"];
      return [];
    });
    watch.disconnect();
    return names.filter((name, i) => names.indexOf(name) === i);
  };
}

describe("S4 below 760 px the Workbench closes, then the inspector collapses", () => {
  it("closes both in the H10 order and keeps a user choice while narrow and after", async () => {
    const frame = await mountApp(fixtureModel("s-access"), {
      size: { width: 1000, height: 600 },
    });
    const { root } = frame;
    run(() => button(root, "Dataset").click());
    expect([layout(root), inert(root), card(root)]).toEqual([
      "split",
      false,
      "expanded",
    ]);
    const order = watchOrder(root);
    frame.resize({ width: 700, height: 600 });
    expect(order()).toEqual(["workbench", "inspector"]);
    expect([layout(root), inert(root), card(root)]).toEqual([
      "canvas-only",
      true,
      "collapsed",
    ]);
    expect(root.querySelector(".shell")?.hasAttribute("data-narrow")).toBe(
      true,
    );
    press(root, "Dataset");
    press(root, "Expand inspector");
    expect([layout(root), inert(root), card(root)]).toEqual([
      "split",
      false,
      "expanded",
    ]);
    frame.resize({ width: 720, height: 600 });
    expect([layout(root), card(root)]).toEqual(["split", "expanded"]);
    frame.resize({ width: 1000, height: 600 });
    expect([layout(root), card(root)]).toEqual(["split", "expanded"]);
    expect(root.querySelector(".shell")?.hasAttribute("data-narrow")).toBe(
      false,
    );
  });
});

describe("S10 the inspector is its chip from 900 px down (STORY-005-11 rule 4)", () => {
  const narrow = (root: Element) =>
    root.querySelector(".shell")?.hasAttribute("data-narrow");
  const row = (root: Element) => [
    card(root),
    layout(root),
    inert(root),
    narrow(root),
  ];

  it("collapses at 900 px and closes the Workbench only below 760 px", async () => {
    const frame = await mountApp(fixtureModel("s-access"), {
      size: { width: 901, height: 600 },
    });
    const { root } = frame;
    expect(state.selection.value).toEqual({ node: "e:t_FCT_REVENUE" });
    run(() => button(root, "Dataset").click());
    expect(row(root)).toEqual(["expanded", "split", false, false]);
    frame.resize({ width: 900, height: 600 });
    expect(row(root)).toEqual(["collapsed", "split", false, false]);
    frame.resize({ width: 761, height: 600 });
    expect(row(root)).toEqual(["collapsed", "split", false, false]);
    frame.resize({ width: 760, height: 600 });
    expect(row(root)).toEqual(["collapsed", "split", false, false]);
    frame.resize({ width: 759, height: 600 });
    expect(row(root)).toEqual(["collapsed", "canvas-only", true, true]);
  });

  it("starts collapsed in a first render at 900 px", async () => {
    const { root } = await mountApp(fixtureModel("s-access"), {
      size: { width: 900, height: 600 },
    });
    expect(row(root)).toEqual(["collapsed", "canvas-only", true, false]);
  });
});

describe("S15 a first render below 760 px", () => {
  it("starts with the Workbench closed and the inspector as its header chip", async () => {
    const frame = await mountApp(fixtureModel("s-access"), {
      size: { width: 700, height: 600 },
    });
    const { root } = frame;
    expect([layout(root), inert(root)]).toEqual(["canvas-only", true]);
    expect(state.selection.value).toEqual({ node: "e:t_FCT_REVENUE" });
    expect(card(root)).toBe("collapsed");
    expect(text(root.querySelector(".inspector .insp-title strong"))).toBe(
      "FCT_REVENUE",
    );
    expect(root.querySelector(".inspector .insp-body")).toBeNull();
    press(root, "Expand inspector");
    expect(card(root)).toBe("expanded");
    expect(root.querySelector(".inspector .insp-body")).not.toBeNull();
    frame.resize({ width: 740, height: 600 });
    expect(card(root)).toBe("expanded");
  });
});

describe("a frame with no layout yet (memo item: width 0)", () => {
  it("does not take a 0 × 0 frame for a narrow one", async () => {
    const frame = await mountApp(fixtureModel("s-access"), {
      size: { width: 0, height: 0 },
    });
    frame.resize({ width: 1000, height: 600 });
    run(() => {});
    expect(card(frame.root)).toBe("expanded");
  });
});

describe("S13 the canvas height step of the Workbench slide", () => {
  it("sets the open height at once and the close height after 300 ms", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    expect(height(root)).toBe("600px");
    press(root, "Dataset");
    expect(height(root)).toBe("360px");
    press(root, "Close table");
    expect(height(root)).toBe("360px");
    void act(() => void vi.advanceTimersByTime(299));
    expect(height(root)).toBe("360px");
    void act(() => void vi.advanceTimersByTime(1));
    expect(height(root)).toBe("600px");
  });

  it("sets the new height at once on open and on close under reduced motion", async () => {
    const { root } = await mountApp(fixtureModel("s-access"), {
      reducedMotion: true,
    });
    press(root, "Dataset");
    expect(height(root)).toBe("360px");
    press(root, "Close table");
    expect(height(root)).toBe("600px");
  });
});
