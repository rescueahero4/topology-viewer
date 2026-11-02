import type { DrawnId, Frontier } from "#engine";
import type { Intent } from "#renderer";
import type { Canvas } from "./methods";

export type EdgePick = (edge: string, anchor: DrawnId) => void;

// why: mockup `toggleGroup` (lib/topology.js lines 2115-2121) and NF-5 — a double-click or Space:
// a group expands; an opened entity collapses; an entity with more neighbours expands; a member of
// an expanded group collapses its group (STORY-003-01); else a focus of its entity (a select)
export function activate(canvas: Canvas, drawn: Frontier, id: DrawnId): void {
  const node = drawn.nodes.find((n) => n.id === id);
  if (node === undefined) return;
  if ("members" in node) return canvas.expand(id);
  if (node.opened > 0) return canvas.collapse(id);
  if (node.more > 0) return canvas.expand(id);
  if (node.group !== null) return canvas.collapse(node.group);
  canvas.focus(node.entity);
}

// why: SA §4.5 (A23.2) — the renderer reports input as intents; the controller routes them through
// the same methods as the shell
export function intentOf(
  canvas: Canvas,
  drawn: () => Frontier,
  pick: EdgePick,
): (intent: Intent) => void {
  return (intent) => {
    if (intent.kind === "select") canvas.select(intent.node);
    else if (intent.kind === "selectEdge") pick(intent.edge, intent.anchor);
    else activate(canvas, drawn(), intent.node);
  };
}
