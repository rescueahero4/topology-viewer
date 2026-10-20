import {
  firstView,
  frontier,
  setLayout,
  type CanvasState,
  type IconMetrics,
} from "@qdic-topology/engine";
import {
  createRenderer,
  iconMetrics,
  type Camera,
  type RendererText,
} from "@qdic-topology/renderer";
import { intentOf } from "./activate";
import { bubblingOf, draggingOf } from "./dragging";
import { createEvents } from "./events";
import { methodsOf, type Canvas } from "./methods";
import {
  act,
  drawHeld,
  flush,
  guard,
  jumpChain,
  motionOf,
  settleNow,
  type CanvasModel,
  type Ctx,
  type Hold,
} from "./route";
import { sceneOf } from "./scene";

// why: owner decision H7 — the factory takes data: the model, and a saved state and camera when
// the shell has them (Undo, widget state, theme change; H8)
export type CanvasOptions = {
  text: RendererText;
  model: CanvasModel;
  state?: CanvasState;
  camera?: Camera;
  metrics?: IconMetrics;
};

// why: H7, Security round 2 item 2 — a saved state counts only for the same graph hash (`===`);
// it keeps its positions and no layout runs. Else the first view with its layout (epic question 9)
function startOf(
  model: CanvasModel,
  saved: CanvasState | undefined,
  metrics: IconMetrics,
): CanvasState {
  if (saved !== undefined && saved.graphHash === model.hash) return saved;
  const { graph, vocab, payload, hash } = model;
  const first = firstView(graph, vocab, payload, hash);
  const drawn = frontier(first, graph, vocab);
  return setLayout(first, drawn, vocab, first.layout, metrics);
}

// why: build-time item B12 — the zoom end handler of the renderer calls `onSettle`, so nothing that
// it calls throws; the renderer reports become notices with their kind only
function wire(ctx: Ctx, canvas: Canvas): void {
  const { renderer, events } = ctx;
  renderer.onSettle((camera) => {
    try {
      if (ctx.hold !== null) ctx.hold.settles.push(camera);
      else settleNow(ctx, camera);
    } catch {
      events.emit("notice", { kind: "error" });
    }
  });
  renderer.onReport((report) => {
    if (report.kind === "zero-size" && ctx.hold !== null)
      ctx.hold.zeroSize = true;
    else if (report.kind !== "ended")
      events.emit("notice", { kind: report.kind });
  });
  const pick = (edge: string, anchor: string) =>
    guard(ctx, () => {
      renderer.endDrag();
      jumpChain(ctx);
      if (ctx.frontier.edges.some((e) => e.key === edge))
        act(ctx, { kind: "selectEdge", edge, anchor });
    });
  renderer.onIntent(intentOf(canvas, () => ctx.frontier, pick));
}

// why: Context "Factory" step (4) — the events of the first paint come in a microtask after the
// return, so a handler that the caller registers in the same task gets them
function booted(ctx: Ctx, first: CanvasState, hold: Hold): void {
  if (ctx.renderer.ended()) return;
  if (first.selection !== null)
    ctx.events.emit("select", { selection: first.selection, state: first });
  flush(ctx, hold);
}

// why: SA §1 step 4 — the first paint is in the DOM before the factory returns; SA §5 Errors — a
// throw removes the renderer root and goes to the caller, which maps it to the fallback notice
export function createCanvas(
  container: HTMLElement,
  options: CanvasOptions,
): Canvas {
  const { text, model } = options;
  const metrics = options.metrics ?? iconMetrics;
  let held: Ctx | undefined;
  const renderer = createRenderer(container, {
    text,
    camera: options.camera,
    drag: draggingOf(() => held),
    bubble: bubblingOf(() => held),
  });
  try {
    const state = startOf(model, options.state, metrics);
    const { graph, vocab, canvas } = model;
    const drawn = frontier(state, graph, vocab);
    const scene = sceneOf(
      { state, frontier: drawn, vocab, canvas },
      text,
      metrics,
    );
    const ctx: Ctx = {
      model,
      text,
      metrics,
      renderer,
      events: createEvents(() => !renderer.ended()),
      state,
      frontier: drawn,
      fit: null,
      chain: [],
      hold: null,
      known: null,
    };
    held = ctx;
    const api = methodsOf(ctx);
    wire(ctx, api);
    const hold = drawHeld(ctx, scene, motionOf("none", {}));
    queueMicrotask(() => booted(ctx, state, hold));
    return api;
  } catch (error) {
    container.replaceChildren();
    renderer.ended();
    throw error;
  }
}
