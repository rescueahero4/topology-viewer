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
const { datasets } = await import("#fixtures");
const { rowsOf } = await import("./workbenchRows");
const { CORE } = await import("./workbenchColumns");
const { cellValue, editable, inputOf } = await import("./cellEdit");
const state = await import("./state");

const kinds = () => appInput(f.KINDS);
const active = () => state.editHistory.value.history.active();
const recordOf = (id: string) =>
  state.editedGraph.value?.records.find((r) => r.id === id);

describe("S1 editable", () => {
  const input = kinds();
  if (!input.ok) throw new Error("fatal");
  const all = rowsOf(input.model.graph, input.model.vocab);
  const node = all.find((r) => r.rtype === "node" && r.id === "a");
  const edge = all.find((r) => r.rtype === "edge");
  if (node === undefined || edge === undefined) throw new Error("no rows");
  const can = (row: typeof node, column: Parameters<typeof editable>[1]) =>
    editable(row, column);

  it("is true for every data cell of each row type (STORY-008-09 rule 10)", () => {
    const nodeCore = CORE.filter((key) => can(node, { core: key }));
    const edgeCore = CORE.filter((key) => can(edge, { core: key }));
    expect(nodeCore).toEqual([
      ...["canvas", "id", "type", "kind", "name", "system", "description"],
      "attributes",
    ]);
    expect(edgeCore).toEqual([
      ...["canvas", "id", "type", "name", "system", "description"],
      ...["predicate", "subject", "object", "family", "attributes"],
    ]);
  });

  it("is true for every node attribute, also a list or an object (rule 19)", () => {
    const keys = ["n", "d", "dt", "z", "bool", "s", "list", "obj", "none"];
    expect(keys.filter((attr) => can(node, { attr }))).toEqual(keys);
    expect(keys.filter((attr) => can(edge, { attr }))).toEqual([]);
  });

  it("gives the input of each value kind (rule 5)", () => {
    const of = (attr: string) =>
      inputOf(node, { attr }, cellValue(node, { attr }));
    const keys = ["n", "d", "dt", "z", "bool", "s", "none", "list", "obj"];
    expect(keys.map(of)).toEqual([
      ...["number", "date", "datetime", "values", "boolean", "values"],
      ...["values", "list", "object"],
    ]);
  });
});

describe("S9 the input of each attribute cell", () => {
  it("opens a number, a date, a choice, text inputs and a JSON text on a list", async () => {
    const { root } = await f.opened(mountApp, kinds());
    const open = (id: string, column: string) => {
      f.dblclick(f.cellOf(root, id, column));
      const found = f.editors(root);
      const kind = found[0]?.querySelector("input")?.type ?? "none";
      const seg = found[0]?.querySelector(".seg[role=radiogroup]");
      if (found.length > 0)
        f.key(found[0].querySelector("input, button"), "Escape");
      return seg ? [...seg.children].map((b) => f.text(b)).join("/") : kind;
    };
    expect(open("a", "n")).toBe("number");
    expect(open("a", "d")).toBe("date");
    expect(open("a", "dt")).toBe("text");
    expect(open("a", "z")).toBe("text");
    expect(open("a", "bool")).toBe("Yes/No/No value");
    expect(open("a", "s")).toBe("text");
    expect(open("b", "n")).toBe("text");
    expect(open("a", "list")).toBe("text");
  });

  it("keeps the time of a date-time and removes the key with No value", async () => {
    const { root } = await f.opened(mountApp, kinds());
    f.dblclick(f.cellOf(root, "a", "dt"));
    f.type(f.input(root), "2027-05-06T07:08:09+02:00");
    f.key(f.input(root), "Enter");
    expect(recordOf("a")?.attrs.dt).toBe("2027-05-06T07:08:09+02:00");
    f.dblclick(f.cellOf(root, "a", "bool"));
    f.click(f.button(root, "No value"));
    f.key(root.querySelector(".cell-edit button"), "Enter");
    expect(Object.hasOwn(recordOf("a")?.attrs ?? {}, "bool")).toBe(false);
    expect(active()).toHaveLength(2);
  });

  it("saves No for a true/false cell and gives a null cell a text value", async () => {
    const { root } = await f.opened(mountApp, kinds());
    f.dblclick(f.cellOf(root, "a", "bool"));
    f.click(f.button(root, "No"));
    f.key(root.querySelector(".cell-edit button"), "Enter");
    expect(recordOf("a")?.attrs.bool).toBe(false);
    f.dblclick(f.cellOf(root, "a", "z"));
    expect(f.input(root)?.value).toBe("");
    f.type(f.input(root), "now set");
    f.key(f.input(root), "Enter");
    expect(recordOf("a")?.attrs.z).toBe("now set");
  });
});

describe("S10 a bad value stays in edit with its message", () => {
  const blocked = async (
    id: string,
    column: string,
    bad: (field: HTMLInputElement | null) => void,
  ) => {
    const frame = await f.opened(mountApp, kinds());
    f.dblclick(f.cellOf(frame.root, id, column));
    bad(f.input(frame.root));
    f.key(f.input(frame.root), "Enter");
    return frame.root;
  };

  it("gives not-a-date for 2026-02-30 on a date-time text input", async () => {
    const root = await blocked("a", "dt", (el) => f.type(el, "2026-02-30"));
    expect(f.message(root)).toBe("Type a valid date.");
    expect(f.input(root)?.getAttribute("aria-invalid")).toBe("true");
    expect(active()).toHaveLength(0);
    f.type(f.input(root), "2026-02-28");
    expect(f.message(root)).toBe("");
    expect(f.input(root)?.hasAttribute("aria-invalid")).toBe(false);
  });

  it("gives empty for an empty Name", async () => {
    const root = await blocked("a", "Name", (el) => f.type(el, ""));
    expect(f.message(root)).toBe("Type a value. This cell cannot be empty.");
    expect(f.editors(root)).toHaveLength(1);
    expect(recordOf("a")?.label).toBe("A");
  });

  it("gives not-a-number and not-a-date for a bad input and keeps the key", async () => {
    const root = await blocked("a", "n", f.markBad);
    expect(f.message(root)).toBe("Type a number.");
    expect(recordOf("a")?.attrs.n).toBe(5);
    const again = await blocked("a", "d", f.markBad);
    expect(f.message(again)).toBe("Type a valid date.");
    expect(recordOf("a")?.attrs.d).toBe("2025-02-18");
    expect(active()).toHaveLength(0);
  });
});

describe("S11 an empty input clears the value", () => {
  it("removes service_name, description and a text attribute", async () => {
    const { root } = await f.opened(mountApp, kinds());
    for (const column of ["System", "Description", "s"]) {
      f.dblclick(f.cellOf(root, "a", column));
      f.type(f.input(root), "");
      f.key(f.input(root), "Enter");
      expect(f.text(f.cellOf(root, "a", column))).toBe("");
    }
    const attrs = recordOf("a")?.attrs ?? {};
    expect(
      ["service_name", "description", "s"].map((k) => Object.hasOwn(attrs, k)),
    ).toEqual([false, false, false]);
    expect(active()).toHaveLength(3);
  });
});

// why: S14 ran before STORY-008-05 on this branch (commit fee11c1); STORY-008-09 rule 10 makes
// every data cell editable, so the cell that keeps no editor is a cell with no data for its row
// type (the Predicate cell of a node row)
describe("S14 no editor for a cell with no data for the row type", () => {
  it("presses the row only on the node Predicate cell", async () => {
    const { root } = await f.opened(mountApp, appInput(datasets.catalog.graph));
    f.search(root, "t_FCT_REVENUE");
    f.dblclick(f.cellOf(root, "t_FCT_REVENUE", "Predicate"));
    expect(state.selection.value).not.toBeNull();
    expect(f.editors(root)).toHaveLength(0);
    expect(active()).toHaveLength(0);
    f.dblclick(f.cellOf(root, "t_FCT_REVENUE", "Kind"));
    expect(f.editors(root)).toHaveLength(1);
  });
});
