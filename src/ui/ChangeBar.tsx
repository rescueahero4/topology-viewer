import type { Lang } from "#engine";
import type { Actions } from "./actions";
import { cancelChanges, redoEdit, saveChanges, undoEdit } from "./edits";
import { extendable } from "./Part";
import { editHistory, editStep, lang, saveState, type EditStep } from "./state";
import { t } from "./strings/index";

// why: STORY-008-09 rule 8 (FR-CELL-16) — the result of each step, read by the `aria-live` region
function resultOf(ui: Lang, step: EditStep): string {
  if (step.kind === "undo") return t(ui, "edit.undone");
  if (step.kind === "cancelled") return t(ui, "edit.cancelled");
  if (step.kind === "saved") return t(ui, "edit.saved");
  if (step.kind === "failed") return t(ui, "edit.saveFailed");
  return step.count === 1
    ? t(ui, "edit.changedOne")
    : t(ui, "edit.changedMany", { count: step.count });
}

// why: SA addendum 0.33 (10) — the press outside of FR-CELL-3 runs first (`CellEditor` listens to
// `pointerdown`); the action runs only when no cell is in edit after it. FR-CELL-16 addendum 0.4:
// when the bar hides, the focus goes back to the tab stop of the table, the last focused cell
function whenFree(action: () => void | Promise<void>) {
  return (event: MouseEvent) => {
    const workbench = (event.currentTarget as Element).closest(".workbench");
    if (workbench?.querySelector(".cell-edit") != null) return;
    const refocus = () => {
      if (editHistory.peek().history.dirty()) return;
      workbench
        ?.querySelector<HTMLElement>('.wb-scroll td[tabindex="0"]')
        ?.focus();
    };
    const running = action();
    if (running instanceof Promise) void running.then(refocus);
    else refocus();
  };
}

// why: SA addendum 0.33 (9), (10), STORY-008-09 rules 1-5 — the bar shows while the history is
// `dirty()` (an unsaved edit, also one the 20-step history dropped, or a step to redo); each of
// Undo and Redo is off with no step
function ChangeBarView({ actions }: { actions: Actions }) {
  const ui = lang.value;
  const { history } = editHistory.value;
  const step = editStep.value;
  const { saving, error } = saveState.value;
  return (
    <>
      <span class="sr-only" aria-live="polite">
        {step === null ? "" : resultOf(ui, step)}
      </span>
      {history.dirty() && (
        <div
          class="change-bar float-card"
          role="group"
          aria-label={t(ui, "change.label")}
        >
          <span class="change-label">{t(ui, "change.label")}</span>
          {error !== null && (
            <span class="change-error" role="alert">
              {error}
            </span>
          )}
          <button
            type="button"
            class="btn small"
            disabled={saving || history.done.length === 0}
            onClick={whenFree(() => undoEdit(actions))}
          >
            {t(ui, "wb.undo")}
          </button>
          <button
            type="button"
            class="btn small"
            disabled={saving || history.undone.length === 0}
            onClick={whenFree(() => redoEdit(actions))}
          >
            {t(ui, "wb.redo")}
          </button>
          <button
            type="button"
            class="btn small"
            disabled={saving}
            onClick={whenFree(() => cancelChanges(actions))}
          >
            {t(ui, "change.cancel")}
          </button>
          <button
            type="button"
            class="btn small primary"
            disabled={saving}
            aria-busy={saving ? "true" : undefined}
            onClick={whenFree(saveChanges)}
          >
            {t(ui, saving ? "change.saving" : "change.save")}
          </button>
        </div>
      )}
    </>
  );
}

export const ChangeBar = extendable(
  "change-bar",
  ChangeBarView,
  ({ actions }) => {
    const { history } = editHistory.value;
    const { saving, error } = saveState.value;
    return {
      dirty: history.dirty(),
      saving,
      error,
      canUndo: history.done.length > 0,
      canRedo: history.undone.length > 0,
      save: () => saveChanges(),
      cancel: () => cancelChanges(actions),
      undo: () => undoEdit(actions),
      redo: () => redoEdit(actions),
    };
  },
);
