import type { Point } from "@qdic-topology/engine";
import type { Camera } from "./fit";

// why: the two fields of a `d3-drag` event that a gesture reads
export type GestureEvent = {
  identifier: string | number;
  sourceEvent: unknown;
};

const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

// why: STORY-003-06a Context "Pointer" — the client point of the gesture (the mouse, or the touch
// with the gesture identifier); a point that is not finite is not used
export function clientOf(event: GestureEvent): Point | null {
  const src = event.sourceEvent as MouseEvent & Partial<TouchEvent>;
  const touch =
    event.identifier === "mouse"
      ? src
      : Array.from(src.changedTouches ?? []).find(
          (t) => t.identifier === event.identifier,
        );
  if (touch === undefined) return null;
  const p = { x: touch.clientX, y: touch.clientY };
  return finite(p) ? p : null;
}

// why: ISSUE-010 — the client point in the root `<svg>` coordinates (in jsdom the root rectangle
// is at 0, 0)
export function originOf(svg: SVGSVGElement): Point {
  const rect = svg.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}

// why: ISSUE-010 `P(c, t)` — the layout point of the client point `c` through the camera `t`
const layoutOf = (c: Point, t: Camera, o: Point): Point => ({
  x: (c.x - o.x - t.x) / t.k,
  y: (c.y - o.y - t.y) / t.k,
});

// why: ISSUE-010 — the press point `c0` and `P(c0, t0)` at the drag start
export type Grip = { c0: Point; p0: Point };

export const gripOf = (c0: Point, t0: Camera, o0: Point): Grip => ({
  c0,
  p0: layoutOf(c0, t0, o0),
});

// why: ISSUE-010, story question 25 — `D(c, t) = (c − c0) / t.k + (P(c0, t) − P(c0, t0))`, in
// this bit-stable form: with no zoom since the drag start the second term is exactly 0, so the
// STORY-003-06a numbers stay; only finite numbers go to a handler (null otherwise)
export function driftOf(g: Grip, c: Point, t: Camera, o: Point): Point | null {
  const p = layoutOf(g.c0, t, o);
  const d = {
    x: (c.x - g.c0.x) / t.k + (p.x - g.p0.x),
    y: (c.y - g.c0.y) / t.k + (p.y - g.p0.y),
  };
  return finite(d) ? d : null;
}
