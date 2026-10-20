import {
  drawnIdOf,
  frontier,
  hide,
  onCanvas,
  transition,
  type Action,
  type Approach,
  type Budget,
  type DrawnId,
  type DrawnNode,
  type Frontier,
  type GroupNode,
  type LayoutName,
  type OnCanvas,
  type Selection,
} from "@qdic-topology/engine";
import {
  fadedAfter,
  fadedSelect,
  focusExit,
  groupAroundRoot,
  layoutExit,
  type FocusAction,
} from "./around";
import type { CanvasEvent, EventName } from "./events";
import {
  act,
  commit,
  drawHeld,
  exited,
  flush,
  guard,
  jumpChain,
  laid,
  motionOf,
  routeOf,
  type Ctx,
} from "./route";
import { sceneOf } from "./scene";

export type Filter = Extract<
  Action,
  {
    kind:
      | "toggleType"
      | "showAllTypes"
      | "toggleFamily"
      | "togglePredicate"
      | "grouping";
  }
>;

export type Canvas = {
  setData(frontier: Frontier): void;
  setLayout(name: LayoutName): void;
  // why: SA §4.5 `select(nodeId | edgeKey | null)`; a drawn id and an edge key are both strings
  select(id: string | null): void;
  focus(id: string): void;
  expand(id: DrawnId): void;
  collapse(id: DrawnId): void;
  hide(ids: DrawnId[]): void;
  restore(ids: DrawnId[]): void;
  reveal(path: string[]): void;
  onCanvas(id: string): OnCanvas;
  setBudget(n: Budget): void;
  resetView(): void;
  setApproach(a: Approach): void;
  setFilters(f: Filter): void;
  groupAroundRoot(on: boolean): void;
  fit(): void;
  on<K extends EventName>(
    event: K,
    handler: (event: CanvasEvent[K]) => void,
  ): () => void;
};

const LAYOUTS: readonly unknown[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const BUDGETS: readonly unknown[] = [10, 20, 50, "all"];
const GROUPINGS: readonly unknown[] = [2, 5, 10, "off"];

const isString = (v: unknown): v is string => typeof v === "string";
const isGroup = (n: DrawnNode): n is GroupNode => "members" in n;

// why: rule (b) — a list is an array of strings with at least one entry
const listOf = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length > 0 && v.every(isString) ? v : null;

const nodeOf = (ctx: Ctx, id: unknown): DrawnNode | undefined =>
  isString(id) ? ctx.frontier.nodes.find((n) => n.id === id) : undefined;

// why: rule (b) — the entity ids that `onCanvas` resolves: graph entity ids and record ids
function known(ctx: Ctx): ReadonlySet<string> {
  ctx.known ??= new Set(
    ctx.model.graph.entities.flatMap((e) => [e.id, ...e.records]),
  );
  return ctx.known;
}

// why: the anchor of an edge pick: the selected node, or the anchor of the picked edge, else ""
// (the engine `selectEdge` then takes the subject; one anchor rule, `view/story.ts`)
const anchorOf = (selection: Selection): DrawnId =>
  selection === null
    ? ""
    : "edge" in selection
      ? selection.anchor
      : selection.node;

// why: Context `focus(id)` — a group drawn id expands the group, an id with no drawn node draws its
// path; each then selects the entity on the placed state, in one draw with motion `local`.
// STORY-003-07 — while grouped `exitAround` comes first, and a faded target is exit 3 after it
function placedFocus(ctx: Ctx, action: FocusAction, id: string): void {
  if (focusExit(ctx, action, id)) return;
  const { graph, vocab } = ctx.model;
  const next = transition(ctx.state, action, graph, vocab);
  if (next === ctx.state) return;
  const drawn = drawnIdOf(next, graph, vocab, id);
  if (drawn === null) return;
  const after = frontier(next, graph, vocab);
  const change = routeOf(ctx, action, next, after, {});
  if (fadedAfter(ctx, action, change, drawn)) return;
  const node = after.nodes.find((n) => n.id === drawn);
  const state =
    node === undefined || isGroup(node)
      ? change.state
      : transition(change.state, { kind: "select", entity: id }, graph, vocab);
  commit(ctx, action, {
    ...change,
    state,
    motion: { ...change.motion, focus: drawn },
  });
}

function focus(ctx: Ctx, id: unknown): void {
  if (!isString(id) || !known(ctx).has(id)) return;
  const { graph, vocab } = ctx.model;
  const drawn = drawnIdOf(ctx.state, graph, vocab, id);
  const node = drawn === null ? undefined : nodeOf(ctx, drawn);
  if (node === undefined) return placedFocus(ctx, { kind: "path", id }, id);
  if (isGroup(node))
    return placedFocus(ctx, { kind: "expandGroup", group: node.id }, id);
  if (!fadedSelect(ctx, node.id, true))
    act(ctx, { kind: "select", node: node.id }, { focus: node.id });
}

function expand(ctx: Ctx, id: unknown): void {
  const node = nodeOf(ctx, id);
  if (node === undefined) return;
  const action: Action = isGroup(node)
    ? { kind: "expandGroup", group: node.id }
    : { kind: "explore", id: node.entity };
  act(ctx, action, { anchor: node.id });
}

// why: STORY-003-01 `EntityNode.group` — an expanded group is not a frontier node, so a `g:` id is
// known when a frontier group has it or a drawn member names it
function collapse(ctx: Ctx, id: unknown): void {
  const node = nodeOf(ctx, id);
  if (node !== undefined && !isGroup(node))
    return act(ctx, { kind: "collapse", id: node.entity });
  const member = (n: DrawnNode) => !isGroup(n) && n.group === id;
  if (isString(id) && id.startsWith("g:"))
    if (node !== undefined || ctx.frontier.nodes.some(member))
      act(ctx, { kind: "collapseGroup", group: id });
}

// why: Context `hide(ids)` — one node is the engine `hide`, more is `hideMany` with the entities of
// the entity nodes and the members of the group nodes; the engine keeps one node drawn (FR-TABLE-5)
function hideIds(ctx: Ctx, ids: unknown): void {
  const list = listOf(ids);
  const nodes = [...new Set(list)]
    .map((id) => nodeOf(ctx, id))
    .filter((n): n is DrawnNode => n !== undefined);
  if (nodes.length === 0) return;
  const action: Extract<Action, { kind: "hide" | "hideMany" }> =
    nodes.length === 1
      ? { kind: "hide", node: nodes[0].id }
      : {
          kind: "hideMany",
          ids: nodes.flatMap((n) => (isGroup(n) ? n.members : [n.entity])),
        };
  if (exited(ctx, action)) return;
  const { graph, vocab } = ctx.model;
  const result = hide(ctx.state, action, graph, vocab);
  if (result.refused === "last-drawn")
    return ctx.events.emit("notice", { kind: "last-drawn" });
  if (result.state === ctx.state) return;
  const after = frontier(result.state, graph, vocab);
  commit(ctx, action, routeOf(ctx, action, result.state, after, {}));
}

function restoreKeys(ctx: Ctx, ids: unknown): void {
  const keys = new Set(ctx.state.hidden.map((h) => h.key));
  const list = [...new Set(listOf(ids))].filter((id) => keys.has(id));
  if (list.length > 0) act(ctx, { kind: "restore", keys: list });
}

function reveal(ctx: Ctx, path: unknown): void {
  const ids = [...new Set(listOf(path))].filter((id) => known(ctx).has(id));
  if (ids.length > 0) act(ctx, { kind: "showMany", ids });
}

// why: Context `setData(frontier)` (H8) — a redraw of this frontier with the state positions and
// the current model; no engine call changes the state
function setData(ctx: Ctx, given: unknown): void {
  const f = given as Frontier | null;
  if (typeof f !== "object" || f === null) return;
  if (!Array.isArray(f.nodes) || !Array.isArray(f.edges)) return;
  const { vocab, canvas } = ctx.model;
  const scene = sceneOf(
    { state: ctx.state, frontier: f, vocab, canvas },
    ctx.text,
    ctx.metrics,
  );
  ctx.fit = null;
  flush(ctx, drawHeld(ctx, scene, motionOf("none", {})));
}

// why: rule (b) — the known names: types are the keys of `vocab.types` and `null`, families the
// names of `vocab.families`, predicates the keys of `vocab.predicates` (Maps, so a key such as
// `__proto__` is not found unless it is a key)
function filterOf(ctx: Ctx, f: unknown): Filter | null {
  if (typeof f !== "object" || f === null) return null;
  const v = f as Record<string, unknown>;
  const { types, families, predicates } = ctx.model.vocab;
  const on = v.on;
  if (v.kind === "showAllTypes") return { kind: "showAllTypes" };
  if (v.kind === "grouping" && GROUPINGS.includes(v.grouping))
    return { kind: "grouping", grouping: v.grouping as 2 | 5 | 10 | "off" };
  if (typeof on !== "boolean") return null;
  const { type, family, predicate } = v;
  if (
    v.kind === "toggleType" &&
    (type === null || (isString(type) && types.has(type)))
  )
    return { kind: "toggleType", type, on };
  if (v.kind === "toggleFamily" && families.some((x) => x.key === family))
    return { kind: "toggleFamily", family: family as string, on };
  if (
    v.kind === "togglePredicate" &&
    isString(predicate) &&
    predicates.has(predicate)
  )
    return { kind: "togglePredicate", predicate, on };
  return null;
}

// why: SA §4.5 `select(nodeId | edgeKey | null)`; STORY-003-07 — a faded node is exit 3
function select(ctx: Ctx, id: unknown): void {
  if (id === null) return act(ctx, { kind: "select", node: null });
  const node = nodeOf(ctx, id);
  if (node !== undefined) {
    if (!fadedSelect(ctx, node.id, false))
      act(ctx, { kind: "select", node: node.id });
    return;
  }
  if (
    isString(id) &&
    id.startsWith("[") &&
    ctx.frontier.edges.some((e) => e.key === id)
  )
    act(ctx, {
      kind: "selectEdge",
      edge: id,
      anchor: anchorOf(ctx.state.selection),
    });
}

// why: SA §4.5 method list as written (v0.12 text, kept in v0.13). STORY-003-06a interrupt rule —
// each method first ends a running drag (its release commits and `drag-end` fires); STORY-003-07 —
// then it puts the last waiting step in the DOM, and then it runs on the committed state
export function methodsOf(ctx: Ctx): Canvas {
  const run = (work: () => void) =>
    guard(ctx, () => {
      ctx.renderer.endDrag();
      jumpChain(ctx);
      work();
    });
  return {
    setData: (f) => run(() => setData(ctx, f)),
    setLayout: (name) =>
      run(() => {
        if (LAYOUTS.includes(name) && !layoutExit(ctx, name))
          commit(ctx, null, laid(ctx, ctx.state, ctx.frontier, name));
      }),
    select: (id) => run(() => select(ctx, id)),
    focus: (id) => run(() => focus(ctx, id)),
    expand: (id) => run(() => expand(ctx, id)),
    collapse: (id) => run(() => collapse(ctx, id)),
    hide: (ids) => run(() => hideIds(ctx, ids)),
    restore: (ids) => run(() => restoreKeys(ctx, ids)),
    reveal: (path) => run(() => reveal(ctx, path)),
    onCanvas: (id) => {
      const { graph, vocab } = ctx.model;
      return isString(id) ? onCanvas(ctx.state, graph, vocab, id) : "not-drawn";
    },
    setBudget: (n) =>
      run(() => {
        if (BUDGETS.includes(n)) act(ctx, { kind: "budget", budget: n });
      }),
    resetView: () => run(() => act(ctx, { kind: "reset" })),
    setApproach: (a) =>
      run(() => {
        if (a === "active" || a === "passive")
          act(ctx, { kind: "approach", approach: a });
      }),
    setFilters: (f) =>
      run(() => {
        const action = filterOf(ctx, f);
        if (action !== null) act(ctx, action);
      }),
    groupAroundRoot: (on) => run(() => groupAroundRoot(ctx, on)),
    fit: () => run(() => ctx.renderer.fit()),
    on: (event, handler) => ctx.events.on(event, handler),
  };
}
