import {
  before,
  boxOf,
  createCamera,
  instant,
  seenOf,
  type CameraControl,
} from "./camera";
import {
  createBubbleDrag,
  type BubbleDrag,
  type BubbleHandlers,
} from "./bubbleDrag";
import { scaleBubbles } from "./bubbles";
import { createDrag, type Drag, type DragHandlers } from "./drag";
import { endOf, endsOf } from "./edges";
import { validCamera, type Camera, type FitOptions } from "./fit";
import { edgeLights, nodeLights, showLights } from "./highlight";
import { bindCanvas, unbind, type Intent, type Pointer } from "./intents";
import { createLod, type Lod } from "./lod";
import {
  cameraNow,
  cameraPart,
  createPlayer,
  motionOf,
  stagesOf,
  type DrawMotion,
  type Plans,
  type Player,
  type StageHost,
} from "./motion";
import {
  endWork,
  mount,
  paint,
  restore,
  showPills,
  type Current,
  type Handlers,
  type Parts,
  type Report,
} from "./paint";
import { nodePills, pillEdges, scalePills } from "./pills";
import type { Scene } from "./scene";
import type { RendererText } from "./text";

export type { Report } from "./paint";

export type Renderer = {
  draw(scene: Scene, motion?: DrawMotion): void;
  fit(options?: FitOptions): void;
  transform(): Camera;
  onIntent(handler: (intent: Intent) => void): void;
  onReport(handler: (report: Report) => void): void;
  onSettle(handler: (camera: Camera) => void): void;
  endDrag(): void;
  ended(): boolean;
};

export type RendererOptions = {
  text: RendererText;
  camera?: Camera;
  drag?: DragHandlers;
  bubble?: BubbleHandlers;
};

const EMPTY: Scene = {
  nodes: [],
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
  types: [],
};

function pointerOf(
  parts: Parts,
  now: Current,
  live: () => boolean,
  k: () => number,
): Pointer {
  const { root, layers, tip } = parts;
  return {
    live,
    scene: () => now.scene,
    emit: (intent) => now.on.intent?.(intent),
    hoverNode(node, event) {
      showLights(root, layers, nodeLights(now.scene.edges, node.id));
      showPills(parts, now, nodePills(now.scene.edges, node.id), k());
      tip.showNode(node, event);
    },
    hoverEdge(edge, event) {
      showLights(root, layers, edgeLights(edge));
      showPills(parts, now, [edge], k());
      const subject = endOf(now.ends, edge.subject);
      tip.showEdge(edge, subject, endOf(now.ends, edge.object), event);
    },
    leave() {
      tip.hide();
      restore(parts, now);
      showPills(parts, now, pillEdges(now.scene), k());
    },
  };
}

type Ctx = {
  parts: Parts;
  now: Current;
  pointer: Pointer;
  lod: Lod;
  cam: CameraControl;
  player: Player;
  stage: StageHost;
  drag: Drag | null;
  bubble: BubbleDrag | null;
  start: Camera | null;
  drawn: boolean;
  settled(): void;
};

function show(c: Ctx, scene: Scene): void {
  const { parts, now, pointer, lod, cam } = c;
  now.scene = scene;
  now.ends = endsOf(scene.nodes);
  const { k } = cam.transform();
  lod.count(scene.nodes.length, k);
  paint(parts, now, pointer, lod, k);
  c.drag?.bind();
  c.bubble?.bind();
}

function cameraOf(parts: Parts, now: Current, lod: Lod, ctx: () => Ctx) {
  const { root, layers, tip } = parts;
  return createCamera({
    root,
    svg: layers.svg,
    viewport: layers.viewport,
    live: () => ctx().pointer.live(),
    zoomed(camera) {
      lod.zoomed(camera.k, now.scene.nodes.length);
      scalePills(layers.edgeLabels, now.ends, camera.k);
      scaleBubbles(layers.bubbleLabels, camera.k);
      tip.hide();
    },
    settled: () => ctx().settled(),
    running: () => running(ctx()),
    // why: mockup `fit` (lib/topology.js line 2165) — while grouped only the shown nodes count,
    // for `fit()`, the first visibility and a resize
    boxes: () => now.scene.nodes.filter((n) => !n.faded).map(boxOf),
  });
}

// why: STORY-003-05 — a new draw first ends a drag and jumps a running motion to its end; the first
// draw fits, or keeps a valid `camera` option, or reports a 0 × 0 container once; under reduced
// motion or a hidden document every change is in the DOM before `draw` returns (NF-8)
function drawScene(c: Ctx, scene: Scene, motion: DrawMotion | undefined) {
  const m = motionOf(motion);
  endDrags(c);
  c.player.jump(false);
  const { parts, now, pointer, lod, cam } = c;
  const prev = now.scene;
  const plans: Plans = {
    b:
      c.drawn && m.anchor !== null
        ? before(m.anchor, prev, now.ends, cam)
        : null,
    seen: c.drawn && m.focus !== null ? seenOf(prev, cam) : null,
  };
  parts.root.classList.toggle("qt-paused", parts.doc.hidden);
  if (c.drawn && m.kind !== "none" && !instant(parts.doc)) {
    const { stages, local } = stagesOf(c.stage, prev, scene, m);
    c.player.play(stages, () => cameraPart(cam, prev, now, m, plans, local));
    return;
  }
  show(c, scene);
  if (!c.drawn) {
    c.drawn = true;
    if (cam.first(c.start !== null)) now.on.report?.({ kind: "zero-size" });
    c.settled();
  } else if (cameraNow(cam, prev, now, m, plans))
    endWork(parts, now, pointer, lod, cam);
  else c.settled();
}

function api(c: Ctx): Renderer {
  const { now, pointer, cam } = c;
  return {
    draw(scene, motion) {
      if (pointer.live()) drawScene(c, scene, motion);
    },
    fit(options) {
      if (pointer.live() && cam.fit(options ?? {}) === "now") c.settled();
    },
    transform: () => cam.transform(),
    onIntent(handler) {
      now.on.intent = handler;
    },
    onReport(handler) {
      now.on.report = handler;
    },
    onSettle(handler) {
      now.on.settle = handler;
    },
    endDrag() {
      if (pointer.live()) endDrags(c);
    },
    ended: () => !pointer.live(),
  };
}

const stageOf = (parts: Parts, now: Current, ctx: () => Ctx): StageHost => ({
  layers: parts.layers,
  root: parts.root,
  paint: (scene) => show(ctx(), scene),
  scene: () => now.scene,
  ends: () => now.ends,
  k: () => ctx().cam.transform().k,
});

// why: SA §4.5, NF-8 — the pulse stops while the document is hidden; a motion and a drag release
// jump to their end
function watchHidden(c: Ctx, live: () => boolean, signal: AbortSignal) {
  const { doc, root } = c.parts;
  doc.addEventListener(
    "visibilitychange",
    () => {
      if (!live()) return;
      root.classList.toggle("qt-paused", doc.hidden);
      if (!doc.hidden) return;
      c.player.jump(true);
      c.drag?.hidden();
    },
    { signal },
  );
}

// why: story "Second press" — one check for both gestures: a node press or a pill press runs
const running = (c: Ctx) =>
  c.drag?.running() === true || c.bubble?.running() === true;

// why: STORY-003-06a interrupt rule — `endDrag()` and a draw end a node drag and a pill drag
function endDrags(c: Ctx): void {
  c.drag?.end();
  c.bubble?.end();
}

const dragHost = (c: Ctx, live: () => boolean, signal: AbortSignal) => ({
  layers: c.parts.layers,
  doc: c.parts.doc,
  view: c.now,
  signal,
  live,
  transform: () => c.cam.transform(),
  running: () => running(c),
  instant: () => instant(c.parts.doc),
  jump: () => c.player.jump(false),
  settled: () => c.settled(),
  failed: () => c.now.on.report?.({ kind: "error" }),
});

// why: story "Pill drag" — at the drag start a release playback (`Drag.end()`) and a motion jump
// to their end, and the tooltip hides (mockup lines 1840-1842)
const bubbleHost = (c: Ctx, live: () => boolean, signal: AbortSignal) => ({
  ...dragHost(c, live, signal),
  root: c.parts.root,
  jump: () => {
    c.drag?.end();
    c.player.jump(false);
  },
  hideTip: () => c.parts.tip.hide(),
});

// why: SA §4.5 (A23.2) — no `d3-drag` on the nodes or the pills when the caller gives no handlers
function gestures(
  c: Ctx,
  options: RendererOptions,
  live: () => boolean,
  signal: AbortSignal,
): void {
  if (options.drag !== undefined)
    c.drag = createDrag(dragHost(c, live, signal), options.drag);
  if (options.bubble !== undefined)
    c.bubble = createBubbleDrag(bubbleHost(c, live, signal), options.bubble);
}

export function createRenderer(
  container: HTMLElement,
  options: RendererOptions,
): Renderer {
  const parts = mount(container, options.text);
  const { root, layers, tip } = parts;
  const abort = new AbortController();
  const on: Handlers = { intent: null, report: null, settle: null };
  const now: Current = { scene: EMPTY, ends: new Map(), on };
  const lod = createLod(root);
  let ended = false;
  // why: owner decision H8 — every listener, zoom handler, observer callback, camera frame and draw
  // first checks that the root is on the page; when it is not, the renderer stops its camera,
  // removes its listeners, hides the tooltip, reports `ended` once and stays ended
  const live = () => {
    if (!ended && !root.isConnected) {
      ended = true;
      c.cam.end();
      c.player.stop();
      c.drag?.drop();
      c.bubble?.drop();
      unbind(layers);
      abort.abort();
      tip.hide();
      on.report?.({ kind: "ended" });
    }
    return !ended;
  };
  const pointer = pointerOf(parts, now, live, () => c.cam.transform().k);
  const c: Ctx = {
    parts,
    now,
    pointer,
    lod,
    cam: cameraOf(parts, now, lod, () => c),
    player: createPlayer({
      live,
      settled: () => c.settled(),
      failed: () => on.report?.({ kind: "error" }),
    }),
    stage: stageOf(parts, now, () => c),
    drag: null,
    bubble: null,
    start: validCamera(options.camera) ? options.camera : null,
    drawn: false,
    // why: STORY-003-05 — while a motion, a drag or its release, or a pill drag runs, its end does
    // the end work and the one `onSettle`
    settled() {
      if (c.player.running() || c.drag?.busy() === true || running(c)) return;
      endWork(parts, now, pointer, lod, c.cam);
      on.settle?.(c.cam.transform());
    },
  };
  gestures(c, options, live, abort.signal);
  if (c.start !== null) c.cam.jump(c.start);
  watchHidden(c, live, abort.signal);
  bindCanvas(layers, pointer);
  return api(c);
}
