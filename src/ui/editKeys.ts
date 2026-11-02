import type { Actions } from "./actions";
import { redoEdit, undoEdit } from "./edits";

// why: STORY-008-08 rule 4 (PRD-002 FR-CELL-11, §10 risk 4) — Ctrl+Z (Cmd+Z on macOS) undoes and
// Ctrl+Shift+Z (Cmd+Shift+Z) redoes while the focus is in the Workbench and no cell is in edit; in
// a cell editor, its form or its choice the keys stay with the input text, as the browser does
export function editKeyOf(event: KeyboardEvent): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.key.toLowerCase() !== "z") return null;
  const target = event.target;
  if (target instanceof Element && target.closest(".cell-edit") !== null)
    return null;
  return event.shiftKey ? "redo" : "undo";
}

// why: rule 4 — the handler of the Workbench section stops the event, so the host page gets no
// Undo of its own (PRD-002 §10 risk 4)
export const editKeys = (actions: Actions | null) => (event: KeyboardEvent) => {
  const key = editKeyOf(event);
  if (key === null || actions === null) return;
  event.preventDefault();
  event.stopPropagation();
  if (key === "undo") undoEdit(actions);
  else redoEdit(actions);
};
