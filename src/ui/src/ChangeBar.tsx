import type { Lang } from "@qdic-topology/engine";
import type { Actions } from "./actions";
import { cancelChanges, redoEdit, saveChanges, undoEdit } from "./edits";
import { editHistory, editStep, lang, type EditStep } from "./state";
import { t } from "./strings/index";

// why: STORY-008-09 rule 8 (FR-CELL-16) — the result of each step, read by the `aria-live` region
function resultOf(ui: Lang, step: EditStep): string {
  if (step.kind === "undo") return t(ui, "edit.undone");
  if (step.kind === "cancelled") return t(ui, "edit.cancelled");
  if (step.kind === "saved") return t(ui, "edit.saved");
  return step.count === 1
    ? t(ui, "edit.changedOne")
    : t(ui, "edit.changedMany", { count: step.count });
}

// why: SA addendum 0.33 (10) — the press outside of FR-CELL-3 runs first (`CellEditor` listens to
// `pointerdown`); the action runs only when no cell is in edit after it
function whenFree(action: () => void) {
  return (event: MouseEvent) => {
    const workbench = (event.currentTarget as Element).closest(".workbench");
    if (workbench?.querySelector(".cell-edit") != null) return;
    action();
  };
}

// why: SA addendum 0.33 (9), (10), STORY-008-09 rules 1-5 — the bar shows while the history is
// `dirty()` (an unsaved edit, also one the 20-step history dropped, or a step to redo); each of
// Undo and Redo is off with no step
export function ChangeBar({ actions }: { actions: Actions }) {
  const ui = lang.value;
  const { history } = editHistory.value;
  const step = editStep.value;
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
          <button
            type="button"
            class="btn small"
            disabled={history.done.length === 0}
            onClick={whenFree(() => undoEdit(actions))}
          >
            {t(ui, "wb.undo")}
          </button>
          <button
            type="button"
            class="btn small"
            disabled={history.undone.length === 0}
            onClick={whenFree(() => redoEdit(actions))}
          >
            {t(ui, "wb.redo")}
          </button>
          <button
            type="button"
            class="btn small"
            onClick={whenFree(() => cancelChanges(actions))}
          >
            {t(ui, "change.cancel")}
          </button>
          <button
            type="button"
            class="btn small primary"
            onClick={whenFree(saveChanges)}
          >
            {t(ui, "change.save")}
          </button>
        </div>
      )}
    </>
  );
}
