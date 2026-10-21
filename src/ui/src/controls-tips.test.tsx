// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasModel } from "./canvas/index";

const spy = vi.hoisted(() => ({
  canvases: [] as Canvas[],
  models: [] as CanvasModel[],
}));
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      const made = mod.createCanvas(...args);
      spy.canvases.push(made);
      spy.models.push(args[1].model);
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
const { t } = await import("./strings/index");

// why: ISSUE-012 C1 (the Scope and Grouping tips), C2 (the layout info icon, the predicate row),
// C7 (the inspector Type row tag) and C11 (a supplied label of a profile type)

const canvas = () => spy.canvases[spy.canvases.length - 1];
const lastModel = () => spy.models[spy.models.length - 1];
const text = (el: Element | null | undefined) => el?.textContent ?? "";
const click = (el: Element) => void act(() => (el as HTMLElement).click());
const hover = (el: Element) =>
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
const tip = (root: Element) => text(root.querySelector('[role="tooltip"]'));

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const buttons = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".controls .ctl-btn"),
];
const typeCell = (root: Element, lang: "en" | "ja" = "en") =>
  [...root.querySelectorAll(".inspector .facts dt")].find(
    (dt) => text(dt) === t(lang, "inspector.type"),
  )?.nextElementSibling as HTMLElement;

describe("C1 the Scope and Grouping tips", () => {
  it("shows the mockup texts on hover and focus, in en and ja", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    hover(buttons(root)[0]);
    expect(tip(root)).toBe("How much of the dataset is drawn on the canvas");
    void act(() => buttons(root)[3].focus());
    expect(tip(root)).toBe(
      "Similar sibling nodes collapse into one; double-click to expand",
    );
    expect(buttons(root)[3].getAttribute("aria-describedby")).toBe(
      root.querySelector('[role="tooltip"]')?.id,
    );
  });

  it("uses the ja texts", async () => {
    const { root } = await mountApp(fixtureModel("s-access"), { lang: "ja" });
    hover(buttons(root)[0]);
    expect(tip(root)).toBe("キャンバスに描画するデータセットの範囲");
  });
});

describe("C2 the layout info icon and the predicate row", () => {
  it("keeps the icon out of the tab order and describes the item", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    click(buttons(root)[2]);
    const items = [
      ...root.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ].filter((el) => el.querySelector(".info") !== null);
    expect(items).toHaveLength(5);
    for (const item of items) {
      const info = item.querySelector(".info") as HTMLElement;
      expect(info.hasAttribute("tabindex")).toBe(false);
      expect(info.hasAttribute("role")).toBe(false);
      const described = root.ownerDocument.getElementById(
        item.getAttribute("aria-describedby") ?? "",
      );
      expect(described?.hidden).toBe(true);
    }
    const atomic = items[1];
    expect(
      text(
        root.ownerDocument.getElementById(
          atomic.getAttribute("aria-describedby") ?? "",
        ),
      ),
    ).toBe("Rings around a central node");
    expect(root.querySelector(".catbar .pill-row")?.getAttribute("role")).toBe(
      "group",
    );
  });
});

const tabelle = (label?: string) =>
  appInput({
    nodes: [
      { id: "t", type: "table", label: "T" },
      { id: "k", type: "kiln", label: "K" },
    ],
    edges: [{ subject: "t", predicate: "relatedTo", object: "k" }],
    ...(label === undefined ? {} : { types: { table: { label } } }),
  });

function typesMenuNames(root: Element): string[] {
  click(buttons(root)[1]);
  const names = [...root.querySelectorAll(".type-list .name")].map(text);
  click(buttons(root)[1]);
  return names;
}

describe("C11 a label that the model gives to a profile type", () => {
  it.each(["en", "ja"] as const)(
    "%s: the canvas, the Types menu and the inspector show Tabelle",
    async (lang) => {
      const { root } = await mountApp(tabelle("Tabelle"), { lang });
      expect(lastModel().vocab.types.get("table")?.label).toBe("Tabelle");
      expect(typesMenuNames(root)).toContain("Tabelle");
      run(() => canvas().focus("t"));
      expect(text(typeCell(root, lang)).startsWith("Tabelle[")).toBe(true);
    },
  );

  it("shows the string-table name with no supplied label", async () => {
    const { root } = await mountApp(tabelle(), { lang: "ja" });
    expect(lastModel().vocab.types.get("table")?.label).toBe("テーブル");
    expect(typesMenuNames(root)).toContain("テーブル");
    run(() => canvas().focus("t"));
    expect(text(typeCell(root, "ja"))).toBe("テーブル[システム]");
  });
});

describe("C7 the inspector Type row tag", () => {
  it("tags a custom type", async () => {
    const { root } = await mountApp(tabelle());
    run(() => canvas().focus("k"));
    expect(text(typeCell(root))).toBe("Kiln[custom]");
    expect(text(typeCell(root).querySelector(".prov"))).toBe("[custom]");
  });
});
