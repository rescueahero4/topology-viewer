import { select } from "d3-selection";
import { setColour } from "./marks";
import type { SceneNode } from "./scene";

// why: mockup `renderFocus` (lib/topology.js lines 1120-1126) — three soft rings, scale and
// opacity of each, then the pulse ring
const RINGS = [
  [2.15, 0.08],
  [1.65, 0.12],
  [1.3, 0.16],
] as const;
const PULSE_R = 1.4;
const PULSE_WIDTH = 0.12;

function fillHalo(g: SVGGElement, node: SceneNode): void {
  g.replaceChildren();
  const halo = select(g);
  for (const [scale, opacity] of RINGS) {
    const ring = halo
      .append("circle")
      .attr("r", node.r * scale)
      .attr("opacity", opacity);
    setColour(ring.node() as SVGCircleElement, "fill", node.colour);
  }
  const pulse = halo
    .append("circle")
    .attr("class", "qt-pulse")
    .attr("r", node.r * PULSE_R)
    .attr("stroke-width", node.r * PULSE_WIDTH);
  setColour(pulse.node() as SVGCircleElement, "stroke", node.colour);
}

// why: FR-CANVAS-13 — the halo and the pulse of the selected node, in the node colour
export function drawHalo(layer: SVGGElement, node: SceneNode | null): void {
  select(layer)
    .selectAll<SVGGElement, SceneNode>("g.qt-focus")
    .data(node === null ? [] : [node])
    .join("g")
    .attr("class", "qt-focus")
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .each((d, i, groups) => fillHalo(groups[i], d));
}
