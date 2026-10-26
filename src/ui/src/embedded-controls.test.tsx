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

// why: STORY-007-03 rules 1-6 — the jsdom part of the embedded look; the boxes and the
// accessibility names are in `apps/widget/test/host/embed-controls.spec.ts`

const shell = (root: Element) => root.querySelector(".shell") as HTMLElement;
const controls = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".controls .ctl-btn"),
];
const tips = (root: Element) => [...root.querySelectorAll(".tip")];
const hover = (el: Element) =>
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
const layout = (root: Element) =>
  root.querySelector(".split")?.getAttribute("data-layout");

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const embedded = (displayMode: "inline" | "fullscreen", width = 760) =>
  mountApp(fixtureModel("s-access"), {
    embedded: true,
    displayMode,
    size: { width, height: 540 },
  });

describe("S1 the embedded attributes of the shell root", () => {
  it("sets data-host and data-display only with embedded", async () => {
    const full = await embedded("fullscreen", 1000);
    expect(shell(full.root).getAttribute("data-host")).toBe("embedded");
    expect(shell(full.root).getAttribute("data-display")).toBe("fullscreen");
    full.unmount();
    const plain = await mountApp(fixtureModel("s-access"));
    expect(shell(plain.root).hasAttribute("data-host")).toBe(false);
    expect(shell(plain.root).hasAttribute("data-display")).toBe(false);
  });

  it("gives inline when the embedded App has no display mode", async () => {
    const frame = await mountApp(fixtureModel("s-access"), { embedded: true });
    expect(shell(frame.root).getAttribute("data-display")).toBe("inline");
  });
});

describe("rule 4 the accessible names of the embedded controls", () => {
  it("names the five buttons by the menu headings", async () => {
    const { root } = await embedded("inline");
    expect(controls(root).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Canvas scope",
      "Node types",
      "Layout",
      "Collapse similar nodes",
      "Dataset table",
    ]);
    for (const b of controls(root)) expect(b.hasAttribute("title")).toBe(false);
  });
});

describe("rule 5 the tip of an embedded control", () => {
  it("shows the current label above each button, never the standalone tip", async () => {
    const { root } = await embedded("inline");
    const seen = controls(root).map((b) => {
      hover(b);
      const shown = tips(root);
      expect(shown).toHaveLength(1);
      expect(shown[0].getAttribute("data-place")).toBe("top");
      return shown[0].textContent;
    });
    expect(seen.slice(1)).toEqual(["Types", "Force", "Group 2+", "Dataset"]);
    expect(seen[0]).toMatch(/^\d+ \/ \d+$/);
  });

  it("shows no tip over an open menu, and a press hides a shown tip", async () => {
    const { root } = await embedded("inline");
    const [, , layoutButton, , dataset] = controls(root);
    hover(layoutButton);
    expect(tips(root)).toHaveLength(1);
    void act(() => layoutButton.click());
    expect(layoutButton.getAttribute("aria-expanded")).toBe("true");
    expect(tips(root)).toHaveLength(0);
    hover(layoutButton);
    expect(tips(root)).toHaveLength(0);
    void act(() => layoutButton.click());
    hover(dataset);
    expect(tips(root)).toHaveLength(1);
    run(() => dataset.click());
    expect(tips(root)).toHaveLength(0);
    expect(layout(root)).toBe("split");
  });

  it("keeps the standalone tips without embedded", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    hover(controls(root)[0]);
    expect(tips(root)[0].textContent).toBe(
      "How much of the dataset is drawn on the canvas",
    );
    expect(tips(root)[0].hasAttribute("data-place")).toBe(false);
  });
});

describe("rule 3 the narrow rule by display mode", () => {
  it("sets no data-narrow inline and keeps the Workbench open across 760 px", async () => {
    const frame = await embedded("inline", 1000);
    const { root } = frame;
    expect(shell(root).hasAttribute("data-narrow")).toBe(false);
    run(() => controls(root)[4].click());
    expect(layout(root)).toBe("split");
    // why: STORY-007-05 rule 1 — the embedded card starts collapsed, so the test opens it first
    run(() =>
      root.querySelector<HTMLButtonElement>('[data-act="toggle"]')?.click(),
    );
    expect(root.querySelector(".inspector")?.getAttribute("data-state")).toBe(
      "expanded",
    );
    run(() => frame.resize({ width: 500, height: 540 }));
    expect(shell(root).hasAttribute("data-narrow")).toBe(false);
    expect(layout(root)).toBe("split");
    expect(root.querySelector(".inspector")?.getAttribute("data-state")).toBe(
      "expanded",
    );
  });

  it("applies the rule of full screen at the current width on a mode change", async () => {
    const frame = await embedded("inline", 700);
    const { root } = frame;
    expect(shell(root).hasAttribute("data-narrow")).toBe(false);
    await frame.update({ displayMode: "fullscreen" });
    expect(shell(root).hasAttribute("data-narrow")).toBe(true);
    await frame.update({ displayMode: "inline" });
    expect(shell(root).hasAttribute("data-narrow")).toBe(false);
  });
});

describe("rule 6 the search card", () => {
  it("puts the card look on the search, not on the tools, only embedded", async () => {
    const { root } = await embedded("inline");
    expect(root.querySelector(".tools")?.className).toBe("tools");
    expect(root.querySelector(".search")?.className).toBe("search float-card");
    const plain = await mountApp(fixtureModel("s-access"));
    expect(plain.root.querySelector(".tools")?.className).toBe(
      "tools float-card",
    );
    expect(plain.root.querySelector(".search")?.className).toBe("search");
  });
});
