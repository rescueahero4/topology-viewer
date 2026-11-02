import {
  drawnIdOf,
  exitAround,
  fadeSet,
  frontier,
  groupAround,
  transition,
  type Action,
  type CanvasState,
  type DrawnId,
  type Frontier,
  type LayoutName,
  type Selection,
} from "#engine";
import type { Box, FitOptions, Scene } from "#renderer";
import {
  commit,
  motionOf,
  play,
  stepsOf,
  type Change,
  type Ctx,
  type Fit,
} from "./route";

// why: mockup `groupAround` (lib/topology.js lines 1261-1270) — the camera frame of the grouping
const GROUP_PAD = 60;
const GROUP_MIN_K = 0.8;

export type FocusAction = Extract<Action, { kind: "path" | "expandGroup" }>;

const fadedIn = (state: CanvasState, drawn: Frontier, id: DrawnId) =>
  fadeSet(state, drawn).some((f) => f.id === id);

// why: Context `groupAroundRoot(true)` — the selected node, or the anchor of a selected edge
const rootOf = (selection: Selection): DrawnId | null =>
  selection === null
    ? null
    : "edge" in selection
      ? selection.anchor
      : selection.node;

// why: mockup lines 1261-1270, FR-CANVAS-8 — the shown nodes and their mirror points about the
// root (`2·R − n`, the same `r`), so the root is in the middle of the frame
const groupFit =
  (root: DrawnId): Fit =>
  (scene: Scene): FitOptions => {
    const at = scene.nodes.find((n) => n.id === root);
    const boxes: Box[] = [];
    if (at !== undefined)
      for (const n of scene.nodes.filter((s) => !s.faded))
        boxes.push(
          { x: n.x, y: n.y, r: n.r },
          { x: 2 * at.x - n.x, y: 2 * at.y - n.y, r: n.r },
        );
    return { boxes, pad: GROUP_PAD, minK: GROUP_MIN_K };
  };

// why: Context `groupAroundRoot(true)` — no selection, a tree layout or the same root give no
// change and no event; another root while grouped keeps `saved` (the engine); the arrange plays as
// motion `local`, then the group fit
function groupOn(ctx: Ctx): void {
  const root = rootOf(ctx.state.selection);
  if (root === null || ctx.state.around?.root === root) return;
  const next = groupAround(ctx.state, ctx.frontier, root, ctx.metrics);
  if (next === ctx.state) return;
  const { graph, vocab } = ctx.model;
  const drawn = frontier(next, graph, vocab);
  const step = { state: next, frontier: drawn, motion: motionOf("local", {}) };
  play(ctx, null, [step], groupFit(root));
}

// why: Context `groupAroundRoot(false)` (exits 1, 2) — one step, the glide home, then `fit()` of
// all nodes at pad 40 (mockup `glideHome`); rule (b) — an argument that is not a boolean is no call
export function groupAroundRoot(ctx: Ctx, on: unknown): void {
  if (on === true) return groupOn(ctx);
  if (on !== false || ctx.state.around === null) return;
  const { graph, vocab } = ctx.model;
  const off = { kind: "off" } as const;
  const r = exitAround(ctx.state, off, ctx.frontier, graph, vocab, ctx.metrics);
  play(ctx, null, stepsOf(ctx, r, "local"), () => ({}));
}

// why: Context exit 3 — `select` or `focus` of a faded node: the glide home, then the select;
// `focus` gives the last step the epic question 19 camera rule, `select` no camera call
export function fadedSelect(ctx: Ctx, id: DrawnId, focus: boolean): boolean {
  if (!fadedIn(ctx.state, ctx.frontier, id)) return false;
  const { graph, vocab } = ctx.model;
  const exit = { kind: "focus", id } as const;
  const r = exitAround(
    ctx.state,
    exit,
    ctx.frontier,
    graph,
    vocab,
    ctx.metrics,
  );
  const opts = { focus: focus ? id : null };
  play(ctx, null, stepsOf(ctx, r, "none", opts), null);
  return true;
}

// why: Context exit 11 — a layout request ends the grouping in place: one step, no glide home,
// then the STORY-003-05 fit at the end
export function layoutExit(ctx: Ctx, name: LayoutName): boolean {
  if (ctx.state.around === null) return false;
  const { graph, vocab } = ctx.model;
  const exit = { kind: "layout", name } as const;
  const r = exitAround(
    ctx.state,
    exit,
    ctx.frontier,
    graph,
    vocab,
    ctx.metrics,
  );
  const drawn = frontier(r.state, graph, vocab);
  const motion = motionOf("layout", {});
  commit(ctx, null, { state: r.state, frontier: drawn, motion, fit: true });
  return true;
}

// why: STORY-003-05 `focus(id)` — the entity is selected on the placed state unless it is still in
// a group
function selected(ctx: Ctx, state: CanvasState, drawn: Frontier, id: string) {
  const { graph, vocab } = ctx.model;
  const at = drawnIdOf(state, graph, vocab, id);
  const node = drawn.nodes.find((n) => n.id === at);
  if (node === undefined || !("entity" in node)) return state;
  return transition(state, { kind: "select", entity: id }, graph, vocab);
}

// why: Context `focus(id)` of an entity that is not drawn, D100 — when its path or group expand
// takes the root off the canvas (exit 10), the glide home, then the path with the select
export function focusExit(ctx: Ctx, action: FocusAction, id: string): boolean {
  if (ctx.state.around === null) return false;
  const { graph, vocab } = ctx.model;
  const exit = { kind: "action", action } as const;
  const r = exitAround(
    ctx.state,
    exit,
    ctx.frontier,
    graph,
    vocab,
    ctx.metrics,
  );
  if (r.steps.length === 0) return false;
  const [home, last] = stepsOf(ctx, r, "local");
  const state = selected(ctx, last.state, last.frontier, id);
  const focus = drawnIdOf(state, graph, vocab, id);
  const motion = { ...last.motion, focus };
  play(ctx, action, [home, { ...last, state, motion }], null);
  return true;
}

// why: Context `focus(id)` (D99 (5), mockup `focus` line 2181) — the path adds faded newcomers, so
// when the target is faded after it, the steps play in order: the path, the glide home, the select
export function fadedAfter(
  ctx: Ctx,
  action: FocusAction,
  change: Change,
  id: DrawnId,
): boolean {
  if (!fadedIn(change.state, change.frontier, id)) return false;
  const { graph, vocab } = ctx.model;
  const exit = { kind: "focus", id } as const;
  const { metrics } = ctx;
  const r = exitAround(
    change.state,
    exit,
    change.frontier,
    graph,
    vocab,
    metrics,
  );
  play(ctx, action, [change, ...stepsOf(ctx, r, "none", { focus: id })], null);
  return true;
}
