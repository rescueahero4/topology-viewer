import {
  frontier,
  place,
  setLayout,
  transition,
  type Action,
  type CanvasState,
  type DrawnId,
  type Frontier,
  type Graph,
  type Hex,
  type IconMetrics,
  type LayoutName,
  type Payload,
  type Selection,
  type Vocab,
} from "@qdic-topology/engine";
import type {
  Camera,
  Motion,
  Renderer,
  RendererText,
  Scene,
} from "@qdic-topology/renderer";
import type { Events } from "./events";
import { sceneOf } from "./scene";

// why: owner decision H7 — engine types only; the caller makes the model from a `normalize`
// result with `ok: true` and `resolveVocab` with the same `canvas`; the factory is not a
// validation boundary (SA §5 "Validate at the boundaries only")
export type CanvasModel = {
  graph: Graph;
  payload: Payload;
  hash: number;
  vocab: Vocab;
  canvas: Hex;
};

export type Hold = { settles: Camera[]; zeroSize: boolean };

export type Ctx = {
  model: CanvasModel;
  text: RendererText;
  metrics: IconMetrics;
  renderer: Renderer;
  events: Events;
  state: CanvasState;
  frontier: Frontier;
  fit: boolean;
  hold: Hold | null;
  known: ReadonlySet<string> | null;
};

export type Change = {
  state: CanvasState;
  frontier: Frontier;
  motion: Motion;
  fit: boolean;
};

export type Opts = { anchor?: DrawnId | null; focus?: DrawnId | null };

// why: Context "Routing" rule (1) — no `place`, no layout; classes, pills and halo only
const RULE_ONE = new Set<Action["kind"]>([
  "select",
  "selectEdge",
  "toggleFamily",
  "togglePredicate",
  "approach",
]);
// why: rule (2) — a new scope runs the layout again (`layout/place-random.test.ts` line 259)
const RULE_TWO = new Set<Action["kind"]>(["budget", "reset"]);

export const motionOf = (
  kind: Motion["kind"],
  opts: Opts,
  placed: Pick<Motion, "starts" | "retractTo"> = { starts: [], retractTo: [] },
): Motion => ({
  kind,
  starts: placed.starts,
  retractTo: placed.retractTo,
  anchor: opts.anchor ?? null,
  focus: opts.focus ?? null,
});

// why: rule (2) — the layout runs on the new state; the renderer fits after the motion
export function laid(
  ctx: Ctx,
  next: CanvasState,
  after: Frontier,
  name: LayoutName,
): Change {
  const { vocab } = ctx.model;
  const state = setLayout(next, after, vocab, name, ctx.metrics);
  return { state, frontier: after, motion: motionOf("layout", {}), fit: true };
}

// why: Context "Routing of one action" — rules (1) to (3); rule (3) gives the motion the engine
// `starts` and `retractTo` and no record of `homes`, `nudges` or `treeShifts` (hand-off item 13)
export function routeOf(
  ctx: Ctx,
  action: Action,
  next: CanvasState,
  after: Frontier,
  opts: Opts,
): Change {
  if (RULE_ONE.has(action.kind))
    return {
      state: next,
      frontier: after,
      motion: motionOf("none", opts),
      fit: false,
    };
  if (RULE_TWO.has(action.kind)) return laid(ctx, next, after, next.layout);
  const change = { action, before: ctx.frontier, after };
  const placed = place(next, change, ctx.model.vocab, ctx.metrics);
  const collapse =
    action.kind === "collapse" || action.kind === "collapseGroup";
  return {
    state: placed.state,
    frontier: after,
    motion: motionOf(collapse ? "collapse" : "local", opts, placed),
    fit: false,
  };
}

const idsOf = (f: Frontier) => f.nodes.map((n) => n.id);

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export const sameDrawn = (a: Frontier, b: Frontier) =>
  sameIds(idsOf(a), idsOf(b));

export const sameHidden = (a: CanvasState, b: CanvasState) =>
  sameIds(
    a.hidden.map((h) => h.key),
    b.hidden.map((h) => h.key),
  );

function sameSelection(a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b;
  if ("edge" in a)
    return "edge" in b && a.edge === b.edge && a.anchor === b.anchor;
  return "node" in b && a.node === b.node;
}

// why: SA §4.5 — after a settle of a rule (2) action the renderer fits (animated, pad 40)
export function settleNow(ctx: Ctx, camera: Camera): void {
  const { state, frontier } = ctx;
  ctx.events.emit("settle", { state, frontier, camera });
  if (!ctx.fit) return;
  ctx.fit = false;
  ctx.renderer.fit();
}

// why: the events of a draw wait until the draw returns, so a handler sees the new state and a
// method that a handler calls draws after this draw
export function drawHeld(ctx: Ctx, scene: Scene, motion: Motion): Hold {
  const hold: Hold = { settles: [], zeroSize: false };
  ctx.hold = hold;
  try {
    ctx.renderer.draw(scene, motion);
  } finally {
    ctx.hold = null;
  }
  return hold;
}

export function flush(ctx: Ctx, hold: Hold): void {
  if (hold.zeroSize) ctx.events.emit("notice", { kind: "zero-size" });
  for (const camera of hold.settles) settleNow(ctx, camera);
}

// why: rule (c) — the scene is made before the commit, so a throw keeps the state, the scene,
// the DOM and the camera; guardrail 10 — `state` is replaced only by engine results
export function commit(ctx: Ctx, action: Action | null, change: Change) {
  const { vocab, canvas } = ctx.model;
  const input = {
    state: change.state,
    frontier: change.frontier,
    vocab,
    canvas,
  };
  const scene = sceneOf(input, ctx.text);
  const prior = ctx.state;
  const drawn = ctx.frontier;
  ctx.state = change.state;
  ctx.frontier = change.frontier;
  ctx.fit = change.fit;
  const hold = drawHeld(ctx, scene, change.motion);
  if (action !== null && !sameDrawn(drawn, change.frontier))
    ctx.events.emit("explore", { action, state: ctx.state });
  if (!sameSelection(prior.selection, ctx.state.selection))
    ctx.events.emit("select", {
      selection: ctx.state.selection,
      state: ctx.state,
    });
  flush(ctx, hold);
}

// why: rule (b) — an engine result equal to the state gives no change and no event; a `showMany`
// that changes no drawn id and no Hidden-list entry returns a new object, so it is checked too
export function act(ctx: Ctx, action: Action, opts: Opts = {}): void {
  const { graph, vocab } = ctx.model;
  const next = transition(ctx.state, action, graph, vocab);
  if (next === ctx.state) return;
  const after = frontier(next, graph, vocab);
  const still =
    action.kind === "showMany" &&
    sameDrawn(ctx.frontier, after) &&
    sameHidden(ctx.state, next);
  if (!still) commit(ctx, action, routeOf(ctx, action, next, after, opts));
}

// why: rule (c) — an engine throw in a method or an intent handler gives `notice { kind: "error" }`
// and the method returns normally; rule (d) — after the end every method returns at once
export function guard(ctx: Ctx, work: () => void): void {
  if (ctx.renderer.ended()) return;
  try {
    work();
  } catch {
    ctx.events.emit("notice", { kind: "error" });
  }
}
