// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import {
  firstView,
  type CanvasState,
  type Frontier,
} from "@qdic-topology/engine";
import { describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent } from "./canvas/index";

// why: S27 — a stub canvas that sends the events of the test; every other row uses the real one
const stub = vi.hoisted(() => ({
  on: false,
  handlers: new Map<string, (event: unknown) => void>(),
}));
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      if (!stub.on) return mod.createCanvas(...args);
      return {
        on: (name: string, handler: (event: unknown) => void) => {
          stub.handlers.set(name, handler);
          return () => stub.handlers.delete(name);
        },
      } as unknown as Canvas;
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
const { mountApp } = await import("./testFrame");
const { fixtureModel } = await import("./fixtureModel");
const state = await import("./state");

const countsOf = (warnings: { code: string; count: number }[]) =>
  Object.fromEntries(warnings.map((w) => [w.code, w.count]));
const roots = (el: Element) => el.querySelectorAll(".qt-root");

describe("S1 the JSX setting", () => {
  it("renders a component into jsdom with act", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    expect(frame.root.querySelector("main.canvas")).not.toBeNull();
  });
});

describe("S2 to S4 the App and its canvas", () => {
  it("S2 mounts s-access and feeds the signals", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const container = frame.root.querySelector(".graph-canvas");
    expect(container?.children).toHaveLength(1);
    expect(roots(frame.root)).toHaveLength(1);
    expect(state.selection.value).toEqual({ node: "e:t_FCT_REVENUE" });
    expect(state.frontier.value?.nodes).toHaveLength(7);
    expect(state.canvasState.value?.approach).toBe("active");
    expect(state.lastNotice.value).toBeNull();
    expect(countsOf(state.warnings.value)).toEqual({
      "dangling-edge": 9,
      "constraint-violation": 2,
    });
    const shell = frame.root.querySelector(".shell");
    expect(shell?.getAttribute("data-theme")).toBe("light");
    await frame.update({ theme: "dark" });
    expect(shell?.getAttribute("data-theme")).toBe("dark");
    expect(roots(frame.root)).toHaveLength(1);
  });

  it("S3 a new input makes a new canvas", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const old = frame.root.querySelector(".qt-root");
    await frame.update({ input: fixtureModel("s-star") });
    expect(old?.isConnected).toBe(false);
    expect(roots(document.body)).toHaveLength(1);
    expect(state.selection.value).toEqual({ node: "e:tag_pii" });
    expect(state.frontier.value?.nodes).toHaveLength(4);
  });

  it("S4 an unmount ends the canvas and stops the signals", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const container = frame.root.querySelector(".graph-canvas");
    frame.unmount();
    expect(container?.isConnected).toBe(false);
    expect(roots(document.body)).toHaveLength(0);
    const before = state.canvasState.value;
    vi.advanceTimersByTime(5_000);
    expect(state.canvasState.value).toBe(before);
  });
});

describe("S5 a fatal input", () => {
  it("draws no canvas and keeps the selection and frontier empty", async () => {
    const input = fixtureModel("s-invalid");
    expect(input.ok ? null : input.fatal.code).toBe("nodes-not-array");
    const frame = await mountApp(input);
    expect(frame.root.querySelector(".graph-canvas")).toBeNull();
    expect(roots(frame.root)).toHaveLength(0);
    expect(state.selection.value).toBeNull();
    expect(state.frontier.value).toBeNull();
  });
});

describe("S9 the untyped node in ja", () => {
  it("shows the ja Unknown text on s-dirty", async () => {
    const frame = await mountApp(fixtureModel("s-dirty"), { lang: "ja" });
    const texts = [...frame.root.querySelectorAll(".qt-root text")].map(
      (el) => el.textContent,
    );
    expect(texts.join("|")).toContain("不明");
    expect(texts.join("|")).not.toContain("Unknown");
  });
});

describe("S22 the full warning list", () => {
  it("has the resolveVocab issues of s-dirty", () => {
    const input = fixtureModel("s-dirty");
    expect(input.ok && countsOf(input.warnings)).toEqual({
      "no-id": 1,
      "duplicate-id": 1,
      "dangling-edge": 3,
      "unknown-type": 1,
    });
  });
});

describe("S27 canvasState from each event", () => {
  // why: STORY-004-03 — the controls read the state, so each state of the stub is a real state
  // (the first view of s-access) with its own `seq`
  const stateOf = (seq: number): CanvasState => {
    const input = fixtureModel("s-access");
    if (!input.ok) throw new Error("fatal");
    const { graph, vocab, payload, hash } = input.model;
    return { ...firstView(graph, vocab, payload, hash), seq };
  };
  const send = <K extends keyof CanvasEvent>(name: K, event: CanvasEvent[K]) =>
    stub.handlers.get(name)?.(event);

  it("takes the state of select, explore and drag-end, and the rest from settle", async () => {
    stub.on = true;
    try {
      await mountApp(fixtureModel("s-access"));
      const [a, b, c, d] = [1, 2, 3, 4].map(stateOf);
      const firstFrontier = state.frontier.value;
      const firstCamera = state.camera.value;
      send("select", { selection: { node: "e:x" }, state: a });
      expect(state.canvasState.value).toBe(a);
      send("explore", { action: { kind: "select", node: null }, state: b });
      expect(state.canvasState.value).toBe(b);
      send("drag-end", { state: c });
      expect(state.canvasState.value).toBe(c);
      expect(state.frontier.value).toBe(firstFrontier);
      expect(state.camera.value).toBe(firstCamera);
      const frontier = { nodes: [], edges: [] } as unknown as Frontier;
      const camera = { k: 2, x: 1, y: 1 };
      send("settle", { state: d, frontier, camera });
      expect(state.canvasState.value).toBe(d);
      expect(state.frontier.value).toBe(frontier);
      expect(state.camera.value).toBe(camera);
    } finally {
      stub.on = false;
    }
  });
});
