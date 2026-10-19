import type { DrawnId, Point } from "@qdic-topology/engine";

// why: mockup `finishLocal` (lib/topology.js lines 1413-1419) — a local change takes 520 ms plus
// 0.3 ms for each unit of its longest trip, at most 900 ms (PRD NF-1)
const LOCAL_MIN = 520;
const LOCAL_MAX = 900;
const LOCAL_RATE = 0.3;
// why: mockup `tween` (lines 2230-2234) — each newcomer starts 14 ms after the one before it,
// nearest first, at most 180 ms late
const STAGGER = 14;
const STAGGER_MAX = 180;
// why: mockup `retract` (line 754) and the layout tween — collapse 280 ms; a layout change 450 ms,
// 520 ms when newcomers emerge
export const RETRACT_MS = 280;
const LAYOUT_MS = 450;
const LAYOUT_NEW_MS = 520;

export type Ease = (t: number) => number;

export type Track = {
  id: DrawnId;
  from: Point;
  to: Point;
  delay: number;
  length: number;
};

// why: `duration` is the tween of one node, `length` the whole stage with the last delay
export type Tracks = {
  tracks: Track[];
  duration: number;
  length: number;
  newcomers: DrawnId[];
};

export const finitePoint = (p: Point | undefined): p is Point =>
  p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y);

const tripOf = (from: Point, to: Point) =>
  Math.hypot(to.x - from.x, to.y - from.y);

export const localMs = (d: number) =>
  Math.round(Math.min(LOCAL_MAX, LOCAL_MIN + LOCAL_RATE * d));

export const layoutMs = (newcomers: boolean) =>
  newcomers ? LAYOUT_NEW_MS : LAYOUT_MS;

// why: the delay of each trip, in input order: rank by length, nearest first, ties in input order
export function staggerOf(trips: readonly number[]): number[] {
  const order = trips.map((trip, i) => ({ trip, i }));
  order.sort((a, b) => a.trip - b.trip || a.i - b.i);
  const delays = new Array<number>(trips.length).fill(0);
  order.forEach(({ i }, rank) => {
    delays[i] = Math.min(rank * STAGGER, STAGGER_MAX);
  });
  return delays;
}

export type Spots = ReadonlyMap<DrawnId, Point>;
type To = readonly { id: DrawnId; x: number; y: number }[];

// why: SA §6 row 5, Security A9 — a start that is not finite is not used: the trip starts at its end
const startOf = (start: Point | undefined, to: Point): Point =>
  finitePoint(start) ? { x: start.x, y: start.y } : { x: to.x, y: to.y };

// why: hand-off items 13, 15, D77 — the motion goes from the drawn positions (newcomers: their
// `starts` entry, else their end) to the scene positions; it reads no engine record
export function localTracks(drawn: Spots, scene: To, starts: Spots): Tracks {
  const trips: { id: DrawnId; from: Point; to: Point; fresh: boolean }[] = [];
  for (const n of scene) {
    const to = { x: n.x, y: n.y };
    const at = drawn.get(n.id);
    const fresh = at === undefined;
    trips.push({
      id: n.id,
      from: startOf(at ?? starts.get(n.id), to),
      to,
      fresh,
    });
  }
  const lengths = trips.map((t) => tripOf(t.from, t.to));
  const d = lengths.reduce(
    (a, b) => (Number.isFinite(b) ? Math.max(a, b) : a),
    0,
  );
  const length = localMs(d);
  const fresh = trips.filter((t) => t.fresh);
  const delays = staggerOf(fresh.map((t) => tripOf(t.from, t.to)));
  const delayOf = new Map(fresh.map((t, i) => [t.id, delays[i]]));
  const tracks = trips.flatMap(({ id, from, to }, i) =>
    lengths[i] > 0
      ? [{ id, from, to, delay: delayOf.get(id) ?? 0, length }]
      : [],
  );
  const last = Math.max(0, ...delays);
  return {
    tracks,
    duration: length,
    length: length + last,
    newcomers: fresh.map((t) => t.id),
  };
}

// why: the layout tween — every node that stays moves in one duration; newcomers appear at their end
export function layoutTracks(drawn: Spots, scene: To): Tracks {
  const newcomers = scene.filter((n) => !drawn.has(n.id)).map((n) => n.id);
  const length = layoutMs(newcomers.length > 0);
  const tracks: Track[] = [];
  for (const n of scene) {
    const at = drawn.get(n.id);
    if (at === undefined) continue;
    const to = { x: n.x, y: n.y };
    const from = startOf(at, to);
    if (tripOf(from, to) > 0)
      tracks.push({ id: n.id, from, to, delay: 0, length });
  }
  return { tracks, duration: length, length, newcomers };
}

// why: mockup `retract` (lines 748-758) — each leaving node with an entry glides to it in 280 ms
export function retractTracks(drawn: Spots, retractTo: Spots): Track[] {
  const tracks: Track[] = [];
  for (const [id, end] of retractTo) {
    const at = drawn.get(id);
    if (at === undefined || !finitePoint(end)) continue;
    tracks.push({
      id,
      from: startOf(at, end),
      to: end,
      delay: 0,
      length: RETRACT_MS,
    });
  }
  return tracks;
}

// why: NF-8, Security A9 — the last sample is the end point itself, and a value that is not finite
// gives the end
export function pointAt(track: Track, elapsed: number, ease: Ease): Point {
  const u = Math.max(0, Math.min(1, (elapsed - track.delay) / track.length));
  if (u >= 1) return track.to;
  const e = ease(u);
  const { from, to } = track;
  const p = {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
  };
  return finitePoint(p) ? p : to;
}
