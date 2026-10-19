import { easeCubicInOut } from "d3-ease";
import { select } from "d3-selection";
import { timer, type Timer } from "d3-timer";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import type { DrawnId, Point } from "@qdic-topology/engine";
import {
  fitTransform,
  K_MAX,
  K_MIN,
  revealPlan,
  type Box,
  type Camera,
} from "./fit";
import type { Ends } from "./edges";
import type { Scene, SceneNode } from "./scene";

export type Size = { w: number; h: number };

// why: SA §4.5 (A23.2) — the camera is view state of the renderer; the renderer gives it the
// work of each zoom event and of each end, and the boxes of the scene
export type CameraHost = {
  root: HTMLDivElement;
  svg: SVGSVGElement;
  viewport: SVGGElement;
  live(): boolean;
  zoomed(camera: Camera): void;
  settled(): void;
  boxes(): Box[];
};

export type CameraControl = {
  transform(): Camera;
  size(): Size;
  jump(camera: Camera): void;
  first(keep: boolean): boolean;
  fit(animate: boolean): "none" | "now" | "tween";
  reveal(plan: Camera, anchor: Point, at: Point): boolean;
  end(): void;
};

// why: mockup camera moves (lib/topology.js lines 939, 2163): 450 ms, pad 40
const DURATION = 450;
const PAD = 40;

type Event = D3ZoomEvent<SVGSVGElement, unknown>;
type Frame = (e: number) => Camera;

export const boxOf = (n: SceneNode): Box => ({ x: n.x, y: n.y, r: n.r });

// why: the zoom goes from k0 to k1 while the layout point `q` (eased from q0 to q1) stays at the
// screen point `at`; a reveal keeps its anchor still in every frame (TL-4)
const glide =
  (k0: number, k1: number, at: Point, q0: Point, q1: Point): Frame =>
  (e) => {
    const k = k0 + (k1 - k0) * e;
    const qx = q0.x + (q1.x - q0.x) * e;
    const qy = q0.y + (q1.y - q0.y) * e;
    return { k, x: at.x - k * qx, y: at.y - k * qy };
  };

const centreOf = (c: Camera, at: Point): Point => ({
  x: (at.x - c.x) / c.k,
  y: (at.y - c.y) / c.k,
});

// why: NF-8 — under reduced motion or a hidden document a move jumps to its end; `matchMedia` is
// read at each move and can be absent (Security round 2 (d))
function instant(doc: Document): boolean {
  const reduce =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  return doc.hidden || reduce;
}

type State = {
  size: Size;
  drawn: boolean;
  current: Camera;
  own: boolean;
  tween: Timer | null;
};

// why: STORY-003-04 Context "Camera" — the default filter, the scale extent, no double-click
// zoom; the extent comes from the observed size (jsdom has no SVG geometry, T1). A gesture
// (`start` with a `sourceEvent`) stops a camera move; only a gesture end runs the end work here
function behaviourOf(host: CameraHost, st: State, stop: () => void) {
  return zoom<SVGSVGElement, unknown>()
    .scaleExtent([K_MIN, K_MAX])
    .extent((): [[number, number], [number, number]] => [
      [0, 0],
      [st.size.w, st.size.h],
    ])
    .on("start", (event: Event) => {
      if (host.live() && event.sourceEvent != null) stop();
    })
    .on("zoom", (event: Event) => {
      if (!host.live()) return;
      const t = event.transform;
      st.current = { k: t.k, x: t.x, y: t.y };
      host.viewport.setAttribute("transform", t.toString());
      host.zoomed(st.current);
    })
    .on("end", (event: Event) => {
      if (host.live() && !st.own && event.sourceEvent != null) host.settled();
    });
}

type Mover = {
  stop: () => void;
  run: (to: Camera, frame: Frame, animate: boolean) => boolean;
};

// why: our own `zoom.transform` call keeps the d3-zoom state current and its `end` does no work;
// the camera runs the end work once at the end of the move. Security round 1 A3 — one camera
// timer at a time; a throw in a frame stops the timer and sets the end transform
function moverOf(
  host: CameraHost,
  st: State,
  apply: (c: Camera) => void,
): Mover {
  const stop = () => {
    st.tween?.stop();
    st.tween = null;
  };
  const finish = (t: Timer, to: Camera) => {
    t.stop();
    if (st.tween !== t) return;
    st.tween = null;
    if (!host.live()) return;
    apply(to);
    host.settled();
  };
  const run = (to: Camera, frame: Frame, animate: boolean) => {
    stop();
    if (!animate || instant(host.root.ownerDocument)) {
      apply(to);
      return false;
    }
    apply(frame(0));
    const t = timer((elapsed) => {
      let done = true;
      try {
        if (!host.live() || st.tween !== t) return;
        if (elapsed < DURATION) {
          apply(frame(easeCubicInOut(elapsed / DURATION)));
          done = false;
        }
      } finally {
        if (done) finish(t, to);
      }
    });
    st.tween = t;
    return true;
  };
  return { stop, run };
}

// why: FR-CANVAS-17, epic question 22 — the first callback with the drawn size is not a resize;
// a change to a non-zero size fits at once, also after a hand zoom; 0 × 0 does nothing
function observerOf(host: CameraHost, st: State, fit: (to: Camera) => void) {
  const observer = new ResizeObserver((entries) => {
    if (!host.live()) return;
    const last = entries[entries.length - 1];
    if (last === undefined) return;
    const { width: w, height: h } = last.contentRect;
    const same = st.size.w === w && st.size.h === h;
    st.size = { w, h };
    if (!st.drawn || same) return;
    const to = fitTransform(host.boxes(), w, h, PAD, 0);
    if (to !== null) fit(to);
  });
  observer.observe(host.root);
  return observer;
}

export function createCamera(host: CameraHost): CameraControl {
  const svgSel = select<SVGSVGElement, unknown>(host.svg);
  const st: State = {
    size: { w: 0, h: 0 },
    drawn: false,
    current: { k: 1, x: 0, y: 0 },
    own: false,
    tween: null,
  };
  const mover = moverOf(host, st, (c) => {
    st.own = true;
    try {
      behaviour.transform(svgSel, zoomIdentity.translate(c.x, c.y).scale(c.k));
    } finally {
      st.own = false;
    }
  });
  const behaviour = behaviourOf(host, st, mover.stop);
  svgSel.call(behaviour).on("dblclick.zoom", null);
  const now = (to: Camera) => mover.run(to, () => to, false);
  const fitNow = () => fitTransform(host.boxes(), st.size.w, st.size.h, PAD, 0);
  const observer = observerOf(host, st, (to) => {
    now(to);
    host.settled();
  });
  return {
    transform: () => ({ ...st.current }),
    size: () => ({ ...st.size }),
    jump: now,
    first(keep) {
      st.drawn = true;
      const rect = host.root.getBoundingClientRect();
      st.size = { w: rect.width, h: rect.height };
      if (!(st.size.w > 0 && st.size.h > 0)) return true;
      const to = keep ? null : fitNow();
      if (to !== null) now(to);
      return false;
    },
    fit(animate) {
      const to = fitNow();
      if (to === null) return "none";
      const at = { x: st.size.w / 2, y: st.size.h / 2 };
      const c = st.current;
      const frame = glide(c.k, to.k, at, centreOf(c, at), centreOf(to, at));
      return mover.run(to, frame, animate) ? "tween" : "now";
    },
    reveal(plan, anchor, at) {
      const frame = glide(st.current.k, plan.k, at, anchor, anchor);
      return mover.run(plan, frame, true);
    },
    end() {
      mover.stop();
      observer.disconnect();
      svgSel.on(".zoom", null);
    },
  };
}

export type Before = {
  id: DrawnId;
  at: Point;
  old: Point;
  prev: ReadonlySet<DrawnId>;
  context: ReadonlySet<DrawnId>;
};

// why: TL-4 — before the draw: the screen point of the anchor and the previous nodes whose centre
// is in the container
export function before(
  id: DrawnId,
  scene: Scene,
  ends: Ends,
  cam: CameraControl,
): Before | null {
  const old = ends.get(id);
  if (old === undefined) return null;
  const t = cam.transform();
  const { w, h } = cam.size();
  const screen = (n: Point) => ({ x: t.x + t.k * n.x, y: t.y + t.k * n.y });
  const seen = (n: SceneNode) => {
    const p = screen(n);
    return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
  };
  return {
    id,
    at: screen(old),
    old: { x: old.x, y: old.y },
    prev: new Set(ends.keys()),
    context: new Set(
      scene.nodes.filter((n) => n.id !== id && seen(n)).map((n) => n.id),
    ),
  };
}

// why: TL-4 — after the draw: `p` is the new position of the anchor (the old one when it left the
// scene), `must` the anchor and the newcomers, `context` the previous nodes that stay
export function planOf(
  b: Before,
  scene: Scene,
  ends: Ends,
  cam: CameraControl,
) {
  const node = ends.get(b.id);
  const p = node === undefined ? b.old : { x: node.x, y: node.y };
  const must = scene.nodes.filter((n) => n.id === b.id || !b.prev.has(n.id));
  const context = scene.nodes.filter((n) => b.context.has(n.id));
  const { w, h } = cam.size();
  const plan = revealPlan(
    cam.transform(),
    w,
    h,
    { s: b.at, p },
    must.map(boxOf),
    context.map(boxOf),
  );
  return plan === null ? null : { plan, p };
}
