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
const rowOf = (root: Element, predicate: string) =>
  rowsOf(root).find((row) =>
    text(row.querySelector(".p")).startsWith(predicate),
  ) as HTMLElement;
const tab = (root: Element, name: string) =>
  [...card(root).querySelectorAll<HTMLElement>(".insp-tab")].find((el) =>
    text(el).startsWith(name),
  ) as HTMLElement;

// why: the lines of the tip of a row predicate, opened by hover, then closed again
function tipOf(root: Element, row: Element): string[] {
  const anchor = row.querySelector(".p") as HTMLElement;
  void act(() => void anchor.dispatchEvent(new MouseEvent("mouseenter")));
  const lines = [...root.querySelectorAll(".tip .tip-line")].map(text);
  void act(() => void anchor.dispatchEvent(new MouseEvent("mouseleave")));
  return lines;
}

type Edge = Record<string, unknown>;

// why: the S12 in-test payload; `extra` adds edges for the plant guard (LEARNINGS 42)
function s12(extra: Edge[] = []) {
  return appInput({
    nodes: [
      { id: "a", type: "database", label: "A" },
      { id: "b", type: "schema", label: "B" },
      { id: "u", type: "user", label: "U" },
      { id: "t", type: "table", label: "T" },
      { id: "m1", type: "tag", label: "Same" },
      { id: "m2", type: "tag", label: "Same" },
    ],
    edges: [
      { subject: "b", predicate: "partOf", object: "a" },
      {
        subject: "u",
        predicate: "permissionedTo",
        object: "t",
        attrs: { permission: "read" },
      },
      {
        subject: "u",
        predicate: "permissionedTo",
        object: "t",
        attrs: { permission: "write" },
      },
      {
        subject: "u",
        predicate: "permissionedTo",
        object: "t",
        attrs: { permission: "admin" },
        isActive: false,
      },
      { subject: "m1", predicate: "relatedTo", object: "m2" },
      ...extra,
    ],
  });
}

describe("S12 inverse names, the triples behind a row and built-in", () => {
  it("reads the triples of the row predicate and direction only", async () => {
    const { root } = await mountApp(s12());
    run(() => canvas().focus("a"));
    expect(rowsOf(root)).toHaveLength(1);
    expect(tipOf(root, rowOf(root, "contains"))[0]).toBe(
      "contains · inverse: partOf",
    );
    run(() => canvas().focus("u"));
    expect(rowsOf(root)).toHaveLength(1);
    const lines = tipOf(root, rowOf(root, "permissionedTo"));
    expect(lines.filter((line) => line.startsWith("permission: "))).toEqual([
      "permission: read",
      "permission: write",
      "permission: admin · Active: No",
    ]);
    run(() => canvas().focus("m1"));
    expect(rowsOf(root)).toHaveLength(1);
    expect(text(rowsOf(root)[0].querySelector(".p"))).toBe("relatedTo");
    void act(() => tab(root, "Outgoing").click());
    expect(rowsOf(root)).toHaveLength(1);
    void act(() => tab(root, "Incoming").click());
    expect(rowsOf(root)).toHaveLength(0);
  });

  it("shows no attribute line of another predicate between the same ends", async () => {
    const other = { subject: "u", predicate: "ownedBy", object: "t" };
    const { root } = await mountApp(s12([{ ...other, attrs: { since: "x" } }]));
    run(() => canvas().focus("u"));
    expect(rowsOf(root)).toHaveLength(2);
    const lines = tipOf(root, rowOf(root, "permissionedTo"));
    expect(lines.some((line) => line.includes("since"))).toBe(false);
    expect(tipOf(root, rowOf(root, "ownedBy"))).toContain("since: x");
  });

  it("gives a built-in predicate the text built-in", async () => {
    const { root } = await mountApp(fixtureModel("q-full-vocabulary"));
    run(() => canvas().focus("node-class-pii"));
    expect(text(card(root).querySelector(".insp-title strong"))).not.toBe("");
    const lines = tipOf(root, rowOf(root, "classifiedAs"));
    expect(lines).toContain("built-in");
  });
});

describe("S13 the tip bound", () => {
  it("makes 20 attribute lines and one N more line on open only", async () => {
    const tables = Array.from({ length: 300 }, (_, i) => ({
      id: `t${i}`,
      type: "table",
      label: `T${i}`,
    }));
    const edges = tables.map((node, i) => ({
      subject: node.id,
      predicate: "taggedWith",
      object: "x",
      attrs: { score: i },
    }));
    const raw = {
      nodes: [{ id: "x", type: "tag", label: "X" }, ...tables],
      edges,
    };
    const { root } = await mountApp(appInput(raw));
    run(() => canvas().select("e:x"));
    expect(rowsOf(root)).toHaveLength(1);
    expect(root.querySelector(".tip")).toBeNull();
    expect(text(root)).not.toContain("score");
    const lines = tipOf(root, rowsOf(root)[0]);
    const scores = lines.filter((line) => line.startsWith("score: "));
    expect(scores).toEqual(Array.from({ length: 20 }, (_, i) => `score: ${i}`));
    expect(lines).toContain("280 more");
  });
});

describe("S14 a retired row", () => {
  it("reads the canvas pill text, with no other style, also when muted", async () => {
    const { root } = await mountApp(s12());
    run(() => canvas().focus("u"));
    const retired = rowOf(root, "permissionedTo");
    expect(text(retired.querySelector(".p"))).toBe("permissionedTo (retired)");
    const retiredClass = retired.className;
    run(() => canvas().focus("a"));
    const plain = rowOf(root, "contains");
    expect(text(plain.querySelector(".p"))).toBe("contains");
    expect(plain.className).toBe(retiredClass);
    run(() => canvas().focus("u"));
    const pill = [...root.querySelectorAll<HTMLElement>(".catbar .pill")].find(
      (el) => el.childNodes[1]?.textContent === "permissionedTo",
    );
    expect(pill).toBeDefined();
    run(() => pill?.click());
    const muted = rowOf(root, "permissionedTo");
    expect(muted.classList.contains("muted")).toBe(true);
    expect(text(muted.querySelector(".p"))).toBe("permissionedTo (retired)");
  });
});
