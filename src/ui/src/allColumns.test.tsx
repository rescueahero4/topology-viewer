// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { describe, expect, it, vi } from "vitest";

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
const f = await import("./cellEditFrame");
const { mountApp } = await import("./testFrame");
const { appInput } = await import("./fixtureModel");
const state = await import("./state");
const { en } = await import("./strings/en");

// why: STORY-008-09 — two `feeds` edges (a shared predicate for the row/all choice), a list
// attribute and a System on an edge
const DATA = {
  nodes: [
    { id: "a", type: "table", label: "A", attrs: { list: [1, 2], s: "x" } },
    { id: "b", type: "table", label: "B", attrs: {} },
    { id: "c", type: "table", label: "C", attrs: {} },
  ],
  edges: [
    { subject: "a", predicate: "feeds", object: "b" },
    { subject: "a", predicate: "feeds", object: "c" },
  ],
};
const AB = "a · feeds · b";

const open = () => f.opened(mountApp, appInput(structuredClone(DATA)));
const graph = () => {
  const now = state.editedGraph.value;
  if (now === null) throw new Error("no graph");
  return now;
};

function save(root: Element, id: string, column: string, value: string) {
  f.dblclick(f.cellOf(root, id, column));
  f.type(f.input(root), value);
  f.key(f.input(root), "Enter");
}

describe("STORY-008-09 all columns", () => {
  it("S12 S13 an ID edit renames the row and its edges; empty and used IDs are blocked", async () => {
    const { root } = await open();
    save(root, "b", "ID", " ");
    expect(f.message(root)).toBe(en["edit.empty"]);
    expect(f.input(root)?.getAttribute("aria-invalid")).toBe("true");
    f.type(f.input(root), "c");
    f.key(f.input(root), "Enter");
    expect(f.message(root)).toBe(en["edit.duplicateId"]);
    f.type(f.input(root), "b2");
    f.key(f.input(root), "Enter");
    expect(f.editors(root)).toHaveLength(0);
    expect(f.text(f.cellOf(root, "b2", "ID"))).toBe("b2");
    expect(f.text(f.cellOf(root, "a · feeds · b2", "ID"))).toBe(
      "a · feeds · b2",
    );
    expect(graph().triples[0].object).toBe("b");
  });

  it("S14 a Type edit changes only the shown label", async () => {
    const { root } = await open();
    save(root, "b", "Type", "asset");
    if (f.choice(root).length > 0) f.thisRow(root);
    expect(f.text(f.cellOf(root, "b", "Type"))).toBe("asset");
    expect(f.text(f.cellOf(root, "c", "Type"))).toBe(en["wb.node"]);
    expect(graph().records[1].type).toBe("table");
  });

  it("S15 a Predicate edit keeps the ends", async () => {
    const { root } = await open();
    save(root, AB, "Predicate", "loads");
    f.thisRow(root);
    expect(graph().triples[0]).toMatchObject({
      subject: "a",
      predicate: "loads",
      object: "b",
    });
    expect(graph().triples[1].predicate).toBe("feeds");
  });

  it("S16 Family: all rows move the predicate; this row gives the edge its own predicate", async () => {
    const { root } = await open();
    save(root, AB, "Family", "Flow");
    expect(f.choice(root)).toHaveLength(2);
    f.click(f.choice(root)[1]);
    expect({ ...graph().familyEdits }).toEqual({ feeds: "Flow" });
    expect(graph().triples.map((t) => t.predicate)).toEqual(["feeds", "feeds"]);
    state.stepEdits((history) => history.undo());
    save(root, AB, "Family", "Flow");
    f.thisRow(root);
    expect(graph().triples.map((t) => t.predicate)).toEqual([
      "feeds (Flow)",
      "feeds",
    ]);
    expect({ ...graph().familyEdits }).toEqual({ "feeds (Flow)": "Flow" });
  });

  it("S17 System on an edge row is the edge attribute service_name", async () => {
    const { root } = await open();
    save(root, AB, "System", "snowflake");
    expect(graph().triples[0].attrs.service_name).toBe("snowflake");
    expect(f.text(f.cellOf(root, AB, "System"))).toBe("snowflake");
  });

  it("S18 S19 the Attributes field replaces the set; bad input is blocked", async () => {
    const { root } = await open();
    f.dblclick(f.cellOf(root, "a", "Attributes"));
    expect(f.input(root)?.placeholder).toBe(en["edit.attrHint"]);
    expect(f.input(root)?.value).toBe("list=[1,2], s=x");
    for (const [bad, code] of [
      ["{bad", "edit.badJson"],
      ["<a><b></a>", "edit.badXml"],
      ["=1", "edit.emptyKey"],
      ["service_name=x", "edit.reservedKey"],
    ] as const) {
      f.type(f.input(root), bad);
      f.key(f.input(root), "Enter");
      expect(f.message(root)).toBe(en[code]);
    }
    f.type(f.input(root), "a=1, b=true, c=2026-01-01, d=x");
    f.key(f.input(root), "Enter");
    expect({ ...graph().records[0].attrs }).toEqual({
      a: 1,
      b: true,
      c: "2026-01-01",
      d: "x",
    });
  });

  it("S20 a list cell saves valid JSON only", async () => {
    const { root } = await open();
    save(root, "a", "list", "[x");
    expect(f.message(root)).toBe(en["edit.badJson"]);
    f.type(f.input(root), '["x","y"]');
    f.key(f.input(root), "Enter");
    expect(graph().records[0].attrs.list).toEqual(["x", "y"]);
  });

  it("S21 hostile keys stay plain keys; markup stays text", async () => {
    const { root } = await open();
    save(root, "b", "Attributes", '{"constructor":{"prototype":{"p":1}}}');
    expect(({} as Record<string, unknown>).p).toBeUndefined();
    expect(Object.hasOwn(graph().records[1].attrs, "constructor")).toBe(true);
    save(root, "c", "Attributes", "x=<img src=x onerror=alert(1)>");
    expect(root.querySelector("img")).toBeNull();
    expect(f.text(f.cellOf(root, "c", "Attributes"))).toContain("<img");
  });
});
