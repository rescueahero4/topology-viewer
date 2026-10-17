import { packSiblings } from "d3-hierarchy";
import { byCodePoint } from "../data/hash";
import { LABEL_CHARS, type IconMetrics } from "../layout/drawn";
import type { DrawnId, Point } from "../state/canvasState";
import { own } from "../vocab/predicates";
import type { DrawnNode } from "./frontier";

// why: mockup `aroundPositions` (lib/topology.js lines 1182-1190) — cells of 96 × 84 px at least, a
// bold label of 7.6 px for each character, and the root circle of at least 70 px
const CELL_W = 96;
const CELL_H = 84;
const CHAR_W = 7.6 * 1.25;
const CELL_PAD = 24;
const PAD = 22;
const ROOT_ROOM = 40;
const ROOT_MIN = 70;

type Cluster = {
  ms: DrawnNode[];
  cols: number;
  rows: number;
  cw: number;
  r: number;
};

const labelOf = (node: DrawnNode) => ("entity" in node ? node.label : "");

// why: lead decision D42 — a group node has no label and takes the 22-character width
const charsOf = (node: DrawnNode) =>
  "entity" in node ? Math.min(node.label.length, LABEL_CHARS) : LABEL_CHARS;

// why: STORY-002-05 "Node box" — a default box is at most 56 px (rank 6), so a type with no own
// `metrics` entry gives the 70 px root circle as its box would; thus no `vocab` input (D23)
function rootCircle(type: string | null, metrics: IconMetrics): number {
  const box = type === null ? undefined : own(metrics, type);
  const r = box === undefined ? 0 : Math.max(box.w, box.h) / 2;
  return Math.max(r + ROOT_ROOM, ROOT_MIN);
}

// why: epic condition C5 — the mockup `localeCompare` of the labels by code point, the drawn id last
function clusterOf(nodes: DrawnNode[]): Cluster {
  const ms = [...nodes].sort(
    (a, b) => byCodePoint(labelOf(a), labelOf(b)) || byCodePoint(a.id, b.id),
  );
  const chars = Math.max(...ms.map(charsOf));
  const cw = Math.max(CELL_W, chars * CHAR_W + CELL_PAD);
  const cols = Math.max(1, Math.ceil(Math.sqrt((ms.length * CELL_H) / cw)));
  const rows = Math.ceil(ms.length / cols);
  const r = Math.hypot(cols * cw, rows * CELL_H) / 2 + PAD;
  return { ms, cols, rows, cw, r };
}

// why: mockup `aroundPositions` (lib/topology.js lines 1172-1198, ddr-0040) — one cluster per type
// in the order of the drawn adjacency, the biggest first, packed around the root's own circle as
// d3-hierarchy gives them; the root does not move
export function clusters(
  root: DrawnNode,
  at: Point,
  near: DrawnNode[],
  metrics: IconMetrics,
): Map<DrawnId, Point> {
  const byType = new Map<string | null, DrawnNode[]>();
  for (const node of near) {
    const list = byType.get(node.type);
    if (list === undefined) byType.set(node.type, [node]);
    else list.push(node);
  }
  const list = [...byType.values()]
    .map(clusterOf)
    .sort((a, b) => b.ms.length - a.ms.length);
  const circles = packSiblings([
    { r: rootCircle(root.type, metrics), c: null },
    ...list.map((c) => ({ r: c.r, c })),
  ]);
  const pos = new Map<DrawnId, Point>();
  for (const { x, y, c } of circles)
    c?.ms.forEach((node, i) => {
      const row = Math.floor(i / c.cols);
      const inRow = Math.min(c.cols, c.ms.length - row * c.cols);
      pos.set(node.id, {
        x: at.x + x + ((i % c.cols) - (inRow - 1) / 2) * c.cw,
        y: at.y + y + (row - (c.rows - 1) / 2) * CELL_H,
      });
    });
  return pos;
}
