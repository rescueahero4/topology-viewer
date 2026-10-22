// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { describe, expect, it, vi } from "vitest";

// why: STORY-003-04 fake clock, rule 15 — the clock comes before `d3-timer` loads
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

describe("S24 the test frame", () => {
  it("starts at 0 × 0, resizes, records scrollIntoView and sizes one element", async () => {
    const frame = await mountApp(fixtureModel("s-access"), {
      size: { width: 0, height: 0 },
    });
    expect(state.lastNotice.value).toBe("zero-size");
    const runs = frame.observerRuns();
    expect(runs.length).toBeGreaterThan(0);
    const before = state.camera.value;
    frame.resize({ width: 800, height: 600 });
    expect(frame.observerRuns()).toEqual(runs.map((n) => n + 1));
    expect(state.camera.value).not.toBe(before);
    const container = frame.root.querySelector(".graph-canvas") as HTMLElement;
    expect([container.clientWidth, container.clientHeight]).toEqual([800, 600]);
    const box = container.getBoundingClientRect();
    expect([box.width, box.height]).toEqual([800, 600]);

    const node = frame.root.querySelector(".qt-root") as HTMLElement;
    node.scrollIntoView();
    expect(frame.scrolls).toEqual([node]);

    const div = document.createElement("div");
    frame.root.appendChild(div);
    frame.sizeOf(div, { width: 300, height: 600 });
    expect(div.clientHeight).toBe(600);
    expect(div.clientWidth).toBe(300);
    const rect = div.getBoundingClientRect();
    expect([rect.width, rect.height]).toEqual([300, 600]);
    expect(container.clientWidth).toBe(800);
  });

  it("starts at 1000 × 600 with no zero-size notice and reduced motion off", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const box = frame.root.querySelector(".shell")?.getBoundingClientRect();
    expect([box?.width, box?.height]).toEqual([1000, 600]);
    expect(state.lastNotice.value).toBeNull();
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
  });

  it("gives reduced motion when the test asks for it", async () => {
    await mountApp(fixtureModel("s-access"), { reducedMotion: true });
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
  });

  it("advances the clock to the settle of a motion", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const root = state.selection.value;
    const node = frame.root.querySelector(".qt-node.qt-selected, .qt-node");
    expect(root).not.toBeNull();
    const before = state.canvasState.value;
    node?.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    expect(state.canvasState.value).not.toBe(before);
    const camera = state.camera.value;
    frame.settle();
    expect(state.camera.value).not.toBe(camera);
  });

  it("records each host call", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const host = frame.host;
    await host.copyForAi("x");
    await host.openLink("https://example.com");
    await host.requestDisplayMode("fullscreen");
    expect(frame.calls.map((c) => c.name)).toEqual([
      "copyForAi",
      "openLink",
      "requestDisplayMode",
    ]);
  });
});
