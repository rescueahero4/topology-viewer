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
const { rendererText } = await import("./rendererText");
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

const pill = (root: Element) =>
  root.querySelector<HTMLElement>(".status-stack .focus-pill");
const action = (root: Element, name: string) => {
  const found = [
    ...root.querySelectorAll<HTMLElement>(".inspector .insp-bar .icon-btn"),
  ].find((el) => el.getAttribute("aria-label") === name);
  if (found === undefined) throw new Error(`no action ${name}`);
  return found;
};

const AROUND = {
  en: "Group neighbours by type around this node",
  ja: "隣接ノードを種類ごとにこのノードの周りにまとめる",
};
const CLEAR = "Clear selection and fit view";

function groupAround(root: Element, id: string, lang: "en" | "ja" = "en") {
  run(() => canvas().select(id));
  run(() => action(root, AROUND[lang]).click());
}

describe("S9 the pill while Group around root is on", () => {
  it("names the root and the faded count, with aria-live", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    expect(state.canvasState.value?.layout).toBe("force");
    expect(pill(root)).toBeNull();
    groupAround(root, "e:t_FCT_REVENUE");
    const shown = pill(root);
    expect(text(shown?.querySelector(".fp-txt"))).toBe(
      "Focused on FCT_REVENUE · 1 faded",
    );
    expect(text(shown?.querySelector(".fp-name"))).toBe("FCT_REVENUE");
    expect(text(shown?.querySelector(".fp-act"))).toBe("Show all");
    expect(shown?.getAttribute("aria-live")).toBe("polite");
    expect(shown?.hasAttribute("aria-label")).toBe(false);
    void act(() => void shown?.dispatchEvent(new MouseEvent("mouseenter")));
    expect(text(root.querySelector(".tip"))).toBe(
      "Showing only FCT_REVENUE and its neighbours. Click to show the 1 faded node again.",
    );
  });
});

describe("S10 the pill ends the grouping", () => {
  it("calls groupAroundRoot(false) once and stays after a clear", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    groupAround(root, "e:t_FCT_REVENUE");
    const around = vi.spyOn(canvas(), "groupAroundRoot");
    run(() => pill(root)?.click());
    expect(around.mock.calls).toEqual([[false]]);
    expect(state.canvasState.value?.around).toBeNull();
    expect(pill(root)).toBeNull();
    groupAround(root, "e:t_FCT_REVENUE");
    expect(pill(root)).not.toBeNull();
    run(() => action(root, CLEAR).click());
    expect(state.selection.value).toBeNull();
    expect(pill(root)).not.toBeNull();
    expect(text(pill(root)?.querySelector(".fp-txt"))).toBe(
      "Focused on FCT_REVENUE · 1 faded",
    );
  });
});

describe("S11 a group root", () => {
  it("names the group by the canvas group text", async () => {
    const { root } = await mountApp(fixtureModel("s-star"));
    const group = state.frontier.value?.nodes.find(
      (n) => "members" in n && n.type === "table",
    );
    if (group === undefined) throw new Error("no table group");
    groupAround(root, group.id);
    expect(state.canvasState.value?.around?.root).toBe(group.id);
    const name = rendererText("en").groupLabel("Table", 300);
    expect(text(pill(root)?.querySelector(".fp-name"))).toBe(name);
    expect(text(pill(root)?.querySelector(".fp-txt"))).toBe(
      `Focused on ${name} · 2 faded`,
    );
  });
});

function shellWords(root: Element): string[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const words: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    words.push(node.textContent ?? "");
  for (const el of root.querySelectorAll("[aria-label], [aria-labelledby]")) {
    words.push(el.getAttribute("aria-label") ?? "");
    for (const id of (el.getAttribute("aria-labelledby") ?? "").split(" "))
      words.push(text(doc.getElementById(id)));
  }
  return words;
}

describe("S12 no shell text calls a faded node hidden", () => {
  it("in en: no text and no accessible name says hidden", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    groupAround(root, "e:t_FCT_REVENUE");
    void act(
      () => void pill(root)?.dispatchEvent(new MouseEvent("mouseenter")),
    );
    const words = shellWords(root);
    expect(words.join("\n")).toContain("1 faded");
    expect(words.filter((w) => /hidden/i.test(w))).toEqual([]);
  });

  it("in ja: no text and no pill name has the Hidden word", async () => {
    const { root } = await mountApp(fixtureModel("s-access"), { lang: "ja" });
    groupAround(root, "e:t_FCT_REVENUE", "ja");
    const shown = pill(root) as HTMLElement;
    void act(() => void shown.dispatchEvent(new MouseEvent("mouseenter")));
    expect(text(shown)).toBe("FCT_REVENUE に注目 · 薄く表示 1 件、すべて表示");
    const tip = text(root.querySelector(".tip"));
    expect(tip).toContain("薄く表示");
    const walker = root.ownerDocument.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
    );
    const texts: string[] = [];
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode())
      texts.push(n.textContent ?? "");
    expect(texts.filter((w) => w.includes("非表示"))).toEqual([]);
    expect(shellWords(shown).filter((w) => w.includes("非表示"))).toEqual([]);
  });
});
