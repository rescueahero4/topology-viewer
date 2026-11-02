import type { Point } from "#engine";

export type Camera = { k: number; x: number; y: number };
export type Box = { x: number; y: number; r: number };
export type Anchor = { s: Point; p: Point };

// why: STORY-003-07 Context — a fit takes its own boxes, pad and lowest zoom (the Group around
// root frame, mockup lines 1261-1270); with none it fits the shown scene nodes at pad 40
export type FitOptions = {
  animate?: boolean;
  boxes?: readonly Box[];
  pad?: number;
  minK?: number;
};

// why: mockup `scaleExtent([0.05, 6])` (lib/topology.js line 535); `zoom.transform` does not
// clamp, so every camera value of this module is clamped here (Security round 1 A4)
export const K_MIN = 0.05;
export const K_MAX = 6;

export const clampK = (k: number) => Math.max(K_MIN, Math.min(K_MAX, k));

const finite = (c: Camera) =>
  Number.isFinite(c.k) && Number.isFinite(c.x) && Number.isFinite(c.y);

export function validCamera(c: Camera | undefined): c is Camera {
  return c !== undefined && finite(c) && c.k >= K_MIN && c.k <= K_MAX;
}

// why: mockup `zoomTo` (lib/topology.js lines 2151-2164) with its floors; the label room below a
// node is 14 layout units, the zoom at most 2 before the clamp
const LABEL_ROOM = 14;
const FIT_MAX = 2;
const FIT_FILL = 0.9;
const MIN_FREE = 50;

export function fitTransform(
  boxes: readonly Box[],
  W: number,
  H: number,
  pad: number,
  minK: number,
): Camera | null {
  if (boxes.length === 0 || !(W > 0) || !(H > 0)) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x - b.r);
    y0 = Math.min(y0, b.y - b.r);
    x1 = Math.max(x1, b.x + b.r);
    y1 = Math.max(y1, b.y + b.r + LABEL_ROOM);
  }
  const w = Math.max(x1 - x0, 1);
  const h = Math.max(y1 - y0, 1);
  const free = Math.max(
    w / Math.max(W - pad * 2, MIN_FREE),
    h / Math.max(H - pad * 2, MIN_FREE),
  );
  const k = clampK(Math.max(minK, Math.min(FIT_MAX, FIT_FILL / free)));
  const c = {
    k,
    x: W / 2 - k * ((x0 + x1) / 2),
    y: H / 2 - k * ((y0 + y1) / 2),
  };
  return finite(c) ? c : null;
}

// why: mockup `screenBox` (lib/topology.js lines 903-910) — a label needs 40 units at each side
// and 30 below the node
const SIDE = 40;
const BELOW = 30;
const MARGIN = 16;
// why: mockup `revealInView` (line 937) — below 55 % of the zoom the context is dropped
const CONTEXT_FLOOR = 0.55;

type Span = { lo: number; hi: number };
type Frame = { L: number; R: number; T: number; B: number };

function spanOf(list: readonly Box[], axis: "x" | "y"): Span {
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of list) {
    lo = Math.min(lo, axis === "x" ? b.x - b.r - SIDE : b.y - b.r);
    hi = Math.max(hi, axis === "x" ? b.x + b.r + SIDE : b.y + b.r + BELOW);
  }
  return { lo, hi };
}

// why: the largest zoom at which the span, with `p` held at `s`, stays between `min` and `max`
function axisK(span: Span, s: number, p: number, min: number, max: number) {
  let k = Infinity;
  if (span.hi > p) k = Math.min(k, (max - s) / (span.hi - p));
  if (span.lo < p) k = Math.min(k, (s - min) / (p - span.lo));
  return k;
}

function kfit(t: Camera, a: Anchor, f: Frame, list: readonly Box[]): number {
  if (list.length === 0) return t.k;
  const kx = axisK(spanOf(list, "x"), a.s.x, a.p.x, f.L, f.R);
  const ky = axisK(spanOf(list, "y"), a.s.y, a.p.y, f.T, f.B);
  return Math.min(t.k, kx, ky);
}

// why: TL-4, SA §6 row 6 — after an explore the anchor keeps its screen point `s` with its new
// layout position `p`; the camera only zooms out, and only when the explore needs it
export function revealPlan(
  t: Camera,
  W: number,
  H: number,
  anchor: Anchor,
  must: readonly Box[],
  context: readonly Box[],
): Camera | null {
  const { s, p } = anchor;
  if (!(W > 0) || !(H > 0) || !(s.x >= 0 && s.x <= W && s.y >= 0 && s.y <= H))
    return null;
  const f: Frame = {
    L: Math.min(MARGIN, s.x),
    R: Math.max(W - MARGIN, s.x),
    T: Math.min(MARGIN, s.y),
    B: Math.max(H - MARGIN, s.y),
  };
  let k = kfit(t, anchor, f, [...must, ...context]);
  if (k < CONTEXT_FLOOR * t.k) k = kfit(t, anchor, f, must);
  k = Math.max(k, K_MIN);
  const c = { k, x: s.x - k * p.x, y: s.y - k * p.y };
  if (!finite(c)) return null;
  // why: `s` comes from the transform, so an unmoved anchor gives `t` again up to rounding
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  return k === t.k && same(c.x, t.x) && same(c.y, t.y) ? null : c;
}
