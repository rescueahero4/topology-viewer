import { easeCubicInOut } from "d3-ease";
import { select } from "d3-selection";
import { timer, type Timer } from "d3-timer";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import type { DrawnId, Point } from "#engine";
import {
  fitTransform,
  K_MAX,
  K_MIN,
  revealPlan,
  type Box,
  type Camera,
  type FitOptions,
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
  // why: STORY-003-06b "Second press" — true while a node drag or a pill drag runs
  running(): boolean;
  boxes(): Box[];
};

// why: STORY-003-05 — the camera part of a motion runs with the motion clock; a gesture, a fit or a
// resize stops it, and the motion end sets its end camera
export type CameraPart = { at(elapsed: number): void; end(): void };

export type CameraControl = {
  transform(): Camera;
  size(): Size;
  jump(camera: Camera): void;
  first(keep: boolean): boolean;
  fit(options: FitOptions): "none" | "now" | "tween";
  reveal(plan: Camera, anchor: Point, at: Point): boolean;
  centred(target: Box, must: Box[], context: Box[]): Camera | null;
  move(to: Camera): boolean;
  glideTo(to: Camera): (e: number) => Camera;
  follow(frame: (elapsed: number) => Camera, end: Camera): CameraPart;
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
export function instant(doc: Document): boolean {
  const reduce =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  return doc.hidden || reduce;
}

type State = {
  size: Size;
  drawn: boolean;
  current: Camera;
  tween: Timer | null;
  follow: object | null;
};

// why: STORY-003-04 Context "Camera" — the default filter terms (STORY-003-06b: a press during a
// drag starts no pan, a wheel zoom stays), the scale extent, no double-click zoom; the extent
// comes from the observed size (jsdom has no SVG geometry, T1). A gesture (`start` with a
// `sourceEvent`) stops a camera move. Only a gesture end runs the end work here: the camera's
// own `zoom.transform` calls have no `sourceEvent`, so their `end` does nothing and the camera
// runs the end work once at the end of its move (Implementer round 2 item (1))
function behaviourOf(host: CameraHost, st: State, stop: () => void) {
  return zoom<SVGSVGElement, unknown>()
    .filter(
      (event: MouseEvent) =>
        (!event.ctrlKey || event.type === "wheel") &&
        !event.button &&
        !(/^(mousedown|touchstart)$/.test(event.type) && host.running()),
    )
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
      if (host.live() && event.sourceEvent != null) host.settled();
    });
}

type Mover = {
  stop: () => void;
  run: (to: Camera, frame: Frame, animate: boolean) => boolean;
};

// why: each frame calls `zoom.transform`, so the d3-zoom state stays current. Security round 1
// A3 — one camera timer at a time; a throw in a frame stops the timer and sets the end transform
function moverOf(
  host: CameraHost,
  st: State,
  apply: (c: Camera) => void,
): Mover {
  const stop = () => {
    st.tween?.stop();
    st.tween = null;
    st.follow = null;
  };
  const finish = (to: Camera) => {
    stop();
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
    st.tween = timer((elapsed) => {
      let done = true;
      try {
        if (!host.live()) return;
        if (elapsed < DURATION) {
          apply(frame(easeCubicInOut(elapsed / DURATION)));
          done = false;
        }
      } finally {
        if (done) finish(to);
      }
    });
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

// why: one camera part at a time; `mover.stop` (a gesture, a fit, a resize, a reveal, the end)
// clears `st.follow`, so the part writes nothing after it
function followOf(
  host: CameraHost,
  st: State,
  apply: (c: Camera) => void,
  frame: (elapsed: number) => Camera,
  end: Camera,
): CameraPart {
  const token = {};
  st.follow = token;
  const on = () => st.follow === token && host.live();
  return {
    at(elapsed) {
      if (on()) apply(frame(elapsed));
    },
    end() {
      if (on()) apply(end);
      if (st.follow === token) st.follow = null;
    },
  };
}

// why: the layout point at the container centre glides from the current camera to `to`
function glideAbout(st: State, to: Camera): Frame {
  const c = st.current;
  const at = { x: st.size.w / 2, y: st.size.h / 2 };
  return glide(c.k, to.k, at, centreOf(c, at), centreOf(to, at));
}

const fitFor = (host: CameraHost, st: State, o: FitOptions) =>
  fitTransform(
    o.boxes ?? host.boxes(),
    st.size.w,
    st.size.h,
    o.pad ?? PAD,
    o.minK ?? 0,
  );

export function createCamera(host: CameraHost): CameraControl {
  const svgSel = select<SVGSVGElement, unknown>(host.svg);
  const st: State = {
    size: { w: 0, h: 0 },
    drawn: false,
    current: { k: 1, x: 0, y: 0 },
    tween: null,
    follow: null,
  };
  const apply = (c: Camera) =>
    behaviour.transform(svgSel, zoomIdentity.translate(c.x, c.y).scale(c.k));
  const mover = moverOf(host, st, apply);
  const behaviour = behaviourOf(host, st, mover.stop);
  svgSel.call(behaviour).on("dblclick.zoom", null);
  const now = (to: Camera) => mover.run(to, () => to, false);
  const fitTo = (o: FitOptions) => fitFor(host, st, o);
  const glideTo = (to: Camera) => glideAbout(st, to);
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
      const to = keep ? null : fitTo({});
      if (to !== null) now(to);
      return false;
    },
    fit(options) {
      const to = fitTo(options);
      if (to === null) return "none";
      return mover.run(to, glideTo(to), options.animate ?? true)
        ? "tween"
        : "now";
    },
    reveal(plan, anchor, at) {
      const frame = glide(st.current.k, plan.k, at, anchor, anchor);
      return mover.run(plan, frame, true);
    },
    centred: (target, must, context) => centred(st, target, must, context),
    move: (to) => mover.run(to, glideTo(to), true),
    glideTo,
    follow(frame, end) {
      mover.stop();
      return followOf(host, st, apply, frame, end);
    },
    end() {
      mover.stop();
      observer.disconnect();
      svgSel.on(".zoom", null);
    },
  };
}

// why: build-time item B5 (epic question 19) — a focus target that is not fully in the viewport
// gets the TL-4 plan about the viewport centre: it pans and only zooms out, never a fit
function centred(
  st: State,
  target: Box,
  must: Box[],
  context: Box[],
): Camera | null {
  const t = st.current;
  const { w, h } = st.size;
  const x0 = t.x + t.k * (target.x - target.r);
  const x1 = t.x + t.k * (target.x + target.r);
  const y0 = t.y + t.k * (target.y - target.r);
  const y1 = t.y + t.k * (target.y + target.r);
  if (x0 >= 0 && x1 <= w && y0 >= 0 && y1 <= h) return null;
  const s = { x: w / 2, y: h / 2 };
  return revealPlan(t, w, h, { s, p: target }, must, context);
}

export type Before = {
  id: DrawnId;
  at: Point;
  old: Point;
  prev: ReadonlySet<DrawnId>;
  context: ReadonlySet<DrawnId>;
};

const screenOf = (t: Camera, n: Point) => ({
  x: t.x + t.k * n.x,
  y: t.y + t.k * n.y,
});

// why: TL-4 — the previous nodes whose centre is in the container
export function seenOf(scene: Scene, cam: CameraControl): Set<DrawnId> {
  const t = cam.transform();
  const { w, h } = cam.size();
  const seen = (n: SceneNode) => {
    const p = screenOf(t, n);
    return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
  };
  return new Set(scene.nodes.filter(seen).map((n) => n.id));
}

// why: TL-4 — before the draw: the screen point of the anchor and the previous nodes on screen
export function before(
  id: DrawnId,
  scene: Scene,
  ends: Ends,
  cam: CameraControl,
): Before | null {
  const old = ends.get(id);
  if (old === undefined) return null;
  const context = seenOf(scene, cam);
  context.delete(id);
  return {
    id,
    at: screenOf(cam.transform(), old),
    old: { x: old.x, y: old.y },
    prev: new Set(ends.keys()),
    context,
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
