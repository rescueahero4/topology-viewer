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
const { appInput, fixtureModel } = await import("./fixtureModel");

// why: ISSUE-012 C5 — the STORY-004-07 QA plants y1, y2, y3, y9, y11 and y25 (memo
// 2026-10-21-qa-story-07-done-gate.md item 6); C1 the two table tips; C7 the provenance tags

const canvas = () => spy.canvases[spy.canvases.length - 1];
const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const press = (el: Element) =>
  run(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const hover = (el: Element) =>
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
const tips = (root: Element) =>
  [...root.querySelectorAll('[role="tooltip"]')].map(text);
const button = (root: Element, name: string) => {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => text(b) === name || b.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};
const seg = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".seg button")].find((b) =>
    text(b).startsWith(name),
  ) as HTMLElement;
const check = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".check-item .check")].find((el) =>
    text(el).startsWith(name),
  ) as HTMLElement;
const count = (root: Element) => text(root.querySelector(".wb-count"));
const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".wb-table tbody tr.row"),
];
const heads = (root: Element) =>
  [...root.querySelectorAll(".wb-table thead th")].map((th) => text(th));
const cell = (root: Element, row: Element, column: string) =>
  row.children[heads(root).indexOf(column)] as HTMLElement;
const rowById = (root: Element, id: string) =>
  rows(root).find((row) => text(cell(root, row, "ID")) === id) as HTMLElement;

function type(root: Element, value: string): void {
  const input = root.querySelector(".wb-search") as HTMLInputElement;
  void act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  void act(() => {
    vi.advanceTimersByTime(200);
  });
}

async function opened() {
  const input = fixtureModel("s-access");
  if (!input.ok) throw new Error("fatal");
  const frame = await mountApp(input);
  press(button(frame.root, "Dataset"));
  const { graph, vocab } = input.model;
  const owner = new Map(
    graph.entities.flatMap((e) => e.records.map((r) => [r, e.id] as const)),
  );
  const typeOf = (record: string) =>
    vocab.entities.get(owner.get(record) ?? "")?.type;
  return { ...frame, graph, vocab, typeOf };
}

const TAIL = " of 1,262 rows · 7 of 483 nodes on canvas";

describe("y1, y2 Kind and Family under Both", () => {
  it("Kind holds back node rows only, and Family edge rows only", async () => {
    const { root, graph, vocab, typeOf } = await opened();
    const users = graph.records.filter((r) => typeOf(r.id) === "user");
    press(button(root, "Kind"));
    press(check(root, "User"));
    expect(count(root)).toBe(`${users.length + graph.triples.length}${TAIL}`);
    press(button(root, "Clear"));
    press(button(root, "Family"));
    press(check(root, "Ownership & Access"));
    const access = graph.triples.filter(
      (tr) =>
        vocab.predicates.get(tr.predicate)?.family === "Ownership & Access",
    );
    expect(count(root)).toBe(`${graph.records.length + access.length}${TAIL}`);
  });
});

describe("y3 the search reads the labels of both ends", () => {
  it("finds an edge row by the label of an end only", async () => {
    const { root, graph, vocab } = await opened();
    press(seg(root, "Edges"));
    type(root, "aiko");
    const label = (id: string) => vocab.entities.get(id)?.label ?? id;
    const hits = graph.triples.filter((tr) =>
      [label(tr.subject), label(tr.object)].some((s) =>
        s.toLowerCase().includes("aiko"),
      ),
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const tr of hits)
      expect(`${tr.subject}${tr.object}`.toLowerCase()).not.toContain("aiko");
    expect(count(root)).toBe(`${hits.length}${TAIL}`);
  });
});

describe("y9 the empty text of the Hidden scope", () => {
  it("names the filters when something is hidden and no row matches", async () => {
    const { root } = await opened();
    run(() => canvas().hide(["e:u_0"]));
    press(seg(root, "Hidden"));
    type(root, "zzzz");
    expect(text(root.querySelector(".wb-empty"))).toBe(
      "No rows match these filters.",
    );
  });
});

describe("y11 an edge row with two hidden ends", () => {
  it("restores the Hidden entry of each end in one call", async () => {
    const { root } = await opened();
    run(() => canvas().hide(["e:u_0"]));
    run(() => canvas().hide(["e:t_FCT_REVENUE"]));
    type(root, "t_FCT_REVENUE · ownedBy · u_0");
    const restore = vi.spyOn(canvas(), "restore");
    press(cell(root, rowById(root, "t_FCT_REVENUE · ownedBy · u_0"), "Name"));
    expect(restore.mock.calls).toEqual([[["e:t_FCT_REVENUE", "e:u_0"]]]);
  });
});

describe("y25 a new input clears the ticks", () => {
  it("has no ticked row after the next input", async () => {
    const { root, update } = await opened();
    press(rows(root)[0].querySelector("td.sel .check") as Element);
    const ticked = () =>
      rows(root).filter((r) => r.getAttribute("aria-selected") === "true");
    expect(ticked()).toHaveLength(1);
    await update({ input: fixtureModel("s-access") });
    expect(rows(root).length).toBeGreaterThan(0);
    expect(ticked()).toHaveLength(0);
  });
});

describe("C1 the Hidden filter and the tick cell tips", () => {
  it("gives the mockup texts", async () => {
    const { root } = await opened();
    hover(seg(root, "Hidden"));
    expect(tips(root)).toContain("Rows you hid from the canvas");
    hover(rows(root)[0].querySelector("td.sel") as HTMLElement);
    expect(tips(root)).toContain("Shift-click to select a range");
  });
});

describe("C7 the provenance tags of the Kind and Predicate cells", () => {
  it("tags a system and a custom type and predicate; the sort text has no tag", async () => {
    const raw = {
      nodes: [
        { id: "u", type: "user", label: "U" },
        { id: "t", type: "table", label: "T" },
        { id: "k", type: "kiln", label: "K" },
      ],
      edges: [
        { subject: "t", predicate: "ownedBy", object: "u" },
        { subject: "u", predicate: "likes", object: "k" },
      ],
    };
    const { root } = await mountApp(appInput(raw));
    press(button(root, "Dataset"));
    const tag = (id: string, column: string) =>
      text(cell(root, rowById(root, id), column).querySelector(".prov"));
    expect(tag("u", "Kind")).toBe("[system]");
    expect(tag("k", "Kind")).toBe("[custom]");
    expect(tag("t · ownedBy · u", "Predicate")).toBe("[system]");
    expect(tag("u · likes · k", "Predicate")).toBe("[custom]");
    expect(text(cell(root, rowById(root, "k"), "Kind"))).toMatch(
      /Kiln\[custom\]$/,
    );
    hover(cell(root, rowById(root, "k"), "Kind"));
    expect(tips(root)).toContain("Kiln");
  });
});
