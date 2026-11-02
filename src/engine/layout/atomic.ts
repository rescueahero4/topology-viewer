import { packEnclose, packSiblings } from "d3-hierarchy";
import { byCodePoint } from "../data/hash";
import {
  entityDrawnId,
  entityOfDrawnId,
  type CanvasState,
  type DrawnId,
  type Point,
} from "../state/canvasState";
import type { Frontier } from "../view/frontier";
import {
  adjacency,
  byTypeThenLabel,
  indexOf,
  type Drawn,
  type Laid,
} from "./drawn";

type System = {
  r: number;
  nx: number;
  ny: number;
  kids: { at: number; dx: number; dy: number }[];
};

type Component = { root: number; order: number[] };

// why: mockup `atomicPositions` (lib/topology.js line 1693)
const PAD = 6;

// why: mockup `atomicPositions` `own` (lib/topology.js lines 1697-1699)
export function atomicRoom(node: Laid): number {
  return node.named ? Math.max(node.r + 22, node.chars * 3.8 + 6) : node.r + 10;
}

// why: mockup lines 1700-1701 — highest drawn degree first, ties by drawn id code point (C5)
function busiestFirst(ids: readonly DrawnId[], adj: number[][]): number[] {
  return ids
    .map((_, at) => at)
    .sort(
      (a, b) => adj[b].length - adj[a].length || byCodePoint(ids[a], ids[b]),
    );
}

// why: STORY-002-05 Context "Static layouts" — the selected entity, else the scope root drawn
// alone, else the most connected drawn node
export function atomicCentre(
  state: CanvasState,
  frontier: Frontier,
): DrawnId | null {
  if (frontier.nodes.length === 0) return null;
  const at = indexOf(frontier);
  const selected =
    state.selection !== null && "node" in state.selection
      ? state.selection.node
      : null;
  if (
    selected !== null &&
    entityOfDrawnId(selected) !== null &&
    at.has(selected)
  )
    return selected;
  if (state.scope.root !== null) {
    const root = entityDrawnId(state.scope.root);
    if (at.has(root)) return root;
  }
  const ids = frontier.nodes.map((node) => node.id);
  return ids[busiestFirst(ids, adjacency(frontier, at))[0]];
}

// why: mockup lines 1702-1714 — a spanning tree grown breadth first from each root in turn
function treesOf(drawn: Drawn, centre: DrawnId | null) {
  const ids = drawn.nodes.map((node) => node.id);
  const roots = busiestFirst(ids, drawn.adj);
  const first = centre === null ? undefined : drawn.at.get(centre);
  if (first !== undefined) roots.unshift(first);
  const seen = new Uint8Array(ids.length);
  const kids: number[][] = ids.map(() => []);
  const comps: Component[] = [];
  for (const root of roots) {
    if (seen[root] === 1) continue;
    seen[root] = 1;
    const order = [root];
    for (let i = 0; i < order.length; i++)
      for (const next of drawn.adj[order[i]])
        if (seen[next] === 0) {
          seen[next] = 1;
          kids[order[i]].push(next);
          order.push(next);
        }
    comps.push({ root, order });
  }
  return { kids, comps };
}

// why: mockup lines 1719-1735 — the node circle first, then the child systems smallest first,
// packed by d3-hierarchy; the system is the circle that encloses them
function systemOf(
  drawn: Drawn,
  at: number,
  kids: readonly number[],
  sys: readonly System[],
): System {
  const own = atomicRoom(drawn.nodes[at]);
  if (kids.length === 0) return { r: own, nx: 0, ny: 0, kids: [] };
  const sorted = [...kids].sort(
    (a, b) =>
      sys[a].r - sys[b].r || byTypeThenLabel(drawn.nodes[a], drawn.nodes[b]),
  );
  const circles = packSiblings([
    { r: own + PAD, at },
    ...sorted.map((kid) => ({ r: sys[kid].r + PAD, at: kid })),
  ]);
  const enc = packEnclose(circles);
  const [c0, ...rest] = circles;
  return {
    r: enc.r - PAD,
    nx: c0.x - enc.x,
    ny: c0.y - enc.y,
    kids: rest.map((c) => ({ at: c.at, dx: c.x - c0.x, dy: c.y - c0.y })),
  };
}

function rotate(x: number, y: number, a: number): [number, number] {
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

const turned = (s: System) => s.nx !== 0 || s.ny !== 0;

// why: mockup lines 1739-1759 — the root sits at the top of its system, and each child system
// turns so that its node faces the parent
function place(
  comp: Component,
  cx: number,
  cy: number,
  sys: readonly System[],
  pos: Point[],
) {
  const s0 = sys[comp.root];
  const rot: number[] = [];
  rot[comp.root] = turned(s0) ? -Math.PI / 2 - Math.atan2(s0.ny, s0.nx) : 0;
  const [rx, ry] = rotate(s0.nx, s0.ny, rot[comp.root]);
  pos[comp.root] = { x: cx + rx, y: cy + ry };
  for (const id of comp.order) {
    const p = pos[id];
    for (const { at, dx, dy } of sys[id].kids) {
      const [ox, oy] = rotate(dx, dy, rot[id]);
      const kx = p.x + ox;
      const ky = p.y + oy;
      const s = sys[at];
      const toward = Math.atan2(p.y - ky, p.x - kx);
      rot[at] = turned(s) ? toward - Math.atan2(s.ny, s.nx) : 0;
      const [nx, ny] = rotate(s.nx, s.ny, rot[at]);
      pos[at] = { x: kx + nx, y: ky + ny };
    }
  }
}

// why: mockup lines 1760-1771 — the components, biggest first, in rows
function rowsOf(comps: Component[], sys: readonly System[], pos: Point[]) {
  const sorted = [...comps].sort((a, b) => sys[b.root].r - sys[a.root].r);
  const area = sorted.reduce((sum, c) => sum + (2 * sys[c.root].r) ** 2, 0);
  const rowW = Math.max(2 * sys[sorted[0].root].r, Math.sqrt(area) * 1.3);
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const comp of sorted) {
    const d = 2 * (sys[comp.root].r + PAD * 2);
    if (x > 0 && x + d > rowW) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    place(comp, x + d / 2, y + d / 2, sys, pos);
    x += d;
    rowH = Math.max(rowH, d);
  }
}

export function atomicLayout(
  drawn: Drawn,
  centre: DrawnId | null,
): [DrawnId, Point][] {
  const { kids, comps } = treesOf(drawn, centre);
  const sys: System[] = [];
  for (const comp of comps)
    for (let i = comp.order.length - 1; i >= 0; i--) {
      const at = comp.order[i];
      sys[at] = systemOf(drawn, at, kids[at], sys);
    }
  const pos: Point[] = [];
  if (comps.length > 0) rowsOf(comps, sys, pos);
  return drawn.nodes.map((node, at) => [node.id, pos[at]]);
}
