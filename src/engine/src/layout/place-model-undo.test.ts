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
import type { IconMetrics } from "./drawn";
import { setLayout } from "./layout";
import { place, type PlaceChange } from "./place";
import { treeRowKeys } from "./tree";
import { undoEntries, type RowsAt } from "./undo";

// why: a reference model of the collapse of STORY-002-07 rule (a) (D21, D54, D59, D64, D65, D70,
// D84, D85, D87), written from the story text; after each collapse of long random action lists in
// five layouts, `place` must give the same records, positions back and retract spots
const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS: IconMetrics = {
  t0: { w: 24, h: 24, tier: "leaf" },
  t1: { w: 38, h: 36, tier: "group" },
};
const LAYOUTS = "force atomic bubbles tree-h tree-v".split(" ") as LayoutName[];
const ents = (n: DrawnNode) => ("members" in n ? n.members : [n.entity]);
// why: rule (a) D21 — the coordinate the event wrote comes back exactly, else the offset goes
const back = (now: number, a: number, b: number) =>
  now === b ? a : now - (b - a);

type Ctx = {
  state: CanvasState;
  ch: PlaceChange;
  was: Map<DrawnId, Point>;
  at: Map<DrawnId, Point>;
  stay: DrawnId[];
  holder: Map<string, DrawnId>;
  rows: RowsAt | null;
};

function setup(state: CanvasState, ch: PlaceChange, vocab: Vocab): Ctx {
  const was = new Map(state.positions);
  const inB = new Set(ch.before.nodes.map((n) => n.id));
  const holder = new Map(
    ch.before.nodes.flatMap((n) =>
      ents(n).map((e): [string, DrawnId] => [e, n.id]),
    ),
  );
  const at = new Map(
    ch.after.nodes.flatMap((n): [DrawnId, Point][] =>
      inB.has(n.id) && was.has(n.id) ? [[n.id, was.get(n.id) as Point]] : [],
    ),
  );
  const v = state.layout === "tree-v";
  const kept = new Map(state.treeRows?.rows);
  const keyOf = new Map(
    treeRowKeys(ch.after, vocab).map(([id, k]): [DrawnId, number] => [
      id,
      inB.has(id) ? (kept.get(id) ?? k) : k,
    ]),
  );
  const tree =
    (v || state.layout === "tree-h") && state.treeRows?.vertical === v;
  const rows = tree
    ? { vertical: v, keyOf, coord: new Map(state.treeRows?.keyCoord) }
    : null;
  return { state, ch, was, at, stay: [...at.keys()], holder, rows };
}

// why: rule (a) "Collapse of X" — the events of X and of every expansion inside the removed set,
// from the latest; then the D64 rows, the glide home and the nodes that come back
function collapse(c: Ctx, removed: DrawnNode[]) {
  const { ch, at, rows } = c;
  const action = ch.action as Extract<
    Action,
    { kind: "collapse" | "collapseGroup" }
  >;
  const group = action.kind === "collapseGroup";
  const key = group
    ? action.group
    : c.holder.has(action.id)
      ? `e:${action.id}`
      : null;
  const keys = new Set([...(key ? [key] : []), ...removed.map((n) => n.id)]);
  const drawnA = new Set(ch.after.nodes.flatMap(ents));
  for (const [id] of [
    ...c.state.homes,
    ...c.state.nudges,
    ...c.state.treeShifts,
  ]) {
    if (!id.startsWith("g:") || keys.has(id)) continue;
    const [anchor, pred, dir, type] = JSON.parse(id.slice(2)) as string[];
    const leaves = ch.before.nodes.filter((n) => {
      const touch = ch.before.edges.flatMap((e) =>
        [e.subject, e.object].filter((x) => x === n.id).map(() => e),
      );
      const [from, to] =
        dir === ">" ? [`e:${anchor}`, n.id] : [n.id, `e:${anchor}`];
      const e = touch[0];
      return (
        "entity" in n &&
        n.type === type &&
        touch.length === 1 &&
        e.predicate === pred &&
        e.subject === from &&
        e.object === to
      );
    });
    if (leaves.length > 0 && leaves.every((n) => !drawnA.has(ents(n)[0])))
      keys.add(id);
  }
  const mine = [...c.state.nudges, ...c.state.treeShifts].filter(([id]) =>
    keys.has(id),
  );
  for (const seq of [...new Set(mine.map(([, s]) => s))].sort(
    (a, b) => b - a,
  )) {
    const now = undoEntries(
      c.stay.map((id) => [id, at.get(id) as Point]),
      mine.filter(([, s]) => s === seq),
    );
    for (const [id, p] of now) at.set(id, p);
    for (const [, s, sh] of c.state.treeShifts) {
      if (s !== seq || !rows || rows.vertical !== sh.vertical) continue;
      for (const m of c.stay) {
        const row = sh.shiftOf.find(([k]) => k === rows.keyOf.get(m));
        const p = at.get(m) as Point;
        if (!row || sh.moved.some(([x]) => x === m)) continue;
        at.set(
          m,
          sh.vertical
            ? { x: p.x, y: back(p.y, row[1], row[2]) }
            : { x: back(p.x, row[1], row[2]), y: p.y },
        );
      }
      for (const [k, c0, c1] of sh.shiftOf)
        if (rows.coord.has(k))
          rows.coord.set(k, back(rows.coord.get(k) as number, c0, c1));
      for (const k of sh.inserted)
        if (![...rows.keyOf.values()].includes(k)) rows.coord.delete(k);
    }
  }
  const home = c.state.homes.find(([id]) => id === key);
  if (home && key && at.has(key))
    at.set(
      key,
      undoEntries([[key, at.get(key) as Point]], [[key, 0, [home]]])[0][1],
    );
  else if (home && key && ch.after.nodes.some((n) => n.id === key))
    at.set(key, { x: home[1], y: home[2] });
  for (const n of ch.after.nodes)
    if (!at.has(n.id) && c.was.has(n.id))
      at.set(n.id, c.was.get(n.id) as Point);
  const spot = group
    ? at.get(action.group)
    : key
      ? c.was.get(c.holder.get(action.id) as DrawnId)
      : undefined;
  return {
    keys,
    retract: removed.map((n): [DrawnId, Point] => [
      n.id,
      spot ?? (c.was.get(n.id) as Point),
    ]),
  };
}
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

const TYPES = ["t0", "t1", "t2", undefined];
const PREDICATES = ["contains", "ownedBy", "relatedTo", "p"];

// why: random graphs with self-loops, parallel predicates, containment for the tree rows and
// leaves for the groups; the first view in a random layout, Grouping and budget
function world(seed: number) {
  const r = random(seed);
  const ids = Array.from({ length: 6 + r.int(15) }, (_, k) => `n${k}`);
  const edges = Array.from(
    { length: ids.length + r.int(2 * ids.length) },
    () => [r.pick(ids), r.pick(PREDICATES), r.pick(ids)],
  );
  const nodes = ids.map((id) =>
    [id, r.pick(TYPES)].filter((x) => x !== undefined),
  );
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
  const lay = (s: CanvasState) =>
    setLayout(s, view(s), vocab, r.pick(LAYOUTS), METRICS);
  return { r, ids, graph, vocab, view, lay, state: lay(first) };
}
type World = ReturnType<typeof world>;

function act(w: World, s: CanvasState, view: Frontier): Action | null {
  const { r } = w;
  const nodes = view.nodes;
  const some = () => w.ids.filter(() => r.int(4) === 0);
  const of = <T>(l: T[], make: (x: T) => Action) =>
    l.length ? make(r.pick(l)) : null;
  const opened = nodes.flatMap((n) =>
    "entity" in n && n.opened > 0 ? [n.entity] : [],
  );
  const more = nodes.flatMap((n) =>
    "entity" in n && n.more > 0 ? [n.entity] : [],
  );
  const choices: (() => Action | null)[] = [
    () => ({ kind: "explore", id: r.pick(more.length ? more : w.ids) }),
    () => ({ kind: "explore", id: r.pick(more.length ? more : w.ids) }),
    () => ({ kind: "collapse", id: r.pick(opened.length ? opened : w.ids) }),
    () => ({ kind: "collapse", id: r.pick(opened.length ? opened : w.ids) }),
    () =>
      of(
        nodes.filter((n) => "members" in n),
        (n) => ({ kind: "expandGroup", group: n.id }),
      ),
    () =>
      of(s.expandedGroups, (k) => ({ kind: "collapseGroup", group: `g:${k}` })),
    () => ({ kind: "path", id: r.pick(w.ids) }),
    () => of(nodes, (n) => ({ kind: "hide", node: n.id })),
    () => ({ kind: "hideMany", ids: some() }),
    () => of(s.hidden, (e) => ({ kind: "restore", keys: [e.key] })),
    () => ({ kind: "showMany", ids: some() }),
    () => ({
      kind: "toggleType",
      type: r.pick(TYPES) ?? null,
      on: r.int(2) === 0,
    }),
    () => ({ kind: "showAllTypes" }),
    () => ({ kind: "grouping", grouping: r.pick([2, 5, "off"] as const) }),
    () => ({ kind: "reset" }),
    () => null,
  ];
  return r.pick(choices)();
}

// why: memo item 5 — the gate runs fewer worlds, so that its load does not disturb the timing
// project (ISSUE-007)
const WORLDS = 250;
const STEPS = 50;

describe("each collapse equals the reference model of rule (a)", () => {
  it(`${WORLDS} worlds × ${STEPS} steps in the five layouts`, () => {
    let collapses = 0;
    for (let seed = 0; seed < WORLDS; seed++) {
      const w = world(seed);
      let s = w.state;
      for (let k = 0; k < STEPS; k++) {
        const before = w.view(s);
        const action = act(w, s, before);
        if (action === null || action.kind === "reset") {
          s = w.lay(
            action === null ? s : transition(s, action, w.graph, w.vocab),
          );
          continue;
        }
        const next = transition(s, action, w.graph, w.vocab);
        const change = { action, before, after: w.view(next) };
        const got = place(next, change, w.vocab, METRICS);
        s = got.state;
        if (action.kind !== "collapse" && action.kind !== "collapseGroup")
          continue;
        const c = setup(next, change, w.vocab);
        const drawn = new Set(change.after.nodes.map((n) => n.id));
        const removed = change.before.nodes.filter((n) => !drawn.has(n.id));
        const { keys, retract } = collapse(c, removed);
        const why = `seed ${seed} step ${k} ${JSON.stringify(action)}`;
        const now = new Map(got.state.positions);
        expect(
          [...c.at].map(([id]) => [id, now.get(id)]),
          why,
        ).toEqual([...c.at]);
        for (const n of removed) expect(now.has(n.id), why).toBe(false);
        expect(got.retractTo, why).toEqual(retract);
        expect(got.state.homes, why).toEqual(
          next.homes.filter(([id]) => !keys.has(id)),
        );
        expect(got.state.nudges, why).toEqual(
          next.nudges.filter(([id]) => !keys.has(id)),
        );
        expect(got.state.treeShifts, why).toEqual(
          next.treeShifts.filter(([id]) => !keys.has(id)),
        );
        if (c.rows !== null && got.candidates.length === 0)
          expect(got.state.treeRows?.keyCoord, why).toEqual(
            [...c.rows.coord].sort((a, b) => a[0] - b[0]),
          );
        expect(got.state.seq).toBe(next.seq + 1);
        collapses++;
      }
    }
    console.log(`collapse model: ${collapses} collapses, 0 differences`);
    expect(collapses).toBeGreaterThan(1_200);
  }, 600_000);
});
