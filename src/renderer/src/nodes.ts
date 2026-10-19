import { select, type Selection } from "d3-selection";
import type { DrawnId } from "@qdic-topology/engine";
import { drawBadge, drawChip } from "./badges";
import { setColour } from "./marks";
import type { SceneNode } from "./scene";
import type { Hrefs } from "./sprite";

type NodeSelection = Selection<SVGGElement, SceneNode, null, undefined>;

export type NodeContext = {
  hrefOf: Hrefs;
  labelId: (id: DrawnId) => string;
};

// why: mockup `iconFor` fallback (lib/topology.js line 306) in the 20 × 20 engine box; TL-7 — a
// node with no visual (only `custom_category` in 0.1.0) is an outline circle until ISSUE-009
const NO_MARK_R = 8.5;

function classOf(d: SceneNode): string {
  if (d.kind === "group") return "qt-node qt-grouped";
  return d.tier === "leaf" ? "qt-node qt-leaf" : "qt-node";
}

// why: quollio-topology group node (lib/topology.js lines 990-994) — a group sits in a soft
// halo of its own guarded colour
function drawHalo(node: NodeSelection, d: SceneNode): void {
  for (const [scale, opacity] of [
    [1.55, 0.1],
    [1.28, 0.12],
  ]) {
    const circle = node
      .append("circle")
      .attr("r", d.r * scale)
      .attr("opacity", opacity);
    setColour(circle.node() as SVGCircleElement, "fill", d.colour);
  }
}

function drawMark(node: NodeSelection, d: SceneNode, href: string | null) {
  if (href === null) {
    node.append("circle").attr("class", "qt-nomark").attr("r", NO_MARK_R);
    return;
  }
  node
    .append("use")
    .attr("href", href)
    .attr("x", -d.w / 2)
    .attr("y", -d.h / 2)
    .attr("width", d.w)
    .attr("height", d.h);
}

// why: epic question 15 — the accessible name comes from a hidden text by `aria-labelledby`, so
// no model string goes into an attribute and no `<title>` gives a second tooltip
function drawLabels(node: NodeSelection, d: SceneNode, labelId: string) {
  node
    .append("text")
    .attr("class", "qt-name")
    .attr("y", d.h / 2)
    .attr("dy", "1.15em")
    .text(d.label);
  node
    .append("text")
    .attr("class", "qt-sub")
    .attr("y", d.h / 2)
    .attr("dy", "2.55em")
    .text(d.sub);
  node
    .append("text")
    .attr("class", "qt-a11y")
    .attr("id", labelId)
    .text(d.fullLabel === "" ? d.sub : d.fullLabel);
}

function fillNode(el: SVGGElement, d: SceneNode, ctx: NodeContext): void {
  el.replaceChildren();
  const node = select<SVGGElement, SceneNode>(el);
  if (d.kind === "group") drawHalo(node, d);
  drawMark(node, d, ctx.hrefOf(d));
  drawLabels(node, d, ctx.labelId(d.id));
  if (d.kind === "group") drawBadge(node, d);
  drawChip(node, d);
}

// why: SA §5 Renderer — one `g.qt-node` per scene node, joined by the drawn id, in scene order
export function drawNodes(
  layer: SVGGElement,
  nodes: readonly SceneNode[],
  ctx: NodeContext,
): void {
  select(layer)
    .selectAll<SVGGElement, SceneNode>("g.qt-node")
    .data(nodes, (d) => d.id)
    .join((enter) =>
      enter
        .append("g")
        .attr("tabindex", 0)
        .attr("aria-labelledby", (d) => ctx.labelId(d.id)),
    )
    .attr("class", classOf)
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .each((d, i, groups) => fillNode(groups[i], d, ctx));
}
