import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type {
  Action,
  CanvasState,
  DrawnId,
  LayoutName,
  Point,
} from "../state/canvasState";
import { frontier, type DrawnNode, type Frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab, type Vocab } from "../vocab/resolve";
import { boxOf, type IconMetrics } from "./drawn";
import { setLayout } from "./layout";
import { place, type PlaceResult } from "./place";

// why: SA v0.12 §6 rows 1, 2, 8 and 16, read from the SA and the story only (no model): checked
// after each step of long random action lists in the five layouts, and each list run twice (NF-3)
const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS: IconMetrics = {
  t0: { w: 24, h: 24, tier: "leaf" },
  t1: { w: 38, h: 36, tier: "group" },
};
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const TYPES = ["t0", "t1", "t2", undefined];
const PREDICATES = ["contains", "ownedBy", "relatedTo", "p"];
// why: rule (b) is 100 px; a row shift read back as a1 - a0 can differ by one unit in the last place
const BOUND = 100 + 1e-9;
const KEEP = new Set([
  "path",
  "restore",
  "showMany",
  "toggleType",
  "showAllTypes",
  "grouping",
  "hide",
  "hideMany",
]);

function random(seed: number) {
  let s = seed;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { int, pick: <T>(l: T[]) => l[int(l.length)] };
}

function world(seed: number) {
  const r = random(seed);
  const ids = Array.from({ length: 6 + r.int(25) }, (_, k) => `n${k}`);
  const edges = Array.from(
    { length: ids.length + r.int(2 * ids.length) },
    () => [r.pick(ids), r.pick(PREDICATES), r.pick(ids)],
  );
  const nodes = ids.map((id) => {
    const type = r.pick(TYPES);
    return type === undefined ? [id] : [id, type];
  });
  const result = normalize(
    { nodes, edges, view: r.int(2) === 0 ? { budget: 10 } : {} },
    { now: "2026-10-14" },
  );
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const first = {
    ...firstView(graph, vocab, payload, hash),
    grouping: r.pick([2, 5, "off"] as const),
  };
  const name = LAYOUTS[seed % LAYOUTS.length];
  const lay = (s: CanvasState) => setLayout(s, view(s), vocab, name, METRICS);
  return { r, ids, graph, vocab, view, lay, state: lay(first) };
}
type World = ReturnType<typeof world>;

function act(
  w: World,
  s: CanvasState,
  last: Action | null,
  view: Frontier,
): Action | null {
  const { r } = w;
  const nodes = view.nodes;
  const some = () => w.ids.filter(() => r.int(4) === 0);
  const opened = nodes.flatMap((n) =>
    "entity" in n && n.opened > 0 ? [n.entity] : [],
  );
  const more = nodes.flatMap((n) =>
    "entity" in n && n.more > 0 ? [n.entity] : [],
  );
  const groups = nodes.flatMap((n) => ("members" in n ? [n.id] : []));
  if (last?.kind === "explore" && r.int(3) === 0)
    return { kind: "collapse", id: last.id };
  if (last?.kind === "expandGroup" && r.int(3) === 0)
    return { kind: "collapseGroup", group: last.group };
  const choices: (() => Action | null)[] = [
    () => ({ kind: "explore", id: r.pick(more.length ? more : w.ids) }),
    () => ({ kind: "explore", id: r.pick(more.length ? more : w.ids) }),
    () => ({ kind: "collapse", id: r.pick(opened.length ? opened : w.ids) }),
    () =>
      groups.length ? { kind: "expandGroup", group: r.pick(groups) } : null,
    () =>
      s.expandedGroups.length
        ? { kind: "collapseGroup", group: `g:${r.pick(s.expandedGroups)}` }
        : null,
    () => ({ kind: "path", id: r.pick(w.ids) }),
    () => (nodes.length ? { kind: "hide", node: r.pick(nodes).id } : null),
    () => ({ kind: "hideMany", ids: some() }),
    () =>
      s.hidden.length
        ? { kind: "restore", keys: [r.pick(s.hidden).key] }
        : null,
    () => ({ kind: "showMany", ids: some() }),
    () => ({
      kind: "toggleType",
      type: r.pick(TYPES) ?? null,
      on: r.int(2) === 0,
    }),
    () => ({ kind: "showAllTypes" }),
    () => ({ kind: "grouping", grouping: r.pick([2, 5, "off"] as const) }),
    () => ({ kind: "reset" }),
  ];
  return r.pick(choices)();
}

// why: the STORY-002-07 Clearance bullet as an oracle: the ellipse, then the node box of the
// newcomer against the node box and the label box of the other node
function clear(vocab: Vocab, p: Point, a: DrawnNode, q: Point, b: DrawnNode) {
  const m = boxOf(a.type, vocab, METRICS);
  const o = boxOf(b.type, vocab, METRICS);
  const meets = (x0: number, x1: number, y0: number, y1: number) =>
    p.x - m.w / 2 < x1 &&
    p.x + m.w / 2 > x0 &&
    p.y - m.h / 2 < y1 &&
    p.y + m.h / 2 > y0;
  const w =
    Math.max(("members" in b ? 22 : Math.min(b.label.length, 22)) * 7.6, 60) +
    6;
  const top = q.y + o.h / 2 + 2;
  return (
    Math.hypot(0.65 * (p.x - q.x), p.y - q.y) > 58 &&
    !meets(q.x - o.w / 2, q.x + o.w / 2, q.y - o.h / 2, q.y + o.h / 2) &&
    !meets(q.x - w / 2, q.x + w / 2, top, top + 30)
  );
}

type Snap = { key: string; ids: DrawnId[]; at: [DrawnId, Point][] };

function snap(s: CanvasState, view: Frontier, key: string): Snap {
  const at = new Map(s.positions);
  const ids = view.nodes.map((n) => n.id);
  return { key, ids, at: ids.map((id) => [id, at.get(id) as Point]) };
}

// why: SA §6 rows 1, 8, 16 and STORY-002-07 rules (b)-(d) after one `place` call
function check(
  w: World,
  s: CanvasState,
  action: Action,
  before: Frontier,
  after: Frontier,
  out: PlaceResult,
) {
  const was = new Map(s.positions);
  const now = new Map(out.state.positions);
  expect(out.state.seq).toBe(s.seq + 1);
  for (const n of after.nodes) {
    const p = now.get(n.id) as Point;
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  }
  const numbers = (value: unknown): number[] =>
    typeof value === "number"
      ? [value]
      : Array.isArray(value) || (typeof value === "object" && value !== null)
        ? Object.values(value).flatMap(numbers)
        : [];
  const records = numbers([
    out.state.homes,
    out.state.nudges,
    out.state.treeShifts,
    out.state.treeRows,
  ]);
  expect(records.every(Number.isFinite)).toBe(true);
  const stay = after.nodes.filter(
    (n) => before.nodes.some((b) => b.id === n.id) && was.has(n.id),
  );
  const target = action.kind === "explore" ? `e:${action.id}` : null;
  const expand = action.kind === "explore" || action.kind === "expandGroup";
  for (const n of stay) {
    const a = was.get(n.id) as Point;
    const b = now.get(n.id) as Point;
    const far = Math.hypot(b.x - a.x, b.y - a.y);
    if (KEEP.has(action.kind) || (expand && s.layout === "bubbles"))
      expect(far).toBe(0);
    else if (expand && n.id !== target) expect(far).toBeLessThanOrEqual(BOUND);
  }
  if (out.crowded) return;
  // why: rule (b) — outside `crowded` no node is nudged; a D70 move item of the target can be there
  const added = out.state.nudges
    .slice(s.nudges.length)
    .flatMap(([, , items]) => items);
  if (expand) expect(added.filter(([id]) => id !== target)).toEqual([]);
  const node = new Map(after.nodes.map((n) => [n.id, n]));
  const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const starts = new Map(out.starts);
  const order = [
    ...new Set(out.candidates.map(([id]) => key(starts.get(id) as Point))),
  ];
  for (const [id] of out.candidates) {
    const rank = order.indexOf(key(starts.get(id) as Point));
    const earlier = out.candidates
      .filter(([o]) => order.indexOf(key(starts.get(o) as Point)) < rank)
      .map(([o]) => o);
    for (const other of [...stay.map((n) => n.id), ...earlier])
      expect(
        clear(
          w.vocab,
          now.get(id) as Point,
          node.get(id) as DrawnNode,
          now.get(other) as Point,
          node.get(other) as DrawnNode,
        ),
      ).toBe(true);
  }
}

function play(seed: number, steps: number) {
  const w = world(seed);
  let s = w.state;
  let last: Action | null = null;
  let stack: Snap[] = [];
  const log: unknown[] = [];
  let exact = 0;
  for (let k = 0; k < steps; k++) {
    const before = w.view(s);
    const action = act(w, s, last, before);
    last = action;
    if (action === null || action.kind === "reset") {
      s = w.lay(action === null ? s : transition(s, action, w.graph, w.vocab));
      stack = [];
      continue;
    }
    const next = transition(s, action, w.graph, w.vocab);
    const after = w.view(next);
    const out = place(next, { action, before, after }, w.vocab, METRICS);
    check(w, s, action, before, after, out);
    // why: a collapse undoes every event of its node (rule (a); STORY-002-04 takes what every explore
    // brought), so only a first explore (opened 0, no record yet) is an "expand" of SA §6 row 2
    const id = `e:${(action as { id?: string }).id}`;
    const records = [...s.homes, ...s.nudges, ...s.treeShifts].some(
      ([k]) => k === id,
    );
    const fresh =
      !records && before.nodes.some((n) => n.id === id && n.opened === 0);
    const key =
      action.kind === "explore" && fresh
        ? `e:${action.id}`
        : action.kind === "expandGroup"
          ? action.group
          : "";
    const undo =
      action.kind === "collapse"
        ? `e:${action.id}`
        : action.kind === "collapseGroup"
          ? action.group
          : "";
    const changed =
      JSON.stringify(after.nodes.map((n) => n.id)) !==
      JSON.stringify(before.nodes.map((n) => n.id));
    if (key !== "" && changed) stack.push(snap(s, before, key));
    else if (undo !== "" && stack.at(-1)?.key === undo) {
      const top = stack.pop() as Snap;
      expect(snap(out.state, after, undo)).toEqual(top);
      exact++;
    } else if (changed) stack = [];
    log.push(out);
    s = out.state;
  }
  return { log, exact };
}

describe("SA §6 rows 1, 2, 8 and 16 after each random step", () => {
  it("holds in 1,500 random lists of 45 steps, in the five layouts", () => {
    let exact = 0;
    let steps = 0;
    for (let seed = 0; seed < 1500; seed++) {
      const run = play(seed, 45);
      exact += run.exact;
      steps += run.log.length;
    }
    console.log(
      `random invariants: ${steps} place steps, ${exact} expand-then-collapse returns, all exact`,
    );
    expect(steps).toBeGreaterThan(50_000);
    expect(exact).toBeGreaterThan(1000);
  }, 600_000);

  it("gives the same results when a list runs twice (NF-3)", () => {
    for (let seed = 0; seed < 150; seed++)
      expect(JSON.stringify(play(seed, 45).log)).toBe(
        JSON.stringify(play(seed, 45).log),
      );
  }, 600_000);
});
