import type { DrawnId } from "../state/canvasState";
import type { CellChange, Edit } from "./types";

// why: PRD-002 FR-CELL-11 — the history keeps the last 20 edits of the session
const LIMIT = 20;

// why: SA §4.8 — plain arrays and no timers or DOM; the edited graph is `applyEdits` over `active()`.
// An edit dropped above 20 stays applied but cannot be undone (SA addendum 0.32). Addendum 0.33 (9)
// — `saved` holds at most one edit with every saved change, so Undo cannot reach a saved change
export class EditHistory {
  private savedList: Edit[] = [];
  private readonly keptList: Edit[] = [];
  private readonly doneList: Edit[] = [];
  private readonly undoneList: Edit[] = [];

  get done(): readonly Edit[] {
    return this.doneList;
  }

  get undone(): readonly Edit[] {
    return this.undoneList;
  }

  push(edit: Edit): void {
    this.doneList.push(edit);
    if (this.doneList.length > LIMIT)
      this.keptList.push(...this.doneList.splice(0, 1));
    this.undoneList.length = 0;
  }

  undo(): Edit | null {
    const edit = this.doneList.pop();
    if (edit === undefined) return null;
    this.undoneList.push(edit);
    return edit;
  }

  redo(): Edit | null {
    const edit = this.undoneList.pop();
    if (edit === undefined) return null;
    this.doneList.push(edit);
    return edit;
  }

  active(): readonly Edit[] {
    return [...this.savedList, ...this.keptList, ...this.doneList];
  }

  // The changes that are not saved yet, in order. A save sends only these.
  pending(): readonly CellChange[] {
    return [...this.keptList, ...this.doneList].flatMap((edit) => edit.changes);
  }

  dirty(): boolean {
    return (
      this.keptList.length + this.doneList.length + this.undoneList.length > 0
    );
  }

  // why: addendum 0.33 (9) — the changes of `saved`, `kept` and `done` in order make one saved edit
  // with an empty canvas effect; the dropped edits and their effects go, so their memory is free
  save(): void {
    const changes = this.active().flatMap((edit) => edit.changes);
    this.savedList =
      changes.length === 0
        ? []
        : [{ changes, effect: { drew: [], undrew: [] } }];
    this.clear();
  }

  cancel(): Edit[] {
    const cancelled = [...this.keptList, ...this.doneList];
    this.clear();
    return cancelled;
  }

  private clear(): void {
    this.keptList.length = 0;
    this.doneList.length = 0;
    this.undoneList.length = 0;
  }
}

// why: addendum 0.33 (9) — the Undo of each cancelled edit, newest first, in one step: for each id
// the oldest edit that names it decides; in its `drew` → undraw, in its `undrew` → draw
export function cancelEffect(edits: readonly Edit[]): {
  draw: DrawnId[];
  undraw: DrawnId[];
} {
  const last = new Map<DrawnId, boolean>();
  for (const { effect } of [...edits].reverse()) {
    for (const id of effect.drew) last.set(id, false);
    for (const id of effect.undrew) last.set(id, true);
  }
  const ids = (draw: boolean) =>
    [...last].filter(([, on]) => on === draw).map(([id]) => id);
  return { draw: ids(true), undraw: ids(false) };
}
