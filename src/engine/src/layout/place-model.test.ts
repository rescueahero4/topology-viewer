import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type {
  Action,
  CanvasState,
  DrawnId,
  LayoutName,
  MoveItem,
  NudgeEntry,
  Point,
} from "../state/canvasState";
import { frontier, type DrawnNode } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab, type Vocab } from "../vocab/resolve";
import {
  centroid,
  moveOut,
  placeArcs,
  placeInBubbles,
  type Newcomer,
} from "./arcs";
import { bodyOf, roomOf, type Placed } from "./clear";
import { drawnOf, type IconMetrics } from "./drawn";
import { setLayout } from "./layout";
import { nudge } from "./nudge";
import { place, type PlaceChange, type PlaceResult } from "./place";
import { inRows, shiftRows } from "./rows";
import { treeRowKeys } from "./tree";

// why: a reference model of the `place` rules (STORY-002-07 rules (a)-(g), Origins), written from
// the story text over the primitives that `place-search*.test.ts` and `place-undo.test.ts` check;
// `place` must give the same result after each step of long random action lists in five layouts
const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS: IconMetrics = {
  t0: { w: 24, h: 24, tier: "leaf" },
  t1: { w: 38, h: 36, tier: "group" },
};
const LAYOUTS = "force atomic bubbles tree-h tree-v".split(" ") as LayoutName[];
const ents = (n: DrawnNode) => ("members" in n ? n.members : [n.entity]);
const mid = (l: Placed[]) => centroid(l.map((p) => p.at));

type Ctx = {
  state: CanvasState;
  ch: PlaceChange;
  vocab: Vocab;
  was: Map<DrawnId, Point>;
  at: Map<DrawnId, Point>;
  stay: DrawnId[];
  holder: Map<string, DrawnId>;
  rows: Parameters<typeof inRows>[0] | null;
};

// why: STORY-002-07 Origins and rule (d), in this order: the explore target or the group spot, the
// mean spot of members drawn before (fixed), the group spot of a member, the first neighbour drawn
// before (a type turned on), the `origins` chain, the phyllotaxis point
function startOf(
  c: Ctx,
  n: DrawnNode,
  spot: Point | undefined,
  seed: () => number,
) {
  const pairs = new Map(c.state.origins);
  const posOf = (e: string) =>
    c.holder.has(e) ? c.was.get(c.holder.get(e) as DrawnId) : undefined;
  const old = ents(n).flatMap((e) => posOf(e) ?? []);
  if (spot) return { o: spot, fixed: false };
  if (old.length && "members" in n) return { o: centroid(old), fixed: true };
  if (old.length) return { o: old[0], fixed: false };
  const kind = c.ch.action.kind;
  let o: Point | undefined;
  if (kind === "toggleType" || kind === "showAllTypes") {
    const near = c.ch.after.edges.flatMap((e) =>
      e.subject === n.id ? [e.object] : e.object === n.id ? [e.subject] : [],
    );
    const first = c.ch.after.nodes.find(
      (m) => m.id !== n.id && near.includes(m.id) && c.stay.includes(m.id),
    );
    o = first && c.was.get(first.id);
  } else
    for (
      let e = pairs.get(ents(n)[0]), k = 0;
      e && !o && k < 999;
      e = pairs.get(e), k++
    )
      o = posOf(e);
  if (o) return { o, fixed: false };
  const i = seed(),
    r = 14 * Math.sqrt(i + 1);
  return {
    o: { x: r * Math.cos(i * 2.39996), y: r * Math.sin(i * 2.39996) },
    fixed: false,
  };
}

function model(state: CanvasState, ch: PlaceChange, vocab: Vocab): PlaceResult {
  const { action } = ch;
  const kind = action.kind;
  const laid = drawnOf(ch.after, vocab, METRICS);
  const was = new Map(state.positions);
  const inB = new Set(ch.before.nodes.map((n) => n.id));
  const inA = new Set(ch.after.nodes.map((n) => n.id));
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
  const stay = [...at.keys()];
  const v = state.layout === "tree-v";
  const kept = new Map(state.treeRows?.rows);
  const rows =
    (v || state.layout === "tree-h") && state.treeRows?.vertical === v
      ? {
          vertical: v,
          coord: new Map(state.treeRows.keyCoord),
          keyOf: new Map(
            treeRowKeys(ch.after, vocab).map(([id, k]): [DrawnId, number] => [
              id,
              inB.has(id) ? (kept.get(id) ?? k) : k,
            ]),
          ),
        }
      : null;
  const c: Ctx = { state, ch, vocab, was, at, stay, holder, rows };
  const removed = ch.before.nodes.filter((n) => !inA.has(n.id));
  let homes = state.homes;
  const pairs = new Map(state.origins);
  let ev: { key: DrawnId; spot?: Point; target: DrawnId | null } | null = null;
  if (kind === "expandGroup")
    ev = { key: action.group, spot: was.get(action.group), target: null };
  const added =
    kind === "explore"
      ? ch.after.nodes.flatMap(ents).find((e) => !holder.has(e) && pairs.has(e))
      : undefined;
  if (added !== undefined) {
    const t = pairs.get(added) as string;
    ev = {
      key: `e:${t}`,
      spot: holder.has(t) ? was.get(holder.get(t) as DrawnId) : undefined,
      target: at.has(`e:${t}`) ? `e:${t}` : null,
    };
  }
  const starts: [DrawnId, Point][] = [];
  const list: Newcomer[] = [];
  let seed = ch.before.nodes.length;
  ch.after.nodes.forEach((n, i) => {
    if (inB.has(n.id) && was.has(n.id)) return;
    const settled = at.get(n.id);
    if (settled) return void starts.push([n.id, settled]);
    const { o, fixed } = startOf(c, n, ev?.spot, () => seed++);
    starts.push([n.id, o]);
    if (fixed) at.set(n.id, o);
    else
      list.push({
        id: n.id,
        node: laid.nodes[i],
        origin: o,
        spot: null,
        tries: 0,
        crowded: false,
      });
  });
  const shifted = rows && shiftRows(rows, list, at, stay, ev ? 100 : 0);
  const placed = (without?: DrawnId | null): Placed[] =>
    ch.after.nodes.flatMap((n, i) =>
      at.has(n.id) && n.id !== without
        ? [{ node: laid.nodes[i], at: at.get(n.id) as Point }]
        : [],
    );
  const all = placed();
  const target = ev?.target ?? null;
  let C: Point | null = null;
  if (list.length === 0) C = null;
  else if (rows) inRows(rows, list, all);
  else if (state.layout === "bubbles")
    placeInBubbles(list, roomOf(all), all, mid(all));
  else if (target === null)
    placeArcs(list, roomOf(all), mid(all), state.layout);
  else {
    const room = roomOf(placed(target));
    const T = all.find((p) => p.node.id === target) as Placed;
    C = moveOut(T, list, room, mid(placed(target)), state.layout);
    if (!C)
      placeArcs(
        list,
        (room.add(bodyOf(T.node, T.at)), room),
        mid(all),
        state.layout,
      );
  }
  for (const n of list) at.set(n.id, n.spot as Point);
  const items: MoveItem[] = [];
  if (C && target) {
    const from = at.get(target) as Point;
    at.set(target, C);
    if (!homes.some(([id]) => id === target))
      homes = [...homes, [target, from.x, from.y, C.x, C.y]];
    else if (from.x !== C.x || from.y !== C.y)
      items.push([target, from.x, from.y, C.x, C.y]);
  }
  if (ev && state.layout !== "bubbles") {
    const room = (id: DrawnId) =>
      100 - (shifted?.shiftOf.get(rows?.keyOf.get(id) as number) ?? 0);
    const movers = stay
      .filter((id) => id !== target)
      .map((id) => ({ id, at: at.get(id) as Point, room: room(id) }));
    for (const it of nudge(
      movers,
      list.map((n) => n.spot as Point),
    )) {
      at.set(it[0], { x: it[3], y: it[4] });
      items.push(it);
    }
  }
  const opened = (n: DrawnNode) =>
    "members" in n && state.expandedGroups.includes(n.id.slice(2));
  for (const n of removed) {
    const p = was.get(n.id);
    if (opened(n) && p)
      homes = [
        ...homes.filter(([id]) => id !== n.id),
        [n.id, p.x, p.y, p.x, p.y],
      ];
  }
  const drawnA = new Set(ch.after.nodes.flatMap(ents));
  const gone = (n: DrawnNode) =>
    kind !== "hide" &&
    kind !== "hideMany" &&
    (["grouping", "collapse", "collapseGroup"].includes(kind) ||
      opened(n) ||
      !ents(n).some((e) => drawnA.has(e)));
  const drop = new Set(removed.filter(gone).map((n) => n.id));
  const shift = ev ? shifted?.entry : undefined;
  const seq = state.seq + 1;
  const { nudges, treeShifts } = state;
  const rowsOut = rows && {
    vertical: v,
    rows: ch.after.nodes.map((n): [DrawnId, number] => [
      n.id,
      rows.keyOf.get(n.id) as number,
    ]),
    keyCoord: [...rows.coord].sort((a, b) => a[0] - b[0]),
  };
  return {
    state: {
      ...state,
      seq,
      positions: [
        ...ch.after.nodes.map((n): [DrawnId, Point] => [
          n.id,
          at.get(n.id) as Point,
        ]),
        ...state.positions.filter(([id]) => !inA.has(id) && !drop.has(id)),
      ],
      treeRows: rowsOut ?? state.treeRows,
      homes,
      nudges:
        items.length && ev
          ? [...nudges, [ev.key, seq, items] as NudgeEntry]
          : nudges,
      treeShifts:
        shift && ev ? [...treeShifts, [ev.key, seq, shift]] : treeShifts,
    },
    starts,
    retractTo: [],
    crowded: list.some((n) => n.crowded),
    candidates: list.map((n) => [n.id, n.tries]),
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

function act(w: World, s: CanvasState): Action | null {
  const { r } = w;
  const nodes = w.view(s).nodes;
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

const WORLDS = 1700;
const STEPS = 50;

describe("place equals the reference model after each random step", () => {
  it(`${WORLDS} worlds × ${STEPS} steps in the five layouts`, () => {
    let steps = 0;
    for (let seed = 0; seed < WORLDS; seed++) {
      const w = world(seed);
      let s = w.state;
      for (let k = 0; k < STEPS; k++) {
        const action = act(w, s);
        if (action === null || action.kind === "reset") {
          s = w.lay(
            action === null ? s : transition(s, action, w.graph, w.vocab),
          );
          continue;
        }
        const next = transition(s, action, w.graph, w.vocab);
        const change = { action, before: w.view(s), after: w.view(next) };
        const got = place(next, change, w.vocab, METRICS);
        s = got.state;
        // why: `place-model-undo.test.ts` holds the model of a collapse
        if (action.kind === "collapse" || action.kind === "collapseGroup")
          continue;
        const want = model(next, change, w.vocab);
        expect(got, `seed ${seed} step ${k} ${JSON.stringify(action)}`).toEqual(
          want,
        );
        steps++;
      }
    }
    console.log(`placement model: ${steps} place steps, 0 differences`);
    expect(steps).toBeGreaterThan(50_000);
  }, 600_000);
});
