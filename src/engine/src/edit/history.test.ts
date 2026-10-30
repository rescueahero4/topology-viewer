import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cancelEffect, EditHistory, type Edit } from "../index";

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

describe("STORY-008-09 save, cancel and the cancel effect (SA addendum 0.33 (9))", () => {
  const edits = Array.from({ length: 23 }, (_, i) => editOf(i + 1));
  const effectOf = (drew: string[], undrew: string[]): Edit => ({
    ...editOf(0),
    effect: { drew, undrew },
  });

  it("folds saved, kept and done into one saved edit; Undo cannot reach it", () => {
    const history = new EditHistory();
    edits.slice(0, 21).forEach((edit) => history.push(edit));
    history.undo();
    expect(history.dirty()).toBe(true);
    history.save();
    expect(history.dirty()).toBe(false);
    expect([history.done, history.undone]).toEqual([[], []]);
    const changes = edits.slice(0, 20).flatMap((edit) => edit.changes);
    expect(history.active()).toEqual([
      { changes, effect: { drew: [], undrew: [] } },
    ]);
    expect(history.undo()).toBeNull();
    history.push(edits[21]);
    history.save();
    expect(history.active()[0].changes).toEqual([
      ...changes,
      ...edits[21].changes,
    ]);
  });

  it("cancel returns kept and done in order and keeps the saved edit", () => {
    const history = new EditHistory();
    history.push(edits[0]);
    history.save();
    const saved = history.active();
    edits.slice(1, 23).forEach((edit) => history.push(edit));
    history.undo();
    expect(history.cancel()).toEqual(edits.slice(1, 22));
    expect(history.active()).toEqual(saved);
    expect(history.dirty()).toBe(false);
  });

  it("is dirty with only Redo steps left", () => {
    const history = new EditHistory();
    history.push(edits[0]);
    history.undo();
    expect(history.dirty()).toBe(true);
  });

  it("lets the oldest cancelled edit decide each id", () => {
    const first = effectOf(["a", "b"], ["c"]);
    const second = effectOf(["c"], ["a", "d"]);
    expect(cancelEffect([first, second])).toEqual({
      draw: ["c", "d"],
      undraw: ["a", "b"],
    });
  });
});
