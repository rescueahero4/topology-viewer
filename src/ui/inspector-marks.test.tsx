// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "./canvas/index";

// why: STORY-004-04 S9, S13, S20 (the story file names one test file; the SA §5 limit of 400
// lines puts these rows here)
process.env.TZ = "UTC";

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
const tip = (root: Element) => root.querySelector('[role="tooltip"]');
const send = (el: Element, event: Event) =>
  void act(() => void el.dispatchEvent(event));
const touch = () =>
  new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true });

function attributesWith(root: Element, value: string): string[] {
  return [root, ...root.querySelectorAll("*")].flatMap((el) =>
    [...el.attributes]
      .filter((a) => a.value.includes(value))
      .map((a) => `${el.tagName}[${a.name}]`),
  );
}

describe("S9 the AI mark reason on hover, focus and touch", () => {
  const REASON = "Named from the table and its schema";

  it("shows and hides the reason as a text node, never in an attribute", async () => {
    const { root } = await mountApp(fixtureModel("s-vocab-meta"));
    const dt = [...card(root).querySelectorAll("dt")].find(
      (el) => el.textContent === "Logical name",
    );
    const mark = dt?.nextElementSibling?.querySelector(
      ".ai-mark",
    ) as HTMLElement;
    expect(mark.tabIndex).toBe(0);
    const name = root.querySelector(
      `#${CSS.escape(mark.getAttribute("aria-labelledby") ?? "")}`,
    );
    expect(text(name)).toBe("Inferred by the data provider");
    const shows = () => {
      const found = tip(root);
      expect(found?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(text(found)).toContain(REASON);
      expect(mark.getAttribute("aria-describedby")).toBe(found?.id);
      expect(attributesWith(root, REASON)).toEqual([]);
    };
    expect(tip(root)).toBeNull();
    send(mark, new MouseEvent("mouseenter"));
    shows();
    send(mark, new MouseEvent("mouseleave"));
    expect(tip(root)).toBeNull();
    void act(() => mark.focus());
    shows();
    send(mark, new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(tip(root)).toBeNull();
    void act(() => mark.focus());
    void act(() => mark.blur());
    void act(() => mark.focus());
    shows();
    void act(() => mark.blur());
    expect(tip(root)).toBeNull();
    send(mark, touch());
    shows();
    send(mark, touch());
    expect(tip(root)).toBeNull();
    send(mark, new PointerEvent("pointerdown", { pointerType: "mouse" }));
    expect(tip(root)).toBeNull();
    expect(attributesWith(root, REASON)).toEqual([]);
  });
});

const sub = (root: Element) => card(root).querySelector(".insp-head .sub");

describe("S13 the namesake line", () => {
  const n = (id: string, type: string, label: string) => ({ id, type, label });
  const has = (subject: string, object: string) => ({
    subject,
    predicate: "contains",
    object,
  });
  const raw = {
    nodes: [
      n("db", "database", "DB"),
      n("sc_sales", "schema", "SALES"),
      n("sc_ops", "schema", "OPS"),
      n("t1", "table", "ORDERS"),
      n("t2", "table", "ORDERS"),
      n("t9", "table", "ORDERS"),
      n("x1", "table", "constructor"),
      n("x3", "table", "constructor"),
      n("x2", "table", "toString"),
    ],
    edges: [
      has("db", "sc_sales"),
      has("db", "sc_ops"),
      has("sc_sales", "t1"),
      has("sc_ops", "t2"),
      has("sc_sales", "x1"),
      has("sc_ops", "x3"),
      has("sc_sales", "x2"),
    ],
    view: { approach: "active", root: "t1" },
  };

  it("shows the container path of each namesake and no line otherwise", async () => {
    const input = appInput(raw);
    if (!input.ok) throw new Error("fatal");
    expect(input.model.graph.entities).toHaveLength(9);
    const { root } = await mountApp(input);
    const lineOf = (id: string) => {
      run(() => canvas().focus(id));
      expect(card(root).dataset.state).toBe("expanded");
      return sub(root);
    };
    const first = sub(root);
    expect(first?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(text(first)).toBe("DB › SALES");
    send(first as Element, new MouseEvent("mouseenter"));
    expect(text(tip(root))).toBe("DB › SALES");
    send(first as Element, new MouseEvent("mouseleave"));
    expect(text(lineOf("t2"))).toBe("DB › OPS");
    expect(lineOf("db")).toBeNull();
    expect(text(card(root).querySelector(".insp-title strong"))).toBe("DB");
    expect(lineOf("t9")).toBeNull();
    expect(text(card(root).querySelector(".insp-title strong"))).toBe("ORDERS");
    expect(text(lineOf("x1"))).toBe("DB › SALES");
    expect(text(lineOf("x3"))).toBe("DB › OPS");
    expect(lineOf("x2")).toBeNull();
    expect(text(card(root).querySelector(".insp-title strong"))).toBe(
      "toString",
    );
  });
});

describe("S20 an empty container label", () => {
  it("shows the empty segment as a dash in the namesake line and the Path slot", async () => {
    const raw = {
      nodes: [
        { id: "db0", type: "database", label: "" },
        { id: "s0", type: "schema", label: "S" },
        { id: "s9", type: "schema", label: "T" },
        {
          id: "o1",
          type: "table",
          label: "ORDERS",
          attrs: { logical_name: "x" },
        },
        { id: "o2", type: "table", label: "ORDERS" },
      ],
      edges: [
        { subject: "db0", predicate: "contains", object: "s0" },
        { subject: "db0", predicate: "contains", object: "s9" },
        { subject: "s0", predicate: "contains", object: "o1" },
        { subject: "s9", predicate: "contains", object: "o2" },
      ],
      view: { approach: "active", root: "o1" },
    };
    const { root } = await mountApp(appInput(raw));
    expect(text(sub(root))).toBe("— › S");
    const path = [...card(root).querySelectorAll("dt")].find(
      (dt) => dt.textContent === "Path",
    );
    expect(text(path?.nextElementSibling)).toBe("— › S › ORDERS");
  });
});
