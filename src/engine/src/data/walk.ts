import type { Issue } from "@qdic-topology/contract";
import {
  addEdge,
  addNode,
  cellText,
  cellsOf,
  isCell,
  isRecord,
  KEYS_PATH,
  notAGraph,
  nullRecord,
  own,
  REASON,
  reason,
  type Columns,
  type Path,
  type ShapedEdge,
  type ShapedNode,
  type ShapeFatal,
  type Tally,
} from "./tally";

export type TreePlan = {
  children: string;
  id?: string;
  label: { key: string } | { keys: readonly string[] };
  predicate: string;
  type: string;
};

export type Roots = {
  items: readonly unknown[];
  path: (index: number) => Path;
  keys: (index: number) => Path;
  read: (value: unknown) => Columns | null;
};

export type Walked =
  | { ok: true; nodes: ShapedNode[]; edges: ShapedEdge[]; issues: Issue[] }
  | { ok: false; fatal: ShapeFatal };

type Item = {
  value: unknown;
  path: Path;
  keys: Path;
  pathId: string;
  level: number;
  parent?: string;
};

type Frame = {
  items: readonly unknown[];
  next: number;
  item: (value: unknown, index: number) => Item;
};

type Out = { nodes: ShapedNode[]; edges: ShapedEdge[]; issues: Issue[] };

// why: SA v0.12 §4.1 — the `tree` form has a nesting cap of 64 levels; a root is level 1
const DEPTH_CAP = 64;

function columnsOf(value: unknown): Columns | null {
  return isRecord(value) ? nullRecord(Object.entries(value)) : null;
}

function labelOf(
  columns: Columns,
  label: TreePlan["label"],
): [string, string] | null {
  if ("key" in label) {
    const text = cellText(own(columns, label.key));
    return text === undefined ? null : [label.key, text];
  }
  for (const key of label.keys) {
    const value = own(columns, key);
    if (typeof value === "string") return [key, value];
  }
  return null;
}

// why: SA §4.1 field-level rule — `KEYS_PATH` is the input path of the keys of the object, so an
// issue on one of its attributes names the exact input path
function nodeOf(
  item: Item,
  columns: Columns,
  id: string,
  plan: TreePlan,
): ShapedNode {
  const used = new Set([plan.children]);
  if (plan.id !== undefined) used.add(plan.id);
  const label = labelOf(columns, plan.label);
  if (label !== null) used.add(label[0]);
  return {
    id,
    type: plan.type,
    ...(label === null ? {} : { label: label[1] }),
    attrs: cellsOf(columns, used, isCell),
    _inferred: { type: reason(plan.children) },
    [KEYS_PATH]: item.keys,
  };
}

// why: the children are read one at a time, so the walk builds no id before the count check
function frameOf(
  item: Item,
  columns: Columns,
  plan: TreePlan,
  parent: string | undefined,
): Frame | null {
  const list = own(columns, plan.children);
  if (!Array.isArray(list)) return null;
  return {
    items: list,
    next: 0,
    item: (value, index) => {
      const path = [...item.path, plan.children, index];
      return {
        value,
        path,
        keys: path,
        pathId: `${item.pathId}.${index}`,
        level: item.level + 1,
        parent,
      };
    },
  };
}

function visit(
  item: Item,
  columns: Columns,
  plan: TreePlan,
  tally: Tally,
  out: Out,
): { fatal: ShapeFatal | null; id?: string } {
  if (item.level > DEPTH_CAP) return { fatal: notAGraph([]) };
  const id =
    plan.id === undefined ? item.pathId : cellText(own(columns, plan.id));
  if (id === undefined) {
    out.issues.push({ code: "no-id", path: item.path });
    return { fatal: null };
  }
  const fatal =
    addNode(tally) ?? (item.parent === undefined ? null : addEdge(tally));
  if (fatal !== null) return { fatal };
  out.nodes.push(nodeOf(item, columns, id, plan));
  if (item.parent !== undefined)
    out.edges.push({
      subject: item.parent,
      predicate: plan.predicate,
      object: id,
      [REASON]: reason(plan.children),
    });
  return { fatal: null, id };
}

// why: SA v0.12 §4.1 and §11 Transport — an explicit stack, so deep input never overflows; the
// running counts and the depth cap apply over the whole walk of all roots (question 9 (a))
export function walk(roots: Roots, plan: TreePlan, tally: Tally): Walked {
  const out: Out = { nodes: [], edges: [], issues: [] };
  const frames: Frame[] = [
    {
      items: roots.items,
      next: 0,
      item: (value, index) => ({
        value,
        path: roots.path(index),
        keys: roots.keys(index),
        pathId: String(index),
        level: 1,
      }),
    },
  ];
  for (let frame = frames.at(-1); frame !== undefined; frame = frames.at(-1)) {
    if (frame.next >= frame.items.length) {
      frames.pop();
      continue;
    }
    const index = frame.next++;
    const item = frame.item(frame.items[index], index);
    const columns =
      item.level === 1 ? roots.read(item.value) : columnsOf(item.value);
    if (columns === null) {
      out.issues.push({ code: "no-id", path: item.path });
      continue;
    }
    const visited = visit(item, columns, plan, tally, out);
    if (visited.fatal !== null) return { ok: false, fatal: visited.fatal };
    const next = frameOf(item, columns, plan, visited.id);
    if (next !== null) frames.push(next);
  }
  return { ok: true, ...out };
}
