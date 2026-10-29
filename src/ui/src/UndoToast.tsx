import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";
import type { Lang } from "@qdic-topology/engine";
import { snapshotOf, type Actions, type Snapshot } from "./actions";
import type { AppInput } from "./App";
import { undoEdit } from "./edits";
import { editStep, lang, type EditStep } from "./state";
import { t } from "./strings/index";
import type { Start } from "./useRenderer";

// why: FR-CANVAS-18 — the toast shows for 10 s
const TOAST_MS = 10_000;

// why: rule 6 — a budget change, a reset or a pasted input keeps a snapshot; a new trigger replaces
// it; an input from the model closes the toast. SA §10 guardrail 6 (ISSUE-012 C12) — a pasted
// fatal input keeps the snapshot too, so the toast brings the previous chart back
export function useUndo(input: AppInput) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSnapshot(input.source === "paste" ? snapshotOf() : null);
  }, [input]);
  // why: STORY-008-08 rule 5 — a view-reset trigger replaces the edit toast (one toast at a time)
  const keep = useCallback(() => {
    editStep.value = null;
    setSnapshot(snapshotOf());
  }, []);
  const close = useCallback(() => setSnapshot(null), []);
  return { snapshot, keep, close };
}

type Props = {
  snapshot: Snapshot | null;
  close: () => void;
  remake: (start: Start) => void;
  actions: Actions | null;
};

// why: STORY-008-08 rule 5 (PRD-002 FR-CELL-12) — "Cell changed" or "N cells changed" with the
// Undo of the Undo button after a save and a Redo; "Change undone" with no button after an Undo
function EditToast(props: { ui: Lang; step: EditStep; actions: Actions }) {
  const { ui, step, actions } = props;
  return (
    <div class="undo-toast float-card" aria-live="polite">
      <span class="ut-txt">
        {step.kind === "undo"
          ? t(ui, "edit.undone")
          : step.count === 1
            ? t(ui, "edit.changedOne")
            : t(ui, "edit.changedMany", { count: step.count })}
      </span>
      {step.kind !== "undo" && (
        <button type="button" class="fp-act" onClick={() => undoEdit(actions)}>
          {t(ui, "undo.action")}
        </button>
      )}
    </div>
  );
}

// why: STORY-008-08 rule 5 — each edit step shows for 10 s and replaces the view toast
function useEditStep(close: () => void): EditStep | null {
  const step = editStep.value;
  useLayoutEffect(() => {
    if (step !== null) close();
  }, [step]);
  useEffect(() => {
    if (step === null) return;
    const timer = setTimeout(() => {
      if (editStep.peek() === step) editStep.value = null;
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [step]);
  return step;
}

// why: rule 6 (H1: the status stack, styles.css lines 303-305, and the focus-pill form, lines
// 321-332) — the text, then one action button; the press makes a new canvas with the saved input,
// state and camera and closes the toast
export function UndoToast({ snapshot, close, remake, actions }: Props) {
  const step = useEditStep(close);
  useEffect(() => {
    if (snapshot === null) return;
    const timer = setTimeout(close, TOAST_MS);
    return () => clearTimeout(timer);
  }, [snapshot, close]);
  const ui = lang.value;
  if (step !== null && actions !== null)
    return <EditToast ui={ui} step={step} actions={actions} />;
  if (snapshot === null) return null;
  return (
    <div class="undo-toast float-card" aria-live="polite">
      <span class="ut-txt">{t(ui, "undo.text")}</span>
      <button
        type="button"
        class="fp-act"
        onClick={() => {
          close();
          remake(snapshot);
        }}
      >
        {t(ui, "undo.action")}
      </button>
    </div>
  );
}
