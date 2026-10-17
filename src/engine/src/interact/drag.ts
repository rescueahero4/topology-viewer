import { adjacency, indexOf } from "../layout/drawn";
import type { CanvasState, DrawnId, Point } from "../state/canvasState";
import type { Frontier } from "../view/frontier";

// why: mockup lines 1956-1958 (ddr-0023) — the pull saturates with the drag distance and decays per
// hop; nothing beyond 3 hops moves (P2)
const MAX_HOPS = 3;
const PULL_MAX = 48;
const PULL_HOP = 0.35;
const PULL_SCALE = 300;
const LAG = [1, 0.2, 0.08, 0.035];
// why: SA §6 row 4, epic Q22 — the bound of each hop holds at every step, also for the spring
const BOUND = [0, 48, 17, 6];
// why: mockup lines 2006-2007 — a follower whose error is at most this does not move
const REST = 0.3;
// why: mockup line 2011 (4 s at 60 frames) as a step count, because the engine reads no clock (NF-8)
const MAX_RELEASE_STEPS = 240;

type Follower = {
  id: DrawnId;
  h: number;
  home: Point;
  p: Point;
  v: Point;
  k: number;
  damp: number;
};

export type DragCtx = {
  state: CanvasState;
  id: DrawnId;
  start: Point;
  pointer: Point;
  spring: boolean;
  followers: Follower[];
};

export type DragStep = {
  positions: [DrawnId, Point][];
  ctx: DragCtx;
  moving: boolean;
};

export type Release = { steps: [DrawnId, Point][][]; state: CanvasState };

const STILL: Point = { x: 0, y: 0 };

// why: mockup `springFor` (lines 1966-1971, ddr-0021, ddr-0022) — softer and more damped further out
function springFor(h: number, dist: number) {
  const e = h + Math.min(1, dist / 600) * 0.5;
  const k = 0.035 * Math.pow(0.6, e - 1);
  const zeta = Math.min(0.9, 0.45 + 0.04 * (e - 1));
  return { k, damp: Math.max(0, 1 - 2 * zeta * Math.sqrt(k)) };
}

// why: mockup `beginDrag` (lines 1978-1984) — hops over the drawn adjacency, breadth first
function hopsFrom(frontier: Frontier, id: DrawnId): Map<DrawnId, number> {
  const at = indexOf(frontier);
  const adj = adjacency(frontier, at);
  const hop = new Map<DrawnId, number>([[id, 0]]);
  let ring = [id];
  for (let h = 1; h <= MAX_HOPS; h++) {
    const next: DrawnId[] = [];
    for (const from of ring)
      for (const m of adj[at.get(from) as number]) {
        const near = frontier.nodes[m].id;
        if (hop.has(near)) continue;
        hop.set(near, h);
        next.push(near);
      }
    ring = next;
  }
  return hop;
}

// why: SA §4.4 `interact/drag` — the followers and their homes come from the positions at the
// drag start; an unknown, not-drawn or hidden id gives no drag
export function beginDrag(
  state: CanvasState,
  frontier: Frontier,
  drawnId: DrawnId,
): DragCtx | null {
  const now = new Map(state.positions);
  const start = now.get(drawnId);
  if (start === undefined || !frontier.nodes.some((n) => n.id === drawnId))
    return null;
  const followers: Follower[] = [];
  for (const [id, h] of hopsFrom(frontier, drawnId)) {
    const home = now.get(id);
    if (h === 0 || home === undefined) continue;
    const spring = springFor(h, Math.hypot(home.x - start.x, home.y - start.y));
    followers.push({ id, h, home, p: home, v: STILL, ...spring });
  }
  const spring = state.layout === "force";
  return { state, id: drawnId, start, pointer: start, spring, followers };
}

// why: epic Q22 — a follower above its bound goes back onto the bound along the same direction,
// with no velocity
function clamped(f: Follower): Follower {
  const dx = f.p.x - f.home.x;
  const dy = f.p.y - f.home.y;
  const d = Math.hypot(dx, dy);
  const bound = BOUND[f.h];
  if (d <= bound) return f;
  const p = { x: f.home.x + dx * (bound / d), y: f.home.y + dy * (bound / d) };
  return { ...f, p, v: STILL };
}

// why: mockup `stepDrag` (lines 2000-2007) — a lag in every layout but Force, a spring in Force
function followed(f: Follower, u: Point, D: number, spring: boolean) {
  const pull =
    PULL_MAX * Math.pow(PULL_HOP, f.h - 1) * (1 - Math.exp(-D / PULL_SCALE));
  const ex = f.home.x + u.x * pull - f.p.x;
  const ey = f.home.y + u.y * pull - f.p.y;
  if (spring) {
    const v = {
      x: (f.v.x + ex * f.k) * f.damp,
      y: (f.v.y + ey * f.k) * f.damp,
    };
    const go =
      Math.abs(ex) + Math.abs(ey) + Math.abs(v.x) + Math.abs(v.y) > REST;
    return go
      ? clamped({ ...f, v, p: { x: f.p.x + v.x, y: f.p.y + v.y } })
      : { ...f, v };
  }
  if (Math.abs(ex) + Math.abs(ey) <= REST) return f;
  const lag = LAG[f.h];
  return clamped({ ...f, p: { x: f.p.x + ex * lag, y: f.p.y + ey * lag } });
}

function positionsOf(ctx: DragCtx): [DrawnId, Point][] {
  const moved = new Map(ctx.followers.map((f) => [f.id, f.p]));
  moved.set(ctx.id, ctx.pointer);
  return ctx.state.positions.map(([id, p]) => [id, moved.get(id) ?? p]);
}

// why: SA §5 Engine — one step with no clock; the caller gives the pointer and keeps the context
export function dragStep(ctx: DragCtx, pointer: Point): DragStep {
  const dx = pointer.x - ctx.start.x;
  const dy = pointer.y - ctx.start.y;
  const D = Math.hypot(dx, dy);
  const u = D === 0 ? STILL : { x: dx / D, y: dy / D };
  let moving = false;
  const followers = ctx.followers.map((f) => {
    const next = followed(f, u, D, ctx.spring);
    if (next.p !== f.p) moving = true;
    return next;
  });
  const next = { ...ctx, pointer, followers };
  return { positions: positionsOf(next), ctx: next, moving };
}

// why: NF-8, epic C8 — the release runs to rest at once and commits the rest positions to the
// cache; the steps let the renderer play them or jump to the end
export function release(ctx: DragCtx): Release {
  const steps: [DrawnId, Point][][] = [];
  let at = ctx;
  for (let i = 0; i < MAX_RELEASE_STEPS; i++) {
    const step = dragStep(at, at.pointer);
    steps.push(step.positions);
    at = step.ctx;
    if (!step.moving) break;
  }
  return { steps, state: { ...ctx.state, positions: steps[steps.length - 1] } };
}

// why: mockup `bubbleDrag` (lines 1835-1858, ddr-0043) — the shown nodes of the type move as one
// piece; nothing else moves and no layout runs (FR-CANVAS-15)
export function dragBubble(
  state: CanvasState,
  frontier: Frontier,
  type: string | null,
  vector: Point,
): CanvasState {
  const shown = state.around === null ? null : new Set(state.around.shown);
  const members = new Set(
    frontier.nodes
      .filter((n) => n.type === type && (shown === null || shown.has(n.id)))
      .map((n) => n.id),
  );
  if (members.size === 0) return state;
  return {
    ...state,
    positions: state.positions.map(([id, p]) =>
      members.has(id)
        ? [id, { x: p.x + vector.x, y: p.y + vector.y }]
        : [id, p],
    ),
  };
}
