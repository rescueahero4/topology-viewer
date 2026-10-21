import type {
  Budget,
  DrawnId,
  Grouping,
  LayoutName,
} from "@qdic-topology/engine";
import type { Canvas } from "./canvas/index";

export type Actions = {
  setBudget(n: Budget): void;
  resetView(): void;
  setLayout(name: LayoutName): void;
  toggleType(type: string | null, on: boolean): void;
  toggleFamily(family: string, on: boolean): void;
  togglePredicate(predicate: string, on: boolean): void;
  setGrouping(grouping: Grouping): void;
  select(id: string | null): void;
  focus(id: string): void;
  expand(id: DrawnId): void;
  collapse(id: DrawnId): void;
  hide(ids: DrawnId[]): void;
  groupAroundRoot(on: boolean): void;
  clearAndFit(): void;
};

// why: rule 1, SA §4.5 — each control of the shell calls one canvas method through this module;
// there is no `setGrouping` method, so the Grouping change is a filter action
export function actionsOf(canvas: Canvas): Actions {
  return {
    setBudget: (n) => canvas.setBudget(n),
    resetView: () => canvas.resetView(),
    setLayout: (name) => canvas.setLayout(name),
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
    groupAroundRoot: (on) => canvas.groupAroundRoot(on),
    // why: STORY-004-05 rule 8, question 17 (mockup app.js line 803) — the selection goes first,
    // then the view fits
    clearAndFit: () => {
      canvas.select(null);
      canvas.fit();
    },
  };
}
