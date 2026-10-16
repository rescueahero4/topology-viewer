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
  | { kind: "reset" };

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
