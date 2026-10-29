import type { Edit } from "./types";

// why: PRD-002 FR-CELL-11 — the history keeps the last 20 edits of the session
const LIMIT = 20;

// why: SA §4.8 — plain arrays and no timers or DOM; the edited graph is `applyEdits` over `active()`
export class EditHistory {
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
    if (this.doneList.length > LIMIT) this.doneList.shift();
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
    return [...this.doneList];
  }
}
