import type { Graph, Payload } from "../data/normalize";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import { place, type PlaceResult } from "../layout/place";
import type {
  Action,
  CanvasState,
  DrawnId,
  LayoutName,
} from "../state/canvasState";
import type { Vocab } from "../vocab/resolve";
import { fadeSet } from "./focus";
import { frontier as frontierOf, type Frontier } from "./frontier";
import { homeOf } from "./home";
import { firstView, transition } from "./story";

export type AroundExit =
  | { kind: "off" }
  | { kind: "focus"; id: DrawnId }
  | { kind: "action"; action: Action }
  | { kind: "layout"; name: LayoutName }
  | {
      kind: "data";
      graph: Graph;
      vocab: Vocab;
      payload: Payload;
      hash: number;
    };

export type Placed = Pick<PlaceResult, "starts" | "retractTo" | "crowded">;

export type ExitResult = {
  steps: CanvasState[];
  state: CanvasState;
  placed: Placed | null;
};

const ALWAYS = new Set<Action["kind"]>([
  "toggleType",
  "entitiesOff",
  "showAllTypes",
  "grouping",
  "restore",
  "showMany",
]);
// why: lead decision D99 (2) — a new scope ends the grouping in place, with no glide
const IN_PLACE = new Set<Action["kind"]>(["budget", "reset"]);

type Run = { graph: Graph; vocab: Vocab; metrics: IconMetrics };

// why: story Context exits 4-10 (D66, D68) — the glide home, then the transition on `home` and the
// STORY-002-07 placement of its change. D100: every other change is exit 9 or 10 when the drawn id
// of the root is not drawn after it (a hide, a collapse, an explore or a group expand, a path)
function actionExit(
  state: CanvasState,
  root: DrawnId,
  action: Action,
  frontier: Frontier,
  { graph, vocab, metrics }: Run,
): ExitResult | null {
  if (!ALWAYS.has(action.kind)) {
    if (IN_PLACE.has(action.kind)) return null;
    const next = transition(state, action, graph, vocab);
    if (frontierOf(next, graph, vocab).nodes.some((n) => n.id === root))
      return null;
  }
  const home = homeOf(state, frontier);
  const next = transition(home, action, graph, vocab);
  const before = frontierOf(home, graph, vocab);
  const change = { action, before, after: frontierOf(next, graph, vocab) };
  const placed = place(next, change, vocab, metrics);
  const { starts, retractTo, crowded } = placed;
  return {
    steps: [home, placed.state],
    state: placed.state,
    placed: { starts, retractTo, crowded },
  };
}

const only = (step: CanvasState): ExitResult => ({
  steps: [step],
  state: step,
  placed: null,
});

// why: FR-CANVAS-14, SA §6 rows 9, 10, NF-8 (D56, D66) — every exit result comes from here: the glide
// home first (exits 1-10), in place for a layout request and new data (exits 11, 12); the last
// step is the returned state. A focus on a node that is not faded is not an exit
export function exitAround(
  state: CanvasState,
  action: AroundExit,
  frontier: Frontier,
  graph: Graph,
  vocab: Vocab,
  metrics: IconMetrics,
): ExitResult {
  const none: ExitResult = { steps: [], state, placed: null };
  const around = state.around;
  if (around === null) return none;
  switch (action.kind) {
    case "off":
      return only(homeOf(state, frontier));
    case "focus": {
      if (!fadeSet(state, frontier).some((item) => item.id === action.id))
        return none;
      const home = homeOf(state, frontier);
      const select = { kind: "select", node: action.id } as const;
      const effect = transition(home, select, graph, vocab);
      return { steps: [home, effect], state: effect, placed: null };
    }
    case "action": {
      const run = { graph, vocab, metrics };
      return (
        actionExit(state, around.root, action.action, frontier, run) ?? none
      );
    }
    case "layout": {
      const s = { ...state, around: null };
      const view = frontierOf(s, graph, vocab);
      return only(setLayout(s, view, vocab, action.name, metrics));
    }
    case "data": {
      const { graph: g, vocab: v, payload, hash } = action;
      const f = firstView(g, v, payload, hash);
      return only(setLayout(f, frontierOf(f, g, v), v, state.layout, metrics));
    }
  }
}
