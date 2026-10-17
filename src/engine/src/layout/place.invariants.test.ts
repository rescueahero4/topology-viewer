import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { packEnclose } from "d3-hierarchy";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type {
  Action,
  CanvasState,
  DrawnId,
  LayoutName,
  Point,
} from "../state/canvasState";
import { frontier, type DrawnNode } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab, type Vocab } from "../vocab/resolve";
import { bubbleRoom } from "./bubbles";
import { boxOf, drawnOf, type IconMetrics } from "./drawn";
import { setLayout } from "./layout";
import { place, type PlaceResult } from "./place";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
// why: rule (b) is 100 px; a shift a0 + s read back as a1 - a0 can differ from s by one unit in
// the last place, so the reading allows 1e-9 px of rounding (memo)
const BOUND = 100 + 1e-9;
const SLOW = 60_000;

function world(input: unknown, name: LayoutName, grouping?: "off") {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const opened = firstView(graph, vocab, payload, hash);
  const first = grouping === undefined ? opened : { ...opened, grouping };
  const state = setLayout(first, view(first), vocab, name, METRICS);
  const act = (s: CanvasState, action: Action): PlaceResult => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return place(next, change, vocab, METRICS);
  };
  return { vocab, state, view, act };
}

type World = ReturnType<typeof world>;

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;

// why: an oracle of the STORY-002-07 Clearance bullet written apart from `clear.ts`
function clearOf(
  vocab: Vocab,
  p: Point,
  mover: DrawnNode,
  q: Point,
  other: DrawnNode,
) {
  const a = boxOf(mover.type, vocab, METRICS);
  const b = boxOf(other.type, vocab, METRICS);
  if (Math.hypot(0.65 * (p.x - q.x), p.y - q.y) <= 58) return false;
  const meets = (x0: number, x1: number, y0: number, y1: number) =>
    p.x - a.w / 2 < x1 &&
    p.x + a.w / 2 > x0 &&
    p.y - a.h / 2 < y1 &&
    p.y + a.h / 2 > y0;
  if (meets(q.x - b.w / 2, q.x + b.w / 2, q.y - b.h / 2, q.y + b.h / 2))
    return false;
  const chars = "members" in other ? 22 : Math.min(other.label.length, 22);
  const w = Math.max(chars * 7.6, 60) + 6;
  const top = q.y + b.h / 2 + 2;
  return !meets(q.x - w / 2, q.x + w / 2, top, top + 30);
}

// why: SA v0.12 §6 row 1 with rule (c) — against every node drawn before the event (the target at
// its new spot) and the newcomers of an earlier origin, read with no distance filter
function newcomersClear(run: World, before: CanvasState, out: PlaceResult) {
  const nodes = new Map(run.view(out.state).nodes.map((n) => [n.id, n]));
  const old = run
    .view(before)
    .nodes.map((n) => n.id)
    .filter((id) => nodes.has(id));
  const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const order = [...new Set(out.starts.map(([, p]) => key(p)))];
  return out.starts.every(([id, start]) => {
    const earlier = out.starts.filter(
      ([, s]) => order.indexOf(key(s)) < order.indexOf(key(start)),
    );
    const others: DrawnId[] = [...old, ...earlier.map(([other]) => other)];
    return others.every((other) =>
      clearOf(
        run.vocab,
        at(out.state, id),
        nodes.get(id) as DrawnNode,
        at(out.state, other),
        nodes.get(other) as DrawnNode,
      ),
    );
  });
}

const expandable = (run: World, s: CanvasState) =>
  run.view(s).nodes.flatMap((n) => ("entity" in n && n.more > 0 ? [n] : []));

const CASES = ["s-access", "s-chain", "q-full-vocabulary"].flatMap((key) =>
  LAYOUTS.map((name): [string, LayoutName] => [key, name]),
);

describe("S1 each expand keeps SA §6 row 1", () => {
  it.each(CASES)("%s in %s", (key, name) => {
    const run = world(loadFixture(key).input, name);
    for (const node of expandable(run, run.state)) {
      const out = run.act(run.state, { kind: "explore", id: node.entity });
      for (const other of run.view(run.state).nodes) {
        if (other.id === node.id && name !== "bubbles") continue;
        const a = at(run.state, other.id);
        const b = at(out.state, other.id);
        const far = Math.hypot(b.x - a.x, b.y - a.y);
        if (name === "bubbles") expect(far).toBe(0);
        else expect(far).toBeLessThanOrEqual(BOUND);
      }
      if (out.crowded) continue;
      expect(newcomersClear(run, run.state, out)).toBe(true);
      // why: D96 (1) — a zero-move item is a kept position of rule (h)(4), not a nudge
      const kept = run.state.nudges.length;
      expect(out.state.nudges.slice(0, kept)).toEqual(run.state.nudges);
      const nudged = out.state.nudges
        .slice(kept)
        .flatMap(([, , items]) => items)
        .filter(([, x0, y0, x1, y1]) => x0 !== x1 || y0 !== y1);
      expect(nudged).toEqual([]);
    }
  });
});

describe("S2 expand then collapse is exact", () => {
  it.each(CASES)("%s in %s", (key, name) => {
    const run = world(loadFixture(key).input, name);
    for (const node of expandable(run, run.state)) {
      const out = run.act(run.state, { kind: "explore", id: node.entity });
      const back = run.act(out.state, { kind: "collapse", id: node.entity });
      expect(back.state.positions).toEqual(run.state.positions);
      expect(run.view(back.state)).toEqual(run.view(run.state));
    }
  });
});

const PAIRS: [string, string][] = [
  ["ug_fin_admin", "t_FCT_PIPELINE"],
  ["ug_fin_admin", "ug_analytics"],
];

function entryIds(s: CanvasState, key: DrawnId): Set<DrawnId> {
  const ids = new Set<DrawnId>();
  for (const [k, , items] of s.nudges)
    if (k === key) items.forEach(([id]) => ids.add(id));
  for (const [k, , shift] of s.treeShifts)
    if (k === key) shift.moved.forEach(([id]) => ids.add(id));
  for (const [id] of s.homes) if (id === key) ids.add(id);
  return ids;
}

function more(run: World, s: CanvasState, id: string) {
  const node = run.view(s).nodes.find((n) => "entity" in n && n.entity === id);
  return node === undefined ? 0 : node.more;
}

describe("S3 two expands and both collapse orders (s-access)", () => {
  it.each(LAYOUTS)("%s returns every node", (name) => {
    const run = world(loadFixture("s-access").input, name);
    for (const [x, y] of PAIRS) {
      expect(more(run, run.state, x)).toBeGreaterThan(0);
      const one = run.act(run.state, { kind: "explore", id: x }).state;
      expect(more(run, one, y)).toBeGreaterThan(0);
      const two = run.act(one, { kind: "explore", id: y }).state;
      const play = (order: string[]) =>
        order.reduce(
          (s, id) => run.act(s, { kind: "collapse", id }).state,
          two,
        );
      const inOrder = play([y, x]);
      expect(inOrder.positions).toEqual(run.state.positions);
      const ends = [inOrder];
      if (y === "ug_analytics") {
        const outOfOrder = play([x, y]);
        const xs = entryIds(two, `e:${x}`);
        const both = [...entryIds(two, `e:${y}`)].filter((id) => xs.has(id));
        for (const [id, p] of run.state.positions) {
          const q = at(outOfOrder, id);
          if (both.includes(id))
            expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(1e-9);
          else expect(q).toEqual(p);
        }
        ends.push(outOfOrder);
      }
      for (const end of ends)
        expect([end.homes, end.treeShifts, end.nudges]).toEqual([[], [], []]);
    }
  });
});

function ringOf(o: Point, p: Point) {
  const r = Math.hypot(p.x - o.x, p.y - o.y);
  for (let r0 = 110; r0 <= 530; r0 += 35)
    if (
      r >= r0 - 1e-9 &&
      Math.abs((r - r0) / 64 - Math.round((r - r0) / 64)) < 1e-9
    )
      return true;
  return false;
}

describe("S7 Bubbles exploration of s-designed (Grouping Off)", () => {
  it("joins the bubble of the type or starts next to the origin", () => {
    const run = world(loadFixture("s-designed").input, "bubbles", "off");
    const out = run.act(run.state, { kind: "explore", id: "sup_cell" });
    const origin = at(run.state, "e:sup_cell");
    expect(out.starts.map(([id]) => id).sort()).toEqual([
      "e:site_JP",
      "e:sup_co",
      "e:sup_gr",
      "e:sup_li",
      "e:sup_ni",
    ]);
    for (const [, p] of out.starts) expect(p).toEqual(origin);
    const drawn = run.view(run.state);
    const laid = drawnOf(drawn, run.vocab, METRICS);
    const suppliers = laid.nodes.filter((n) => n.type === "supplier");
    const e = packEnclose(
      suppliers.map((n) => ({ ...at(run.state, n.id), r: bubbleRoom(n) })),
    );
    for (const id of ["e:sup_li", "e:sup_co", "e:sup_ni", "e:sup_gr"]) {
      const p = at(out.state, id);
      expect(
        Math.hypot(p.x - e.x, p.y - e.y) <= e.r + 400 || ringOf(origin, p),
      ).toBe(true);
    }
    expect(ringOf(origin, at(out.state, "e:site_JP"))).toBe(true);
    if (!out.crowded) expect(newcomersClear(run, run.state, out)).toBe(true);
    for (const [id, p] of run.state.positions)
      expect(at(out.state, id)).toEqual(p);
  });

  it("starts a new type next to its origin", () => {
    const input = loadFixture("s-designed").input as {
      nodes: object[];
      edges: object[];
    };
    const auditors = {
      ...input,
      nodes: [
        ...input.nodes,
        ...["aud_1", "aud_2"].map((id) => ({ id, type: "auditor", label: id })),
      ],
      edges: [
        ...input.edges,
        ...["aud_1", "aud_2"].map((s) => ({
          subject: s,
          predicate: "audits",
          object: "prd_cell",
        })),
      ],
    };
    const run = world(auditors, "bubbles", "off");
    const out = run.act(run.state, { kind: "explore", id: "prd_cell" });
    const origin = at(run.state, "e:prd_cell");
    for (const id of ["e:aud_1", "e:aud_2"]) {
      expect(new Map(out.starts).get(id)).toEqual(origin);
      expect(ringOf(origin, at(out.state, id))).toBe(true);
    }
    if (!out.crowded) expect(newcomersClear(run, run.state, out)).toBe(true);
    for (const [id, p] of run.state.positions)
      expect(at(out.state, id)).toEqual(p);
  });
});

describe("S9 restore from Hidden (s-access)", () => {
  it.each(LAYOUTS)(
    "%s moves no drawn node and starts on the origin",
    (name) => {
      const run = world(loadFixture("s-access").input, name);
      const hid = run.act(run.state, {
        kind: "hide",
        node: "e:ug_analytics",
      }).state;
      expect(hid.hidden).toHaveLength(1);
      const back = run.act(hid, { kind: "restore", keys: ["e:ug_analytics"] });
      for (const node of run.view(hid).nodes)
        expect(at(back.state, node.id)).toEqual(at(hid, node.id));
      const pairs = new Map(back.state.origins);
      expect(back.starts.length).toBeGreaterThan(0);
      for (const [id, p] of back.starts)
        expect(p).toEqual(at(hid, `e:${pairs.get(id.slice(2))}`));
    },
    SLOW,
  );
});
