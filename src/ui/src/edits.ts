import {
  checkEdit,
  type CellChange,
  type Edit,
  type EditCode,
} from "@qdic-topology/engine";
import type { Actions } from "./actions";
import { endsToDraw } from "./canvas/index";
import { changeOf, sameValue, type Read } from "./cellEdit";
import { localVocab } from "./names";
import { editedModel, lang, model, shownInput, stepEdits } from "./state";
import type { Column } from "./workbenchColumns";
import type { Row } from "./workbenchRows";

// why: SA §4.8, STORY-008-04 rule 6 — one save is one history step: the edit goes into the
// history, the canvas gets the edited graph and the localised edited vocabulary with the not-drawn
// new ends to draw, and the edit keeps the canvas effect for Undo. In memory only; nothing goes to
// the host (SA §11 addendum 0.28)
export function saveEdit(actions: Actions, changes: CellChange[]): void {
  const edit: Edit = { changes, effect: { drew: [], undrew: [] } };
  stepEdits((history) => history.push(edit));
  const now = editedModel.peek();
  if (now === null) return;
  const draw = endsToDraw(edit, now.graph, (id) => actions.onCanvas(id));
  const vocab = localVocab(lang.peek(), now.vocab);
  edit.effect = actions.applyEdit(now.graph, vocab, { draw, undraw: [] });
}

type Checked = { code: EditCode | null; change: CellChange | null };

// why: STORY-008-04 rule 4 (PRD-002 FR-CELL-5) — the code of a bad value, or the change; an
// unchanged value gives no change, so the editor closes with no history step
function checked(row: Row, column: Column, read: Read): Checked {
  if ("code" in read) return { code: read.code, change: null };
  const base = model.peek();
  const now = editedModel.peek();
  const input = shownInput.peek();
  if (base === null || now === null || input === null || !input.ok)
    return { code: null, change: null };
  const change = changeOf(base.graph, row, column, read.after);
  if (sameValue(change.before, change.after))
    return { code: null, change: null };
  return { code: checkEdit(now.graph, input.profile, change), change };
}

export const checkCell = (row: Row, column: Column, read: Read) =>
  checked(row, column, read).code;

// why: STORY-008-04 rule 4 — a save runs `checkEdit` first; with a code the save does not occur
export function trySave(
  actions: Actions,
  row: Row,
  column: Column,
  read: Read,
): EditCode | null {
  const { code, change } = checked(row, column, read);
  if (code === null && change !== null) saveEdit(actions, [change]);
  return code;
}
