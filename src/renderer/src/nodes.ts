import { select, type Selection } from "d3-selection";
import type { DrawnId, Point } from "@qdic-topology/engine";
import { drawBadge, drawChip, drawLost } from "./badges";
import { setColour } from "./marks";
import type { SceneNode } from "./scene";
import type { Hrefs } from "./sprite";

type NodeSelection = Selection<SVGGElement, SceneNode, null, undefined>;

export type NodeContext = {
  hrefOf: Hrefs;
  labelId: (id: DrawnId) => string;
  big: boolean;
  lostMark: string;
};

export const translate = (p: Point) => `translate(${p.x},${p.y})`;

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

function drawMark(node: NodeSelection, d: SceneNode, href: string) {
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
function drawLabels(node: NodeSelection, d: SceneNode, ctx: NodeContext) {
  node
    .append("text")
    .attr("class", "qt-name")
    .attr("y", d.h / 2)
    .attr("dy", "1.15em")
    .text(d.label);
  // why: mockup big mode (lib/topology.js line 1000) — above 1,200 nodes no subtitle is drawn
  if (!ctx.big)
    node
      .append("text")
      .attr("class", "qt-sub")
      .attr("y", d.h / 2)
      .attr("dy", "2.55em")
      .text(d.sub);
  node
    .append("text")
    .attr("class", "qt-a11y")
    .attr("id", ctx.labelId(d.id))
    .text(d.fullLabel === "" ? d.sub : d.fullLabel);
}

// why: STORY-005-09 rule 2 (c), ISSUE-015 — the last drawn inputs of each node stay in memory
// only, never in the DOM
const drawnInputs = new WeakMap<SVGGElement, string>();

// why: STORY-005-09 rule 2 (a) — every input that `fillNode` reads
function inputsOf(d: SceneNode, ctx: NodeContext): string {
  return JSON.stringify([
    d.kind,
    d.r,
    d.colour,
    ctx.hrefOf(d),
    d.w,
    d.h,
    d.label,
    d.sub,
    d.fullLabel,
    ctx.big,
    ctx.lostMark,
    d.count,
    d.lost,
    d.more,
    d.opened,
  ]);
}

// why: ISSUE-015 — Chromium fires `dblclick` only when both clicks hit the same element, and the
// select of the first click paints again, so a node with equal inputs keeps its children
function fillNode(el: SVGGElement, d: SceneNode, ctx: NodeContext): void {
  const inputs = inputsOf(d, ctx);
  if (drawnInputs.get(el) === inputs) return;
  drawnInputs.set(el, inputs);
  el.replaceChildren();
  const node = select<SVGGElement, SceneNode>(el);
  if (d.kind === "group") drawHalo(node, d);
  drawMark(node, d, ctx.hrefOf(d));
  drawLabels(node, d, ctx);
  if (d.kind === "group") drawBadge(node, d);
  drawLost(node, d, ctx.lostMark);
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
    .attr("transform", translate)
    .each((d, i, groups) => fillNode(groups[i], d, ctx));
}

// why: STORY-003-05 frame writes — the `transform` of the moving nodes only; drawn ids are `Map`
// keys, never part of a selector (Security A9)
export function nodeMover(
  layer: SVGGElement,
  moving: ReadonlySet<DrawnId>,
): (at: ReadonlyMap<DrawnId, Point>) => void {
  const els = new Map<DrawnId, SVGGElement>();
  select(layer)
    .selectAll<SVGGElement, SceneNode>("g.qt-node")
    .each((d, i, groups) => {
      if (moving.has(d.id)) els.set(d.id, groups[i]);
    });
  return (at) => {
    for (const [id, el] of els) {
      const p = at.get(id);
      if (p !== undefined) el.setAttribute("transform", translate(p));
    }
  };
}
