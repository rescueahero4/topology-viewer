// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { CanvasState } from "@qdic-topology/engine";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AppProps } from "./App";
import type { Camera, Canvas } from "./canvas/index";

const made = vi.hoisted(() => [] as Canvas[]);
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      const canvas = mod.createCanvas(...args);
      made.push(canvas);
      return canvas;
    },
  };
});

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
const { mountFrame } = await import("./testFrame");
const { fixtureModel } = await import("./fixtureModel");
const { App } = await import("./App");

const host = {
  copyForAi: () => Promise.resolve("copied" as const),
  openLink: () => Promise.resolve(),
  requestDisplayMode: () => Promise.resolve(),
};
const input = fixtureModel("s-access");
const mount = (root: HTMLElement, more: Partial<AppProps>) =>
  void act(() =>
    render(
      h(App, {
        input,
        lang: "en",
        locale: "en-US",
        theme: "light",
        host,
        ...more,
      }),
      root,
    ),
  );

type Saved = { state: CanvasState; camera: Camera };

const run = (work: () => void) => {
  void act(work);
  for (let i = 0; i < 200; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
};

// why: STORY-003-06a decisions item 1 — the test gives `view` as an own property
const mouse = (type: string, x: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 300,
    buttons: 1,
  });
  Object.defineProperty(event, "view", { value: window });
  return event;
};

const drawn = (root: Element) => ({
  ids: [...root.querySelectorAll("g.qt-node")].map(
    (g) => (g as unknown as { __data__: { id: string } }).__data__.id,
  ),
  nodes: [...root.querySelectorAll("g.qt-node")].map((el) =>
    el.getAttribute("transform"),
  ),
  viewport: root.querySelector("g.qt-viewport")?.getAttribute("transform"),
});

describe("S7 <App> with start from the last settle", () => {
  it("waits for a size, then draws the same set, positions and camera", () => {
    let saved: Saved | undefined;
    const first = mountFrame();
    mount(first.root, {
      onSettle: (state, camera) => {
        saved = { state, camera };
      },
    });
    run(() => {});
    run(() => made[made.length - 1].expand("e:u_0"));
    const node = first.root.querySelectorAll("g.qt-node")[1];
    run(() => {
      node.dispatchEvent(mouse("mousedown", 100));
      window.dispatchEvent(mouse("mousemove", 150));
      window.dispatchEvent(mouse("mouseup", 150));
    });
    const before = drawn(first.root);
    expect(saved).toBeDefined();
    expect(saved?.state.positions.length ?? 0).toBeGreaterThan(7);
    void act(() => render(null, first.root));
    const count = made.length;
    const second = mountFrame({ size: { width: 0, height: 0 } });
    mount(second.root, { start: saved });
    run(() => {});
    expect(made).toHaveLength(count);
    expect(second.root.querySelector("svg")).toBeNull();
    second.resize({ width: 1000, height: 600 });
    run(() => {});
    expect(made).toHaveLength(count + 1);
    expect(drawn(second.root)).toEqual(before);
  });
});
