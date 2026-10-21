// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AppInput } from "./App";
import type { Canvas } from "./canvas/index";

// why: S11 — the real canvas, kept so the test can turn the types off
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
const { stats } = await import("@qdic-topology/engine");
const { mountApp } = await import("./testFrame");
const { appInput, fixtureModel } = await import("./fixtureModel");
const state = await import("./state");
const { t } = await import("./strings/index");

const TYPES = { t0: { label: "T0", rank: 0 } };
const NODES = [
  { id: "n0", type: "t0" },
  { id: "n1", type: "t0" },
];
const graph = (extra: Record<string, unknown>) => () =>
  appInput({ types: TYPES, nodes: NODES, ...extra });
// why: the Givens table of the story — every catalog code once, in one mounted App
const NOTICE_INPUTS: (() => AppInput)[] = [
  () => fixtureModel("s-not-graph"),
  () => fixtureModel("s-invalid"),
  () => appInput({ types: TYPES, nodes: NODES, edges: {} }),
  () => fixtureModel("s-noid-all"),
  () => fixtureModel("s-stress"),
  () => appInput({ items: [{ name: "a" }], shape: { kind: "graph" } }),
  () => fixtureModel("s-empty"),
  () => fixtureModel("s-edges-only"),
];
const CHIP_INPUTS: (() => AppInput)[] = [
  ...["s-access", "s-noid-some", "s-dirty", "s-badroot"].map(
    (key) => () => fixtureModel(key),
  ),
  () => appInput({ nodes: [{ from: "a", to: "b" }] }),
  graph({ types: { t0: { ...TYPES.t0, glyph: "M0 0 <x>" } } }),
  graph({ types: { t0: { ...TYPES.t0, color: "c".repeat(65) } } }),
  graph({ types: { t0: { ...TYPES.t0, rank: 7 } } }),
  graph({ view: { layout: "radial" } }),
  graph({ view: { budget: 30 } }),
  graph({ schemaVersion: "2" }),
  graph({ nodes: [{ ...NODES[0], _inferred: "yes" }, NODES[1]] }),
  graph({ title: "t" }),
  graph({ view: { root: "n0", reveal: ["n9"] } }),
  graph({ nodes: [{ ...NODES[0], label: 5 }, NODES[1]] }),
];

const click = (el: Element | null | undefined) =>
  void act(() => (el as HTMLElement).click());
const chip = (root: Element) => root.querySelector(".data-notice");
const wait = (ms: number) =>
  void act(() => {
    vi.advanceTimersByTime(ms);
  });
function step(work: () => void): void {
  const before = state.camera.value;
  void act(work);
  for (let i = 0; i < 1000 && state.camera.value === before; i++) wait(16);
}
function scope(root: Element) {
  const button = root.querySelector(".controls .ctl-btn") as HTMLElement;
  const menu = button.nextElementSibling as HTMLElement;
  if (menu.hidden) click(button);
  return menu;
}

function typesOff(off: (type: string | null) => boolean): void {
  const now = state.model.value;
  const at = state.canvasState.value;
  if (now === null || at === null) throw new Error("no canvas");
  const made = spy.canvases[spy.canvases.length - 1];
  for (const row of stats(now.vocab, at).types)
    if (off(row.type))
      step(() =>
        made.setFilters({ kind: "toggleType", type: row.type, on: false }),
      );
}

describe("S11 the host port only on a press", () => {
  it("has no host call before the copy press and one after it", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const codes = new Set<string>();
    const read = () => {
      const code = frame.root.querySelector(".notice-details code");
      if (code?.textContent) codes.add(code.textContent);
    };
    for (const given of NOTICE_INPUTS) {
      await frame.update({ input: given() });
      read();
    }
    await frame.update({ input: fixtureModel("s-access") });
    typesOff(() => true);
    read();
    await frame.update({ input: fixtureModel("s-access") });
    typesOff((type) => ["table", "user_group", "user"].includes(type ?? ""));
    read();
    frame.resize({ width: 0, height: 0 });
    await frame.update({ input: fixtureModel("s-access") });
    read();
    frame.resize({ width: 800, height: 600 });
    expect(codes.size).toBe(11);
    for (const given of CHIP_INPUTS) {
      await frame.update({ input: given() });
      click(chip(frame.root)?.querySelector(".dn-toggle"));
      expect(chip(frame.root)?.querySelector(".dn-body li")).not.toBeNull();
    }
    await frame.update({ input: fixtureModel("s-noid-some") });
    click(chip(frame.root)?.querySelector(".dn-head .icon-btn"));
    step(() =>
      scope(frame.root)
        .querySelectorAll<HTMLElement>('[role="menuitemradio"]')[2]
        .click(),
    );
    expect(frame.root.querySelector(".undo-toast")).not.toBeNull();
    wait(10_000);
    expect(frame.root.querySelector(".undo-toast")).toBeNull();
    expect(frame.calls).toEqual([]);
    click(scope(frame.root).lastElementChild);
    click(chip(frame.root)?.querySelector(".dn-toggle"));
    click(chip(frame.root)?.querySelector(".dn-body .btn"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(frame.calls.map((call) => call.name)).toEqual(["copyForAi"]);
    click(chip(frame.root)?.querySelector(".dn-head .icon-btn"));
    const item = scope(frame.root).lastElementChild;
    expect(item?.textContent).toBe(t("en", "chip.reopen"));
    click(item);
    expect(chip(frame.root)).not.toBeNull();
    wait(5000);
    expect(frame.calls.map((call) => call.name)).toEqual(["copyForAi"]);
  });
});
