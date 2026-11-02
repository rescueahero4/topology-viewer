import {
  edgeKey,
  entityDrawnId,
  entityType,
  frontier,
  locate,
  onCanvas,
  place,
  transition,
  type Action,
  type CanvasState,
  type DrawnId,
  type DrawnNode,
  type Edit,
  type EditEffect,
  type Frontier,
  type Graph,
  type OnCanvas,
  type Point,
  type Vocab,
} from "#engine";
import {
  drawHeld,
  flush,
  guard,
  jumpChain,
  motionOf,
  sameDrawn,
  type CanvasModel,
  type Ctx,
} from "./route";
import { sceneOf } from "./scene";

export type EditEnds = { draw: string[]; undraw: DrawnId[] };

type Work = {
  ctx: Ctx;
  old: Graph;
  graph: Graph;
  vocab: Vocab;
  start: CanvasState;
  before: Frontier;
};

type Placed = { state: CanvasState; starts: [DrawnId, Point][] };

// why: the `draw` list, the new ends that it draws, and the ids that `undraw` took off
type Given = { draw: string[]; ends: string[]; gone: ReadonlySet<DrawnId> };

const isString = (v: unknown): v is string => typeof v === "string";

// why: rule (b) of the other methods — only the strings of an array count
const listOf = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter(isString))] : [];

const entitiesOf = (node: DrawnNode) =>
  "members" in node ? node.members : [node.entity];

// why: the drawn id that holds each entity of a frontier, a group id for its members
function holderOf(f: Frontier): Map<string, DrawnId> {
  const map = new Map<string, DrawnId>();
  for (const node of f.nodes)
    for (const entity of entitiesOf(node)) map.set(entity, node.id);
  return map;
}

// why: rule 4, STORY-008-01 rule 2 — the row names its triple by the base key, which only
// `locate` finds in an edited graph; the new end is the value of the triple after the edit
export function endsToDraw(
  edit: Edit,
  graph: Graph,
  on: (id: string) => OnCanvas,
): string[] {
  const ends: string[] = [];
  for (const { row, column } of edit.changes) {
    if (column !== "subject" && column !== "object") continue;
    if (!("triple" in row)) continue;
    const triple = graph.triples[locate(graph, row).index];
    const subject = column === "subject";
    const end = subject ? triple.subject : triple.object;
    const near = on(subject ? triple.object : triple.subject);
    if (ends.includes(end) || on(end) !== "not-drawn") continue;
    if (near === "drawn" || near === "faded") ends.push(end);
  }
  return ends;
}

// why: rule 5 — an `undraw` id that is still an entity node after the swap leaves the drawn set;
// a group id or an id that is not drawn changes nothing (the swap regroups the members itself)
function undrawn(w: Work, state: CanvasState, ids: string[]) {
  const gone = new Set<DrawnId>();
  if (ids.length === 0) return { state, gone };
  const out = new Set<string>();
  for (const node of frontier(state, w.graph, w.vocab).nodes)
    if ("entity" in node && ids.includes(node.id)) {
      gone.add(node.id);
      out.add(node.entity);
    }
  if (out.size === 0) return { state, gone };
  const all = state.revealed ?? w.graph.entities.map((e) => e.id);
  const scope = state.scope.mode === "all" ? "custom" : state.scope.mode;
  const next: CanvasState = {
    ...state,
    revealed: all.filter((id) => !out.has(id)),
    origins: state.origins.filter(([c, f]) => !out.has(c) && !out.has(f)),
    scope: { ...state.scope, mode: scope },
  };
  return { state: next, gone };
}

// why: rule 3 (Tech Lead reading) — the other end of the first moved triple, in triple order, that
// has the id as its new end; the graphs of one dataset keep the triple order (FR-CELL-10)
function otherEnd(w: Work, id: string, near: (id: string) => boolean) {
  for (const [i, t] of w.graph.triples.entries()) {
    const was = w.old.triples.at(i);
    const other =
      t.subject === id && was?.subject !== id
        ? t.object
        : t.object === id && was?.object !== id
          ? t.subject
          : null;
    if (other !== null && near(other)) return other;
  }
  return null;
}

// why: rule 3, Implementer readiness (c) — the controller writes the origin pair [new end, other
// end] itself, so the reveal placement starts next to that end and not at the end of a shortest
// path; a hidden, drawn, type-off or alone end is not drawn (rule 6: filters stay)
function withEnds(w: Work, state: CanvasState, ids: string[]) {
  const ends: string[] = [];
  if (state.revealed === null) return { state, ends };
  const entity = new Map<string, string>();
  for (const e of w.graph.entities)
    for (const id of [e.id, ...e.records]) entity.set(id, e.id);
  const { graph, vocab } = w;
  const at = (id: string) => onCanvas(state, graph, vocab, id);
  const near = (id: string) => at(id) === "drawn" || at(id) === "faded";
  const origins = [...state.origins];
  for (const id of ids) {
    const end = entity.get(id);
    if (end === undefined || ends.includes(end) || at(end) !== "not-drawn")
      continue;
    if (state.filters.typesOff.includes(entityType(vocab, end))) continue;
    const other = otherEnd(w, end, near);
    if (other === null) continue;
    ends.push(end);
    origins.push([end, other]);
  }
  if (ends.length === 0) return { state, ends };
  const set = new Set([...state.revealed, ...ends]);
  const revealed = graph.entities.map((e) => e.id).filter((id) => set.has(id));
  return { state: { ...state, revealed, origins }, ends };
}

// why: rule 10, SA-001 v0.29 §4.8 addendum (2) — a node that leaves keeps its position in
// `state.positions`, and an Undo `draw` id with a kept position goes back there, not to the
// `place` spot next to an other end; the other drawn nodes keep the `place` result (0 px)
function kept(w: Work, r: Placed, after: Frontier, given: Given): Placed {
  const was = new Map(w.start.positions);
  const before = new Set(w.before.nodes.map((n) => n.id));
  const shown = new Set(after.nodes.map((n) => n.id));
  const positions = new Map(r.state.positions);
  for (const id of before)
    if (!shown.has(id) && !given.gone.has(id) && !positions.has(id))
      if (was.has(id)) positions.set(id, was.get(id) as Point);
  const back = new Map<DrawnId, Point>();
  for (const id of given.draw) {
    const p = was.get(id);
    if (p !== undefined && shown.has(id) && !before.has(id)) back.set(id, p);
  }
  for (const [id, p] of back) positions.set(id, p);
  return {
    state: { ...r.state, positions: [...positions] },
    starts: r.starts.map(([id, p]) => [id, back.get(id) ?? p]),
  };
}

// why: rule 3, guardrail 5 addendum 0.28 — the engine `place` of a reveal (`showMany`) gives the
// newcomers their spots and moves no drawn node; nothing runs when the drawn set is the same
function placed(
  w: Work,
  state: CanvasState,
  after: Frontier,
  given: Given,
): Placed {
  if (sameDrawn(w.before, after)) return { state, starts: [] };
  const action = { kind: "showMany", ids: given.ends } as const;
  const change = { action, before: w.before, after };
  const r = place(state, change, w.vocab, w.ctx.metrics);
  return kept(w, r, after, given);
}

// why: rule 11 — the new key of the selected edge: the first triple behind it that the edit moved,
// when both of its ends are drawn after the edit
function followed(w: Work, key: string, after: Frontier): string | null {
  const edge = w.before.edges.find((e) => e.key === key);
  if (edge === undefined) return null;
  const was = holderOf(w.before);
  const now = holderOf(after);
  for (const [i, t] of w.graph.triples.entries()) {
    const o = w.old.triples.at(i);
    if (o === undefined || o.key === t.key || o.predicate !== edge.predicate)
      continue;
    if (was.get(o.subject) !== edge.subject) continue;
    if (was.get(o.object) !== edge.object) continue;
    const s1 = now.get(t.subject);
    const o1 = now.get(t.object);
    if (s1 === undefined || o1 === undefined) return null;
    const next = edgeKey(s1, t.predicate, o1);
    return after.edges.some((e) => e.key === next) ? next : null;
  }
  return null;
}

// why: rule 11 (FR-CELL-18) — a selected edge follows its new key, else the selection goes to its
// anchor node; the engine `select` and `selectEdge` keep owner decision D90 (a node that goes
// into a group hands the selection to the group, a node that leaves the canvas clears it)
function selectionAfter(w: Work, state: CanvasState, after: Frontier) {
  const sel = w.start.selection;
  const { graph, vocab } = w;
  const to = (action: Action) => transition(state, action, graph, vocab);
  if (sel === null) return null;
  if ("node" in sel) return to({ kind: "select", node: sel.node }).selection;
  if (after.edges.some((e) => e.key === sel.edge)) return sel;
  const edge = followed(w, sel.edge, after);
  if (edge === null) return to({ kind: "select", node: sel.anchor }).selection;
  return to({ kind: "selectEdge", edge, anchor: sel.anchor }).selection;
}

// why: rule 1, rule (c) of the other methods — the scene is made before the commit, so a throw
// keeps the model, the state and the DOM; rule 8 — no `explore` or `select`, only the `settle` of
// the draw; no fit and no camera call
function commit(
  w: Work,
  model: CanvasModel,
  r: Placed & { frontier: Frontier },
  held: boolean,
): void {
  const { ctx } = w;
  const { vocab, canvas } = model;
  const input = { state: r.state, frontier: r.frontier, vocab, canvas };
  const scene = sceneOf(input, ctx.text, ctx.metrics);
  const motion =
    r.starts.length === 0
      ? motionOf("none", {})
      : motionOf("local", {}, { starts: r.starts, retractTo: [] });
  ctx.model = model;
  ctx.known = null;
  ctx.state = r.state;
  ctx.frontier = r.frontier;
  if (held) ctx.chain.push({ scene, motion });
  else flush(ctx, drawHeld(ctx, scene, motion));
}

function effectOf(w: Work, after: Frontier, given: Given) {
  const before = new Set(w.before.nodes.map((n) => n.id));
  const shown = new Set(after.nodes.map((n) => n.id));
  const holder = holderOf(after);
  const fresh = after.nodes.map((n) => n.id).filter((id) => !before.has(id));
  // why: rule 3 — a new end that joins a group also names its own drawn id, so an Undo `undraw`
  // takes it off when the swap draws it alone again
  const own = given.ends.filter((e) => holder.has(e)).map(entityDrawnId);
  return {
    drew: [...new Set([...fresh, ...own])],
    undrew: [...before].filter((id) => !shown.has(id) && !given.gone.has(id)),
  };
}

function applied(
  ctx: Ctx,
  graph: Graph,
  vocab: Vocab,
  given: EditEnds,
  held: boolean,
): EditEffect {
  const w: Work = {
    ctx,
    old: ctx.model.graph,
    graph,
    vocab,
    start: ctx.state,
    before: ctx.frontier,
  };
  const { state: mid, gone } = undrawn(w, w.start, given.undraw);
  const { state, ends } = withEnds(w, mid, given.draw);
  const after = frontier(state, graph, vocab);
  const r = placed(w, state, after, { draw: given.draw, ends, gone });
  const next = { ...r.state, selection: selectionAfter(w, r.state, after) };
  const model = { ...ctx.model, graph, vocab };
  commit(w, model, { state: next, starts: r.starts, frontier: after }, held);
  return effectOf(w, after, { draw: given.draw, ends, gone });
}

// why: rule 7 (FR-CANVAS-14) — while Group around root is on and its fit waits for the end of the
// arrange motion, the edit waits as a step after that motion (STORY-003-07 waiting steps) and
// does not end the grouping
const holding = (ctx: Ctx) => ctx.state.around !== null && ctx.fit !== null;

// why: SA-001 v0.29 §4.8 `applyEdit(graph, vocab, { draw, undraw })` — rule 1: it first ends a drag
// and the step chain, as the other methods do (rule 7 keeps the waiting edit step instead)
export function applyEdit(
  ctx: Ctx,
  graph: Graph,
  vocab: Vocab,
  ends: unknown,
): EditEffect {
  let effect: EditEffect = { drew: [], undrew: [] };
  guard(ctx, () => {
    ctx.renderer.endDrag();
    const held = holding(ctx);
    if (!held) jumpChain(ctx);
    const v = (typeof ends === "object" && ends !== null ? ends : {}) as {
      draw?: unknown;
      undraw?: unknown;
    };
    const given = { draw: listOf(v.draw), undraw: listOf(v.undraw) };
    effect = applied(ctx, graph, vocab, given, held);
  });
  return effect;
}
