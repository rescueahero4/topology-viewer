import { packEnclose, packSiblings } from "d3-hierarchy";
import { byCodePoint } from "../data/hash";
import type { DrawnId, Point } from "../state/canvasState";
import type { Frontier } from "../view/frontier";
import type { Vocab } from "../vocab/resolve";
import {
  byType,
  drawnOf,
  type Drawn,
  type IconMetrics,
  type Laid,
} from "./drawn";

export type Bubble = { key: string | null; x: number; y: number; r: number };

// why: mockup `BUBBLE_PAD` 14 + 10 for the bubble label (lib/topology.js lines 1779, 1792)
const BUBBLE_PAD = 14;
const BUBBLE_ROOM = BUBBLE_PAD + 10;
// why: mockup lines 1788, 1794 — the room between members and between bubbles; owner decision
// H11 (no DDR): the pill keeps the mockup height 20, so `OUTER` stays 26 (STORY-003-06b)
const MEMBER_GAP = 4;
const OUTER = 26;

// why: mockup `roomOf` (lib/topology.js lines 1780-1782)
export function bubbleRoom(node: Laid): number {
  return node.named ? Math.max(node.r + 22, node.chars * 3.8 + 6) : node.r + 12;
}

// why: STORY-003-01 Rule B, mockup `drawBubbles` (lib/topology.js lines 1806-1812) — the renderer
// encloses these rooms at the frame positions, so the room rule stays in the engine (SA §3)
export function bubbleRooms(
  frontier: Frontier,
  vocab: Vocab,
  metrics: IconMetrics,
): [DrawnId, number][] {
  return drawnOf(frontier, vocab, metrics).nodes.map((node) => [
    node.id,
    bubbleRoom(node) + BUBBLE_PAD,
  ]);
}

function membersOf(drawn: Drawn): Map<string | null, number[]> {
  const byKey = new Map<string | null, number[]>();
  drawn.nodes.forEach((node, at) => {
    const list = byKey.get(node.type);
    if (list === undefined) byKey.set(node.type, [at]);
    else list.push(at);
  });
  return byKey;
}

// why: mockup lines 1786-1792 — members by drawn degree, then label (C5), then drawn id
function packed(drawn: Drawn, key: string | null, members: number[]) {
  const { nodes, adj } = drawn;
  const sorted = [...members].sort(
    (a, b) =>
      adj[b].length - adj[a].length ||
      byCodePoint(nodes[a].label, nodes[b].label) ||
      byCodePoint(nodes[a].id, nodes[b].id),
  );
  const circles = packSiblings(
    sorted.map((at) => ({ r: bubbleRoom(nodes[at]) + MEMBER_GAP, at })),
  );
  const enc = packEnclose(circles);
  return { key, circles, ex: enc.x, ey: enc.y, r: enc.r + BUBBLE_ROOM };
}

// why: mockup `bubblePositions` (lib/topology.js lines 1783-1799) — one bubble per type, packed
// around the biggest one as d3-hierarchy gives them, with no translation (lead decision D26)
export function bubbleLayout(drawn: Drawn): {
  positions: [DrawnId, Point][];
  bubbles: Bubble[];
} {
  const groups = [...membersOf(drawn)]
    .map(([key, members]) => packed(drawn, key, members))
    .sort(
      (a, b) =>
        b.circles.length - a.circles.length ||
        b.r - a.r ||
        byType(a.key, b.key),
    );
  const outer = packSiblings(groups.map((g) => ({ r: g.r + OUTER, g })));
  const pos: Point[] = [];
  for (const { x, y, g } of outer)
    for (const c of g.circles)
      pos[c.at] = { x: x + c.x - g.ex, y: y + c.y - g.ey };
  return {
    positions: drawn.nodes.map((node, at) => [node.id, pos[at]]),
    bubbles: outer.map(({ x, y, g }) => ({ key: g.key, x, y, r: g.r })),
  };
}
