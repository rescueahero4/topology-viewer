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
const { en } = await import("./strings/en");
const { ja } = await import("./strings/ja");

// why: STORY-007-05 S10 — the jsdom part of the compact inspector; the boxes and the CSS values are
// in `apps/widget/test/host/embed-inspector.spec.ts`

const SIZE = { width: 1200, height: 600 };
const canvas = () => spy.canvases[spy.canvases.length - 1];
const card = (root: Element) => root.querySelector(".inspector") as HTMLElement;
const toggle = (root: Element) =>
  card(root).querySelector<HTMLButtonElement>('[data-act="toggle"]');

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const embedded = (key: string, options = {}) =>
  mountApp(fixtureModel(key), {
    embedded: true,
    displayMode: "inline",
    size: SIZE,
    ...options,
  });

describe("S10 the start state and the user's choice", () => {
  it("starts collapsed embedded and expanded on the standalone page", async () => {
    const widget = await embedded("s-access");
    expect(card(widget.root).dataset.state).toBe("collapsed");
    expect(toggle(widget.root)?.getAttribute("aria-label")).toBe(
      en["inspector.expand"],
    );
    expect(card(widget.root).querySelector(".insp-body")).toBeNull();
    const page = await mountApp(fixtureModel("s-access"), { size: SIZE });
    expect(card(page.root).dataset.state).toBe("expanded");
  });

  it("starts collapsed in full screen too", async () => {
    const { root } = await embedded("s-access", { displayMode: "fullscreen" });
    expect(card(root).dataset.state).toBe("collapsed");
  });

  it("keeps the expanded card across a new selection", async () => {
    const { root } = await embedded("s-access");
    run(() => toggle(root)?.click());
    expect(card(root).dataset.state).toBe("expanded");
    run(() => canvas().select("e:u_0"));
    expect(card(root).querySelector(".insp-title strong")?.textContent).toBe(
      "Aiko Tanaka",
    );
    expect(card(root).dataset.state).toBe("expanded");
    expect(card(root).querySelector(".insp-body")).not.toBeNull();
  });

  it("keeps the collapsed card across a new selection", async () => {
    const { root } = await embedded("s-access");
    run(() => canvas().select("e:u_0"));
    expect(card(root).dataset.state).toBe("collapsed");
  });
});

describe("S10 the empty hint", () => {
  it.each([
    ["en", en],
    ["ja", ja],
  ] as const)(
    "gives the embedded hint and the standalone hint · %s",
    async (lang, table) => {
      const widget = await embedded("q-full-vocabulary", { lang });
      expect(card(widget.root).dataset.state).toBe("empty");
      expect(card(widget.root).textContent).toBe(
        table["inspector.emptyEmbedded"],
      );
      const page = await mountApp(fixtureModel("q-full-vocabulary"), {
        lang,
        size: SIZE,
      });
      expect(card(page.root).textContent).toBe(table["inspector.empty"]);
    },
  );

  it("has a short embedded hint that differs from the standalone hint", () => {
    expect(en["inspector.emptyEmbedded"]).toBe("Click a node to inspect");
    expect(ja["inspector.emptyEmbedded"]).not.toBe(ja["inspector.empty"]);
  });
});

// why: STORY-007-05 rule 2 (app.js line 1447) — the collapsed peek is measured again after a
// display-mode change; jsdom has no layout, so the header height here depends on the mode
describe("rule 2 the peek after a display-mode change", () => {
  it("sets --insp-peek from the header height of the current mode", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        const mode = this.closest(".shell")?.getAttribute("data-display");
        return mode === "fullscreen" ? 40 : 30;
      },
    );
    const frame = await embedded("s-access");
    const peek = () => card(frame.root).style.getPropertyValue("--insp-peek");
    expect(peek()).toBe("32px");
    await frame.update({ displayMode: "fullscreen" });
    expect(peek()).toBe("42px");
    await frame.update({ displayMode: "inline" });
    expect(peek()).toBe("32px");
  });
});
