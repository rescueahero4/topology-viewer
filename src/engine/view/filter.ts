import { profile } from "#contract";
import { byCodePoint } from "../data/hash";
import type { CanvasState, Filters, Grouping } from "../state/canvasState";
import { CUSTOM, own, type Provenance } from "../vocab/predicates";
import type { ResolvedType, Vocab } from "../vocab/resolve";

export type TypeRow = {
  type: string | null;
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

// why: STORY-004-01 Rule G (G9) — the shell reads the group order of the Types menu and the family
// order here, because `ui` does not import `contract` (SA §3)
export function typeGroups(): readonly string[] {
  return [...profile.typeMenuCategories.order, CUSTOM];
}

export function familyOrder(): readonly string[] {
  return [...profile.categoryOrder];
}

// why: mockup `stats` (lib/topology.js line 2263) — one row per present type in the order of first
// appearance; the entities with no type share one row, key `null`, in the Custom group, at the place
// of the first of them (lead decision D93 (1), PRD v0.10 FR-FILTER-3; mockup type `unknown`, line
// 350); its label is UI text
function typeRows(vocab: Vocab, typesOff: Set<string | null>): TypeRow[] {
  const rows = new Map<string | null, TypeRow>();
  for (const entity of vocab.entities.values()) {
    const row = rows.get(entity.type);
    if (row !== undefined) row.count += entity.type === null ? 1 : 0;
    else if (entity.type === null)
      rows.set(null, {
        type: null,
        count: 1,
        group: CUSTOM,
        provenance: entity.provenance,
        on: !typesOff.has(null),
      });
    else {
      const type = vocab.types.get(entity.type) as ResolvedType;
      rows.set(type.name, {
        type: type.name,
        count: type.count,
        group: groupOf(type.name),
        provenance: type.provenance,
        on: !typesOff.has(type.name),
      });
    }
  }
  return [...rows.values()];
}

// why: mockup `stats` (lib/topology.js lines 2261-2291) — dataset totals of the present types,
// families and predicates; types by count, predicates by family order, then count
export function stats(vocab: Vocab, state: CanvasState): Stats {
  const typesOff = new Set(state.filters.typesOff);
  const familiesOff = new Set(state.filters.familiesOff);
  const predicatesOff = new Set(state.filters.predicatesOff);
  const types = typeRows(vocab, typesOff).sort((a, b) => b.count - a.count);
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

// why: SA §5 Determinism — by code point, `null` first, so the same toggles give the same array
function byName(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
  return byCodePoint(a, b);
}

function switched<T extends string | null>(list: T[], name: T, on: boolean) {
  if (on) return list.filter((item) => item !== name);
  return list.includes(name) ? list : [...list, name].sort(byName);
}

function withFilters(state: CanvasState, filters: Filters): CanvasState {
  const same = <T>(a: T[], b: T[]) =>
    a.length === b.length && a.every((item, index) => item === b[index]);
  const before = state.filters;
  if (
    same(before.typesOff, filters.typesOff) &&
    same(before.familiesOff, filters.familiesOff) &&
    same(before.predicatesOff, filters.predicatesOff) &&
    same(before.entitiesOff ?? [], filters.entitiesOff ?? [])
  )
    return state;
  return { ...state, filters };
}

// why: STORY-002-06 question 1 — a type change keeps every position; no layout runs (FR-CANVAS-8)
export function toggleType(
  state: CanvasState,
  vocab: Vocab,
  type: string | null,
  on: boolean,
): CanvasState {
  const present =
    type === null ? vocab.untyped !== null : !!vocab.types.get(type)?.count;
  if (!present) return state;
  const typesOff = switched(state.filters.typesOff, type, on);
  return withFilters(state, { ...state.filters, typesOff });
}

// The result of the custom filters: sorted, so the same filters give the same array, and no key at
// all with nothing off, so a viewer with no custom filter has the same state as before.
export function setEntitiesOff(state: CanvasState, ids: readonly string[]) {
  const { entitiesOff: _, ...rest } = state.filters;
  const sorted = [...ids].sort(byCodePoint);
  return withFilters(
    state,
    sorted.length === 0 ? rest : { ...rest, entitiesOff: sorted },
  );
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
