import type { Graph, Payload } from "../data/normalize";
import {
  entityDrawnId,
  entityOfDrawnId,
  type Action,
  type Approach,
  type Budget,
  type CanvasState,
  type DrawnId,
  type Hint,
  type Selection,
} from "../state/canvasState";
import type { Vocab } from "../vocab/resolve";
import {
  collapse,
  drawnView,
  explore,
  fill,
  mostConnected,
  path,
  wholeCount,
  type DrawnView,
  type Frontier,
} from "./frontier";
import {
  NO_FILTERS,
  setGrouping,
  showAllTypes,
  toggleFamily,
  togglePredicate,
  toggleType,
} from "./filter";
import {
  collapseGroup,
  expandGroup,
  idsOf,
  maskOf,
  topology,
  type Topology,
} from "./group";
import {
  hideMany,
  hideNode,
  restore,
  settled,
  showMany,
  type HideResult,
} from "./hidden";

type View = NonNullable<Payload["view"]>;

const DEFAULT_BUDGET = 20;

// why: PRD FR-CANVAS-13 (ruling 6) — an unknown root still opens Active; the mockup infers Passive
function approachOf(view: View): Approach {
  return view.approach ?? (view.root === undefined ? "passive" : "active");
}

// why: mockup `setData` (lib/topology.js lines 2302-2303) — ids map to their entity; reveal ids of
// one entity count once
function hintOf(top: Topology, view: View): Hint | null {
  const root =
    view.root === undefined ? undefined : top.entityOf.get(view.root);
  if (root === undefined) return null;
  const mask = maskOf(top, []);
  for (const id of view.reveal ?? []) {
    const entity = id === undefined ? undefined : top.entityOf.get(id);
    if (entity !== undefined) mask[entity] = 1;
  }
  return { root: top.ids[root], reveal: idsOf(top, mask) };
}

function fits(top: Topology, state: CanvasState, budget: Budget): boolean {
  return budget === "all" || wholeCount(top, state.grouping) <= budget;
}

// why: mockup `initScope` (lib/topology.js lines 676-690) — the budget applies to no node of a
// valid hint (FR-CANVAS-7); the "all" test counts after grouping (FR-CANVAS-5)
function scoped(top: Topology, state: CanvasState): CanvasState {
  const { hint } = state.scope;
  if (hint !== null) {
    const revealed = idsOf(top, maskOf(top, [hint.root, ...hint.reveal]));
    return { ...state, scope: { mode: "ai", root: hint.root, hint }, revealed };
  }
  if (fits(top, state, state.budget))
    return {
      ...state,
      scope: { mode: "all", root: null, hint },
      revealed: null,
    };
  const start = mostConnected(top) as number;
  const revealed = fill(top, start, state.budget as number, state.grouping);
  return {
    ...state,
    scope: { mode: "auto", root: top.ids[start], hint },
    revealed,
  };
}

function busiest(drawn: Frontier): DrawnId | null {
  const links = new Map<DrawnId, number>();
  const bump = (id: DrawnId) => links.set(id, (links.get(id) ?? 0) + 1);
  for (const edge of drawn.edges) {
    bump(edge.subject);
    if (edge.object !== edge.subject) bump(edge.object);
  }
  let best: DrawnId | null = null;
  let most = -1;
  for (const node of drawn.nodes) {
    const count = links.get(node.id) ?? 0;
    if (count > most) {
      best = node.id;
      most = count;
    }
  }
  return best;
}

// why: mockup `selectRoot` (lib/topology.js lines 1150-1157) — the root, else its group, else the
// most connected drawn node (FR-CANVAS-13)
function storySelection(top: Topology, state: CanvasState): Selection {
  if (state.approach === "passive") return null;
  const view = drawnView(top, state);
  const root =
    (state.scope.root === null
      ? undefined
      : top.entityOf.get(state.scope.root)) ?? mostConnected(top);
  const node =
    (root === null ? null : view.drawnOf[root]) ?? busiest(view.frontier);
  return node === null ? null : { node };
}

// why: mockup `initScope` and `setBudget` (lib/topology.js lines 677, 2373) — a new scope clears
// the Hidden list; only new data clears the filters (line 2308). The STORY-002-07 records belong to
// the expansions of `origins`, so they go with them (the mockup keeps them, line 2381; SA §6 row 2)
const NO_EXPANSION = {
  origins: [],
  expandedGroups: [],
  homes: [],
  treeShifts: [],
  nudges: [],
};

function restart(top: Topology, state: CanvasState): CanvasState {
  const next = scoped(top, {
    ...state,
    ...NO_EXPANSION,
    selection: null,
    hidden: [],
  });
  return { ...next, selection: storySelection(top, next) };
}

export function firstView(
  graph: Graph,
  vocab: Vocab,
  payload: Payload,
  hash: number,
): CanvasState {
  const top = topology(graph, vocab);
  const view: View = payload.view ?? {};
  return restart(top, {
    graphHash: hash,
    approach: approachOf(view),
    scope: { mode: "all", root: null, hint: hintOf(top, view) },
    budget: view.budget ?? DEFAULT_BUDGET,
    grouping: 2,
    revealed: null,
    ...NO_EXPANSION,
    selection: null,
    seq: 0,
    layout: view.layout ?? "force",
    positions: [],
    treeRows: null,
    filters: NO_FILTERS,
    hidden: [],
  });
}

// why: mockup `setBudget` (lib/topology.js lines 2371-2379) — the fill runs from the scope root, or
// the most connected entity, and the whole graph is drawn when it fits
function rebudget(top: Topology, state: CanvasState, budget: Budget) {
  const start =
    (state.scope.root === null
      ? undefined
      : top.entityOf.get(state.scope.root)) ?? mostConnected(top);
  const base = {
    ...state,
    budget,
    ...NO_EXPANSION,
    hidden: [],
  };
  const root = start === null ? null : top.ids[start];
  const hint = state.scope.hint;
  const next: CanvasState =
    start === null || fits(top, base, budget)
      ? { ...base, scope: { mode: "all", root, hint }, revealed: null }
      : {
          ...base,
          scope: { mode: "auto", root, hint },
          revealed: fill(top, start, budget as number, base.grouping),
        };
  return { ...next, selection: storySelection(top, next) };
}

function nodeAfter(top: Topology, view: DrawnView, node: DrawnId): Selection {
  if (view.frontier.nodes.some((item) => item.id === node)) return { node };
  const id = entityOfDrawnId(node);
  const entity = id === null ? undefined : top.entityOf.get(id);
  const drawn = entity === undefined ? null : view.drawnOf[entity];
  return drawn === null ? null : { node: drawn };
}

// why: mockup `prune`, `hideMany`, `showMany`, `restore` (lib/topology.js lines 779, 806, 821, 861)
// re-select the node as an explore does, which clears an edge pick
const RESHAPE = new Set<Action["kind"]>([
  "explore",
  "collapse",
  "hide",
  "hideMany",
  "restore",
  "showMany",
]);

// why: STORY-002-04 Context and owner decision D90 — a selection that leaves the drawn set is
// cleared; a node that goes into a group hands the selection to the group; an action of RESHAPE
// clears an edge pick and keeps its anchor node (mockup `select`, lib/topology.js line 2083)
function kept(top: Topology, state: CanvasState, action: Step): Selection {
  const { selection } = state;
  if (selection === null) return null;
  const view = drawnView(top, state);
  if (!("edge" in selection)) return nodeAfter(top, view, selection.node);
  const reshaped = RESHAPE.has(action.kind);
  if (!reshaped && view.frontier.edges.some((e) => e.key === selection.edge))
    return selection;
  return nodeAfter(top, view, selection.anchor);
}

function selectEdge(
  top: Topology,
  state: CanvasState,
  key: string,
  anchor: DrawnId,
): CanvasState {
  const edge = drawnView(top, state).frontier.edges.find(
    (item) => item.key === key,
  );
  if (edge === undefined) return state;
  const end =
    anchor === edge.subject || anchor === edge.object ? anchor : edge.subject;
  return { ...state, selection: { edge: key, anchor: end } };
}

function select(
  top: Topology,
  state: CanvasState,
  action: Extract<Action, { kind: "select" }>,
): CanvasState {
  if ("entity" in action) {
    const entity = top.entityOf.get(action.entity);
    const node = entity === undefined ? null : entityDrawnId(top.ids[entity]);
    return { ...state, selection: node === null ? null : { node } };
  }
  return {
    ...state,
    selection: action.node === null ? null : { node: action.node },
  };
}

type Step = Exclude<Action, { kind: "budget" | "reset" | "selectEdge" }>;
type Hide = Extract<Action, { kind: "hide" | "hideMany" }>;

function hideStep(top: Topology, state: CanvasState, action: Hide) {
  return action.kind === "hide"
    ? hideNode(top, state, action.node)
    : hideMany(top, state, action.ids);
}

function step(
  top: Topology,
  state: CanvasState,
  action: Step,
  vocab: Vocab,
): CanvasState {
  switch (action.kind) {
    case "explore":
      return explore(top, state, action.id);
    case "collapse":
      return collapse(top, state, action.id);
    case "expandGroup":
      return expandGroup(top, state, action.group);
    case "collapseGroup":
      return collapseGroup(state, action.group);
    case "path":
      return path(top, state, action.id);
    case "select":
      return select(top, state, action);
    case "toggleType":
      return toggleType(state, vocab, action.type, action.on);
    case "showAllTypes":
      return showAllTypes(state);
    case "toggleFamily":
      return toggleFamily(state, vocab, action.family, action.on);
    case "togglePredicate":
      return togglePredicate(state, vocab, action.predicate, action.on);
    case "grouping":
      return setGrouping(state, action.grouping);
    case "hide":
    case "hideMany":
      return hideStep(top, state, action).state;
    case "restore":
      return restore(top, state, action.keys);
    case "showMany":
      return showMany(top, state, action.ids);
  }
}

// why: STORY-002-06 Context "Restore rule" — an entry whose members are all drawn again leaves the
// list (mockup line 826), then the selection rule runs
function finish(
  top: Topology,
  before: CanvasState,
  after: CanvasState,
  action: Step,
): CanvasState {
  const next = settled(top, after);
  if (next === before) return before;
  const selection = kept(top, next, action);
  return selection === next.selection ? next : { ...next, selection };
}

// why: STORY-002-06 Context "Bulk rules" and question 2 — the same state as `transition`, with the
// number of entities hidden and the reason of a refusal
export function hide(
  state: CanvasState,
  action: Hide,
  graph: Graph,
  vocab: Vocab,
): HideResult {
  const top = topology(graph, vocab);
  const result = hideStep(top, state, action);
  return { ...result, state: finish(top, state, result.state, action) };
}

// why: SA §5 Engine — a transition is a pure function of its inputs and returns a new state, so the
// old state stays usable for Undo (FR-CANVAS-18)
export function transition(
  state: CanvasState,
  action: Action,
  graph: Graph,
  vocab: Vocab,
): CanvasState {
  const top = topology(graph, vocab);
  if (action.kind === "budget") return rebudget(top, state, action.budget);
  if (action.kind === "reset") return restart(top, state);
  if (action.kind === "selectEdge")
    return selectEdge(top, state, action.edge, action.anchor);
  return finish(top, state, step(top, state, action, vocab), action);
}
