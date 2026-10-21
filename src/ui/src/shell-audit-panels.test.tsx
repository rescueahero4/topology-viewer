// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "./canvas/index";

// why: STORY-004-06 S17 — the real canvas, kept so the test can hide and group hostile nodes
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
const { appInput } = await import("./fixtureModel");
const { hostilePayload, shellAudit, MARKERS } = await import("./shellAudit");
const state = await import("./state");

const QUERY = `qxm099"<>&javascript:`;
const markers = [...MARKERS, QUERY.slice(0, 6)];

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

function textsOf(root: Element): string {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const texts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    texts.push(node.textContent ?? "");
  return texts.join("\n");
}

function hover(anchors: Iterable<Element>, visit: () => void): number {
  let count = 0;
  for (const anchor of anchors) {
    void act(() => void anchor.dispatchEvent(new MouseEvent("mouseenter")));
    visit();
    void act(() => void anchor.dispatchEvent(new MouseEvent("mouseleave")));
    count += 1;
  }
  return count;
}

function type(root: Element, value: string): void {
  const input = root.querySelector(".search input") as HTMLInputElement;
  void act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  void act(() => {
    vi.advanceTimersByTime(120);
  });
}

describe("S17 the Hidden card, the pill and search on the hostile payload", () => {
  it("puts no marker into an attribute with each panel open", async () => {
    const frame = await mountApp(appInput(hostilePayload()));
    const { root } = frame;
    const canvas = spy.canvases[spy.canvases.length - 1];
    const visit = () => {
      expect(shellAudit(root, markers)).toEqual([]);
      const texts = textsOf(root);
      expect(texts).not.toContain("function");
      expect(texts).not.toContain("[object Object]");
    };
    const drawn = state.frontier.value?.nodes.map((node) => node.id) ?? [];
    expect(drawn.length).toBeGreaterThan(3);
    for (const id of drawn.slice(1)) run(() => canvas.hide([id]));
    const items = state.canvasState.value?.hidden.length ?? 0;
    expect(items).toBeGreaterThan(2);
    run(() => root.querySelector<HTMLElement>(".hid-toggle")?.click());
    const rows = [...root.querySelectorAll(".hid-row")];
    expect(rows).toHaveLength(items);
    expect(textsOf(root).includes(MARKERS[9])).toBe(true);
    visit();
    void act(() => root.querySelector<HTMLElement>(".hid-bar .check")?.click());
    visit();

    run(() => root.querySelector<HTMLElement>(".hid-bar .btn")?.click());
    run(() => canvas.select(drawn[0]));
    run(() => canvas.groupAroundRoot(true));
    const pill = root.querySelector(".focus-pill");
    expect(pill).not.toBeNull();
    expect(hover([pill as Element], visit)).toBe(1);

    type(root, "qxm");
    expect(root.querySelectorAll(".search-results [role=option]").length).toBe(
      7,
    );
    visit();
    type(root, QUERY);
    const none = root.querySelector(".search-results .none");
    expect(none?.childNodes[1]?.nodeType).toBe(Node.TEXT_NODE);
    expect(none?.childNodes[1]?.textContent).toBe(QUERY);
    visit();
    expect(frame.calls).toEqual([]);
  });
});
