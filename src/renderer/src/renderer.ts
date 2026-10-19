import type { DrawnId } from "@qdic-topology/engine";
import { createLayers } from "./layers";
import { drawNodes } from "./nodes";
import type { Scene } from "./scene";
import { drawSymbols } from "./sprite";
import type { RendererText } from "./text";

export type Renderer = { draw(scene: Scene): void };

export type RendererOptions = { text: RendererText };

const instances = new WeakMap<Document, number>();

// why: Security round 1 A3 — the id prefix is made here from a number per document, so no model
// or host string goes into an id, and two documents give the same ids (NF-3)
function prefixOf(doc: Document): string {
  const n = (instances.get(doc) ?? 0) + 1;
  instances.set(doc, n);
  return `qt${n}`;
}

export function createRenderer(
  container: HTMLElement,
  options: RendererOptions,
): Renderer {
  const doc = container.ownerDocument;
  const prefix = prefixOf(doc);
  container.replaceChildren();
  const root = doc.createElement("div");
  root.setAttribute("class", "qt-root");
  container.appendChild(root);
  const layers = createLayers(root, options.text.canvasName);
  const labels = new Map<DrawnId, string>();
  const labelId = (id: DrawnId) => {
    let label = labels.get(id);
    if (label === undefined) {
      label = `${prefix}-l-${labels.size}`;
      labels.set(id, label);
    }
    return label;
  };
  let ended = false;
  return {
    draw(scene) {
      // why: owner decision H8 — a renderer whose root left the page ends, and stays ended
      if (ended || !root.isConnected) {
        ended = true;
        return;
      }
      const hrefOf = drawSymbols(layers.defs, scene.nodes, prefix);
      drawNodes(layers.nodes, scene.nodes, { hrefOf, labelId });
    },
  };
}
