import type { Action, DrawnId, Point } from "../state/canvasState";
import type { DrawnNode, Frontier } from "../view/frontier";
import type { Vocab } from "../vocab/resolve";
import type { Newcomer } from "./arcs";
import { drawnOf, type Drawn, type IconMetrics } from "./drawn";

export type Frame = {
  frontier: Frontier;
  drawn: Drawn;
  holder: Map<string, number>;
};

export function entitiesOf(node: DrawnNode): string[] {
  return "members" in node ? node.members : [node.entity];
}

// why: `holder` maps each drawn entity to the node that draws it, a group node for its members
export function frameOf(
  frontier: Frontier,
  vocab: Vocab,
  metrics: IconMetrics,
): Frame {
  const holder = new Map<string, number>();
  frontier.nodes.forEach((node, at) => {
    for (const entity of entitiesOf(node)) holder.set(entity, at);
  });
  return { frontier, drawn: drawnOf(frontier, vocab, metrics), holder };
}

type Start = { spot: Point; fixed: boolean };

export type Origins = {
  action: Action;
  before: Frame;
  after: Frame;
  was: Map<DrawnId, Point>;
  pairs: Map<string, string>;
  known: (id: DrawnId) => boolean;
  spot: Point | null;
};

export function spotBefore(o: Origins, entity: string): Point | undefined {
  const at = o.before.holder.get(entity);
  return at === undefined
    ? undefined
    : o.was.get(o.before.frontier.nodes[at].id);
}

// why: STORY-002-07 rule (d) — for a type turned on, the first neighbour in canonical order that was
// drawn before the event; a newcomer of the same call is not an origin
function neighbourSpot(o: Origins, at: number): Point | undefined {
  const nodes = o.after.frontier.nodes;
  const near = [...o.after.drawn.adj[at]].sort((a, b) => a - b);
  const first = near.find((m) => m !== at && o.known(nodes[m].id));
  return first === undefined ? undefined : o.was.get(nodes[first].id);
}

// why: STORY-002-07 Origins — path reveal, restore and bulk Show write `origins` pairs that lead to
// a node drawn before the event (STORY-002-04, 06); the nearest one on the chain is the origin
function chainSpot(o: Origins, entity: string): Point | undefined {
  const seen = new Set<string>([entity]);
  for (let at = o.pairs.get(entity); at !== undefined; at = o.pairs.get(at)) {
    const spot = spotBefore(o, at);
    if (spot !== undefined || seen.has(at)) return spot;
    seen.add(at);
  }
  return undefined;
}

// why: STORY-002-07 Origins and rule (d) — a group node made of nodes drawn before starts and stays
// at their mean spot; a member that leaves a group starts at the group spot
function startOf(o: Origins, at: number): Start | null {
  if (o.spot !== null) return { spot: o.spot, fixed: false };
  const node = o.after.frontier.nodes[at];
  const members = entitiesOf(node);
  const old = members.flatMap((entity) => spotBefore(o, entity) ?? []);
  if (old.length > 0 && "members" in node) {
    const x = old.reduce((sum, p) => sum + p.x, 0) / old.length;
    const y = old.reduce((sum, p) => sum + p.y, 0) / old.length;
    return { spot: { x, y }, fixed: true };
  }
  if (old.length > 0) return { spot: old[0], fixed: false };
  const kind = o.action.kind;
  const spot =
    kind === "toggleType" || kind === "showAllTypes"
      ? neighbourSpot(o, at)
      : chainSpot(o, members[0]);
  return spot === undefined ? null : { spot, fixed: false };
}

// why: STORY-002-07 Origins, mockup `seedPosition` (lib/topology.js lines 955-956) — the phyllotaxis
// point r = 14·√(i+1), angle i·2.39996, made deterministic: i counts the nodes drawn before the
// event, then the newcomers of the call that take such a point, in canonical order
function phyllotaxis(i: number): Point {
  const r = 14 * Math.sqrt(i + 1);
  const a = i * 2.39996;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

// why: STORY-002-07 Origins and rule (g) `starts` — the start spot of each newcomer in canonical
// order; a node that already has its place (a collapse put it back) starts there, and a fixed start
// is also its place
export function newcomersOf(
  o: Origins,
  fresh: number[],
  at: Map<DrawnId, Point>,
) {
  const starts: [DrawnId, Point][] = [];
  const list: Newcomer[] = [];
  let seed = o.before.frontier.nodes.length;
  for (const i of fresh) {
    const id = o.after.frontier.nodes[i].id;
    const settled = at.get(id);
    const start = settled === undefined ? startOf(o, i) : null;
    const spot = settled ?? start?.spot ?? phyllotaxis(seed++);
    starts.push([id, spot]);
    if (start?.fixed === true) at.set(id, spot);
    else if (settled === undefined) {
      const node = o.after.drawn.nodes[i];
      list.push({
        id,
        node,
        origin: spot,
        spot: null,
        tries: 0,
        crowded: false,
      });
    }
  }
  return { starts, list };
}
