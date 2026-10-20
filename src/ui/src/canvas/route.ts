import {
  collapseAround,
  exitAround,
  expandAround,
  frontier,
  place,
  setLayout,
  transition,
  type Action,
  type CanvasState,
  type DrawnId,
  type ExitResult,
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
  FitOptions,
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

// why: STORY-003-07 "Waiting steps" — the scenes of a step chain are made before the commit
type Waiting = { scene: Scene; motion: Motion };

export type Ctx = {
  model: CanvasModel;
  text: RendererText;
  metrics: IconMetrics;
  renderer: Renderer;
  events: Events;
  state: CanvasState;
  frontier: Frontier;
  fit: FitOptions | null;
  chain: Waiting[];
  hold: Hold | null;
  known: ReadonlySet<string> | null;
};

export type Step = { state: CanvasState; frontier: Frontier; motion: Motion };

export type Change = Step & { fit: boolean };

// why: the camera call after the last step, made from the scene of that step
export type Fit = (last: Scene) => FitOptions;

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

const isCollapse = (kind: Action["kind"]) =>
  kind === "collapse" || kind === "collapseGroup";

// why: rule (3) — the motion kind of an action: `collapse` retracts, rule (1) moves nothing
const kindOf = (action: Action): Motion["kind"] =>
  RULE_ONE.has(action.kind)
    ? "none"
    : isCollapse(action.kind)
      ? "collapse"
      : "local";

// why: hand-off item 16 (D81, Q24) — while grouped an explore or a group expand joins `shown` and
// a collapse keeps the root; every other rule (3) action is the STORY-002-07 `place`
function placeOf(grouped: boolean, kind: Action["kind"]) {
  if (!grouped) return place;
  if (kind === "explore" || kind === "expandGroup") return expandAround;
  return isCollapse(kind) ? collapseAround : place;
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
  const placed = placeOf(ctx.state.around !== null, action.kind)(
    next,
    change,
    ctx.model.vocab,
    ctx.metrics,
  );
  return {
    state: placed.state,
    frontier: after,
    motion: motionOf(kindOf(action), opts, placed),
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

// why: STORY-003-07 step chain — the renderer gives no `onSettle` while a motion runs (STORY-003-05
// decisions item 4), so a settle while a step waits is the end of the motion of the step before
// it. After the last step: one `settle`, then the camera call (SA §4.5: a rule (2) fit)
export function settleNow(ctx: Ctx, camera: Camera): void {
  const next = ctx.chain.shift();
  if (next !== undefined) {
    flush(ctx, drawHeld(ctx, next.scene, next.motion));
    return;
  }
  const { state, frontier } = ctx;
  ctx.events.emit("settle", { state, frontier, camera });
  const fit = ctx.fit;
  if (fit === null) return;
  ctx.fit = null;
  ctx.renderer.fit(fit);
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

// why: rule (c) — every scene is made before the commit, so a throw keeps the state, the scene,
// the DOM and the camera; guardrail 10 — `state` is replaced only by engine results. NF-8 — the
// state is the last step at once; the renderer draws the first step, the settles draw the others
export function play(
  ctx: Ctx,
  action: Action | null,
  steps: readonly Step[],
  fit: Fit | null,
): void {
  const { vocab, canvas } = ctx.model;
  const drawn = steps.map((s): Waiting => ({
    scene: sceneOf(
      { state: s.state, frontier: s.frontier, vocab, canvas },
      ctx.text,
    ),
    motion: s.motion,
  }));
  const last = steps[steps.length - 1];
  const prior = ctx.state;
  const before = ctx.frontier;
  ctx.state = last.state;
  ctx.frontier = last.frontier;
  ctx.fit = fit === null ? null : fit(drawn[drawn.length - 1].scene);
  ctx.chain = drawn.slice(1);
  const hold = drawHeld(ctx, drawn[0].scene, drawn[0].motion);
  if (action !== null && !sameDrawn(before, ctx.frontier))
    ctx.events.emit("explore", { action, state: ctx.state });
  if (!sameSelection(prior.selection, ctx.state.selection))
    ctx.events.emit("select", {
      selection: ctx.state.selection,
      state: ctx.state,
    });
  flush(ctx, hold);
}

export const commit = (ctx: Ctx, action: Action | null, change: Change) =>
  play(ctx, action, [change], change.fit ? () => ({}) : null);

// why: STORY-003-07 "Waiting steps" — a call, an intent or a drag start first puts the last step in
// the DOM; the draw stops the running motion and its timer before anything else runs, and the
// chain ends with its one `settle`
export function jumpChain(ctx: Ctx): void {
  const last = ctx.chain.pop();
  if (last === undefined) return;
  ctx.chain = [];
  flush(ctx, drawHeld(ctx, last.scene, motionOf("none", {})));
}

// why: Context "Routing while grouped" — the glide home with motion `local` and no anchor (b3),
// then the effect with the motion kind of rule (3) and the engine `starts` and `retractTo`
export function stepsOf(
  ctx: Ctx,
  r: ExitResult,
  kind: Motion["kind"],
  opts: Opts = {},
): Step[] {
  const { graph, vocab } = ctx.model;
  return r.steps.map((state, i) => ({
    state,
    frontier: frontier(state, graph, vocab),
    motion:
      i === 0
        ? motionOf("local", {})
        : motionOf(kind, opts, r.placed ?? undefined),
  }));
}

// why: hand-off item 16, D99 (1), D100 — while grouped an action asks `exitAround` first; an
// action that ends the grouping plays its steps, and no other engine function changes the state
export function exited(ctx: Ctx, action: Action): boolean {
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
  play(ctx, action, stepsOf(ctx, r, kindOf(action)), null);
  return true;
}

// why: rule (b) — an engine result equal to the state gives no change and no event; a `showMany`
// that changes no drawn id and no Hidden-list entry returns a new object, so it is checked too
export function act(ctx: Ctx, action: Action, opts: Opts = {}): void {
  if (exited(ctx, action)) return;
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
