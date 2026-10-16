import { byCodePoint } from "../data/hash";
import type { DrawnId } from "../state/canvasState";
import type { DrawnNode, Frontier } from "../view/frontier";
import { own } from "../vocab/predicates";
import type { Vocab } from "../vocab/resolve";

export type Tier = "source" | "group" | "container" | "asset" | "leaf";

export type IconMetrics = {
  [type: string]: { w: number; h: number; tier: Tier };
};

export type Box = { w: number; h: number; tier: Tier | "node" };

export type Laid = {
  id: DrawnId;
  type: string | null;
  label: string;
  chars: number;
  w: number;
  h: number;
  r: number;
  named: boolean;
};

export type Link = { subject: number; object: number; predicate: string };

export type Drawn = {
  nodes: Laid[];
  at: Map<DrawnId, number>;
  adj: number[][];
  links: Link[];
};

// why: mockup `opts.labelChars` (lib/topology.js line 424); a group node has no label and takes the
// full width (lead decisions D42, D46; SA ruling S5)
export const LABEL_CHARS = 22;

// why: mockup `iconFor` (lib/topology.js line 306) — a type outside the sprite is a rank-0 circle
const RANK_ZERO: Box = { w: 20, h: 20, tier: "leaf" };

// why: lead decisions D23, D27 — an own `metrics` entry, else the STORY-002-03 size of the type
export function boxOf(
  type: string | null,
  vocab: Vocab,
  metrics: IconMetrics,
): Box {
  if (type === null) return RANK_ZERO;
  const entry = own(metrics, type);
  if (entry !== undefined) return entry;
  const visual = vocab.types.get(type)?.visual;
  if (visual === undefined || "icon" in visual) return RANK_ZERO;
  return {
    w: visual.size,
    h: visual.size,
    tier: visual.rank === 0 ? "leaf" : "node",
  };
}

function laid(node: DrawnNode, vocab: Vocab, metrics: IconMetrics): Laid {
  const box = boxOf(node.type, vocab, metrics);
  const group = "members" in node;
  const label = group ? "" : node.label;
  return {
    id: node.id,
    type: node.type,
    label,
    chars: group ? LABEL_CHARS : Math.min(label.length, LABEL_CHARS),
    w: box.w,
    h: box.h,
    r: Math.max(box.w, box.h) / 2,
    named: group || box.tier !== "leaf",
  };
}

// why: mockup `view.adj` (lib/topology.js lines 602-603) — distinct drawn neighbours in canonical
// edge order; a self-loop makes a node its own neighbour once
export function adjacency(frontier: Frontier, at: Map<DrawnId, number>) {
  const sets = frontier.nodes.map(() => new Set<number>());
  for (const edge of frontier.edges) {
    const subject = at.get(edge.subject) as number;
    const object = at.get(edge.object) as number;
    sets[subject].add(object);
    sets[object].add(subject);
  }
  return sets.map((set) => [...set]);
}

export function indexOf(frontier: Frontier): Map<DrawnId, number> {
  return new Map(frontier.nodes.map((node, i) => [node.id, i]));
}

export function drawnOf(
  frontier: Frontier,
  vocab: Vocab,
  metrics: IconMetrics,
): Drawn {
  const at = indexOf(frontier);
  return {
    nodes: frontier.nodes.map((node) => laid(node, vocab, metrics)),
    at,
    adj: adjacency(frontier, at),
    links: frontier.edges.map((edge) => ({
      subject: at.get(edge.subject) as number,
      object: at.get(edge.object) as number,
      predicate: edge.predicate,
    })),
  };
}

// why: lead decisions D43, D57 — a node with no type sorts after every type name
export function byType(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return byCodePoint(a, b);
}

// why: epic condition C5 — the mockup `localeCompare` keys by code point, the drawn id last
export function byTypeThenLabel(a: Laid, b: Laid): number {
  return (
    byType(a.type, b.type) ||
    byCodePoint(a.label, b.label) ||
    byCodePoint(a.id, b.id)
  );
}
