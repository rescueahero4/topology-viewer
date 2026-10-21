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
const { appInput } = await import("./fixtureModel");
const { generate } = await import("@qdic-topology/fixtures");

const ROW_H = 36;

describe("S14 the window of rows at 6,000 rows", () => {
  it("draws at most 37 data rows between two spacer rows", async () => {
    const frame = await mountApp(appInput(generate.random(2000, 4000, 1)));
    const { root } = frame;
    const dataset = [...root.querySelectorAll<HTMLElement>("button")].find(
      (b) => b.textContent === "Dataset",
    );
    void act(() => dataset?.click());
    expect(root.querySelector(".wb-count")?.textContent).toMatch(
      /^6,000 rows · /,
    );
    const scroll = root.querySelector(".wb-scroll") as HTMLElement;
    frame.sizeOf(scroll, { width: 800, height: 600 });
    scroll.scrollTop = (6000 * ROW_H) / 2;
    void act(() => void scroll.dispatchEvent(new Event("scroll")));
    const body = root.querySelector(".wb-table tbody") as HTMLElement;
    const data = body.querySelectorAll("tr.row");
    const pads = [...body.querySelectorAll<HTMLElement>("tr.wb-pad")];
    expect(data.length).toBeGreaterThan(17);
    expect(data.length).toBeLessThanOrEqual(Math.ceil(600 / ROW_H) + 20);
    expect(pads).toHaveLength(2);
    expect(body.children).toHaveLength(data.length + 2);
    const spacers = pads.map((pad) =>
      Number.parseFloat((pad.firstElementChild as HTMLElement).style.height),
    );
    expect(spacers[0] + spacers[1] + data.length * ROW_H).toBe(6000 * ROW_H);
    expect(spacers[0]).toBe((3000 - 10) * ROW_H);
  });
});
