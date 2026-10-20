import {
  collapseAround,
  drawnIdOf,
  exitAround,
  expandAround,
  fadeSet,
  frontier,
  groupAround,
  hide,
  place,
  setLayout,
  transition,
  type Action,
  type AroundExit,
  type CanvasState,
  type DrawnNode,
  type Frontier,
  type Graph,
  type LayoutName,
  type Vocab,
} from "@qdic-topology/engine";
import { iconMetrics as M } from "@qdic-topology/renderer";

// why: STORY-003-07 S17 (A) — the reference router of `around-random.test.ts`, moved here with no
// behaviour change (STORY-003-06b T3, the 400-line limit); only tests import it
export type W = { graph: Graph; vocab: Vocab; known: Set<string> };
// `home`: the glide-home step of an exit with 2 steps (build-time item (c))
export type Ref = { state: CanvasState; front: Frontier; home?: CanvasState };
export type Call = { name: string; arg: unknown };
const isGroup = (n: DrawnNode) => "members" in n;
const entityOf = (n: DrawnNode) => ("entity" in n ? n.entity : "");
const expandOf = (n: DrawnNode): Action =>
  isGroup(n)
    ? { kind: "expandGroup", group: n.id }
    : { kind: "explore", id: entityOf(n) };
const node = (r: Ref, id: unknown) => r.front.nodes.find((n) => n.id === id);
const sorted = (list: string[]) => [...list].sort().join("\n");
const faded = (r: Ref, id: unknown) =>
  fadeSet(r.state, r.front).some((f) => f.id === id);
const at = (w: W, state: CanvasState, home?: CanvasState): Ref => ({
  state,
  front: frontier(state, w.graph, w.vocab),
  home,
});

// The reference router: from the story Context "Routing while grouped" and STORY-003-05, not
// imported (LEARNINGS 26). `exitAround` gives no step when the canvas is not grouped.
function exit(w: W, r: Ref, e: AroundExit): Ref | null {
  const x = exitAround(r.state, e, r.front, w.graph, w.vocab, M);
  if (x.steps.length === 0) return null;
  return at(w, x.state, x.steps.length === 2 ? x.steps[0] : undefined);
}
const NONE = "select selectEdge toggleFamily togglePredicate approach";
function route(w: W, r: Ref, a: Action, next: CanvasState): Ref | null {
  if (next === r.state) return null;
  const after = frontier(next, w.graph, w.vocab);
  const keys = (s: CanvasState) => sorted(s.hidden.map((h) => h.key));
  const ids = (f: Frontier) => sorted(f.nodes.map((n) => n.id));
  if (a.kind === "showMany" && ids(after) === ids(r.front))
    if (keys(next) === keys(r.state)) return null;
  if (NONE.split(" ").includes(a.kind)) return { state: next, front: after };
  if (a.kind === "budget" || a.kind === "reset")
    return at(w, setLayout(next, after, w.vocab, next.layout, M));
  const change = { action: a, before: r.front, after };
  const grouped = r.state.around !== null;
  const expand = a.kind === "explore" || a.kind === "expandGroup";
  const fold = a.kind === "collapse" || a.kind === "collapseGroup";
  const fn =
    grouped && expand ? expandAround : grouped && fold ? collapseAround : place;
  return { state: fn(next, change, w.vocab, M).state, front: after };
}
const step = (w: W, r: Ref, a: Action) =>
  exit(w, r, { kind: "action", action: a }) ??
  route(w, r, a, transition(r.state, a, w.graph, w.vocab));

const selectEntity = (w: W, s: CanvasState, id: string) => {
  const n = frontier(s, w.graph, w.vocab).nodes.find(
    (x) => x.id === drawnIdOf(s, w.graph, w.vocab, id),
  );
  if (n === undefined || isGroup(n)) return s;
  return transition(s, { kind: "select", entity: id }, w.graph, w.vocab);
};
function focusRef(w: W, r: Ref, id: string): Ref | null {
  if (!w.known.has(id)) return null;
  const n = node(r, drawnIdOf(r.state, w.graph, w.vocab, id));
  if (n !== undefined && !isGroup(n))
    return faded(r, n.id)
      ? exit(w, r, { kind: "focus", id: n.id })
      : step(w, r, { kind: "select", node: n.id });
  const a: Action =
    n === undefined
      ? { kind: "path", id }
      : { kind: "expandGroup", group: n.id };
  const ex = exit(w, r, { kind: "action", action: a });
  if (ex !== null) return at(w, selectEntity(w, ex.state, id), ex.home);
  const next = transition(r.state, a, w.graph, w.vocab);
  const to = drawnIdOf(next, w.graph, w.vocab, id);
  if (next === r.state || to === null) return null;
  const out = route(w, r, a, next) as Ref;
  if (faded(out, to)) {
    const x = exit(w, out, { kind: "focus", id: to }) as Ref;
    return { state: x.state, front: x.front };
  }
  return { ...out, state: selectEntity(w, out.state, id) };
}

function hideRef(w: W, r: Ref, ids: string[]): Ref | null {
  const nodes = [...new Set(ids)].flatMap((id) => node(r, id) ?? []);
  if (nodes.length === 0) return null;
  const many = nodes.flatMap((x) => ("members" in x ? x.members : [x.entity]));
  const a: Extract<Action, { kind: "hide" | "hideMany" }> =
    nodes.length === 1
      ? { kind: "hide", node: nodes[0].id }
      : { kind: "hideMany", ids: many };
  const ex = exit(w, r, { kind: "action", action: a });
  if (ex !== null) return ex;
  const out = hide(r.state, a, w.graph, w.vocab);
  return out.refused !== undefined ? null : route(w, r, a, out.state);
}

export const anchorOf = ({ selection: s }: CanvasState) =>
  s === null ? null : "edge" in s ? s.anchor : s.node;
function groupRef(w: W, r: Ref, on: unknown): Ref | null {
  if (on === false) return exit(w, r, { kind: "off" });
  const root = anchorOf(r.state);
  if (on !== true || root === null || r.state.around?.root === root)
    return null;
  const next = groupAround(r.state, r.front, root, M);
  return next === r.state ? null : at(w, next);
}

export function refOf(w: W, r: Ref, c: Call): Ref | null {
  const n = node(r, c.arg);
  const list = c.arg as string[];
  if (c.name === "expand")
    return n === undefined ? null : step(w, r, expandOf(n));
  if (c.name === "collapse") {
    if (n !== undefined && !isGroup(n))
      return step(w, r, { kind: "collapse", id: entityOf(n) });
    const member = r.front.nodes.some((x) => "group" in x && x.group === c.arg);
    if (!String(c.arg).startsWith("g:") || (n === undefined && !member))
      return null;
    return step(w, r, { kind: "collapseGroup", group: c.arg as string });
  }
  if (c.name === "hide") return hideRef(w, r, list);
  if (c.name === "restore") {
    const keys = list.filter((k) => r.state.hidden.some((h) => h.key === k));
    return keys.length === 0
      ? null
      : step(w, r, { kind: "restore", keys: [...new Set(keys)] });
  }
  if (c.name === "reveal") {
    const ids = [...new Set(list)].filter((id) => w.known.has(id));
    return ids.length === 0 ? null : step(w, r, { kind: "showMany", ids });
  }
  if (c.name === "focus") return focusRef(w, r, c.arg as string);
  if (c.name === "select") {
    if (c.arg === null) return step(w, r, { kind: "select", node: null });
    if (n !== undefined)
      return faded(r, n.id)
        ? exit(w, r, { kind: "focus", id: n.id })
        : step(w, r, { kind: "select", node: n.id });
    return null;
  }
  if (c.name === "groupAroundRoot") return groupRef(w, r, c.arg);
  if (c.name === "setApproach")
    return step(w, r, { kind: "approach", approach: c.arg as "active" });
  if (c.name === "setLayout") {
    const name = c.arg as LayoutName;
    if (r.state.around !== null) return exit(w, r, { kind: "layout", name });
    return at(w, setLayout(r.state, r.front, w.vocab, name, M));
  }
  return step(w, r, c.arg as Action);
}
