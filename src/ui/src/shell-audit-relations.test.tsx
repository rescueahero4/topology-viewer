// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "./canvas/index";

// why: STORY-004-05 S15 — the real canvas, kept so the test can select each hostile node
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
const { hostilePayload, shellAudit } = await import("./shellAudit");

function textsOf(root: Element): string[] {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const texts: string[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode.textContent ?? "");
  return texts;
}

// why: the tip anchors of the card: the counts, the name, each predicate, the info icon and the
// header actions
const ANCHORS = '[tabindex="0"]:not(.triple), .insp-bar .icon-btn';

function eachTip(card: Element, visit: () => void): number {
  const anchors = [...card.querySelectorAll(ANCHORS)];
  for (const anchor of anchors) {
    void act(() => void anchor.dispatchEvent(new MouseEvent("mouseenter")));
    visit();
    void act(() => void anchor.dispatchEvent(new MouseEvent("mouseleave")));
  }
  return anchors.length;
}

describe("S15 the relationships on the hostile payload", () => {
  it("opens every tab and tip of each hostile node with no marker in an attribute", async () => {
    const raw = hostilePayload() as {
      nodes: { id?: string; globalId?: string }[];
    };
    const ids = raw.nodes.map((n) => n.id ?? n.globalId ?? "");
    const frame = await mountApp(appInput(hostilePayload()));
    const canvas = spy.canvases[spy.canvases.length - 1];
    const visit = () => {
      expect(shellAudit(frame.root)).toEqual([]);
      const texts = textsOf(frame.root).join("\n");
      expect(texts).not.toContain("function");
      expect(texts).not.toContain("[object Object]");
    };
    let rows = 0;
    let tips = 0;
    for (const id of ids) {
      void act(() => canvas.focus(id));
      for (let i = 0; i < 120; i++)
        void act(() => {
          vi.advanceTimersByTime(16);
        });
      const card = frame.root.querySelector(".inspector") as HTMLElement;
      expect([id, card.dataset.state]).toEqual([id, "expanded"]);
      for (const tab of card.querySelectorAll<HTMLElement>(".insp-tab")) {
        void act(() => tab.click());
        visit();
        rows += card.querySelectorAll(".triple").length;
        tips += eachTip(card, visit);
      }
    }
    expect(rows).toBeGreaterThanOrEqual(10);
    expect(tips).toBeGreaterThanOrEqual(ids.length * 3);
    expect(frame.calls).toEqual([]);
  });
});
