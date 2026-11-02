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
const { rendererText } = await import("./rendererText");
const state = await import("./state");

// why: ISSUE-012 C5 — the STORY-004-05 QA plants y5, y7, y8 and y10 (memo
// 2026-10-21-qa-story-05-done-gate.md item 2); C3 the count chip and C1 the tips of the card

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
const names = (root: Element) =>
  [...card(root).querySelectorAll<HTMLElement>(".insp-bar .icon-btn")]
    .filter((el) => !el.hasAttribute("aria-expanded"))
    .map((el) => el.getAttribute("aria-label"));
const hover = (el: Element) =>
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
const leave = (el: Element) =>
  void act(() => void el.dispatchEvent(new MouseEvent("mouseleave")));
const tip = (root: Element) => text(root.querySelector('[role="tooltip"]'));

function tipLines(root: Element, row: Element): string[] {
  const anchor = row.querySelector(".p") as HTMLElement;
  hover(anchor);
  const lines = [...root.querySelectorAll(".tip .tip-line")].map(text);
  leave(anchor);
  return lines;
}

function groupOf(type: string) {
  const node = state.frontier.value?.nodes.find(
    (n) => "members" in n && n.type === type,
  );
  if (node === undefined) throw new Error(`no ${type} group`);
  return node;
}

const AROUND = "Group neighbours by type around this node";
const HIDE = "Hide from canvas";
const CLEAR = "Clear selection and fit view";
const CENTER = "Center the atomic layout on this node";

describe("y5 the 1,000-character cut of the predicate tip", () => {
  it("cuts a line of a 5,000-character key and value with …", async () => {
    const long = { ["k".repeat(5000)]: "v".repeat(5000) };
    const raw = {
      nodes: [
        { id: "u", type: "user", label: "U" },
        { id: "t", type: "table", label: "T" },
      ],
      edges: [{ subject: "u", predicate: "ownedBy", object: "t", attrs: long }],
    };
    const { root } = await mountApp(appInput(raw));
    run(() => canvas().focus("u"));
    const lines = tipLines(root, rowsOf(root)[0]);
    const line = lines.find((l) => l.startsWith("k"));
    expect(line).toBe(`${"k".repeat(999)}…`);
  });
});

describe("y7 Center here and a group node", () => {
  it("is not on a selected group node in Atomic", async () => {
    const { root } = await mountApp(fixtureModel("s-star"));
    run(() => canvas().setLayout("atomic"));
    run(() => canvas().select(groupOf("column").id));
    expect(names(root)).toEqual([AROUND, HIDE, CLEAR]);
    run(() => canvas().select("e:tag_pii"));
    expect(names(root)).toEqual([CENTER, AROUND, HIDE, CLEAR]);
  });
});

describe("y8 the direction of the triples behind a row", () => {
  it("reads only the triples from the subject end to the object end", async () => {
    const raw = {
      nodes: [
        { id: "u", type: "tag", label: "U" },
        { id: "t", type: "tag", label: "T" },
      ],
      edges: [
        { subject: "u", predicate: "relatedTo", object: "t", attrs: { a: 1 } },
        { subject: "t", predicate: "relatedTo", object: "u", attrs: { b: 2 } },
      ],
    };
    const { root } = await mountApp(appInput(raw));
    run(() => canvas().focus("u"));
    const out = rowsOf(root).find(
      (row) => text(row.querySelector(".s .me")) === "U",
    ) as HTMLElement;
    const lines = tipLines(root, out);
    expect(lines).toContain("a: 1");
    expect(lines).not.toContain("b: 2");
  });
});

describe("y10 the header actions of a collapsed card", () => {
  it("shows no action while the card is collapsed", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    expect(names(root)).toEqual([AROUND, HIDE, CLEAR]);
    const toggle = card(root).querySelector<HTMLElement>(
      ".insp-bar [aria-expanded]",
    );
    void act(() => toggle?.click());
    expect(card(root).getAttribute("data-state")).toBe("collapsed");
    expect(names(root)).toEqual([]);
  });
});

describe("C3 the member count chip of a group end", () => {
  it("shows the count of the group end as the mockup, and none for an entity end", async () => {
    const { root } = await mountApp(fixtureModel("s-star"));
    const label = (type: string, count: number) =>
      rendererText("en").groupLabel(type, count);
    const row = (end: string) =>
      rowsOf(root).find((r) => text(r.querySelector(".s")) === end);
    expect(text(row(label("Table", 300))?.querySelector(".cnt"))).toBe("300");
    expect(text(row(label("Column", 12))?.querySelector(".cnt"))).toBe("12");
    run(() => canvas().select(groupOf("column").id));
    expect(rowsOf(root)[0].querySelector(".cnt")).toBeNull();
  });
});

describe("C1 the ROOT pill and the provenance tag tips", () => {
  it("gives the mockup texts to the pill and to a system and a custom tag", async () => {
    const raw = {
      nodes: [
        { id: "u", type: "user", label: "U" },
        { id: "t", type: "table", label: "T" },
      ],
      edges: [
        { subject: "u", predicate: "ownedBy", object: "t" },
        { subject: "u", predicate: "likes", object: "t" },
      ],
    };
    const { root } = await mountApp(appInput(raw));
    run(() => canvas().focus("u"));
    hover(card(root).querySelector(".root-pill") as HTMLElement);
    expect(tip(root)).toBe(
      "The selected node; the canvas is focused on its neighbourhood",
    );
    const prov = (predicate: string) =>
      rowsOf(root)
        .find((r) => text(r.querySelector(".p")) === predicate)
        ?.querySelector(".prov") as HTMLElement;
    expect(text(prov("ownedBy"))).toBe("[system]");
    hover(prov("ownedBy"));
    expect(tip(root)).toBe("System predicate from the Graph Vocabulary");
    expect(text(prov("likes"))).toBe("[custom]");
    hover(prov("likes"));
    expect(tip(root)).toBe("Custom predicate");
  });

  it("gives no tip to an inferred tag", async () => {
    const raw = { nodes: [{ source: "a", target: "b" }] };
    const { root } = await mountApp(appInput(raw));
    run(() => canvas().focus("a"));
    const prov = rowsOf(root)[0].querySelector(".prov") as HTMLElement;
    expect(text(prov)).toBe("[inferred]");
    hover(prov);
    expect(root.querySelector('[role="tooltip"]')).toBeNull();
  });
});
