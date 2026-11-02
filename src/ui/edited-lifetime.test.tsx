// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AppInput } from "./App";
import type { Canvas, CanvasOptions } from "./canvas/index";

// why: rule 8 — the test keeps each canvas and the options it was made with
const spy = vi.hoisted(() => ({
  canvases: [] as Canvas[],
  options: [] as CanvasOptions[],
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
const { memoryStorage, mountApp, pushEdit } = await import("./testFrame");
const { fixtureModel, LIGHT } = await import("./fixtureModel");
const { applyEdits } = await import("#engine");
const state = await import("./state");

const text = (el: Element | null | undefined) => el?.textContent ?? "";
const canvas = () => spy.canvases[spy.canvases.length - 1];
const lastModel = () => spy.options[spy.options.length - 1].model;
const title = (root: Element) =>
  text(root.querySelector(".inspector .insp-title strong"));
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

function step(work: () => void): void {
  const before = state.camera.value;
  void act(work);
  for (let i = 0; i < 1000 && state.camera.value === before; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
  if (state.camera.value === before) throw new Error("no settle");
}

function scope(root: Element) {
  const button = root.querySelector(".controls .ctl-btn") as HTMLElement;
  const menu = button.nextElementSibling as HTMLElement;
  if (menu.hidden) void act(() => button.click());
  return menu;
}

async function pressUndo(root: Element) {
  void act(() =>
    root.querySelector<HTMLElement>(".undo-toast button")?.click(),
  );
  await flush();
}

// why: SA §11 addendum 0.28 — the file records every storage call and every host call
const used: string[] = [];
const memory = memoryStorage();
const storage: Storage = {
  get length() {
    return memory.length;
  },
  key: (index) => memory.key(index),
  getItem: (key) => {
    used.push(`get ${key}`);
    return memory.getItem(key);
  },
  setItem: (key, value) => {
    used.push(`set ${key}`);
    memory.setItem(key, value);
  },
  removeItem: (key) => {
    used.push(`remove ${key}`);
    memory.removeItem(key);
  },
  clear: () => {
    used.push("clear");
    memory.clear();
  },
};
const hostCalls: unknown[][] = [];

async function edited(input: AppInput) {
  if (!input.ok) throw new Error("fatal");
  const frame = await mountApp(input, { storage });
  hostCalls.push(frame.calls);
  step(() => canvas().select("e:t_FCT_REVENUE"));
  expect(title(frame.root)).toBe("FCT_REVENUE");
  expect(state.editHistory.value.history.active()).toEqual([]);
  pushEdit({
    row: { record: "t_FCT_REVENUE" },
    column: "name",
    before: "FCT_REVENUE",
    after: "FCT_REVENUE_EU",
  });
  return { ...frame, input };
}

// why: rule 7 — the edit is still active, the inspector shows it, and the last canvas was made
// with the edited graph and the base hash (rule 8)
function kept(root: Element, input: Extract<AppInput, { ok: true }>) {
  expect(state.editHistory.value.history.active()).toHaveLength(1);
  expect(title(root)).toBe("FCT_REVENUE_EU");
  const model = lastModel();
  expect(model.hash).toBe(input.model.hash);
  expect(model.graph).not.toBe(input.model.graph);
  expect(model.graph).toBe(state.editedGraph.value);
  expect(model.vocab.entities.get("t_FCT_REVENUE")?.label).toBe(
    "FCT_REVENUE_EU",
  );
}

describe("S10 the edits stay through the actions that keep the input", () => {
  it("keeps them after a budget Undo, a layout change, a reset and a locale change", async () => {
    const { root, input, update } = await edited(fixtureModel("s-access"));
    if (!input.ok) throw new Error("fatal");
    const made = spy.options.length;
    step(() =>
      scope(root)
        .querySelectorAll<HTMLElement>('[role="menuitemradio"]')[2]
        .click(),
    );
    await pressUndo(root);
    expect(spy.options).toHaveLength(made + 1);
    kept(root, input);
    step(() => canvas().setLayout("atomic"));
    expect(state.canvasState.value?.layout).toBe("atomic");
    kept(root, input);
    step(() =>
      scope(root).querySelector<HTMLElement>('[role="menuitem"]')?.click(),
    );
    kept(root, input);
    const again = fixtureModel("s-access");
    const saved = state.settled.value;
    if (saved === null) throw new Error("no settle");
    await update({ input: again, start: saved, lang: "ja", locale: "ja-JP" });
    expect(spy.options).toHaveLength(made + 2);
    expect(state.shownInput.value).toBe(again);
    if (!again.ok) throw new Error("fatal");
    kept(root, again);
  });
});

describe("S11 a new dataset starts an empty history", () => {
  it("empties it for a new model input with no start", async () => {
    const { root, update } = await edited(fixtureModel("s-access"));
    expect(state.editHistory.value.history.active()).toHaveLength(1);
    const next = fixtureModel("s-access");
    if (!next.ok) throw new Error("fatal");
    await update({ input: next });
    expect(state.editHistory.value.history.active()).toEqual([]);
    expect(state.editedModel.value).toBe(next.model);
    expect(lastModel().graph).toBe(next.model.graph);
    step(() => canvas().select("e:t_FCT_REVENUE"));
    expect(title(root)).toBe("FCT_REVENUE");
  });

  it("empties it for a paste, and the Undo of the paste keeps it empty", async () => {
    const { root, update, input } = await edited(fixtureModel("s-access"));
    const star = fixtureModel("s-star");
    if (!star.ok) throw new Error("fatal");
    await update({ input: { ...star, source: "paste" } });
    expect(state.editHistory.value.history.active()).toEqual([]);
    expect(state.editedModel.value).toBe(star.model);
    await pressUndo(root);
    expect(state.shownInput.value).toBe(input);
    expect(state.editHistory.value.history.active()).toEqual([]);
    if (!input.ok) throw new Error("fatal");
    expect(lastModel().graph).toBe(input.model.graph);
    step(() => canvas().select("e:t_FCT_REVENUE"));
    expect(title(root)).toBe("FCT_REVENUE");
  });
});

describe("S15 the edited graph follows the date of the input", () => {
  it("keeps a valid_to edit between now and today not retired", async () => {
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const input = fixtureModel("q-full-vocabulary", LIGHT, "2026-01-01");
    if (!input.ok) throw new Error("fatal");
    expect(input.now).toBe("2026-01-01");
    await mountApp(input, { storage });
    const base = input.model.graph.triples.find(
      (tr) =>
        tr.subject === "ugrp-analysts" &&
        tr.predicate === "permissionedTo" &&
        tr.object === "tbl-orders",
    );
    if (base === undefined) throw new Error("no triple");
    expect([base.validTo, base.retired]).toEqual(["2026-12-31", false]);
    const change = {
      row: { triple: base.key },
      column: { fact: "valid_to" },
      before: "2026-12-31",
      after: "2026-06-30",
    };
    pushEdit(change);
    const at = input.model.graph.triples.indexOf(base);
    const triple = state.editedGraph.value?.triples[at];
    expect([triple?.validTo, triple?.retired]).toEqual(["2026-06-30", false]);
    const today = new Date().toISOString().slice(0, 10);
    expect(today).toBe("2026-10-29");
    const edits = [{ changes: [change], effect: { drew: [], undrew: [] } }];
    expect(
      applyEdits(input.model.graph, edits, today).triples[at].retired,
    ).toBe(true);
  });
});

describe("S11 nothing leaves the widget in this file", () => {
  it("writes no storage key and makes no host call", () => {
    expect(hostCalls.length).toBeGreaterThanOrEqual(3);
    expect(used.filter((call) => !call.startsWith("get "))).toEqual([]);
    expect(new Set(used).size).toBe(1);
    for (const calls of hostCalls) expect(calls).toEqual([]);
  });
});
