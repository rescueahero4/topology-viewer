import { easeCubicIn, easeCubicInOut, easeCubicOut } from "d3-ease";
import { select } from "d3-selection";
import { timer, type Timer } from "d3-timer";
import type { DrawnId, Point } from "@qdic-topology/engine";
import {
  boxOf,
  planOf,
  type Before,
  type CameraControl,
  type CameraPart,
} from "./camera";
import { edgeMover, endOf, type At, type Ends } from "./edges";
import { haloMover } from "./halo";
import type { Layers } from "./layers";
import {
  layoutTracks,
  localTracks,
  pointAt,
  retractTracks,
  RETRACT_MS,
  type Ease,
  type Track,
  type Tracks,
} from "./motionPlan";
import { nodeMover } from "./nodes";
import { pillMover } from "./pills";
import type { Scene, SceneEdge, SceneNode } from "./scene";

export type MotionKind = "none" | "local" | "layout" | "collapse";

// why: STORY-003-05 Context "Renderer motion" — the controller gives the kind, the engine `starts`
// and `retractTo` of `place`, the anchor that keeps its screen point (TL-4) and the focus target
// that the camera shows (build-time item B5)
export type Motion = {
  kind: MotionKind;
  starts: [DrawnId, Point][];
  retractTo: [DrawnId, Point][];
  anchor: DrawnId | null;
  focus: DrawnId | null;
};

// why: Implementer round 2 (d) — the STORY-003-04 form `{ anchor }` stays: kind `none` with the
// 450 ms camera move
export type DrawMotion = Motion | Pick<Motion, "anchor">;

const NONE: Motion = {
  kind: "none",
  starts: [],
  retractTo: [],
  anchor: null,
  focus: null,
};

export const motionOf = (m: DrawMotion | undefined): Motion =>
  m === undefined ? NONE : "kind" in m ? m : { ...NONE, anchor: m.anchor };

export type Stage = {
  length: number;
  begin(): void;
  at(t: number): void;
  end(): void;
};

export type StageHost = {
  layers: Layers;
  root: HTMLDivElement;
  paint(scene: Scene): void;
  scene(): Scene;
  ends(): Ends;
  k(): number;
};

const BORN = "qt-born";
const EMERGING = "qt-born qt-emerge";

// why: mockup `bloom` and `retract` (lib/topology.js lines 748-751, 2208-2219) — the emerge classes
// go on the nodes and on each edge with an end among them
function classed(
  layers: Layers,
  ids: ReadonlySet<DrawnId>,
  names: string,
  on: boolean,
) {
  if (ids.size === 0) return;
  select(layers.nodes)
    .selectAll<SVGGElement, SceneNode>("g.qt-node")
    .filter((d) => ids.has(d.id))
    .classed(names, on);
  select(layers.edges)
    .selectAll<SVGPathElement, SceneEdge>("path.qt-edge")
    .filter((e) => ids.has(e.subject) || ids.has(e.object))
    .classed(names, on);
}

// why: STORY-003-05 frame writes — finite numbers only, for the moving nodes, the edges and hit
// paths with a moving end, the halo of a moving selected node and the pills with a moving end
function writerOf(host: StageHost, tracks: Track[], ease: Ease) {
  const { layers } = host;
  const scene = host.scene();
  const ends = host.ends();
  const moving = new Set(tracks.map((t) => t.id));
  const nodes = nodeMover(layers.nodes, moving);
  const edges = edgeMover(layers.edges, "path.qt-edge", moving, scene.layout);
  const hits = edgeMover(layers.hits, "path.qt-ehit", moving, scene.layout);
  const pills = pillMover(layers.edgeLabels, moving);
  const selected = scene.selection.node;
  const halo =
    selected !== null && moving.has(selected) ? haloMover(layers.focus) : null;
  return (elapsed: number) => {
    const pos = new Map(tracks.map((t) => [t.id, pointAt(t, elapsed, ease)]));
    const at: At = (id) => {
      const p = pos.get(id);
      const node = endOf(ends, id);
      return p === undefined ? node : { ...node, x: p.x, y: p.y };
    };
    nodes(pos);
    edges(at);
    hits(at);
    pills(at, host.k());
    const p = selected === null ? undefined : pos.get(selected);
    if (halo !== null && p !== undefined) halo(p);
  };
}

// why: SA §4.5 — the nodes and edges tween from the drawn positions; newcomers emerge with
// `qt-born`, which the first later frame removes so the CSS transition runs (mockup `bloom`)
function trackStage(
  host: StageHost,
  paint: Scene,
  plan: Tracks,
  ease: Ease,
): Stage {
  const fresh = new Set(plan.newcomers);
  let write: ((elapsed: number) => void) | null = null;
  let born = false;
  let first = true;
  return {
    length: plan.length,
    begin() {
      host.paint(paint);
      classed(host.layers, fresh, EMERGING, true);
      // why: mockup `bloom` (line 2214) — the start state is styled before the transition starts
      if (fresh.size > 0) host.root.getBoundingClientRect();
      born = fresh.size > 0;
      write = writerOf(host, plan.tracks, ease);
    },
    at(t) {
      write?.(t);
      if (born && !first) {
        classed(host.layers, fresh, BORN, false);
        born = false;
      }
      first = false;
    },
    end() {
      write?.(Infinity);
      classed(host.layers, fresh, EMERGING, false);
    },
  };
}

// why: mockup `retract` (lines 748-758) — the leaving nodes with an entry fade, shrink and glide to
// it; the leaving nodes with no entry and their edges leave at once
function retractStage(
  host: StageHost,
  prev: Scene,
  tracks: Track[],
  gone: Set<DrawnId>,
): Stage {
  const keep = (id: DrawnId) => !gone.has(id);
  const scene: Scene = {
    ...prev,
    nodes: prev.nodes.filter((n) => keep(n.id)),
    edges: prev.edges.filter((e) => keep(e.subject) && keep(e.object)),
  };
  const ids = new Set(tracks.map((t) => t.id));
  let write: ((elapsed: number) => void) | null = null;
  return {
    length: RETRACT_MS,
    begin() {
      host.paint(scene);
      classed(host.layers, ids, EMERGING, true);
      write = writerOf(host, tracks, easeCubicIn);
    },
    at: (t) => write?.(t),
    end: () => write?.(Infinity),
  };
}

const spotsOf = (nodes: readonly SceneNode[]) =>
  new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

export type Staged = { stages: Stage[]; local: Tracks };

export function stagesOf(
  host: StageHost,
  prev: Scene,
  scene: Scene,
  motion: Motion,
): Staged {
  const drawn = spotsOf(prev.nodes);
  if (motion.kind === "layout") {
    const local = layoutTracks(drawn, scene.nodes);
    return { stages: [trackStage(host, scene, local, easeCubicOut)], local };
  }
  const local = localTracks(drawn, scene.nodes, new Map(motion.starts));
  const stages = [trackStage(host, scene, local, easeCubicOut)];
  if (motion.kind !== "collapse") return { stages, local };
  const next = new Set(scene.nodes.map((n) => n.id));
  const leaving = new Map([...drawn].filter(([id]) => !next.has(id)));
  const tracks = retractTracks(leaving, new Map(motion.retractTo));
  if (tracks.length === 0) return { stages, local };
  const gone = new Set(
    [...leaving.keys()].filter((id) => !tracks.some((t) => t.id === id)),
  );
  return { stages: [retractStage(host, prev, tracks, gone), ...stages], local };
}

export type PlayerHost = {
  live(): boolean;
  settled(): void;
  failed(): void;
};

export type Player = {
  running(): boolean;
  play(stages: Stage[], camera: () => CameraPart | null): void;
  jump(settle: boolean): void;
  stop(): void;
};

type Run = {
  stages: Stage[];
  i: number;
  offset: number;
  camera: CameraPart | null;
  timer: Timer | null;
};

function advance(run: Run): void {
  run.stages[run.i].end();
  run.offset += run.stages[run.i].length;
  run.i++;
  if (run.i < run.stages.length) run.stages[run.i].begin();
}

function finish(run: Run): void {
  while (run.i < run.stages.length) advance(run);
  run.camera?.end();
}

// why: Security A6 — one `d3-timer` per running motion and at most one per renderer; a new draw,
// a hidden document or the renderer end stops it; a throw in a frame stops it, sets the end and
// reports, and the timer stops before the end work and `onSettle`
export function createPlayer(host: PlayerHost): Player {
  let run: Run | null = null;
  const stop = () => {
    run?.timer?.stop();
    run = null;
  };
  const close = (r: Run, failed: boolean, settle: boolean) => {
    stop();
    try {
      finish(r);
    } finally {
      if (failed) host.failed();
      else if (settle) host.settled();
    }
  };
  const frame = (r: Run) => (elapsed: number) => {
    if (!host.live()) return stop();
    let done = true;
    let failed = false;
    try {
      while (
        r.i < r.stages.length &&
        elapsed - r.offset >= r.stages[r.i].length
      )
        advance(r);
      r.camera?.at(elapsed);
      if (r.i < r.stages.length) {
        r.stages[r.i].at(elapsed - r.offset);
        done = false;
      }
    } catch {
      failed = true;
    } finally {
      if (done || failed) close(r, failed, true);
    }
  };
  return {
    running: () => run !== null,
    play(stages, camera) {
      stop();
      const r: Run = { stages, i: 0, offset: 0, camera: null, timer: null };
      stages[0].begin();
      r.camera = camera();
      r.camera?.at(0);
      stages[0].at(0);
      run = r;
      r.timer = timer(frame(r));
    },
    jump(settle) {
      if (run !== null) close(run, false, settle);
    },
    stop,
  };
}

// why: TL-4 and build-time item B5 — the anchor and the nodes on screen are read before the draw
export type Plans = { b: Before | null; seen: ReadonlySet<DrawnId> | null };
type View = { scene: Scene; ends: Ends };

function focusPlan(
  cam: CameraControl,
  prev: Scene,
  now: View,
  focus: DrawnId | null,
  seen: ReadonlySet<DrawnId> | null,
) {
  const target = focus === null ? undefined : now.ends.get(focus);
  if (target === undefined || seen === null) return null;
  const old = new Set(prev.nodes.map((n) => n.id));
  const nodes = now.scene.nodes;
  const must = nodes.filter((n) => n.id === focus || !old.has(n.id));
  const context = nodes.filter((n) => n.id !== focus && seen.has(n.id));
  return cam.centred(boxOf(target), must.map(boxOf), context.map(boxOf));
}

// why: TL-4, Implementer round 2 (f) — with the motion clock the zoom eases over the tween of one
// node, and the anchor keeps its screen point at its tweened position in every frame
export function cameraPart(
  cam: CameraControl,
  prev: Scene,
  now: View,
  m: Motion,
  plans: Plans,
  local: Tracks,
): CameraPart | null {
  const ease = (elapsed: number) =>
    easeCubicInOut(Math.min(1, elapsed / local.duration));
  const b = plans.b;
  if (b === null) {
    const plan = focusPlan(cam, prev, now, m.focus, plans.seen);
    if (plan === null) return null;
    const glide = cam.glideTo(plan);
    return cam.follow((elapsed) => glide(ease(elapsed)), plan);
  }
  const next = planOf(b, now.scene, now.ends, cam);
  if (next === null) return null;
  const { plan, p } = next;
  const k0 = cam.transform().k;
  const track = local.tracks.find((t) => t.id === b.id);
  return cam.follow((elapsed) => {
    const e = ease(elapsed);
    const k = e >= 1 ? plan.k : k0 + (plan.k - k0) * e;
    const q = track === undefined ? p : pointAt(track, elapsed, easeCubicOut);
    return { k, x: b.at.x - k * q.x, y: b.at.y - k * q.y };
  }, plan);
}

// why: a draw with no motion: the STORY-003-04 camera move of an anchor, or the B5 focus move
export function cameraNow(
  cam: CameraControl,
  prev: Scene,
  now: View,
  m: Motion,
  plans: Plans,
): boolean {
  if (plans.b !== null) {
    const next = planOf(plans.b, now.scene, now.ends, cam);
    return next !== null && cam.reveal(next.plan, next.p, plans.b.at);
  }
  const plan = focusPlan(cam, prev, now, m.focus, plans.seen);
  return plan !== null && cam.move(plan);
}
