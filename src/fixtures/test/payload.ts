export type Raw = Record<string, unknown>;

export function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(input: unknown, field: "nodes" | "edges"): Raw[] {
  if (!isRecord(input)) return [];
  const items = input[field];
  return Array.isArray(items) ? items.filter(isRecord) : [];
}

export const nodesOf = (input: unknown) => list(input, "nodes");
export const edgesOf = (input: unknown) => list(input, "edges");

function asId(value: unknown): string | undefined {
  const text =
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : undefined;
  return text === "" ? undefined : text;
}

export function nodeId(node: Raw): string | undefined {
  return asId(node.id ?? node.globalId);
}

export function edgeEnds(edge: Raw): [string, string] {
  return [
    String(edge.source ?? edge.subject ?? edge.subjectNodeId),
    String(edge.target ?? edge.object ?? edge.objectNodeId),
  ];
}

export interface SkipCounts {
  "no-id": number;
  "duplicate-id": number;
  "dangling-edge": number;
}

// why: the mockup `normalise()` rules — a record without id, a repeated id and an edge to a missing node are skipped and counted
export function skipCounts(input: unknown): SkipCounts {
  const counts: SkipCounts = {
    "no-id": 0,
    "duplicate-id": 0,
    "dangling-edge": 0,
  };
  const ids = new Set<string>();
  const rawNodes =
    isRecord(input) && Array.isArray(input.nodes) ? input.nodes : [];
  for (const node of rawNodes) {
    const id = isRecord(node) ? nodeId(node) : undefined;
    if (id === undefined) counts["no-id"] += 1;
    else if (ids.has(id)) counts["duplicate-id"] += 1;
    else ids.add(id);
  }
  for (const edge of edgesOf(input)) {
    const [from, to] = edgeEnds(edge);
    if (!ids.has(from) || !ids.has(to)) counts["dangling-edge"] += 1;
  }
  return counts;
}

function mostConnected(input: unknown): string | null {
  const degree = new Map<string, number>();
  for (const node of nodesOf(input)) {
    const id = nodeId(node);
    if (id !== undefined) degree.set(id, 0);
  }
  for (const edge of edgesOf(input)) {
    const ends = edgeEnds(edge);
    if (ends.every((end) => degree.has(end)))
      for (const end of ends) degree.set(end, (degree.get(end) ?? 0) + 1);
  }
  let best: string | null = null;
  let top = -1;
  for (const [id, count] of degree) {
    if (count > top) {
      best = id;
      top = count;
    }
  }
  return best;
}

// why: mockup `storyInfo()` — a valid root reads as active, no hint as passive; an active
// payload with an unknown root falls back to the most connected node
export function firstPaintOf(input: unknown) {
  const view = isRecord(input) && isRecord(input.view) ? input.view : {};
  const ids = new Set(nodesOf(input).map(nodeId));
  const hinted = asId(view.root);
  const root = hinted !== undefined && ids.has(hinted) ? hinted : null;
  const approach =
    view.approach === "active" || view.approach === "passive"
      ? view.approach
      : root === null
        ? "passive"
        : "active";
  return {
    approach,
    selected: approach === "passive" ? null : (root ?? mostConnected(input)),
  };
}
