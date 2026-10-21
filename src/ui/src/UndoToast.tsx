import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";
import { snapshotOf, type Snapshot } from "./actions";
import type { AppInput } from "./App";
import { lang } from "./state";
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
  const keep = useCallback(() => setSnapshot(snapshotOf()), []);
  const close = useCallback(() => setSnapshot(null), []);
  return { snapshot, keep, close };
}

type Props = {
  snapshot: Snapshot | null;
  close: () => void;
  remake: (start: Start) => void;
};

// why: rule 6 (H1: the status stack, styles.css lines 303-305, and the focus-pill form, lines
// 321-332) — the text, then one action button; the press makes a new canvas with the saved input,
// state and camera and closes the toast
export function UndoToast({ snapshot, close, remake }: Props) {
  useEffect(() => {
    if (snapshot === null) return;
    const timer = setTimeout(close, TOAST_MS);
    return () => clearTimeout(timer);
  }, [snapshot, close]);
  if (snapshot === null) return null;
  const ui = lang.value;
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
