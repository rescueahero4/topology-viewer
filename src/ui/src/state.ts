import { batch, computed, signal } from "@preact/signals";
import {
  applyEdits,
  EditHistory,
  resolveVocab,
  type CanvasState,
  type Counts,
  type Frontier,
  type Graph,
  type Lang,
  type Selection,
  type Shaped,
  type warningEntries,
} from "@qdic-topology/engine";
import type { AppInput } from "./App";
import type {
  Camera,
  CanvasEvent,
  CanvasModel,
  NoticeKind,
} from "./canvas/index";

// why: SA §5 UI, rule 4 — the shell state that the engine feeds, set only from the props and the
// canvas events. View state (an open menu or panel) stays in the module that owns it (reading d4)
export const model = signal<CanvasModel | null>(null);
export const warnings = signal<ReturnType<typeof warningEntries>>([]);
export const counts = signal<Counts | null>(null);
export const shaped = signal<Shaped | undefined>(undefined);
export const source = signal<"model" | "paste" | null>(null);
export const lang = signal<Lang>("en");
export const locale = signal("");
export const canvasState = signal<CanvasState | null>(null);
export const frontier = signal<Frontier | null>(null);
export const camera = signal<Camera | null>(null);
export const selection = signal<Selection>(null);
export const lastNotice = signal<NoticeKind | null>(null);
// why: STORY-004-08 rule 6 — the input on the canvas (after an Undo of a paste it is not the prop)
// and the state and camera of the last `settle`, for the Undo snapshot. STORY-008-04 (found by QA
// of STORY-008-02 and 03) — each `settle` also keeps the `editHistory` version of its time, so the
// kept row order knows the `settle` that came after the newest edit step
export const shownInput = signal<AppInput | null>(null);
export type Settled = { state: CanvasState; camera: Camera; version: number };
export const settled = signal<Settled | null>(null);

// why: SA §4.8, STORY-008-02 rule 1 — one history for each base input; the version changes on each
// push, undo and redo, so the computed values and the kept row order follow it. In memory only
// (SA §11 addendum 0.28)
export const editHistory = signal({ history: new EditHistory(), version: 0 });

// why: STORY-008-08 rule 5 (PRD-002 FR-CELL-12) — the last save, Undo or Redo with its change
// count, for the toast; a new object each time, so the toast shows again for the same kind
export type EditStep = { kind: "save" | "undo" | "redo"; count: number };
export const editStep = signal<EditStep | null>(null);

export function stepEdits(step: (history: EditHistory) => unknown): void {
  const { history, version } = editHistory.peek();
  step(history);
  editHistory.value = { history, version: version + 1 };
}

// why: SA §4.8 addendum 0.29 (1) — the edited graph uses the date that `normalize` got, never the
// clock; with no active edit it is the base graph itself
export const editedGraph = computed<Graph | null>(() => {
  const input = shownInput.value;
  if (input === null || !input.ok) return null;
  const edits = editHistory.value.history.active();
  const { graph } = input.model;
  return edits.length === 0 ? graph : applyEdits(graph, edits, input.now);
});

// why: STORY-008-02 rule 1 — the vocabulary of the edited graph; the payload, the canvas colour and
// the hash stay those of the base input, so a saved state stays valid (`canvas.ts` hash check)
export const editedModel = computed<CanvasModel | null>(() => {
  const input = shownInput.value;
  const graph = editedGraph.value;
  if (input === null || !input.ok || graph === null) return null;
  const base = input.model;
  if (graph === base.graph) return base;
  const { payload, canvas } = base;
  const { vocab } = resolveVocab(graph, payload, input.profile, canvas);
  return { ...base, graph, vocab };
});

// why: STORY-008-02 rule 7 (PRD-002 FR-CELL-13) — the edits belong to the base input. `same`: only
// the same input object keeps them ("Try again", the Undo of a view reset, a new language); the
// Undo of a paste gives another object. `hash`: a theme or locale change gives a new object from
// `normalize`, which keeps them when its base hash is the same
export type EditsKept = "same" | "hash";

function keepsEdits(was: AppInput | null, input: AppInput, kept: EditsKept) {
  if (was === input) return true;
  if (kept === "same" || was === null || !was.ok || !input.ok) return false;
  return was.model.hash === input.model.hash;
}

// why: owner decision H8 — a new input is a new canvas, so the state of the old canvas goes; the
// model is kept by reference only and never serialised (EPIC-002 hand-off items 1, 2)
export function takeInput(input: AppInput, kept: EditsKept): void {
  batch(() => {
    if (!keepsEdits(shownInput.peek(), input, kept)) {
      editHistory.value = {
        history: new EditHistory(),
        version: editHistory.peek().version + 1,
      };
      editStep.value = null;
    }
    shownInput.value = input;
    settled.value = null;
    model.value = input.ok ? input.model : null;
    warnings.value = input.ok ? input.warnings : [];
    counts.value = input.ok ? input.counts : null;
    shaped.value = input.ok ? input.shaped : undefined;
    source.value = input.ok ? input.source : null;
    canvasState.value = null;
    frontier.value = null;
    camera.value = null;
    selection.value = null;
    lastNotice.value = null;
  });
}

export function takeLanguage(next: Lang, nextLocale: string): void {
  batch(() => {
    lang.value = next;
    locale.value = nextLocale;
  });
}

type Feed = { readonly [K in keyof CanvasEvent]: (e: CanvasEvent[K]) => void };

// why: P4-3, EPIC-003 report `settle` fact 5 — each of `select`, `explore`, `drag-end` and `settle`
// carries the state; a method during a drag gives `drag-end` and no `settle`
export const feed: Feed = {
  select: (e) => {
    batch(() => {
      canvasState.value = e.state;
      selection.value = e.selection;
    });
  },
  explore: (e) => {
    canvasState.value = e.state;
  },
  "drag-end": (e) => {
    canvasState.value = e.state;
  },
  settle: (e) => {
    batch(() => {
      canvasState.value = e.state;
      frontier.value = e.frontier;
      camera.value = e.camera;
      settled.value = {
        state: e.state,
        camera: e.camera,
        version: editHistory.peek().version,
      };
    });
  },
  notice: (e) => {
    lastNotice.value = e.kind;
  },
};
