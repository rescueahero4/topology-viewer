import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EditHistory, type Edit } from "../index";

const editOf = (n: number): Edit => ({
  changes: [
    { row: { record: `r${n}` }, column: "name", before: "a", after: `${n}` },
  ],
  effect: { drew: [], undrew: [] },
});

describe("S14 the 20-step history", () => {
  const edits = Array.from({ length: 22 }, (_, i) => editOf(i + 1));

  it("drops the oldest edit above 20 from the steps and keeps it applied", () => {
    const history = new EditHistory();
    edits.slice(0, 21).forEach((edit) => history.push(edit));
    expect(history.done).toEqual(edits.slice(1, 21));
    expect(history.active()).toEqual(edits.slice(0, 21));
    while (history.undo() !== null);
    expect(history.active()).toEqual([edits[0]]);
  });

  it("undoes and redoes the moved edit in order", () => {
    const history = new EditHistory();
    edits.slice(0, 21).forEach((edit) => history.push(edit));
    expect(history.undo()).toBe(edits[20]);
    expect(history.undo()).toBe(edits[19]);
    expect(history.undone).toEqual([edits[20], edits[19]]);
    expect(history.redo()).toBe(edits[19]);
    expect(history.done.at(-1)).toBe(edits[19]);
    expect(history.undone).toEqual([edits[20]]);
    history.push(edits[21]);
    expect(history.undone).toEqual([]);
    expect(history.redo()).toBeNull();
    expect(history.active().at(-1)).toBe(edits[21]);
    expect(history.active()).toHaveLength(21);
  });

  it("gives `null` for undo and redo on an empty history", () => {
    const history = new EditHistory();
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
    expect(history.done).toEqual([]);
    expect(history.undone).toEqual([]);
  });
});

describe("S21 the edit tests import the edit parts from the engine entry", () => {
  const files = readdirSync(import.meta.dirname).filter((name) =>
    name.endsWith(".test.ts"),
  );

  it.each(files)("%s has no import path into `src/edit`", (name) => {
    const text = readFileSync(path.join(import.meta.dirname, name), "utf8");
    expect(text).toContain('from "../index"');
    expect(text).not.toMatch(/from "\.\/|from "\.\.\/edit\//);
  });

  it("covers the six test files", () => {
    expect(files).toHaveLength(6);
  });
});
