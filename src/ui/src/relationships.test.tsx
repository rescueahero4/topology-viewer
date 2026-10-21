// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "./canvas/index";

const spy = vi.hoisted(() => ({
  canvases: [] as Canvas[],
  pairings: [] as string[],
}));
// why: S19, plant (k) — a pass-through `pairingsOf` records when the "Allowed" line is made
vi.mock("@qdic-topology/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/engine")>();
  return {
    ...mod,
    pairingsOf: (predicate: string) => {
      spy.pairings.push(predicate);
      return mod.pairingsOf(predicate);
    },
  };
});
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
const { edgeKey } = await import("@qdic-topology/engine");
const { UiIcon } = await import("./UiIcon");

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
const triple = (row: Element) =>
  [".s", ".p", ".o"].map((part) => text(row.querySelector(part)));
const tabs = (root: Element) => [
  ...card(root).querySelectorAll<HTMLElement>(".insp-tab"),
];
const tab = (root: Element, name: string) =>
  tabs(root).find((el) => text(el).startsWith(name)) as HTMLElement;
const tipLines = (root: Element) =>
  [...root.querySelectorAll(".tip .tip-line")].map(text);

function hover(el: Element): void {
  void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
}
function leave(el: Element): void {
  void act(() => void el.dispatchEvent(new MouseEvent("mouseleave")));
}

const ROOT = "e:t_FCT_REVENUE";
const S1_ROWS = [
  ["FCT_REVENUE", "ownedBy", "Aiko Tanaka"],
  ["FCT_REVENUE", "ownedBy", "Hana Costa"],
  ["FCT_REVENUE", "ownedBy", "Mateo Novak"],
  ["Finance admins", "permissionedTo", "FCT_REVENUE"],
  ["Analytics", "permissionedTo", "FCT_REVENUE"],
];

describe("S1 the relationships of the s-access root", () => {
  it("shows the counts, one family block and the five rows", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const hops = card(root).querySelector(".insp-bar .hops") as HTMLElement;
    expect(text(hops)).toBe("5e 5n");
    hover(hops);
    expect(text(root.querySelector(".tip"))).toBe(
      "5 relationships, 5 neighbours",
    );
    leave(hops);
    const blocks = [...card(root).querySelectorAll(".fam-group")];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].classList.contains("qt-fam-4")).toBe(true);
    const head = blocks[0].querySelector(".fam-head") as HTMLElement;
    expect(text(head)).toBe("Ownership & Access (5)");
    const icon = document.createElement("div");
    render(<UiIcon name="access" />, icon);
    expect(head.querySelector("svg")?.outerHTML).toBe(icon.innerHTML);
    expect(rowsOf(root).map(triple)).toEqual(S1_ROWS);
    for (const row of rowsOf(root))
      expect(text(row.querySelector(".prov"))).toBe("[system]");
    expect(tabs(root).map(text)).toEqual([
      "All (5)",
      "Outgoing (3)",
      "Incoming (2)",
    ]);
    expect(tab(root, "All").getAttribute("aria-selected")).toBe("true");
    const me = rowsOf(root).map((row) => text(row.querySelector(".me")));
    expect(me).toEqual(Array(5).fill("FCT_REVENUE"));
  });
});

describe("S2 the tabs", () => {
  it("filters by direction and opens a new selection on All", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    void act(() => tab(root, "Incoming").click());
    expect(rowsOf(root).map((row) => triple(row)[1])).toEqual([
      "permissionedTo",
      "permissionedTo",
    ]);
    expect(tab(root, "Incoming").getAttribute("aria-selected")).toBe("true");
    void act(() => tab(root, "All").click());
    expect(rowsOf(root)).toHaveLength(5);
    void act(() => tab(root, "Incoming").click());
    run(() => canvas().select("e:ug_exec"));
    expect(tab(root, "All").getAttribute("aria-selected")).toBe("true");
    expect(rowsOf(root)).toHaveLength(1);
    const only = rowsOf(root)[0];
    expect(triple(only).slice(0, 2)).toEqual(["Mateo Novak", "memberOf"]);
    expect(only.querySelector(".o .me")).not.toBeNull();
    expect(tabs(root).map(text)).toEqual([
      "All (1)",
      "Outgoing (0)",
      "Incoming (1)",
    ]);
    void act(() => tab(root, "Outgoing").click());
    expect(rowsOf(root)).toHaveLength(0);
    expect(text(card(root).querySelector(".none-note"))).toBe(
      "No relationships in this direction.",
    );
  });
});

describe("S3 a row press selects its edge", () => {
  it("selects the edge by press and by Enter and scrolls the row into view", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const { root, scrolls } = frame;
    const select = vi.spyOn(canvas(), "select");
    run(() => rowsOf(root)[0].click());
    expect(select.mock.calls).toEqual([[edgeKey(ROOT, "ownedBy", "e:u_0")]]);
    expect(rowsOf(root)[0].getAttribute("aria-pressed")).toBe("true");
    expect(text(card(root).querySelector(".insp-title strong"))).toBe(
      "FCT_REVENUE",
    );
    expect(scrolls).toEqual([rowsOf(root)[0]]);
    const fourth = rowsOf(root)[3];
    void act(() => fourth.focus());
    run(
      () =>
        void fourth.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        ),
    );
    expect(select.mock.calls).toEqual([
      [edgeKey(ROOT, "ownedBy", "e:u_0")],
      [edgeKey("e:ug_fin_admin", "permissionedTo", ROOT)],
    ]);
    expect(rowsOf(root)[3].getAttribute("aria-pressed")).toBe("true");
    expect(rowsOf(root)[0].getAttribute("aria-pressed")).toBe("false");
    expect(text(card(root).querySelector(".insp-title strong"))).toBe(
      "FCT_REVENUE",
    );
    expect(scrolls).toEqual([rowsOf(root)[0], rowsOf(root)[3]]);
  });

  it("selects with Space too, and the arrow does not select", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const select = vi.spyOn(canvas(), "select");
    const focus = vi.spyOn(canvas(), "focus").mockImplementation(() => {});
    run(
      () =>
        void rowsOf(root)[1].dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", bubbles: true }),
        ),
    );
    expect(select.mock.calls).toEqual([[edgeKey(ROOT, "ownedBy", "e:u_7")]]);
    void act(() =>
      rowsOf(root)[2].querySelector<HTMLElement>(".goto")?.click(),
    );
    expect(select).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls).toEqual([["u_12"]]);
  });
});

describe("S4 a predicate filter mutes its rows", () => {
  it("keeps the ownedBy rows in the list with the muted style", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const pill = [...root.querySelectorAll<HTMLElement>(".catbar .pill")].find(
      (el) => el.childNodes[1]?.textContent === "ownedBy",
    );
    expect(pill).toBeDefined();
    run(() => pill?.click());
    const muted = rowsOf(root).map((row) => row.classList.contains("muted"));
    expect(muted).toEqual([true, true, true, false, false]);
    expect(rowsOf(root).map(triple)).toEqual(S1_ROWS);
  });
});

describe("S8 the go-to arrow of an entity end", () => {
  it("calls focus with the entity id once", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const focus = vi.spyOn(canvas(), "focus");
    const row = rowsOf(root)[1];
    expect(triple(row)[2]).toBe("Hana Costa");
    const arrow = row.querySelector(".goto") as HTMLElement;
    const name = document.getElementById(
      arrow.getAttribute("aria-labelledby") ?? "",
    );
    expect(text(name)).toBe("Go to Hana Costa");
    run(() => arrow.click());
    expect(focus.mock.calls).toEqual([["u_7"]]);
  });
});

describe("S19 the allowed types and the write rules on request", () => {
  it("makes the lines only when a tip opens", async () => {
    spy.pairings.length = 0;
    const { root, calls } = await mountApp(fixtureModel("s-access"));
    expect(text(root)).not.toContain("Allowed");
    expect(root.querySelector(".tip")).toBeNull();
    expect(spy.pairings).toEqual([]);
    const first = rowsOf(root)[0].querySelector(".p") as HTMLElement;
    hover(first);
    expect(spy.pairings).toEqual(["ownedBy"]);
    expect(tipLines(root)).toContain("Allowed: any type → User");
    leave(first);
    const fourth = rowsOf(root)[3].querySelector(".p") as HTMLElement;
    void act(() => fourth.focus());
    expect(tipLines(root)).toContain("Allowed: User group → any type");
    void act(() => fourth.blur());
    expect(root.querySelector(".tip")).toBeNull();
    const info = card(root).querySelector(".insp-tabs .info") as HTMLElement;
    expect(info.getAttribute("aria-label")).toBe("Write rules");
    hover(info);
    const lines = [...root.querySelectorAll(".tip .tip-line")];
    expect(lines.map(text)).toEqual([
      "A new custom node must use a custom-defined node type",
      "Every edge must match an allowed pairing",
      "Both ends of a custom edge cannot be system-owned",
    ]);
    for (const line of lines) {
      expect(line.childNodes).toHaveLength(1);
      expect(line.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    }
    expect(calls).toEqual([]);
  });
});
