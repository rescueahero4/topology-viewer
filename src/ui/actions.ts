import type {
  Budget,
  CanvasState,
  DrawnId,
  EditEffect,
  Graph,
  Grouping,
  LayoutName,
  OnCanvas,
  Vocab,
} from "#engine";
import type { AppInput } from "./App";
import type { Camera, Canvas, EditEnds } from "./canvas/index";
import { settled, shownInput } from "./state";

export type Actions = {
  setBudget(n: Budget): void;
  resetView(): void;
  setLayout(name: LayoutName): void;
  showAllTypes(): void;
  toggleType(type: string | null, on: boolean): void;
  toggleFamily(family: string, on: boolean): void;
  togglePredicate(predicate: string, on: boolean): void;
  setGrouping(grouping: Grouping): void;
  select(id: string | null): void;
  focus(id: string): void;
  expand(id: DrawnId): void;
  collapse(id: DrawnId): void;
  hide(ids: DrawnId[]): void;
  restore(keys: DrawnId[]): void;
  reveal(path: string[]): void;
  groupAroundRoot(on: boolean): void;
  clearAndFit(): void;
  onCanvas(id: string): OnCanvas;
  applyEdit(graph: Graph, vocab: Vocab, ends: EditEnds): EditEffect;
};

export type Snapshot = {
  input: Extract<AppInput, { ok: true }>;
  state: CanvasState;
  camera: Camera;
};

// why: STORY-004-08 rule 6 (FR-CANVAS-18, EPIC-003 H8) — the input on the canvas with the state
// and the camera of its last `settle`; in memory only (Security notes)
export function snapshotOf(): Snapshot | null {
  const input = shownInput.value;
  const last = settled.value;
  if (input === null || !input.ok || last === null) return null;
  return { input, state: last.state, camera: last.camera };
}

// why: rule 1, SA §4.5 — each control of the shell calls one canvas method through this module;
// there is no `setGrouping` method, so the Grouping change is a filter action. STORY-004-08 rule 6
// — a budget change and a reset first keep the snapshot for the Undo toast
export function actionsOf(canvas: Canvas, keep: () => void): Actions {
  return {
    setBudget: (n) => {
      keep();
      canvas.setBudget(n);
    },
    resetView: () => {
      keep();
      canvas.resetView();
    },
    setLayout: (name) => canvas.setLayout(name),
    showAllTypes: () => canvas.setFilters({ kind: "showAllTypes" }),
    toggleType: (type, on) =>
      canvas.setFilters({ kind: "toggleType", type, on }),
    toggleFamily: (family, on) =>
      canvas.setFilters({ kind: "toggleFamily", family, on }),
    togglePredicate: (predicate, on) =>
      canvas.setFilters({ kind: "togglePredicate", predicate, on }),
    setGrouping: (grouping) =>
      canvas.setFilters({ kind: "grouping", grouping }),
    select: (id) => canvas.select(id),
    focus: (id) => canvas.focus(id),
    expand: (id) => canvas.expand(id),
    collapse: (id) => canvas.collapse(id),
    hide: (ids) => canvas.hide(ids),
    restore: (keys) => canvas.restore(keys),
    reveal: (path) => canvas.reveal(path),
    groupAroundRoot: (on) => canvas.groupAroundRoot(on),
    // why: STORY-004-05 rule 8, question 17 (mockup app.js line 803) — the selection goes first,
    // then the view fits
    clearAndFit: () => {
      canvas.select(null);
      canvas.fit();
    },
    // why: SA §4.8, STORY-008-04 rule 6 — the save path reads the canvas state of each new end and
    // applies the edit through this module
    onCanvas: (id) => canvas.onCanvas(id),
    applyEdit: (graph, vocab, ends) => canvas.applyEdit(graph, vocab, ends),
  };
}
