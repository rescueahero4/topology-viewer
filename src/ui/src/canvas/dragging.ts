import {
  beginDrag,
  dragBubble,
  dragStep,
  fadeSet,
  release,
  type DragCtx,
  type DrawnId,
} from "@qdic-topology/engine";
import type { BubbleHandlers, DragHandlers } from "@qdic-topology/renderer";
import { jumpChain, type Ctx } from "./route";

// why: SA §4.5 (A23.2), FR-CANVAS-9 — the renderer asks for the positions of each drag frame; the
// engine `beginDrag`, `dragStep` and `release` give them, so the controller copies no drag rule
export function draggingOf(get: () => Ctx | undefined): DragHandlers {
  let drag: DragCtx | null = null;
  return {
    start(id) {
      drag = null;
      const ctx = get();
      if (ctx === undefined) return false;
      // why: STORY-003-07 "Waiting steps" — a drag start first puts the last step in the DOM
      jumpChain(ctx);
      // why: STORY-003-07, SA §6 row 11 — a faded node is in the frontier, so the engine would drag
      // it; the controller refuses it
      if (fadeSet(ctx.state, ctx.frontier).some((f) => f.id === id))
        return false;
      drag = beginDrag(ctx.state, ctx.frontier, id);
      return drag !== null;
    },
    frame(pointer) {
      if (drag === null) return [];
      const step = dragStep(drag, pointer);
      drag = step.ctx;
      return step.positions;
    },
    // why: SA §4.5, NF-8 — the release commits its rest positions at once and `drag-end` carries
    // them; `settle` follows after the playback (the renderer `onSettle`)
    end() {
      const ctx = get();
      const at = drag;
      drag = null;
      if (at === null || ctx === undefined) return [];
      const { steps, state } = release(at);
      ctx.state = state;
      ctx.events.emit("drag-end", { state });
      return steps;
    },
  };
}

// why: FR-CANVAS-15, FR-CANVAS-14 — the shown members of a type: drawn nodes of the type key that
// `fadeSet` does not fade (the members that `dragBubble` moves)
function shownOf(ctx: Ctx, type: string | null): Set<DrawnId> {
  const faded = new Set(fadeSet(ctx.state, ctx.frontier).map((f) => f.id));
  return new Set(
    ctx.frontier.nodes
      .filter((n) => n.type === type && !faded.has(n.id))
      .map((n) => n.id),
  );
}

// why: SA §4.5 (A23.2), FR-CANVAS-15 — the pill drag moves the shown members of its type through
// the engine `dragBubble`, committed at each frame (NF-8); `drag-end` carries the state
export function bubblingOf(get: () => Ctx | undefined): BubbleHandlers {
  return {
    start(type) {
      const ctx = get();
      if (ctx === undefined || ctx.renderer.ended()) return false;
      // why: STORY-003-07 "Waiting steps" — a drag start first puts the last step in the DOM
      jumpChain(ctx);
      return shownOf(ctx, type).size > 0;
    },
    move(type, vector) {
      const ctx = get();
      if (ctx === undefined) return [];
      ctx.state = dragBubble(ctx.state, ctx.frontier, type, vector);
      const members = shownOf(ctx, type);
      return ctx.state.positions.filter(([id]) => members.has(id));
    },
    end() {
      const ctx = get();
      if (ctx !== undefined) ctx.events.emit("drag-end", { state: ctx.state });
    },
  };
}
