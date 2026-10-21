// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AppInput } from "./App";
import type { Canvas, CanvasOptions } from "./canvas/index";

// why: S12 to S24 — the real canvas; the test keeps each canvas and the options it was made with
const spy = vi.hoisted(() => ({
  canvases: [] as Canvas[],
  options: [] as unknown[],
}));
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      spy.options.push(args[1]);
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
const state = await import("./state");

const text = (el: Element | null | undefined) => el?.textContent ?? "";
const click = (el: Element | null | undefined) =>
  void act(() => (el as HTMLElement).click());
const canvas = () => spy.canvases[spy.canvases.length - 1];
const toast = (root: Element) => root.querySelector(".undo-toast");
const undoButton = (root: Element) => toast(root)?.querySelector("button");
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
const wait = (ms: number) =>
  void act(() => {
    vi.advanceTimersByTime(ms);
  });

function step(work: () => void): void {
  const before = state.camera.value;
  void act(work);
  for (let i = 0; i < 1000 && state.camera.value === before; i++) wait(16);
  if (state.camera.value === before) throw new Error("no settle");
}

// why: rule 6 — what Undo must give back: the drawn ids, the positions and the camera
function view() {
  return {
    ids: (state.frontier.value?.nodes ?? []).map((node) => node.id).sort(),
    positions: state.canvasState.value?.positions,
    camera: state.camera.value,
  };
}

function scope(root: Element) {
  const button = root.querySelector(".controls .ctl-btn") as HTMLElement;
  const menu = button.nextElementSibling as HTMLElement;
  if (menu.hidden) click(button);
  return menu;
}
const pickBudget = (root: Element, index: number) =>
  step(() =>
    scope(root)
      .querySelectorAll<HTMLElement>('[role="menuitemradio"]')
      [index].click(),
  );
const pressReset = (root: Element) =>
  step(() =>
    scope(root).querySelector<HTMLElement>('[role="menuitem"]')?.click(),
  );

async function pressUndo(root: Element) {
  click(undoButton(root));
  await flush();
}

describe("S12 and S18 the Undo of a budget change", () => {
  it("brings back the frontier, the positions and the camera", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const before = view();
    const saved = state.settled.value;
    pickBudget(frame.root, 2);
    expect(view().ids).not.toEqual(before.ids);
    const stack = frame.root.querySelector(".status-stack");
    expect(toast(frame.root)?.parentElement).toBe(stack);
    const children = [...(stack?.children ?? [])];
    expect(children.indexOf(toast(frame.root) as Element)).toBeGreaterThan(
      children.indexOf(stack?.querySelector(".data-notice") as Element),
    );
    expect(stack?.querySelector(".data-notice")).not.toBeNull();
    expect(toast(frame.root)?.getAttribute("aria-live")).toBe("polite");
    expect(text(toast(frame.root)?.querySelector(".ut-txt"))).toBe(
      "View reset",
    );
    expect(
      [...(toast(frame.root)?.querySelectorAll("button") ?? [])].map(text),
    ).toEqual(["Undo"]);
    wait(9000);
    expect(toast(frame.root)).not.toBeNull();
    const made = spy.options.length;
    await pressUndo(frame.root);
    expect(toast(frame.root)).toBeNull();
    expect(spy.options).toHaveLength(made + 1);
    const options = spy.options[made] as CanvasOptions;
    expect(options.state).toBe(saved?.state);
    expect(options.camera).toBe(saved?.camera);
    expect(view()).toEqual(before);
    expect(frame.calls).toEqual([]);
  });
});

describe("S13 the toast ends", () => {
  it("closes at 10 s, and a model input closes it and shows none", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const start = Date.now();
    pickBudget(frame.root, 0);
    wait(start + 9999 - Date.now());
    expect(toast(frame.root)).not.toBeNull();
    wait(1);
    expect(toast(frame.root)).toBeNull();
    pressReset(frame.root);
    expect(toast(frame.root)).not.toBeNull();
    await frame.update({ input: fixtureModel("s-star") });
    expect(toast(frame.root)).toBeNull();
    wait(1000);
    expect(toast(frame.root)).toBeNull();
  });
});

describe("S14 the Undo of a pasted input", () => {
  it("brings back the earlier input with its explored state", async () => {
    const first = fixtureModel("s-access");
    const frame = await mountApp(first);
    const start = view();
    step(() => canvas().expand("e:ug_analytics"));
    const explored = view();
    expect(explored.ids).not.toEqual(start.ids);
    const star = fixtureModel("s-star");
    if (!star.ok) throw new Error("fatal");
    const paste: AppInput = { ...star, source: "paste" };
    await frame.update({ input: paste });
    expect(state.model.value).toBe(paste.ok && paste.model);
    expect(text(toast(frame.root)?.querySelector(".ut-txt"))).toBe(
      "View reset",
    );
    await pressUndo(frame.root);
    expect(state.model.value).toBe(first.ok && first.model);
    expect(state.warnings.value).toBe(first.ok && first.warnings);
    expect(view()).toEqual(explored);
    expect(toast(frame.root)).toBeNull();
  });
});

// why: ISSUE-012 C12 (SA §10 guardrail 6, FR-CANVAS-18) — a pasted input that is fatal also keeps
// the way back; a fatal input from the model closes the toast
describe("C12 the Undo of a pasted fatal input", () => {
  it("brings back the earlier chart within 10 s", async () => {
    const first = fixtureModel("s-access");
    const frame = await mountApp(first);
    const before = view();
    const bad = fixtureModel("s-not-graph");
    if (bad.ok) throw new Error("not fatal");
    await frame.update({ input: { ...bad, source: "paste" } });
    expect(state.model.value).toBeNull();
    expect(frame.root.querySelector(".graph")).toBeNull();
    wait(9000);
    expect(text(toast(frame.root)?.querySelector(".ut-txt"))).toBe(
      "View reset",
    );
    await pressUndo(frame.root);
    wait(1000);
    expect(state.model.value).toBe(first.ok && first.model);
    expect(view()).toEqual(before);
    expect(toast(frame.root)).toBeNull();
    await frame.update({ input: bad });
    expect(toast(frame.root)).toBeNull();
  });
});

describe("S23 a new trigger replaces the snapshot", () => {
  it("gives the state after the explore, not before budget 50", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const first = view();
    pickBudget(frame.root, 2);
    const atBudget = view();
    // why: the story marks 11 as a model value — the entities that the explore adds and that
    // were neither drawn nor members of a drawn group
    const seen = new Set(
      (state.frontier.value?.nodes ?? []).flatMap((n) =>
        "entity" in n ? [n.entity] : n.members,
      ),
    );
    step(() => canvas().expand("e:ug_analytics"));
    const added = (state.frontier.value?.nodes ?? []).filter(
      (n) => "entity" in n && !seen.has(n.entity),
    );
    expect(added).toHaveLength(11);
    const explored = view();
    expect(explored.ids).not.toEqual(atBudget.ids);
    pressReset(frame.root);
    expect(frame.root.querySelectorAll(".undo-toast")).toHaveLength(1);
    await pressUndo(frame.root);
    expect(view()).toEqual(explored);
    expect(view().ids).not.toEqual(first.ids);
  });
});

describe("S24 the Undo in a 0 × 0 container", () => {
  it("makes the new canvas at the first size above 0 × 0", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const before = view();
    const saved = state.settled.value;
    pickBudget(frame.root, 2);
    frame.resize({ width: 0, height: 0 });
    const made = spy.options.length;
    await pressUndo(frame.root);
    expect(spy.options).toHaveLength(made);
    expect(toast(frame.root)).toBeNull();
    frame.resize({ width: 800, height: 600 });
    await flush();
    expect(spy.options).toHaveLength(made + 1);
    const options = spy.options[made] as CanvasOptions;
    expect(options.state).toBe(saved?.state);
    expect(options.camera).toBe(saved?.camera);
    expect(view()).toEqual(before);
    frame.resize({ width: 700, height: 500 });
    await flush();
    expect(spy.options).toHaveLength(made + 1);
  });
});
