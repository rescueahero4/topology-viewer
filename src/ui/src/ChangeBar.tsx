import type { Lang } from "@qdic-topology/engine";
import type { Actions } from "./actions";
import { cancelEdits, keepEdits, redoEdit, undoEdit } from "./edits";
import { editHistory, editStep, lang, type EditStep } from "./state";
import { t } from "./strings/index";

// why: STORY-008-09 rule 8 (FR-CELL-16) — the result of each step, read by the `aria-live` region
function resultOf(ui: Lang, step: EditStep): string {
  if (step.kind === "undo") return t(ui, "edit.undone");
  if (step.kind === "cancel") return t(ui, "edit.cancelled");
  if (step.kind === "kept") return t(ui, "edit.saved");
  return step.count === 1
    ? t(ui, "edit.changedOne")
    : t(ui, "edit.changedMany", { count: step.count });
}

// why: STORY-008-09 rules 1-5 — the bar shows while the history has a step since the last save
// (an active edit, also one the 20-step history dropped, or a step to redo); each of Undo and Redo
// is off with no step
export function ChangeBar({ actions }: { actions: Actions }) {
  const ui = lang.value;
  const { history } = editHistory.value;
  const step = editStep.value;
  const open = history.active().length > 0 || history.undone.length > 0;
  return (
    <>
      <span class="sr-only" aria-live="polite">
        {step === null ? "" : resultOf(ui, step)}
      </span>
      {open && (
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
            onClick={() => undoEdit(actions)}
          >
            {t(ui, "wb.undo")}
          </button>
          <button
            type="button"
            class="btn small"
            disabled={history.undone.length === 0}
            onClick={() => redoEdit(actions)}
          >
            {t(ui, "wb.redo")}
          </button>
          <button
            type="button"
            class="btn small"
            onClick={() => cancelEdits(actions)}
          >
            {t(ui, "change.cancel")}
          </button>
          <button type="button" class="btn small primary" onClick={keepEdits}>
            {t(ui, "change.save")}
          </button>
        </div>
      )}
    </>
  );
}
