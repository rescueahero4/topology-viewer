// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent } from "./canvas/index";

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

// why: STORY-003-04 fake clock, STORY-004-02 rule 15 — the clock comes before `d3-timer` loads;
// the wall clock of the timing is `process.hrtime`, which the fake clock does not replace
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
const state = await import("./state");

// why: S15, LEARNINGS 24 — the limit is at least 2 times the time of the runs under full-suite
// load with parallel agents (ISSUE-018: up to 75 ms); the median of the rounds is read
const LIMIT_MS = 150;
const ROUNDS = 21;

type Settle = CanvasEvent["settle"];
const ms = (from: bigint) => Number(process.hrtime.bigint() - from) / 1e6;

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

describe("S15 one settle update of the Canvas column", () => {
  it("stays below the limit at 6,000 rows", async () => {
    const settles: Settle[] = [];
    const feed = state.feed.settle;
    vi.spyOn(state.feed, "settle").mockImplementation((event) => {
      settles.push(event);
      feed(event);
    });
    const frame = await mountApp(appInput(generate.random(2000, 4000, 1)));
    const { root } = frame;
    const dataset = [...root.querySelectorAll<HTMLElement>("button")].find(
      (b) => b.textContent === "Dataset",
    );
    run(() => dataset?.click());
    const scroll = root.querySelector(".wb-scroll") as HTMLElement;
    frame.sizeOf(scroll, { width: 800, height: 600 });
    scroll.scrollTop = 108_000;
    void act(() => void scroll.dispatchEvent(new Event("scroll")));
    const before = settles[settles.length - 1];
    const drawn = state.frontier.value?.nodes.map((node) => node.id) ?? [];
    const canvas = spy.canvases[spy.canvases.length - 1];
    run(() => canvas.hide(drawn.slice(1)));
    const after = settles[settles.length - 1];
    expect(after).not.toBe(before);
    const eyes = () =>
      [...root.querySelectorAll(".wb-table tbody tr.row .oc")].map((el) =>
        el.getAttribute("class"),
      );
    const times: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const next = i % 2 === 0 ? before : after;
      const from = process.hrtime.bigint();
      void act(() =>
        state.feed.settle({ ...next, frontier: { ...next.frontier } }),
      );
      times.push(ms(from));
      expect(eyes().length).toBeGreaterThan(0);
      expect(eyes().length).toBeLessThanOrEqual(37);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(ROUNDS / 2)];
    console.info(`S15 settle update: median ${median.toFixed(1)} ms`, times);
    expect(median).toBeLessThan(LIMIT_MS);
  }, 120_000);
});
