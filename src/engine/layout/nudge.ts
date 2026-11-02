import type { DrawnId, MoveItem, Point } from "../state/canvasState";
import { ellipse, grid, type Grid } from "./clear";

// why: mockup `nudge` and NUDGE_SOFT, NUDGE_MAX (lib/topology.js lines 531, 1461-1487) — first
// within 20 px of where a node was, and only if that is not enough, up to 100 px; a node is pushed
// away from each newcomer nearer than 50 on the clearance ellipse, in at most 8 rounds per limit
const SOFT = 20;
export const MAX_MOVE = 100;
const NEAR = 50;
const SQUASH = 0.65;
const ROUNDS = 8;
const SLACK = 1;

// why: STORY-002-07 rule (b) — `room` = 100 px minus the row shift of the node in this event
type Mover = { id: DrawnId; at: Point; room: number };

type Source = Point & { order: number };

// why: the push adds up the sources in the order of the newcomers, as the mockup does (line 1474),
// so the grid does not change the result
function pushOf(q: Point, sources: Grid<Source>): Point | null {
  const hits: Source[] = [];
  sources.scan(q, NEAR / SQUASH + SLACK, NEAR + SLACK, (o) => {
    if (ellipse(q, o) < NEAR) hits.push(o);
    return false;
  });
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.order - b.order);
  let x = 0;
  let y = 0;
  for (const o of hits) {
    const dx = q.x - o.x;
    const dy = q.y - o.y;
    const dist = ellipse(q, o);
    const length = Math.hypot(dx, dy) || 1;
    x += (dx / length) * (NEAR - dist);
    y += (dy / length) * (NEAR - dist);
  }
  return { x, y };
}

// why: each mover reads only the fixed sources, so the movers of the mockup loop do not depend on
// each other and each one can run its own rounds
function settle(mover: Mover, sources: Grid<Source>): Point {
  const home = mover.at;
  let q = home;
  for (const limit of [SOFT, MAX_MOVE]) {
    const most = Math.min(limit, mover.room);
    for (let round = 0; round < ROUNDS; round++) {
      const push = pushOf(q, sources);
      if (push === null) break;
      let x = q.x + push.x;
      let y = q.y + push.y;
      const off = Math.hypot(x - home.x, y - home.y);
      if (off > most) {
        x = home.x + ((x - home.x) / off) * most;
        y = home.y + ((y - home.y) / off) * most;
      }
      if (x === q.x && y === q.y) break;
      q = { x, y };
    }
  }
  return q;
}

// why: STORY-002-07 rule (b), lead decision D55 — only the newcomers push; the expanding target is
// not a source and not a mover. Each item holds the position before and after (rule (a))
export function nudge(movers: Mover[], push: Point[]): MoveItem[] {
  if (push.length === 0) return [];
  const sources = grid<Source>();
  push.forEach((p, order) => sources.add({ x: p.x, y: p.y, order }));
  const items: MoveItem[] = [];
  for (const mover of movers) {
    const end = settle(mover, sources);
    if (end.x !== mover.at.x || end.y !== mover.at.y)
      items.push([mover.id, mover.at.x, mover.at.y, end.x, end.y]);
  }
  return items;
}
