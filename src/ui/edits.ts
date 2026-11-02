import {
  attributeChanges,
  cancelEffect,
  checkEdit,
  entityDrawnId,
  familyPredicateName,
  readAttributes,
  sameValueRows,
  type CellChange,
  type Edit,
  type EditCode,
  type Graph,
  type RowRef,
} from "#engine";
import type { Actions } from "./actions";
import { endsToDraw } from "./canvas/index";
import { changeOf, sameValue, type Read, type Saved } from "./cellEdit";
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

// why: SA addendum 0.33 (9), STORY-008-09 rule 4 — "Cancel change" takes back every unsaved edit,
// also the edits that the 20-step history dropped (addendum 0.32), in one canvas step with no
// confirmation
export function cancelChanges(actions: Actions): void {
  let cancelled: Edit[] = [];
  stepEdits((history) => (cancelled = history.cancel()));
  editStep.value = { kind: "cancelled", count: cancelled.length };
  const now = editedModel.peek();
  if (now === null || cancelled.length === 0) return;
  const vocab = localVocab(lang.peek(), now.vocab);
  actions.applyEdit(now.graph, vocab, cancelEffect(cancelled));
}

// why: SA addendum 0.33 (9), STORY-008-09 rule 5 — "Save changes" folds the unsaved edits into the
// one saved edit and empties Undo and Redo; the edited graph is the same, so the canvas does not move
export function saveChanges(): void {
  const count = editHistory.peek().history.done.length;
  stepEdits((history) => history.save());
  editStep.value = { kind: "saved", count };
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
function checked(row: Row, column: Column, read: Read): Checked {
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

const isCore = (column: Column, key: string) =>
  "core" in column && column.core === key;

type SetRead = { code: EditCode } | { changes: CellChange[] };

// why: SA §4.8 addendum 0.33 (6) — the Attributes text is read by the row type; the changes of one
// save are the replace of the set (`attributeChanges`), for this row only
function setRead(row: Row, read: Read): SetRead {
  if ("code" in read) return read;
  const text = typeof read.after === "string" ? read.after : "";
  const found = readAttributes(text, row.rtype);
  const base = model.peek();
  const now = editedModel.peek();
  if ("code" in found) return found;
  if (base === null || now === null) return { changes: [] };
  const ref = changeOf(base.graph, row, { core: "attributes" }, null).row;
  return { changes: attributeChanges(now.graph, ref, found.entries) };
}

export function checkCell(row: Row, column: Column, read: Read) {
  if (isCore(column, "canvas")) return null;
  if (isCore(column, "attributes")) {
    const found = setRead(row, read);
    return "code" in found ? found.code : null;
  }
  return checked(row, column, read).code;
}

// why: SA §4.8 addendum 0.33 (4) — the Canvas select is not an edit: one row of the bulk bar rules.
// "On canvas" draws or restores the node, or the ends of an edge; "Not on canvas" hides a node
// (the canvas keeps one node drawn); an edge row has no "Not on canvas"
function canvasSave(actions: Actions, row: Row, read: Read): EditCode | null {
  if ("code" in read) return read.code;
  const ends = row.rtype === "node" ? [row.entity] : [row.subject, row.object];
  if (read.after === "on") actions.reveal(ends);
  else if (row.rtype === "node") actions.hide([entityDrawnId(row.entity)]);
  return null;
}

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

// why: SA §4.8 addendum 0.33 (5) — "this row only" on a Family gives the edge its own predicate
// `familyPredicateName`, then the family, in one edit of two changes
function ownFamily(actions: Actions, row: Row, found: Checked) {
  const base = model.peek();
  const input = shownInput.peek();
  const { change, check, graph } = found;
  if (row.rtype !== "edge" || !input?.ok || !base || !change || !graph)
    return null;
  const family = String(change.after);
  const { profile } = input;
  const name = familyPredicateName(
    graph,
    profile,
    base.payload,
    row.triple.predicate,
    family,
  );
  const own = changeOf(base.graph, row, { core: "predicate" }, name);
  const code = check(own);
  if (code !== null) return code;
  saveEdit(actions, [own, change]);
  return null;
}

// why: STORY-008-04 rule 4 — a save runs `checkEdit` first; with a code the save does not occur.
// STORY-008-07 rule 1 (FR-CELL-6) — with 2 or more rows of the same old value the save asks; an
// empty old value gives one row (`sameValueRows`), so it saves at once. SA §4.8 addendum 0.33
// (4)-(6) — Canvas is a canvas action; Attributes saves this row only
export function trySave(
  actions: Actions,
  row: Row,
  column: Column,
  read: Read,
  shown: ReadonlySet<number>,
): Saved {
  if (isCore(column, "canvas")) return canvasSave(actions, row, read);
  if (isCore(column, "attributes")) {
    const found = setRead(row, read);
    if ("code" in found) return found.code;
    if (found.changes.length > 0) saveEdit(actions, found.changes);
    return null;
  }
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
      if (isCore(column, "family")) return ownFamily(actions, row, found);
      saveEdit(actions, [change]);
      return null;
    },
  };
}
