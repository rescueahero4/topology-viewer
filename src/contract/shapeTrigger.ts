import { shapeHint } from "./input";
import { profile } from "./profile";
import { isRecord, NODE_LISTS, own, type Path, type Raw } from "./raw";

type Heuristic = (typeof profile.shapeHeuristics)[number];

const WILDCARD = "*";

// why: SA §11 — keys are read with Object.keys and Object.hasOwn only, so a prototype key never matches
function matches(first: Raw, heuristic: Heuristic): boolean {
  if (heuristic.kind === "tree")
    return heuristic.columns.some((column) => Object.hasOwn(first, column));
  return heuristic.columns.every((column) => {
    if (!column.startsWith(WILDCARD)) return Object.hasOwn(first, column);
    const end = column.slice(WILDCARD.length);
    return Object.keys(first).filter((key) => key.endsWith(end)).length >= 2;
  });
}

export function matchShapeHeuristic(first: unknown): number | null {
  if (!isRecord(first)) return null;
  const index = profile.shapeHeuristics.findIndex((heuristic) =>
    matches(first, heuristic),
  );
  return index < 0 ? null : index;
}

function idLess(item: unknown): boolean {
  return (
    isRecord(item) &&
    !Object.hasOwn(item, "id") &&
    !Object.hasOwn(item, "globalId")
  );
}

// why: SA §4.1 — the trigger sentence of `data/shape`; a `shape: null` is not a hint (ISSUE-003, D30)
export function sendsToShape(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  const hint = shapeHint.safeParse(own(raw, "shape"));
  if (hint.success && hint.data !== null) return true;
  const nodes = own(raw, "nodes");
  return (
    Array.isArray(nodes) &&
    nodes.length > 0 &&
    nodes.every(idLess) &&
    matchShapeHeuristic(nodes[0]) !== null
  );
}

// why: PRD FR-DATA-8 — `data/shape` counts the top-level `nodes` list after expansion; it is the
// only node list with one path segment
export function countedNodeLists(raw: Raw): Path[] {
  return sendsToShape(raw)
    ? NODE_LISTS.filter((path) => path.length > 1)
    : NODE_LISTS;
}
