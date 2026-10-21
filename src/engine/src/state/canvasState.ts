export type DrawnId = string;
export type EdgeKey = string;
export type GroupKey = string;

export type Approach = "active" | "passive";
export type Budget = 10 | 20 | 50 | "all";
export type Grouping = 2 | 5 | 10 | "off";
export type ScopeMode = "ai" | "auto" | "all" | "custom";

export type Hint = { root: string; reveal: string[] };

export type Scope = {
  mode: ScopeMode;
  root: string | null;
  hint: Hint | null;
};

export type Selection =
  { node: DrawnId } | { edge: EdgeKey; anchor: DrawnId } | null;

export type LayoutName = "force" | "atomic" | "bubbles" | "tree-h" | "tree-v";

export type Point = { x: number; y: number };

export type TreeRows = {
  vertical: boolean;
  rows: [DrawnId, number][];
  keyCoord: [number, number][];
};

// why: lead decision D93 (1) — `null` stands for the entities with no type; it sorts first
export type Filters = {
  typesOff: (string | null)[];
  familiesOff: string[];
  predicatesOff: string[];
};

export type HiddenEntry = {
  key: DrawnId;
  members: string[];
  stranded: string[];
  seq: number;
};

// why: STORY-002-07 rule (a) JSON forms — a move from (x0, y0) to (x1, y1); the coordinate after
// is kept, because x0 + (x1 - x0) is not always x1 in floating point (D21, D59)
export type MoveItem = [
  id: DrawnId,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
];

export type NudgeEntry = [eventKey: DrawnId, seq: number, items: MoveItem[]];

export type TreeShift = {
  vertical: boolean;
  shiftOf: [rowKey: number, c0: number, c1: number][];
  inserted: number[];
  moved: [id: DrawnId, a0: number, a1: number][];
};

export type ShiftEntry = [eventKey: DrawnId, seq: number, shift: TreeShift];

// why: STORY-002-08 Context `CanvasState.around` — ids, booleans and numbers only (S-C3); the fade
// set, the exit vectors and `aroundInfo` are computed, not stored
export type Around = {
  root: DrawnId;
  saved: [DrawnId, Point][];
  shown: DrawnId[];
  events: [eventKey: DrawnId, wroteHome: boolean][];
  seq0: number;
};

// why: STORY-002-04 Q16 — plain JSON only: a Set is an array in canonical order, a Map is an
// array of [key, value] pairs, and no object is keyed by a model id (S-C3)
export type CanvasState = {
  graphHash: number;
  approach: Approach;
  scope: Scope;
  budget: Budget;
  grouping: Grouping;
  revealed: string[] | null;
  origins: [string, string][];
  expandedGroups: GroupKey[];
  selection: Selection;
  seq: number;
  layout: LayoutName;
  positions: [DrawnId, Point][];
  treeRows: TreeRows | null;
  filters: Filters;
  hidden: HiddenEntry[];
  homes: MoveItem[];
  treeShifts: ShiftEntry[];
  nudges: NudgeEntry[];
  around: Around | null;
};

export type Action =
  | { kind: "explore"; id: string }
  | { kind: "collapse"; id: string }
  | { kind: "expandGroup"; group: DrawnId }
  | { kind: "collapseGroup"; group: DrawnId }
  | { kind: "path"; id: string }
  | { kind: "select"; node: DrawnId | null }
  | { kind: "select"; entity: string }
  | { kind: "selectEdge"; edge: EdgeKey; anchor: DrawnId }
  | { kind: "budget"; budget: Budget }
  | { kind: "reset" }
  | { kind: "toggleType"; type: string | null; on: boolean }
  | { kind: "showAllTypes" }
  | { kind: "toggleFamily"; family: string; on: boolean }
  | { kind: "togglePredicate"; predicate: string; on: boolean }
  | { kind: "grouping"; grouping: Grouping }
  | { kind: "hide"; node: DrawnId }
  | { kind: "hideMany"; ids: string[] }
  | { kind: "restore"; keys: DrawnId[] }
  | { kind: "showMany"; ids: string[] }
  | { kind: "approach"; approach: Approach };

export type Direction = ">" | "<";

const ENTITY_PREFIX = "e:";
const GROUP_PREFIX = "g:";

export function entityDrawnId(entityId: string): DrawnId {
  return ENTITY_PREFIX + entityId;
}

// why: STORY-002-04 Context "Drawn ids" — JSON of the parts, so no model id can collide with a key
export function groupKey(
  anchor: string,
  predicate: string,
  direction: Direction,
  type: string | null,
): GroupKey {
  return JSON.stringify([anchor, predicate, direction, type]);
}

export function groupDrawnId(key: GroupKey): DrawnId {
  return GROUP_PREFIX + key;
}

export function groupKeyOf(id: DrawnId): GroupKey | null {
  return id.startsWith(GROUP_PREFIX) ? id.slice(GROUP_PREFIX.length) : null;
}

export type GroupParts = {
  anchor: string;
  predicate: string;
  direction: Direction;
  type: string | null;
};

// why: STORY-004-01 Rule F (G8) — the shell names a hidden group row and a group root from these
// parts; a value that the engine did not make gives null, never a throw
export function groupParts(id: DrawnId): GroupParts | null {
  const key = groupKeyOf(id);
  if (key === null) return null;
  let parts: unknown;
  try {
    parts = JSON.parse(key);
  } catch {
    return null;
  }
  if (!Array.isArray(parts) || parts.length !== 4) return null;
  const [anchor, predicate, direction, type] = parts as unknown[];
  if (typeof anchor !== "string" || typeof predicate !== "string") return null;
  if (direction !== ">" && direction !== "<") return null;
  if (type !== null && typeof type !== "string") return null;
  return { anchor, predicate, direction, type };
}

export function entityOfDrawnId(id: DrawnId): string | null {
  return id.startsWith(ENTITY_PREFIX) ? id.slice(ENTITY_PREFIX.length) : null;
}

export function edgeKey(
  subject: DrawnId,
  predicate: string,
  object: DrawnId,
): EdgeKey {
  return JSON.stringify([subject, predicate, object]);
}
