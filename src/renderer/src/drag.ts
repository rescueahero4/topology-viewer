import { drag, type D3DragEvent } from "d3-drag";
import { select } from "d3-selection";
import { timer, type Timer } from "d3-timer";
import type { DrawnId, Point } from "@qdic-topology/engine";
import { edgeMover, endOf, endsOf, type At, type Ends } from "./edges";
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
  k(): number;
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
  k: number;
  on: "pressed" | "running" | "done";
};
type How = "play" | "now" | "quiet";
type M = {
  host: DragHost;
  on: DragHandlers;
  press: Press | null;
  ticker: Timer | null;
  steps: Steps | null;
  next: number;
  gen: number;
  stuck: () => void;
  hide: () => void;
};

// why: Context "Pointer" — the client point of the gesture (the mouse, or the touch with the
// gesture identifier); a point that is not finite is not used
function clientOf(event: Event): Point | null {
  const src = event.sourceEvent as MouseEvent & Partial<TouchEvent>;
  const touch =
    event.identifier === "mouse"
      ? src
      : Array.from(src.changedTouches ?? []).find(
          (t) => t.identifier === event.identifier,
        );
  if (touch === undefined) return null;
  const p = { x: touch.clientX, y: touch.clientY };
  return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
}

// why: Context "Pointer" — the node position at the start plus the client move since the press,
// divided by the camera `k`, so the node does not jump by the grab offset and jsdom gives the
// numbers of Chromium (no `getScreenCTM`)
const pointerOf = (p: Press): Point => ({
  x: p.origin.x + (p.at.x - p.from.x) / p.k,
  y: p.origin.y + (p.at.y - p.from.y) / p.k,
});

// why: STORY-003-05 frame writes — the nodes that changed, the edges, hit paths and pills with a
// changed end and the halo of a changed selected node; finite numbers only, so a node with a
// position that is not finite keeps its last finite `transform`
function moveTo(host: DragHost, list: readonly [DrawnId, Point][]): void {
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
  nodeMover(layers.nodes, ids)(moved);
  edgeMover(layers.edges, "path.qt-edge", ids, view.scene.layout)(at);
  edgeMover(layers.hits, "path.qt-ehit", ids, view.scene.layout)(at);
  pillMover(layers.edgeLabels, ids)(at, host.k());
  const selected = view.scene.selection.node;
  const p = selected === null ? undefined : moved.get(selected);
  if (p !== undefined) haloMover(layers.focus)(p);
}

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

function watch(m: M, on: boolean): void {
  const { doc, signal } = m.host;
  const win = doc.defaultView;
  if (on) {
    win?.addEventListener("blur", m.stuck, { signal });
    doc.addEventListener("visibilitychange", m.hide, { signal });
    return;
  }
  win?.removeEventListener("blur", m.stuck);
  doc.removeEventListener("visibilitychange", m.hide);
}

// why: Context "End", "Stuck drags" — one `drag.end()`; the steps play one per frame, or at once
// for a stuck end, under reduced motion and in a hidden document (NF-8). A draw or an `endDrag`
// inside that call wins over the steps (Implementer round 2 (e))
function finish(m: M, p: Press, how: How): void {
  stopTicker(m);
  watch(m, false);
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

function frame(m: M): void {
  const p = m.press;
  if (!m.host.live()) return;
  if (p?.on !== "running") return stopTicker(m);
  try {
    moveTo(m.host, m.on.frame(pointerOf(p)));
  } catch {
    finish(m, p, "quiet");
    m.host.failed();
  }
}

// why: Context "Start" — the drag starts on the first move that is not zero; a running motion and
// a release playback first jump to their end, so `beginDrag` gets the committed positions (S7)
function begin(m: M, p: Press): void {
  p.on = "done";
  let ok = false;
  try {
    jumpPlay(m, false);
    m.host.jump();
    if (!m.host.view.ends.has(p.id)) return;
    ok = m.on.start(p.id) === true;
    // why: STORY-003-07 — the start handler first draws the last waiting step of a step chain, so
    // the origin and the zoom are read after it
    const node = m.host.view.ends.get(p.id);
    if (node === undefined) return;
    p.origin = { x: node.x, y: node.y };
    p.k = m.host.k();
  } catch {
    return m.host.failed();
  }
  if (!ok || !m.host.live() || m.press !== p) return;
  p.on = "running";
  watch(m, true);
  m.ticker = timer(() => frame(m));
}

// why: Context "Start" — a second press during a drag is ignored; the press of a mouse or touch
// gesture keeps its identifier, and the events of other gestures call no handler
function started(m: M, event: Event, d: SceneNode): void {
  if (!m.host.live() || m.press?.on === "running") return;
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
          k: 1,
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
  const m: M = {
    host,
    on: handlers,
    press: null,
    ticker: null,
    steps: null,
    next: 0,
    gen: 0,
    stuck: () => {
      const p = m.press;
      if (host.live() && p?.on === "running") finish(m, p, "now");
    },
    hide: () => {
      if (host.doc.hidden) m.stuck();
    },
  };
  const behaviour = drag<SVGGElement, SceneNode>()
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
    drop() {
      stopTicker(m);
      m.steps = null;
      if (m.press !== null) m.press.on = "done";
      watch(m, false);
      nodes().on(".drag", null);
    },
  };
}
