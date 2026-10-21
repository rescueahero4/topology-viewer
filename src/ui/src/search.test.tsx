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
const { matchEntities } = await import("@qdic-topology/engine");

const canvas = () => spy.canvases[spy.canvases.length - 1];
const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const field = (root: Element) =>
  root.querySelector(".search input") as HTMLInputElement;
const list = (root: Element) => root.querySelector(".search-results");
const options = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".search-results [role=option]"),
];
const metas = (root: Element) =>
  options(root).map((row) => text(row.querySelector(".meta")));
const rowOf = (root: Element, label: string) =>
  options(root).find((row) => text(row.querySelector(".name")) === label);
const key = (el: Element, name: string) => {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  void act(() => void el.dispatchEvent(event));
  return event;
};
const shape = (row: Element | undefined) =>
  [...(row?.children ?? [])].map((el) => `${el.tagName}.${el.className}`);

function type(root: Element, value: string, wait = 120): void {
  const input = field(root);
  void act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  void act(() => {
    vi.advanceTimersByTime(wait);
  });
}

function shellAction(root: Element, id: string, name: string): void {
  run(() => canvas().select(id));
  const button = [
    ...root.querySelectorAll<HTMLElement>(".inspector .insp-bar .icon-btn"),
  ].find((el) => el.getAttribute("aria-label") === name);
  if (button === undefined) throw new Error(`no ${name} for ${id}`);
  run(() => button.click());
}

async function hiddenAndGrouped() {
  const input = fixtureModel("s-access");
  if (!input.ok) throw new Error("fatal");
  const frame = await mountApp(input);
  shellAction(frame.root, "e:u_0", "Hide from canvas");
  shellAction(
    frame.root,
    "e:t_FCT_REVENUE",
    "Group neighbours by type around this node",
  );
  return { ...frame, input };
}

describe("S13 the result list", () => {
  it("lists the hits in engine order with their state, 50 rows and N more", async () => {
    const input = fixtureModel("s-access");
    if (!input.ok) throw new Error("fatal");
    const { root } = await mountApp(input);
    expect(field(root).labels?.[0]?.textContent).toBe("Search nodes");
    expect(text(root.querySelector(".search kbd"))).toBe("/");
    type(root, "revenue", 119);
    expect(list(root)).toBeNull();
    void act(() => {
      vi.advanceTimersByTime(1);
    });
    const hits = matchEntities(input.model.graph, "revenue");
    expect(hits).toHaveLength(5);
    const label = (id: string) => input.model.vocab.entities.get(id)?.label;
    expect(
      options(root).map((row) => text(row.querySelector(".name"))),
    ).toEqual(hits.map(label));
    expect(metas(root)[hits.indexOf("t_FCT_REVENUE")]).toBe("Table");
    for (const [i, id] of hits.entries())
      if (id !== "t_FCT_REVENUE")
        expect(metas(root)[i]).toMatch(/^(Column|Tag) · not drawn$/);
    expect(metas(root)[hits.indexOf("tag_Revenue")]).toBe("Tag · not drawn");
    type(root, "e");
    expect(matchEntities(input.model.graph, "e")).toHaveLength(344);
    expect(options(root)).toHaveLength(50);
    expect(text(list(root)?.lastElementChild)).toBe("294 more…");
  });
});

describe("S14 hidden, faded and not-drawn hits", () => {
  it("reads the records and the canvas state of each hit", async () => {
    const { root, input } = await hiddenAndGrouped();
    type(root, "u_20");
    expect(options(root)).toHaveLength(1);
    expect(text(options(root)[0].querySelector(".name"))).toBe(
      input.model.vocab.entities.get("u_0")?.label,
    );
    expect(metas(root)).toEqual(["User · 4 records · hidden"]);
    type(root, "exec");
    expect(
      text(rowOf(root, "Executive reporting")?.querySelector(".meta")),
    ).toMatch(/ · not drawn$/);
    expect(
      text(rowOf(root, "Executive staff")?.querySelector(".meta")),
    ).toMatch(/ · faded$/);
  });
});

describe("S15 a pick, the / key and Escape", () => {
  it("restores a hidden hit, focuses a not-drawn hit and closes the list", async () => {
    const { root, input } = await hiddenAndGrouped();
    const restore = vi.spyOn(canvas(), "restore");
    const focus = vi.spyOn(canvas(), "focus");
    void act(() => field(root).focus());
    type(root, "u_20");
    run(() => key(field(root), "Enter"));
    expect(restore.mock.calls).toEqual([[["e:u_0"]]]);
    expect(focus).not.toHaveBeenCalled();
    expect(list(root)).toBeNull();
    type(root, "revenue");
    const hits = matchEntities(input.model.graph, "revenue");
    const column = options(root).findIndex((row) =>
      text(row.querySelector(".meta")).startsWith("Column · not drawn"),
    );
    expect(column).toBeGreaterThanOrEqual(0);
    run(() => options(root)[column].click());
    expect(focus.mock.calls).toEqual([[hits[column]]]);
    expect(restore.mock.calls).toHaveLength(1);
    expect(list(root)).toBeNull();
  });

  it("focuses the search with / outside a text field and clears it with Escape", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const graph = root.querySelector(".graph") as HTMLElement;
    expect(key(graph, "/").defaultPrevented).toBe(true);
    expect(root.ownerDocument.activeElement).toBe(field(root));
    type(root, "exec");
    expect(list(root)).not.toBeNull();
    key(field(root), "Escape");
    expect(field(root).value).toBe("");
    expect(list(root)).toBeNull();
    expect(root.ownerDocument.activeElement).not.toBe(field(root));
    const other = root.ownerDocument.createElement("input");
    root.appendChild(other);
    void act(() => other.focus());
    expect(key(other, "/").defaultPrevented).toBe(false);
    expect(root.ownerDocument.activeElement).toBe(other);
    void act(() => field(root).focus());
    expect(key(field(root), "/").defaultPrevented).toBe(false);
  });

  it("moves the active row with the arrows and closes the list on blur", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    void act(() => field(root).focus());
    type(root, "revenue");
    const selected = () =>
      options(root).map((row) => row.getAttribute("aria-selected"));
    expect(selected()[0]).toBe("true");
    key(field(root), "ArrowDown");
    key(field(root), "ArrowDown");
    key(field(root), "ArrowUp");
    expect(selected()).toEqual(["false", "true", "false", "false", "false"]);
    void act(() => field(root).blur());
    expect(list(root)).toBeNull();
  });

  it("shows the query of a search with no hit as a text node", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    type(root, "zzzz");
    const none = list(root)?.querySelector(".none");
    expect(text(none)).toBe("No nodes match “zzzz”");
    expect(none?.childNodes[1]?.nodeType).toBe(Node.TEXT_NODE);
    expect(none?.childNodes[1]?.textContent).toBe("zzzz");
  });
});

describe("S16 the namesake line and a faded row", () => {
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
    ],
    edges: [
      has("db", "sc_sales"),
      has("db", "sc_ops"),
      has("sc_sales", "t1"),
      has("sc_ops", "t2"),
    ],
  };

  it("gives each namesake its container path under the meta line", async () => {
    const { root } = await mountApp(appInput(raw));
    type(root, "orders");
    const rows = options(root);
    expect(rows.map((row) => text(row.querySelector(".name")))).toEqual([
      "ORDERS",
      "ORDERS",
    ]);
    const lines = rows.map((row) => row.querySelector(".sub"));
    expect(lines.map(text)).toEqual(["DB › SALES", "DB › OPS"]);
    for (const line of lines) {
      expect(line?.childNodes).toHaveLength(1);
      expect(line?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(line?.previousElementSibling?.className).toBe("meta");
    }
    type(root, "db");
    expect(
      options(root).map((row) => text(row.querySelector(".name"))),
    ).toEqual(["DB"]);
    expect(options(root)[0].querySelector(".sub")).toBeNull();
  });

  it("gives a faded row the meta text only, with the structure of a drawn row", async () => {
    const { root } = await hiddenAndGrouped();
    type(root, "exec");
    const faded = rowOf(root, "Executive staff");
    expect(text(faded?.querySelector(".meta"))).toBe("User group · faded");
    type(root, "FCT_REVENUE");
    const drawn = rowOf(root, "FCT_REVENUE");
    expect(text(drawn?.querySelector(".meta"))).toBe("Table");
    expect(shape(faded)).toEqual(shape(drawn));
    expect(shape(drawn)).toEqual(["SPAN.glyph", "SPAN.name", "SPAN.meta"]);
  });
});
