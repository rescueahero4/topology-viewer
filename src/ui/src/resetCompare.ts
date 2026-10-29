import { computed } from "@preact/signals";
import {
  frontier as frontierOf,
  hiddenList,
  transition,
  type Budget,
  type CanvasState,
  type Frontier,
} from "@qdic-topology/engine";
import type { CanvasModel } from "./canvas/index";
import { canvasState, editedModel, frontier } from "./state";

export type ResetView = { enabled: boolean; budget: Budget };

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return a.length === b.length && b.every((item) => set.has(item));
}

const nodeIds = (drawn: Frontier) => drawn.nodes.map((node) => node.id);
const hiddenKeys = (state: CanvasState) =>
  hiddenList(state).map((item) => item.key);

// why: rule 2 (the mockup `dirty` rule, app.js line 434, with engine data) — Reset is enabled
// when the engine reset that the button starts gives other drawn nodes or another Hidden list
export function resetOf(
  state: CanvasState,
  drawn: Frontier,
  { graph, vocab }: CanvasModel,
): ResetView {
  const reset = transition(state, { kind: "reset" }, graph, vocab);
  const enabled =
    !sameSet(nodeIds(frontierOf(reset, graph, vocab)), nodeIds(drawn)) ||
    !sameSet(hiddenKeys(reset), hiddenKeys(state));
  return { enabled, budget: reset.budget };
}

// why: rule 2 — the compare runs after each `settle`, which is the only event that sets the
// frontier (state.ts); the state and the model of that same `settle` are read without a subscribe
export const resetView = computed<ResetView | null>(() => {
  const drawn = frontier.value;
  const state = canvasState.peek();
  const now = editedModel.peek();
  if (drawn === null || state === null || now === null) return null;
  return resetOf(state, drawn, now);
});
