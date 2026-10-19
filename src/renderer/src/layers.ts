import { select } from "d3-selection";

export type Layers = {
  svg: SVGSVGElement;
  defs: SVGDefsElement;
  viewport: SVGGElement;
  bubbles: SVGGElement;
  edges: SVGGElement;
  bubbleLabels: SVGGElement;
  hits: SVGGElement;
  focus: SVGGElement;
  nodes: SVGGElement;
  edgeLabels: SVGGElement;
};

// why: mockup `Q.create` (lib/topology.js lines 435-444) — the layer order of the canvas, from
// the back: bubbles, edges, bubble labels, edge hit paths, focus, nodes, edge labels. The
// `aria-label` is UI text of the caller, not model text (epic question 15)
export function createLayers(root: HTMLDivElement, canvasName: string): Layers {
  const svg = select(root)
    .append("svg")
    .attr("class", "qt-svg")
    .attr("role", "group")
    .attr("aria-label", canvasName);
  const defs = svg.append("defs");
  const viewport = svg.append("g").attr("class", "qt-viewport");
  const layer = () => viewport.append("g").node() as SVGGElement;
  return {
    svg: svg.node() as SVGSVGElement,
    defs: defs.node() as SVGDefsElement,
    viewport: viewport.node() as SVGGElement,
    bubbles: layer(),
    edges: layer(),
    bubbleLabels: layer(),
    hits: layer(),
    focus: layer(),
    nodes: layer(),
    edgeLabels: layer(),
  };
}
