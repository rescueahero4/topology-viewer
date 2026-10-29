import {
  checkEdit,
  sameValueRows,
  type CellChange,
  type Edit,
  type EditCode,
  type Graph,
  type RowRef,
} from "@qdic-topology/engine";
import type { Actions } from "./actions";
import { endsToDraw } from "./canvas/index";
import {
  changeOf,
  sameValue,
  type Read,
  type Saved,
  type Target,
} from "./cellEdit";
import { localVocab } from "./names";
import {
  editedModel,
  editHistory,
  editStep,
  lang,
  model,
  shownInput,
  stepEdits,
} from "./state";
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
  draws.set(edit, draw);
  const vocab = localVocab(lang.peek(), now.vocab);
  edit.effect = actions.applyEdit(now.graph, vocab, { draw, undraw: [] });
  editStep.value = { kind: "save", count: changes.length };
}

// why: STORY-008-08 rule 3 (memo 2026-10-29-implementer-group-a-build item 7) — the `draw` list of
// the first save stays with its edit, so Redo draws the same ends; in memory only
const draws = new WeakMap<Edit, string[]>();

// why: SA §4.8 addendum 0.29 (2), STORY-008-08 rule 2 (FR-CELL-11) — Undo applies the edited graph
// without the newest edit, with `draw` = its `undrew` (back at the old place) and `undraw` = its
// `drew` (back to not drawn)
export function undoEdit(actions: Actions): void {
  const edit = editHistory.peek().history.done.at(-1);
  if (edit === undefined) return;
  stepEdits((history) => history.undo());
  const now = editedModel.peek();
  if (now === null) return;
  const vocab = localVocab(lang.peek(), now.vocab);
  const { drew, undrew } = edit.effect;
  actions.applyEdit(now.graph, vocab, { draw: undrew, undraw: drew });
  editStep.value = { kind: "undo", count: edit.changes.length };
}

// why: STORY-008-08 rule 3 (FR-CELL-11) — Redo applies the edit again with the same `draw` list as
// the first save and keeps the new effect for the next Undo
export function redoEdit(actions: Actions): void {
  const edit = editHistory.peek().history.undone.at(-1);
  if (edit === undefined) return;
  stepEdits((history) => history.redo());
  const now = editedModel.peek();
  if (now === null) return;
  const vocab = localVocab(lang.peek(), now.vocab);
  const draw = draws.get(edit) ?? [];
  edit.effect = actions.applyEdit(now.graph, vocab, { draw, undraw: [] });
  editStep.value = { kind: "redo", count: edit.changes.length };
}

type Checked = {
  code: EditCode | null;
  change: CellChange | null;
  check: (change: CellChange) => EditCode | null;
  graph: Graph | null;
};

const NOTHING: Checked = {
  code: null,
  change: null,
  check: () => null,
  graph: null,
};

// why: STORY-008-04 rule 4 (PRD-002 FR-CELL-5) — the code of a bad value, or the change; an
// unchanged value gives no change, so the editor closes with no history step
function checked(row: Row, column: Target, read: Read): Checked {
  if ("code" in read) return { ...NOTHING, code: read.code };
  const base = model.peek();
  const now = editedModel.peek();
  const input = shownInput.peek();
  if (base === null || now === null || input === null || !input.ok)
    return NOTHING;
  const change = changeOf(base.graph, row, column, read.after);
  if (sameValue(change.before, change.after)) return NOTHING;
  const check = (one: CellChange) => checkEdit(now.graph, input.profile, one);
  return { code: check(change), change, check, graph: now.graph };
}

export const checkCell = (row: Row, column: Target, read: Read) =>
  checked(row, column, read).code;

// why: STORY-008-07 rule 2 — the place of a row in the row list: the records, then the triples
function placesOf(base: Graph): (ref: RowRef) => number {
  const records = new Map(base.records.map((r, at) => [r.id, at]));
  const triples = new Map(base.triples.map((t, at) => [t.key, at]));
  const offset = base.records.length;
  return (ref) =>
    "record" in ref
      ? (records.get(ref.record) ?? -1)
      : offset + (triples.get(ref.triple) ?? -1);
}

// why: STORY-008-07 rule 3 (PRD-002 FR-CELL-5, FR-CELL-6) — "all N rows" is one edit with one change
// for each row in graph order; each change is checked, and one code saves nothing
function applyAll(actions: Actions, found: Checked, refs: RowRef[]) {
  const { change, check } = found;
  if (change === null) return null;
  const changes = refs.map((ref) => ({ ...change, row: ref }));
  for (const one of changes) {
    const code = check(one);
    if (code !== null) return code;
  }
  saveEdit(actions, changes);
  return null;
}

// why: STORY-008-04 rule 4 — a save runs `checkEdit` first; with a code the save does not occur.
// STORY-008-07 rule 1 (FR-CELL-6) — with 2 or more rows of the same old value the save asks; an
// empty old value gives one row (`sameValueRows`), so it saves at once
export function trySave(
  actions: Actions,
  row: Row,
  column: Target,
  read: Read,
  shown: ReadonlySet<number>,
): Saved {
  const found = checked(row, column, read);
  const { code, change, graph } = found;
  if (code !== null || change === null || graph === null) return code;
  const refs = sameValueRows(graph, change.row, change.column);
  if (refs.length < 2) {
    saveEdit(actions, [change]);
    return null;
  }
  const base = model.peek();
  const place = base === null ? () => -1 : placesOf(base.graph);
  return {
    count: refs.length,
    hidden: refs.filter((ref) => !shown.has(place(ref))).length,
    apply: (all) => {
      if (all) return applyAll(actions, found, refs);
      saveEdit(actions, [change]);
      return null;
    },
  };
}
