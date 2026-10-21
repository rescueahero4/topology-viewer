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
const { typeMark } = await import("@qdic-topology/renderer");
const { rendererText } = await import("./rendererText");
const state = await import("./state");

const canvas = () => spy.canvases[spy.canvases.length - 1];
const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const card = (root: Element) => root.querySelector(".inspector") as HTMLElement;
const rowsOf = (root: Element) => [
  ...card(root).querySelectorAll<HTMLElement>(".triple"),
];
const buttons = (root: Element) =>
  [...card(root).querySelectorAll<HTMLElement>(".insp-bar .icon-btn")].filter(
    (el) => !el.hasAttribute("aria-expanded"),
  );
const names = (root: Element) =>
  buttons(root).map((el) => el.getAttribute("aria-label"));
const button = (root: Element, name: string) =>
  buttons(root).find((el) => el.getAttribute("aria-label") === name);
const notes = (root: Element) => [
  ...card(root).querySelectorAll<HTMLElement>(".bucket-note"),
];
const noteButton = (note: Element) =>
  note.querySelector("button") as HTMLElement;

const AROUND = "Group neighbours by type around this node";
const HIDE = "Hide from canvas";
const CLEAR = "Clear selection and fit view";
const CENTER = "Center the atomic layout on this node";

function groupOf(type: string) {
  const node = state.frontier.value?.nodes.find(
    (n) => "members" in n && n.type === type,
  );
  if (node === undefined) throw new Error(`no ${type} group`);
  return node;
}

describe("S5 group ends and a selected group node", () => {
  it("names the groups, expands from the arrow and shows the group card", async () => {
    const input = fixtureModel("s-star");
    const { root } = await mountApp(input);
    if (!input.ok) throw new Error("fatal");
    const label = (type: string, count: number) =>
      rendererText("en").groupLabel(type, count);
    const tables = groupOf("table");
    const columns = groupOf("column");
    const ends = rowsOf(root).map((row) => text(row.querySelector(".s")));
    expect(ends).toContain(label("Table", 300));
    expect(ends).toContain(label("Column", 12));
    const expand = vi.spyOn(canvas(), "expand").mockImplementation(() => {});
    const row = rowsOf(root).find(
      (r) => text(r.querySelector(".s")) === label("Table", 300),
    );
    void act(() => row?.querySelector<HTMLElement>(".goto")?.click());
    expect(expand.mock.calls).toEqual([[tables.id]]);
    run(() => canvas().select(columns.id));
    const head = card(root).querySelector(".insp-head") as HTMLElement;
    const { vocab } = input.model;
    const mark = typeMark(vocab.types.get("column")?.visual ?? null, 16, null);
    expect(head.querySelector(".glyph svg")?.outerHTML).toBe(mark.outerHTML);
    expect(text(head.querySelector(".insp-title strong"))).toBe(
      label("Column", 12),
    );
    expect(text(head.querySelector(".hops"))).toBe("1e 1n");
    const facts = card(root).querySelector(".facts") as HTMLElement;
    expect([...facts.querySelectorAll("dt")].map(text)).toEqual(["Type"]);
    expect([...facts.querySelectorAll("dd")].map(text)).toEqual(["Column"]);
    expect(text(card(root))).not.toContain("Write access");
    expect(notes(root)).toHaveLength(1);
    expect(text(notes(root)[0])).toMatch(/^12 similar columns collapsed\./);
    void act(() => noteButton(notes(root)[0]).click());
    expect(text(noteButton(notes(root)[0]))).toBe("Expand");
    expect(expand.mock.calls).toEqual([[tables.id], [columns.id]]);
  });
});

describe("S6 the member note", () => {
  it("collapses the expanded group of the member", async () => {
    const group = 'g:["a3","derivedFrom",">","table"]';
    const { root } = await mountApp(fixtureModel("s-islands"));
    run(() => canvas().expand(group));
    run(() => canvas().select("e:a1"));
    const member = notes(root).find((n) =>
      text(n).startsWith("Expanded from a group of similar nodes."),
    );
    expect(member).toBeDefined();
    const collapse = vi.spyOn(canvas(), "collapse");
    run(() => noteButton(member as Element).click());
    expect(collapse.mock.calls).toEqual([[group]]);
  });
});

describe("S7 the +N and the − notes", () => {
  it("shows, then collapses what the node brought in", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const { root } = frame;
    run(() => canvas().select("e:u_0"));
    const expand = vi.spyOn(canvas(), "expand");
    const collapse = vi.spyOn(canvas(), "collapse");
    const more = notes(root)[0];
    expect(text(more.querySelector(".more-chip"))).toBe("+4");
    expect(text(more)).toContain(
      "4 more connections in the dataset aren’t drawn yet. Double-click the node to show them.",
    );
    expect(text(noteButton(more))).toBe("Show");
    void act(() => noteButton(more).click());
    expect(expand.mock.calls).toEqual([["e:u_0"]]);
    frame.settle();
    const opened = notes(root)[0];
    expect(text(opened.querySelector(".more-chip.open"))).toBe("−");
    expect(text(opened)).toContain("Expanded here.");
    expect(text(noteButton(opened))).toBe("Collapse");
    void act(() => noteButton(opened).click());
    expect(collapse.mock.calls).toEqual([["e:u_0"]]);
  });
});

describe("S9 the header actions by layout", () => {
  it("shows Center here only in Atomic and Group around root only outside a tree", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    expect(state.canvasState.value?.layout).toBe("force");
    expect(names(root)).toEqual([AROUND, HIDE, CLEAR]);
    run(() => canvas().setLayout("atomic"));
    expect(names(root)).toEqual([CENTER, AROUND, HIDE, CLEAR]);
    const center = button(root, CENTER) as HTMLElement;
    expect(center.hasAttribute("aria-pressed")).toBe(false);
    const setLayout = vi.spyOn(canvas(), "setLayout");
    run(() => center.click());
    expect(setLayout.mock.calls).toEqual([["atomic"]]);
    run(() => canvas().setLayout("tree-h"));
    expect(names(root)).toEqual([HIDE, CLEAR]);
  });
});

describe("S10 Group around root, Hide and Clear", () => {
  it("toggles the grouping, hides the node and clears then fits", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const around = vi.spyOn(canvas(), "groupAroundRoot");
    expect(button(root, AROUND)?.getAttribute("aria-pressed")).toBe("false");
    run(() => button(root, AROUND)?.click());
    expect(around.mock.calls).toEqual([[true]]);
    expect(button(root, AROUND)?.getAttribute("aria-pressed")).toBe("true");
    run(() => button(root, AROUND)?.click());
    expect(around.mock.calls).toEqual([[true], [false]]);
    expect(button(root, AROUND)?.getAttribute("aria-pressed")).toBe("false");
    run(() => canvas().select("e:u_7"));
    const hide = vi.spyOn(canvas(), "hide");
    run(() => button(root, HIDE)?.click());
    expect(hide.mock.calls).toEqual([[["e:u_7"]]]);
    run(() => canvas().select("e:t_FCT_REVENUE"));
    const select = vi.spyOn(canvas(), "select");
    const fit = vi.spyOn(canvas(), "fit");
    run(() => button(root, CLEAR)?.click());
    expect(select.mock.calls).toEqual([[null]]);
    expect(fit).toHaveBeenCalledTimes(1);
    expect(select.mock.invocationCallOrder[0]).toBeLessThan(
      fit.mock.invocationCallOrder[0],
    );
  });
});

describe("S11 the only drawn node", () => {
  it("has no relationships and a disabled Hide", async () => {
    const { root } = await mountApp(fixtureModel("s-root-only"));
    expect(text(card(root).querySelector(".none-note"))).toBe(
      "No relationships.",
    );
    expect(rowsOf(root)).toHaveLength(0);
    expect(text(card(root).querySelector(".hops"))).toBe("0e 0n");
    expect(button(root, HIDE)?.hasAttribute("disabled")).toBe(true);
    expect(button(root, CLEAR)?.hasAttribute("disabled")).toBe(false);
  });
});
