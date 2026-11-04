import { fromControl } from "./intents";
import { drag, type D3DragEvent } from "d3-drag";
import { select } from "d3-selection";
import { timer, type Timer } from "d3-timer";
import type { DrawnId, Point } from "#engine";
import { bubbleMover } from "./bubbles";
import { edgeMover, endOf, endsOf, type At, type Ends } from "./edges";
import type { Camera } from "./fit";
import { clientOf, driftOf, gripOf, originOf, type Grip } from "./gesture";
import { haloMover } from "./halo";
import type { Layers } from "./layers";
import { nodeMover } from "./nodes";
import { pillMover } from "./pills";
import type { Scene, SceneNode } from "./scene";

// why: SA §4.5 (A23.2) — during a drag the renderer asks the controller for the positions of each
// frame; the controller runs the engine drag, so the renderer has no drag rule of its own
export type DragHandlers = {
  start(id: DrawnId): boolean;
  frame(pointer: Point): [DrawnId, Point][];
  end(): [DrawnId, Point][][];
};

export type DragHost = {
  layers: Layers;
  doc: Document;
  view: { scene: Scene; ends: Ends };
  signal: AbortSignal;
  live(): boolean;
  // why: ISSUE-010 — the camera transform of each frame; `k` is read from it, so the zoom has
  // one source
  transform(): Camera;
  // why: story "Second press" — true while a node press or a pill press is running
  running(): boolean;
  instant(): boolean;
  jump(): void;
  settled(): void;
  failed(): void;
};

export type Drag = {
  bind(): void;
  end(): void;
  hidden(): void;
  busy(): boolean;
  running(): boolean;
  drop(): void;
};

type Event = D3DragEvent<SVGGElement, SceneNode, SceneNode>;
type Steps = [DrawnId, Point][][];
type Press = {
  id: DrawnId;
  key: string | number;
  from: Point;
  at: Point;
  origin: Point;
  grip: Grip | null;
  on: "pressed" | "running" | "done";
};
type How = "play" | "now" | "quiet";

// why: Context "Stuck drags" — the window `blur` and the `visibilitychange` listeners of a drag
export type Watch = {
  doc: Document;
  signal: AbortSignal;
  stuck: () => void;
  hide: () => void;
};

type M = {
  host: DragHost;
  on: DragHandlers;
  press: Press | null;
  ticker: Timer | null;
  steps: Steps | null;
  next: number;
  gen: number;
  w: Watch;
};

// why: ISSUE-010 — the node position at the start plus the drag point `D(c, t)` of the gesture
// module, so the node does not jump by the grab offset, stays under the pointer after a wheel
// zoom, and jsdom gives the numbers of Chromium (no `getScreenCTM`)
function pointerOf(host: DragHost, p: Press): Point | null {
  if (p.grip === null) return null;
  const d = driftOf(p.grip, p.at, host.transform(), originOf(host.layers.svg));
  return d === null ? null : { x: p.origin.x + d.x, y: p.origin.y + d.y };
}

// why: STORY-003-05 frame writes — the nodes that changed, the edges, hit paths and pills with a
// changed end, the halo of a changed selected node and the bubbles; finite numbers only, so a
// node with a position that is not finite keeps its last finite `transform`
export function moveTo(
  host: Pick<DragHost, "layers" | "view" | "transform">,
  list: readonly [DrawnId, Point][],
): void {
  const { view, layers } = host;
  const moved = new Map<DrawnId, Point>();
  for (const [id, p] of list) {
    const node = view.ends.get(id);
    if (node === undefined || !Number.isFinite(p.x) || !Number.isFinite(p.y))
      continue;
    if (node.x !== p.x || node.y !== p.y) moved.set(id, { x: p.x, y: p.y });
  }
  if (moved.size === 0) return;
  const nodes = view.scene.nodes.map((n) => {
    const p = moved.get(n.id);
    return p === undefined ? n : { ...n, x: p.x, y: p.y };
  });
  view.scene = { ...view.scene, nodes };
  view.ends = endsOf(nodes);
  const ids = new Set(moved.keys());
  const at: At = (id) => endOf(view.ends, id);
  const { k } = host.transform();
  nodeMover(layers.nodes, ids)(moved);
  edgeMover(layers.edges, "path.qt-edge", ids, view.scene.layout)(at);
  edgeMover(layers.hits, "path.qt-ehit", ids, view.scene.layout)(at);
  pillMover(layers.edgeLabels, ids)(at, k);
  bubbleMover(layers, view.scene)(at, k);
  const selected = view.scene.selection.node;
  const p = selected === null ? undefined : moved.get(selected);
  if (p !== undefined) haloMover(layers.focus)(p);
}

// why: Security note n2 — the one `defaultView` use; the listeners go with the drag
export function watch(w: Watch, on: boolean): void {
  const { doc, signal } = w;
  const win = doc.defaultView;
  if (on) {
    win?.addEventListener("blur", w.stuck, { signal });
    doc.addEventListener("visibilitychange", w.hide, { signal });
    return;
  }
  win?.removeEventListener("blur", w.stuck);
  doc.removeEventListener("visibilitychange", w.hide);
}

// why: story "Second press" — the `d3-drag` default terms (`d3-drag/src/drag.js` line 10) and no
// press while a drag runs, so a second press writes no window listeners of its own
export const pressFilter =
  (running: () => boolean) => (event: MouseEvent | TouchEvent) =>
    !event.ctrlKey &&
    !(event as MouseEvent).button &&
    !running() &&
    !fromControl(event);

const stopTicker = (m: M) => {
  m.ticker?.stop();
  m.ticker = null;
};

function stopPlay(m: M): Steps | null {
  const steps = m.steps;
  stopTicker(m);
  m.steps = null;
  return steps;
}

// why: Context "End" (TL-10) — a jumped playback writes its last step; only the hidden case settles
function jumpPlay(m: M, settle: boolean): void {
  const steps = stopPlay(m);
  if (steps === null) return;
  try {
    if (steps.length > 0) moveTo(m.host, steps[steps.length - 1]);
  } catch {
    return m.host.failed();
  }
  if (settle) m.host.settled();
}

function playFrame(m: M): void {
  const steps = m.steps;
  if (!m.host.live() || steps === null) return;
  try {
    moveTo(m.host, steps[m.next++]);
  } catch {
    stopPlay(m);
    return m.host.failed();
  }
  if (m.next < steps.length) return;
  stopPlay(m);
  m.host.settled();
}

// why: Context "End", "Stuck drags" — one `drag.end()`; the steps play one per frame, or at once
// for a stuck end, under reduced motion and in a hidden document (NF-8). A draw or an `endDrag`
// inside that call wins over the steps (Implementer round 2 (e))
function finish(m: M, p: Press, how: How): void {
  stopTicker(m);
  watch(m.w, false);
  p.on = "done";
  const gen = m.gen;
  let steps: Steps;
  try {
    steps = m.on.end();
  } catch {
    return m.host.failed();
  }
  if (gen !== m.gen || !m.host.live()) return;
  if (how === "play" && steps.length > 0 && !m.host.instant()) {
    m.steps = steps;
    m.next = 0;
    m.ticker = timer(() => playFrame(m));
    return;
  }
  m.steps = steps;
  jumpPlay(m, how !== "quiet");
}

// why: ISSUE-010 — a frame with a pointer or a transform that is not finite calls no handler
function frame(m: M): void {
  const p = m.press;
  if (!m.host.live()) return;
  if (p?.on !== "running") return stopTicker(m);
  try {
    const pointer = pointerOf(m.host, p);
    if (pointer !== null) moveTo(m.host, m.on.frame(pointer));
  } catch {
    finish(m, p, "quiet");
    m.host.failed();
  }
}

// why: Context "Start" — the drag starts on the first move that is not zero; a running motion and
// a release playback first jump to their end, so `beginDrag` gets the committed positions (S7).
// Story "Second press" — while a pill drag runs the press ends here with no jump and no start
function begin(m: M, p: Press): void {
  p.on = "done";
  if (m.host.running()) return;
  let ok = false;
  try {
    jumpPlay(m, false);
    m.host.jump();
    if (!m.host.view.ends.has(p.id)) return;
    ok = m.on.start(p.id) === true;
    // why: STORY-003-07 — the start handler first draws the last waiting step of a step chain, so
    // the origin and the transform are read after it (ISSUE-010 `t0` and `o`)
    const node = m.host.view.ends.get(p.id);
    if (node === undefined) return;
    p.origin = { x: node.x, y: node.y };
    p.grip = gripOf(p.from, m.host.transform(), originOf(m.host.layers.svg));
  } catch {
    return m.host.failed();
  }
  if (!ok || !m.host.live() || m.press !== p) return;
  p.on = "running";
  watch(m.w, true);
  m.ticker = timer(() => frame(m));
}

// why: Context "Start" — the press of a mouse or touch gesture keeps its identifier, and the
// events of other gestures call no handler; a press during a drag is stopped by the filter
function started(m: M, event: Event, d: SceneNode): void {
  if (!m.host.live()) return;
  const at = clientOf(event);
  m.press =
    at === null
      ? null
      : {
          id: d.id,
          key: event.identifier,
          from: at,
          at,
          origin: at,
          grip: null,
          on: "pressed",
        };
}

// why: Context "Stuck drags" — `buttons` 0 on a `mousemove` is read here: the `d3-drag` window
// capture listeners stop the propagation, so an own `window` listener would never run; a touch
// event has no `buttons` (Implementer round 3 item 1)
function dragged(m: M, event: Event): void {
  const p = m.press;
  if (!m.host.live() || p === null || p.on === "done") return;
  if (p.key !== event.identifier) return;
  const src = event.sourceEvent as MouseEvent;
  if (src.type === "mousemove" && src.buttons === 0) {
    if (p.on === "running") finish(m, p, "now");
    p.on = "done";
    return;
  }
  const at = clientOf(event);
  if (at === null) return;
  p.at = at;
  if (p.on === "pressed" && (at.x !== p.from.x || at.y !== p.from.y))
    begin(m, p);
}

function ended(m: M, event: Event): void {
  const p = m.press;
  if (!m.host.live() || p === null || p.key !== event.identifier) return;
  m.press = null;
  if (p.on !== "running") return;
  const cancel = (event.sourceEvent as UIEvent).type === "touchcancel";
  finish(m, p, cancel ? "now" : "play");
}

// why: Context "Stuck drags", owner decision H8 — a window `blur` or a hidden document ends the
// drag at once; at the end of the renderer a drag is dropped and no handler is called
export function createDrag(host: DragHost, handlers: DragHandlers): Drag {
  const stuck = () => {
    const p = m.press;
    if (host.live() && p?.on === "running") finish(m, p, "now");
  };
  const m: M = {
    host,
    on: handlers,
    press: null,
    ticker: null,
    steps: null,
    next: 0,
    gen: 0,
    w: {
      doc: host.doc,
      signal: host.signal,
      stuck,
      hide: () => {
        if (host.doc.hidden) stuck();
      },
    },
  };
  const behaviour = drag<SVGGElement, SceneNode>()
    .filter(pressFilter(() => host.running()))
    .on("start", (event: Event, d) => started(m, event, d))
    .on("drag", (event: Event) => dragged(m, event))
    .on("end", (event: Event) => ended(m, event));
  const nodes = () =>
    select(host.layers.nodes).selectAll<SVGGElement, SceneNode>("g.qt-node");
  return {
    bind: () => nodes().call(behaviour),
    end() {
      m.gen++;
      const p = m.press;
      if (p?.on === "running") finish(m, p, "quiet");
      else jumpPlay(m, false);
    },
    hidden: () => jumpPlay(m, true),
    busy: () => m.press?.on === "running" || m.steps !== null,
    running: () => m.press?.on === "running",
    drop() {
      stopTicker(m);
      m.steps = null;
      if (m.press !== null) m.press.on = "done";
      watch(m.w, false);
      nodes().on(".drag", null);
    },
  };
}
