import type { DrawnId } from "@qdic-topology/engine";
import {
  before,
  boxOf,
  createCamera,
  instant,
  seenOf,
  type CameraControl,
} from "./camera";
import { cullLabels } from "./cull";
import { createDrag, type Drag, type DragHandlers } from "./drag";
import { drawEdges, endOf, endsOf, pathsOf, type Ends } from "./edges";
import { validCamera, type Camera } from "./fit";
import { drawHalo } from "./halo";
import {
  edgeLights,
  nodeLights,
  selectionLights,
  showLights,
  showSelection,
} from "./highlight";
import { drawHits, hitEdges, keptHits } from "./hits";
import {
  bindCanvas,
  bindHits,
  bindNodes,
  unbind,
  type Intent,
  type Pointer,
} from "./intents";
import { createLayers, type Layers } from "./layers";
import { createLod, type Lod } from "./lod";
import { drawMarkers } from "./markers";
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
import { drawNodes } from "./nodes";
import { drawPills, pillEdges, scalePills } from "./pills";
import type { Scene } from "./scene";
import { drawSymbols } from "./sprite";
import type { RendererText } from "./text";
import { createTooltip, type Tooltip } from "./tooltip";

export type Report =
  { kind: "zero-size" } | { kind: "ended" } | { kind: "error" };

export type Renderer = {
  draw(scene: Scene, motion?: DrawMotion): void;
  fit(options?: { animate?: boolean }): void;
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
};

const instances = new WeakMap<Document, number>();

// why: Security round 1 A3 — the id prefix is made here from a number per document, so no model
// or host string goes into an id, and two documents give the same ids (NF-3)
function prefixOf(doc: Document): string {
  const n = (instances.get(doc) ?? 0) + 1;
  instances.set(doc, n);
  return `qt${n}`;
}

const EMPTY: Scene = {
  nodes: [],
  edges: [],
  selection: { node: null, edge: null },
  layout: "force",
};

type Parts = {
  doc: Document;
  root: HTMLDivElement;
  tip: Tooltip;
  layers: Layers;
  prefix: string;
  labelId: (id: DrawnId) => string;
};

type Handlers = {
  intent: ((intent: Intent) => void) | null;
  report: ((report: Report) => void) | null;
  settle: ((camera: Camera) => void) | null;
};

type Current = { scene: Scene; ends: Ends; on: Handlers };

function mount(container: HTMLElement, text: RendererText): Parts {
  const doc = container.ownerDocument;
  const prefix = prefixOf(doc);
  container.replaceChildren();
  const root = doc.createElement("div");
  root.setAttribute("class", "qt-root");
  container.appendChild(root);
  const tip = createTooltip(root, text);
  const layers = createLayers(root, text.canvasName);
  const labels = new Map<DrawnId, string>();
  const labelId = (id: DrawnId) => {
    let label = labels.get(id);
    if (label === undefined) {
      label = `${prefix}-l-${labels.size}`;
      labels.set(id, label);
    }
    return label;
  };
  return { doc, root, tip, layers, prefix, labelId };
}

const restore = ({ root, layers }: Parts, { scene }: Current) =>
  showLights(root, layers, selectionLights(scene));

function pointerOf(parts: Parts, now: Current, live: () => boolean): Pointer {
  const { root, layers, tip } = parts;
  return {
    live,
    scene: () => now.scene,
    emit: (intent) => now.on.intent?.(intent),
    hoverNode(node, event) {
      showLights(root, layers, nodeLights(now.scene.edges, node.id));
      tip.showNode(node, event);
    },
    hoverEdge(edge, event) {
      showLights(root, layers, edgeLights(edge));
      const subject = endOf(now.ends, edge.subject);
      tip.showEdge(edge, subject, endOf(now.ends, edge.object), event);
    },
    leave() {
      tip.hide();
      restore(parts, now);
    },
  };
}

function paint(
  parts: Parts,
  now: Current,
  pointer: Pointer,
  lod: Lod,
  k: number,
) {
  const { layers, prefix, labelId } = parts;
  const { scene, ends } = now;
  const hrefOf = drawSymbols(layers.defs, scene.nodes, prefix);
  const markers = drawMarkers(layers.defs, scene.edges, prefix);
  drawEdges(layers, scene, ends, markers);
  keptHits(layers.hits, scene.edges, pathsOf(scene, ends));
  drawNodes(layers.nodes, scene.nodes, { hrefOf, labelId, big: lod.big() });
  bindNodes(layers, pointer);
  showSelection(layers, scene);
  restore(parts, now);
  const node = scene.selection.node;
  drawHalo(layers.focus, node === null ? null : (ends.get(node) ?? null));
  drawPills(layers.edgeLabels, pillEdges(scene), ends, k);
}

// why: STORY-003-04 Context "Labels", "Viewport hit paths" — at the end of each gesture or camera
// move and after each draw, never per frame: `--k`, culling and the hit paths in the viewport
function endWork(
  parts: Parts,
  now: Current,
  pointer: Pointer,
  lod: Lod,
  cam: CameraControl,
) {
  const { layers } = parts;
  const { scene, ends } = now;
  const camera = cam.transform();
  lod.ended(camera.k);
  cullLabels(layers.nodes, scene, camera.k, lod.level(), lod.big());
  const edges = hitEdges(scene.edges, ends, { camera, ...cam.size() });
  drawHits(layers.hits, edges, pathsOf(scene, ends));
  bindHits(layers, pointer);
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
      tip.hide();
    },
    settled: () => ctx().settled(),
    boxes: () => now.scene.nodes.map(boxOf),
  });
}

// why: STORY-003-05 — a new draw first ends a drag and jumps a running motion to its end; the first
// draw fits, or keeps a valid `camera` option, or reports a 0 × 0 container once; under reduced
// motion or a hidden document every change is in the DOM before `draw` returns (NF-8)
function drawScene(c: Ctx, scene: Scene, motion: DrawMotion | undefined) {
  const m = motionOf(motion);
  c.drag?.end();
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
      if (pointer.live() && cam.fit(options?.animate ?? true) === "now")
        c.settled();
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
      if (pointer.live()) c.drag?.end();
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

const dragHost = (c: Ctx, live: () => boolean, signal: AbortSignal) => ({
  layers: c.parts.layers,
  doc: c.parts.doc,
  view: c.now,
  signal,
  live,
  k: () => c.cam.transform().k,
  instant: () => instant(c.parts.doc),
  jump: () => c.player.jump(false),
  settled: () => c.settled(),
  failed: () => c.now.on.report?.({ kind: "error" }),
});

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
      unbind(layers);
      abort.abort();
      tip.hide();
      on.report?.({ kind: "ended" });
    }
    return !ended;
  };
  const pointer = pointerOf(parts, now, live);
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
    start: validCamera(options.camera) ? options.camera : null,
    drawn: false,
    // why: STORY-003-05 — while a motion, a drag or its release runs, its end does the end work
    // and the one `onSettle`
    settled() {
      if (c.player.running() || c.drag?.busy() === true) return;
      endWork(parts, now, pointer, lod, c.cam);
      on.settle?.(c.cam.transform());
    },
  };
  if (options.drag !== undefined)
    c.drag = createDrag(dragHost(c, live, abort.signal), options.drag);
  if (c.start !== null) c.cam.jump(c.start);
  watchHidden(c, live, abort.signal);
  bindCanvas(layers, pointer);
  return api(c);
}
