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

// why: STORY-008-04 rule 4 (PRD-002 FR-CELL-5) — a bad value gives its code and no save; an
// unchanged value closes the editor with no history step
export function trySave(
  actions: Actions,
  row: Row,
  column: Column,
  read: Read,
): EditCode | null {
  if ("code" in read) return read.code;
  const base = model.peek();
  const now = editedModel.peek();
  const input = shownInput.peek();
  if (base === null || now === null || input === null || !input.ok)
    return null;
  const change = changeOf(base.graph, row, column, read.after);
  if (sameValue(change.before, change.after)) return null;
  const code = checkEdit(now.graph, input.profile, change);
  if (code !== null) return code;
  saveEdit(actions, [change]);
  return null;
}
