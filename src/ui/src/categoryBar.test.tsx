// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi, type MockInstance } from "vitest";

// why: S11-S15 — the real canvas, with a spy on `setFilters`
const spy = vi.hoisted(() => ({ filters: [] as MockInstance[] }));
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      const made = mod.createCanvas(...args);
      spy.filters.push(vi.spyOn(made, "setFilters"));
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
const { appInput, fixtureModel } = await import("./fixtureModel");
const { edgeStyles } = await import("./canvas/index");
const { iconParts } = await import("./icons");
const state = await import("./state");

const setFilters = () => spy.filters[spy.filters.length - 1];
const click = (el: Element) => void act(() => (el as HTMLElement).click());
const text = (el: Element | null | undefined) => el?.textContent ?? "";

function step(work: () => void): boolean {
  const before = state.camera.value;
  void act(work);
  for (let i = 0; i < 1000 && state.camera.value === before; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
  return state.camera.value !== before;
}

const tabs = (root: Element) => [...root.querySelectorAll(".fam-tab")];
const pills = (root: Element) => [...root.querySelectorAll(".pill")];
const nameOf = (pill: Element) => pill.childNodes[1]?.textContent ?? "";
const tabNamed = (root: Element, name: string) =>
  tabs(root).find((tab) => text(tab) === name) as HTMLElement;

// why: SA §6 row 3 — the positions, the groups and the +N counts that a filter must not change
function view() {
  return {
    positions: state.canvasState.value?.positions,
    nodes: state.frontier.value?.nodes.map((node) =>
      "members" in node
        ? [node.id, node.members, node.count, node.more, node.opened]
        : [node.id, node.group, node.more, node.opened],
    ),
  };
}

describe("S11 the category bar of s-access", () => {
  it("has three family tabs and eight pills with the canvas colours", async () => {
    const input = fixtureModel("s-access");
    if (!input.ok) throw new Error("fatal");
    const frame = await mountApp(input);
    expect(tabs(frame.root).map(text)).toEqual([
      "Structure",
      "Annotation",
      "Ownership & Access",
    ]);
    expect(tabs(frame.root).map((tab) => tab.className)).toEqual([
      "fam-tab qt-fam-0",
      "fam-tab qt-fam-3",
      "fam-tab qt-fam-4",
    ]);
    for (const tab of tabs(frame.root))
      expect(tab.getAttribute("aria-pressed")).toBe("true");
    const colours = edgeStyles(input.model.vocab, input.model.canvas);
    expect(pills(frame.root)).toHaveLength(8);
    for (const pill of pills(frame.root)) {
      const colour = (pill as HTMLElement).style.getPropertyValue("--c");
      expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(colour).toBe(colours.get(nameOf(pill))?.colour);
      expect(text(pill.querySelector(".n"))).toMatch(/^[\d,]+$/);
      expect(pill.getAttribute("aria-pressed")).toBe("true");
    }
    const annotation = pills(frame.root).filter((pill) =>
      ["taggedWith", "enrichedWith"].includes(nameOf(pill)),
    );
    expect(annotation).toHaveLength(2);
    const [a, b] = annotation.map((pill) =>
      (pill as HTMLElement).style.getPropertyValue("--c"),
    );
    expect(a).not.toBe(b);
  });
});

describe("S12 a family partly on", () => {
  it("a predicate off makes the tab partial; the tab press turns the family on; nothing moves", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const before = view();
    const pill = pills(frame.root).find((p) => nameOf(p) === "enrichedWith");
    expect(step(() => click(pill as Element))).toBe(true);
    expect(view()).toEqual(before);
    const annotation = tabNamed(frame.root, "Annotation");
    expect(annotation.hasAttribute("data-partial")).toBe(true);
    expect(annotation.getAttribute("aria-pressed")).toBe("true");
    expect(step(() => click(annotation))).toBe(true);
    expect(setFilters()).toHaveBeenLastCalledWith({
      kind: "toggleFamily",
      family: "Annotation",
      on: true,
    });
    expect(view()).toEqual(before);
    expect(
      tabNamed(frame.root, "Annotation").hasAttribute("data-partial"),
    ).toBe(false);
  });
});

describe("S13 the Predicates picker of s-many-preds", () => {
  it("searches, toggles with the menu open and counts 19/20", async () => {
    const frame = await mountApp(fixtureModel("s-many-preds"));
    expect(tabs(frame.root)).toHaveLength(6);
    const row = frame.root.querySelector('.pill-row[data-mode="advanced"]');
    const pickers = row?.querySelectorAll(".pick-btn") ?? [];
    expect(pickers).toHaveLength(1);
    const picker = pickers[0];
    expect(text(picker)).toBe("Predicates20/20");
    click(picker);
    const menu = picker.nextElementSibling as HTMLElement;
    expect(menu.hidden).toBe(false);
    const search = menu.querySelector("input") as HTMLInputElement;
    expect(menu.ownerDocument.activeElement).toBe(search);
    void act(() => {
      search.value = "own";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const items = [...menu.querySelectorAll(".pick-item")];
    expect(items.map((item) => text(item.querySelector(".nm")))).toEqual([
      "ownedBy",
    ]);
    expect(step(() => click(items[0]))).toBe(true);
    expect(setFilters()).toHaveBeenCalledWith({
      kind: "togglePredicate",
      predicate: "ownedBy",
      on: false,
    });
    expect(menu.hidden).toBe(false);
    expect(text(picker)).toBe("Predicates19/20");
    expect(picker.classList.contains("filtered")).toBe(true);
  });
});

// why: S14 — 11 custom categories, one predicate each: both rows have more than ten options
function elevenFamilies(): unknown {
  const names = Array.from({ length: 11 }, (_, i) => `p${i}`);
  return {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: names.map((predicate) => ({ subject: "a", predicate, object: "b" })),
    predicates: Object.fromEntries(
      names.map((name, i) => [name, { category: `c${i}` }]),
    ),
  };
}

describe("S14 the row mode follows the dataset totals", () => {
  it("q-full-vocabulary keeps family tabs and a predicate picker after each family toggle", async () => {
    const frame = await mountApp(fixtureModel("q-full-vocabulary"));
    const modes = () => ({
      families: frame.root
        .querySelector(".fam-tabs")
        ?.getAttribute("data-mode"),
      tabs: tabs(frame.root).length,
      predicates: frame.root
        .querySelector(".pill-row")
        ?.getAttribute("data-mode"),
      pickers: frame.root.querySelectorAll(".pill-row .pick-btn").length,
    });
    const basic = {
      families: "basic",
      tabs: 6,
      predicates: "advanced",
      pickers: 1,
    };
    expect(modes()).toEqual(basic);
    for (const name of tabs(frame.root).map(text)) {
      step(() => click(tabNamed(frame.root, name)));
      expect(tabNamed(frame.root, name).getAttribute("aria-pressed")).toBe(
        "false",
      );
      expect(modes()).toEqual(basic);
    }
    expect(setFilters()).toHaveBeenCalledTimes(6);
  });

  it("11 custom categories and 11 predicates are two pickers on one row", async () => {
    const frame = await mountApp(appInput(elevenFamilies()));
    const bar = frame.root.querySelector(".catbar");
    expect(bar?.getAttribute("data-layout")).toBe("inline");
    expect(bar?.querySelectorAll(".pick-btn")).toHaveLength(2);
    expect([...(bar?.querySelectorAll(".pick-btn") ?? [])].map(text)).toEqual([
      "Families11/11",
      "Predicates11/11",
    ]);
    expect(tabs(frame.root)).toHaveLength(0);
    expect(pills(frame.root)).toHaveLength(0);
  });
});

describe("S15 a custom family", () => {
  it("shows governance as text with the other icon and the Other set", async () => {
    const frame = await mountApp(fixtureModel("q-spec-scenarios"));
    const tab = tabNamed(frame.root, "governance");
    const words = [...tab.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    expect(words.map((node) => node.textContent)).toEqual(["governance"]);
    const paths = [...tab.querySelectorAll("svg > *")].map((el) =>
      el.getAttribute("d"),
    );
    expect(paths).toEqual(iconParts("other").map(([, attrs]) => attrs.d));
    expect(tab.className).toBe("fam-tab qt-fam-5");
    for (const el of frame.root.querySelectorAll("*")) {
      expect(el.getAttribute("class") ?? "").not.toContain("governance");
      const { style } = el as HTMLElement;
      for (let i = 0; i < (style?.length ?? 0); i++)
        expect(style.item(i)).not.toContain("governance");
    }
  });
});
