import type { DrawnId } from "@qdic-topology/engine";
import { drawBubbles } from "./bubbles";
import type { CameraControl } from "./camera";
import type { Camera } from "./fit";
import { cullLabels } from "./cull";
import { drawEdges, pathsOf, type Ends } from "./edges";
import { drawFade, fadeHits } from "./fade";
import { drawHalo } from "./halo";
import { selectionLights, showLights, showSelection } from "./highlight";
import { drawHits, hitEdges, keptHits } from "./hits";
import { bindHits, bindNodes, type Intent, type Pointer } from "./intents";
import { createLayers, type Layers } from "./layers";
import type { Lod } from "./lod";
import { drawMarkers } from "./markers";
import { drawNodes } from "./nodes";
import { drawPills, pillEdges } from "./pills";
import type { Scene } from "./scene";
import { drawSymbols } from "./sprite";
import type { RendererText } from "./text";
import { createTooltip, type Tooltip } from "./tooltip";

export type Report =
  { kind: "zero-size" } | { kind: "ended" } | { kind: "error" };

const instances = new WeakMap<Document, number>();

// why: Security round 1 A3 — the id prefix is made here from a number per document, so no model
// or host string goes into an id, and two documents give the same ids (NF-3)
function prefixOf(doc: Document): string {
  const n = (instances.get(doc) ?? 0) + 1;
  instances.set(doc, n);
  return `qt${n}`;
}

export type Parts = {
  doc: Document;
  root: HTMLDivElement;
  tip: Tooltip;
  layers: Layers;
  prefix: string;
  text: RendererText;
  labelId: (id: DrawnId) => string;
  pillId: (type: string | null) => string;
};

export type Handlers = {
  intent: ((intent: Intent) => void) | null;
  report: ((report: Report) => void) | null;
  settle: ((camera: Camera) => void) | null;
};

export type Current = { scene: Scene; ends: Ends; on: Handlers };

export function mount(container: HTMLElement, text: RendererText): Parts {
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
  // why: story "Accessible names" — the pill ids come from their own counter keyed by the type key,
  // in first-use order, never from the type key text, so no pill id equals a node label id
  const pills = new Map<string | null, string>();
  const pillId = (type: string | null) => {
    let id = pills.get(type);
    if (id === undefined) {
      id = `${prefix}-b-${pills.size}`;
      pills.set(type, id);
    }
    return id;
  };
  return { doc, root, tip, layers, prefix, text, labelId, pillId };
}

export const restore = ({ root, layers }: Parts, { scene }: Current) =>
  showLights(root, layers, selectionLights(scene));

export function paint(
  parts: Parts,
  now: Current,
  pointer: Pointer,
  lod: Lod,
  k: number,
) {
  const { layers, prefix, labelId, pillId, text } = parts;
  const { scene, ends } = now;
  const hrefOf = drawSymbols(layers.defs, scene.nodes, prefix);
  drawBubbles(layers, scene, ends, { text, pillId, pointer, k });
  const markers = drawMarkers(layers.defs, scene.edges, prefix);
  drawEdges(layers, scene, ends, markers);
  keptHits(layers.hits, scene.edges, pathsOf(scene, ends));
  drawNodes(layers.nodes, scene.nodes, {
    hrefOf,
    labelId,
    big: lod.big(),
    lostMark: text.lostMark,
  });
  bindNodes(layers, pointer);
  showSelection(layers, scene);
  restore(parts, now);
  const node = scene.selection.node;
  drawHalo(layers.focus, node === null ? null : (ends.get(node) ?? null));
  drawPills(layers.edgeLabels, pillEdges(scene), ends, k, text);
  drawFade(layers, scene);
}

// why: STORY-003-04 Context "Labels", "Viewport hit paths" — at the end of each gesture or camera
// move and after each draw, never per frame: `--k`, culling and the hit paths in the viewport
export function endWork(
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
  fadeHits(layers.hits, scene);
  bindHits(layers, pointer);
}
