import type { DrawnId } from "@qdic-topology/engine";
import { drawEdges, endOf, endsOf, type Ends } from "./edges";
import { drawHalo } from "./halo";
import {
  edgeLights,
  nodeLights,
  selectionLights,
  showLights,
  showSelection,
} from "./highlight";
import {
  bindCanvas,
  bindHits,
  bindNodes,
  unbind,
  type Intent,
  type Pointer,
} from "./intents";
import { createLayers, type Layers } from "./layers";
import { drawMarkers } from "./markers";
import { drawNodes } from "./nodes";
import { drawPills, pillEdges } from "./pills";
import type { Scene } from "./scene";
import { drawSymbols } from "./sprite";
import type { RendererText } from "./text";
import { createTooltip, type Tooltip } from "./tooltip";

export type Renderer = {
  draw(scene: Scene): void;
  onIntent(handler: (intent: Intent) => void): void;
};

export type RendererOptions = { text: RendererText };

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

type Current = {
  scene: Scene;
  ends: Ends;
  handler: ((intent: Intent) => void) | null;
};

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
    emit: (intent) => now.handler?.(intent),
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

function paint(parts: Parts, now: Current, pointer: Pointer): void {
  const { layers, prefix, labelId } = parts;
  const { scene, ends } = now;
  const hrefOf = drawSymbols(layers.defs, scene.nodes, prefix);
  const markers = drawMarkers(layers.defs, scene.edges, prefix);
  drawEdges(layers, scene, ends, markers);
  drawNodes(layers.nodes, scene.nodes, { hrefOf, labelId });
  bindNodes(layers, pointer);
  bindHits(layers, pointer);
  showSelection(layers, scene);
  restore(parts, now);
  const node = scene.selection.node;
  drawHalo(layers.focus, node === null ? null : (ends.get(node) ?? null));
  drawPills(layers.edgeLabels, pillEdges(scene), ends);
}

export function createRenderer(
  container: HTMLElement,
  options: RendererOptions,
): Renderer {
  const parts = mount(container, options.text);
  const { doc, root, layers, tip } = parts;
  const abort = new AbortController();
  const now: Current = { scene: EMPTY, ends: new Map(), handler: null };
  let ended = false;
  // why: owner decision H8 — every listener and every draw first checks that the root is on the
  // page; when it is not, the renderer removes its listeners, hides the tooltip and stays ended
  const live = () => {
    if (!ended && !root.isConnected) {
      ended = true;
      unbind(layers);
      abort.abort();
      tip.hide();
    }
    return !ended;
  };
  const pointer = pointerOf(parts, now, live);
  // why: SA §4.5, NF-8 — the pulse stops while the document is hidden
  const pause = () => root.classList.toggle("qt-paused", doc.hidden);
  doc.addEventListener("visibilitychange", () => live() && pause(), {
    signal: abort.signal,
  });
  bindCanvas(layers, pointer);
  return {
    draw(scene) {
      if (!live()) return;
      now.scene = scene;
      now.ends = endsOf(scene.nodes);
      pause();
      paint(parts, now, pointer);
    },
    onIntent(handler) {
      now.handler = handler;
    },
  };
}
