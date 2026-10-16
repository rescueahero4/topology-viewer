import { profile } from "@qdic-topology/contract";
import { byCodePoint } from "../data/hash";
import type { CanvasState, Filters, Grouping } from "../state/canvasState";
import { CUSTOM, own, type Provenance } from "../vocab/predicates";
import type { Vocab } from "../vocab/resolve";

export type TypeRow = {
  type: string;
  count: number;
  group: string;
  provenance: Provenance;
  on: boolean;
};

export type FamilyRow = { family: string; count: number; on: boolean };

export type PredicateRow = {
  predicate: string;
  family: string;
  count: number;
  on: boolean;
};

export type Stats = {
  types: TypeRow[];
  families: FamilyRow[];
  predicates: PredicateRow[];
};

export type Mode = "basic" | "advanced";

export type FilterModes = { families: Mode; predicates: Mode };

export const NO_FILTERS: Filters = {
  typesOff: [],
  familiesOff: [],
  predicatesOff: [],
};

// why: app.js `FILTER_BASIC_MAX` (line 294) — more options than this make the row a dropdown
const BASIC_MAX = 10;

// why: PRD FR-FILTER-3 and STORY-002-09 T3 — a profile category in `typeMenuCategories.order` is its
// own group; every other type is in Custom, so no category name is in engine code (D7, D13)
function groupOf(type: string): string {
  const category = own(profile.nodeTypes, type)?.category;
  return category !== undefined &&
    profile.typeMenuCategories.order.includes(category)
    ? category
    : CUSTOM;
}

// why: mockup `stats` (lib/topology.js lines 2261-2291) — dataset totals of the present types,
// families and predicates; types by count, predicates by family order, then count
export function stats(vocab: Vocab, state: CanvasState): Stats {
  const typesOff = new Set(state.filters.typesOff);
  const familiesOff = new Set(state.filters.familiesOff);
  const predicatesOff = new Set(state.filters.predicatesOff);
  const types = [...vocab.types.values()]
    .filter((type) => type.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((type) => ({
      type: type.name,
      count: type.count,
      group: groupOf(type.name),
      provenance: type.provenance,
      on: !typesOff.has(type.name),
    }));
  const families = vocab.families.map(({ key, count }) => ({
    family: key,
    count,
    on: !familiesOff.has(key),
  }));
  const rank = new Map(families.map((row, index) => [row.family, index]));
  const predicates = [...vocab.predicates.values()]
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        (rank.get(a.family) as number) - (rank.get(b.family) as number) ||
        b.count - a.count,
    )
    .map((item) => ({
      predicate: item.name,
      family: item.family,
      count: item.count,
      on: !predicatesOff.has(item.name),
    }));
  return { types, families, predicates };
}

// why: app.js lines 308-309 and ddr-0035 — the mode follows the dataset totals, so a filter turned
// off never flips it (FR-FILTER-7, P18)
export function filterMode(rows: Stats): FilterModes {
  const mode = (count: number): Mode =>
    count > BASIC_MAX ? "advanced" : "basic";
  return {
    families: mode(rows.families.length),
    predicates: mode(rows.predicates.length),
  };
}

function switched(list: string[], name: string, on: boolean): string[] {
  if (on) return list.filter((item) => item !== name);
  return list.includes(name) ? list : [...list, name].sort(byCodePoint);
}

function withFilters(state: CanvasState, filters: Filters): CanvasState {
  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((item, index) => item === b[index]);
  const before = state.filters;
  if (
    same(before.typesOff, filters.typesOff) &&
    same(before.familiesOff, filters.familiesOff) &&
    same(before.predicatesOff, filters.predicatesOff)
  )
    return state;
  return { ...state, filters };
}

// why: STORY-002-06 question 1 — a type change keeps every position; no layout runs (FR-CANVAS-8)
export function toggleType(
  state: CanvasState,
  vocab: Vocab,
  type: string,
  on: boolean,
): CanvasState {
  if ((vocab.types.get(type)?.count ?? 0) === 0) return state;
  const typesOff = switched(state.filters.typesOff, type, on);
  return withFilters(state, { ...state.filters, typesOff });
}

export function showAllTypes(state: CanvasState): CanvasState {
  return withFilters(state, { ...state.filters, typesOff: [] });
}

// why: mockup `toggleCategory` (lib/topology.js lines 2337-2342) — a family toggle also turns on
// every predicate of that family, so a family turned on shows all of it
export function toggleFamily(
  state: CanvasState,
  vocab: Vocab,
  family: string,
  on: boolean,
): CanvasState {
  if (!vocab.families.some((item) => item.key === family)) return state;
  const predicatesOff = state.filters.predicatesOff.filter(
    (name) => vocab.predicates.get(name)?.family !== family,
  );
  const familiesOff = switched(state.filters.familiesOff, family, on);
  return withFilters(state, { ...state.filters, familiesOff, predicatesOff });
}

export function togglePredicate(
  state: CanvasState,
  vocab: Vocab,
  predicate: string,
  on: boolean,
): CanvasState {
  if ((vocab.predicates.get(predicate)?.count ?? 0) === 0) return state;
  const predicatesOff = switched(state.filters.predicatesOff, predicate, on);
  return withFilters(state, { ...state.filters, predicatesOff });
}

// why: mockup `setGroupThreshold` (lib/topology.js line 2333) and STORY-002-06 question 1 — the
// drawn set and the expanded groups stay; no layout runs
export function setGrouping(
  state: CanvasState,
  grouping: Grouping,
): CanvasState {
  return state.grouping === grouping ? state : { ...state, grouping };
}
