import type { Selection } from "d3-selection";
import type { SceneNode } from "./scene";

type NodeSelection = Selection<SVGGElement, SceneNode, null, undefined>;

const PILL_H = 15;

// why: mockup `badgeText` (lib/topology.js lines 310-314); "k" is a number-format symbol, not UI
// text (build-time item B6)
export function badgeText(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

function pill(g: NodeSelection, width: number, text: string): void {
  g.append("rect")
    .attr("x", -width / 2)
    .attr("y", -PILL_H / 2)
    .attr("width", width)
    .attr("height", PILL_H)
    .attr("rx", PILL_H / 2);
  g.append("text").attr("y", 0.5).text(text);
}

// why: mockup `badgeSvg` and the group badge (lib/topology.js lines 316-319, 1003-1009)
function topRight(
  node: NodeSelection,
  d: SceneNode,
  name: string,
  text: string,
) {
  const g = node
    .append("g")
    .attr("class", name)
    .attr("transform", `translate(${d.w / 2 - 6},${-d.h / 2 - 6})`);
  pill(g, Math.max(15, text.length * 6.2 + 9), text);
}

export function drawBadge(node: NodeSelection, d: SceneNode): void {
  topRight(node, d, "qt-badge", badgeText(d.count));
}

// why: FR-QDIC-4, TL-14 — the count-badge form at the top right, where only a group node has a
// badge; the colours come from the `qt-lost` rules (the inspector chip, mockup styles.css:247)
export function drawLost(node: NodeSelection, d: SceneNode, text: string) {
  if (d.kind === "entity" && d.lost) topRight(node, d, "qt-lost", text);
}

// why: mockup +N chip (lib/topology.js lines 1029-1037); "+" and "−" (U+2212) are symbols, not UI
// text (build-time item B6). An opened node shows "−" also when it has more neighbours (FR-CANVAS-6)
export function drawChip(node: NodeSelection, d: SceneNode): void {
  if (d.more <= 0 && d.opened <= 0) return;
  const text = d.opened > 0 ? "−" : `+${badgeText(d.more)}`;
  const g = node
    .append("g")
    .attr("class", d.opened > 0 ? "qt-more qt-open" : "qt-more")
    .attr("transform", `translate(${-d.w / 2 + 2},${-d.h / 2 - 6})`);
  pill(g, Math.max(17, text.length * 6 + 8), text);
}
