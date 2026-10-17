import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { boxOf, type IconMetrics } from "./drawn";
import { forceLayout } from "./force";
import { layout, setLayout } from "./layout";
import { place, type PlaceResult } from "./place";
import { treeLayout } from "./tree";

vi.mock("./force", async (load) => {
  const mod = await load<typeof import("./force")>();
  return { ...mod, forceLayout: vi.fn(mod.forceLayout) };
});
vi.mock("./tree", async (load) => {
  const mod = await load<typeof import("./tree")>();
  return { ...mod, treeLayout: vi.fn(mod.treeLayout) };
});
vi.mock("./layout", async (load) => {
  const mod = await load<typeof import("./layout")>();
  return { ...mod, layout: vi.fn(mod.layout), setLayout: vi.fn(mod.setLayout) };
});
const spyCalls = () =>
  [forceLayout, treeLayout, layout, setLayout]
    .map((fn) => vi.mocked(fn).mock.calls.length)
    .reduce((a, b) => a + b, 0);

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
const SLOW = 60_000;

function world(key: string, name: LayoutName) {
  const result = normalize(loadFixture(key).input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const first = firstView(graph, vocab, payload, hash);
  const state = setLayout(first, view(first), vocab, name, METRICS);
  const act = (s: CanvasState, action: Action): PlaceResult => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return place(next, change, vocab, METRICS);
  };
  return { vocab, state, view, act };
}

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;

// why: an oracle of the STORY-002-07 Clearance bullet written apart from `clear.ts`: the ellipse
// (> 58) and the node box of the newcomer against the node box and the label box of the other node
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

// why: rule (c) "Other nodes" — each newcomer against every node drawn before the event and the
// newcomers of an earlier origin; with `crowded` a newcomer may sit on the fallback ring instead
function landsClear(
  run: ReturnType<typeof world>,
  before: CanvasState,
  out: PlaceResult,
) {
  const nodes = new Map(run.view(out.state).nodes.map((n) => [n.id, n]));
  const old = run
    .view(before)
    .nodes.map((n) => n.id)
    .filter((id) => nodes.has(id));
  const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const order = [...new Set(out.starts.map(([, p]) => key(p)))];
  for (const [id, start] of out.starts) {
    const p = at(out.state, id);
    const earlier = out.starts.filter(
      ([, s]) => order.indexOf(key(s)) < order.indexOf(key(start)),
    );
    const others: DrawnId[] = [...old, ...earlier.map(([other]) => other)];
    const clear = others.every((other) =>
      clearOf(
        run.vocab,
        p,
        nodes.get(id) as DrawnNode,
        at(out.state, other),
        nodes.get(other) as DrawnNode,
      ),
    );
    const r = Math.hypot(p.x - start.x, p.y - start.y);
    const onRing = Math.abs((r - 110) / 64 - Math.round((r - 110) / 64)) < 1e-9;
    expect(clear || (out.crowded && onRing)).toBe(true);
  }
}

const unmoved = (a: CanvasState, b: CanvasState, ids: DrawnId[]) => {
  for (const id of ids) expect(at(b, id)).toEqual(at(a, id));
};

beforeEach(() => vi.clearAllMocks());

describe("S18 turn the type user on (s-access)", () => {
  it.each(LAYOUTS)(
    "%s starts each user on t_FCT_REVENUE and moves no node",
    (name) => {
      const run = world("s-access", name);
      const off = run.act(run.state, {
        kind: "toggleType",
        type: "user",
        on: false,
      }).state;
      vi.clearAllMocks();
      const on = run.act(off, { kind: "toggleType", type: "user", on: true });
      const drawn = run.view(on.state).nodes.map((n) => n.id);
      unmoved(
        off,
        on.state,
        run
          .view(off)
          .nodes.map((n) => n.id)
          .filter((id) => drawn.includes(id)),
      );
      const starts = new Map(on.starts);
      for (const id of ["e:u_0", "e:u_7", "e:u_12"])
        expect(starts.get(id)).toEqual(at(off, "e:t_FCT_REVENUE"));
      // why: with user off, the two user groups are leaves of t_FCT_REVENUE and form one group node;
      // turning user on splits it, and its members start at the group spot (rule (d))
      const group = run.view(off).nodes.find((n) => "members" in n);
      for (const id of ["e:ug_analytics", "e:ug_fin_admin"])
        expect(starts.get(id)).toEqual(at(off, group?.id as string));
      landsClear(run, off, on);
      expect(spyCalls()).toBe(0);
    },
  );
});

describe("S19 Show all types with user and user_group off (Force)", () => {
  it("starts on the neighbour drawn before, else on the phyllotaxis point", () => {
    const run = world("s-access", "force");
    const a = run.act(run.state, {
      kind: "toggleType",
      type: "user",
      on: false,
    }).state;
    const b = run.act(a, {
      kind: "toggleType",
      type: "user_group",
      on: false,
    }).state;
    expect(run.view(b).nodes.map((n) => n.id)).toEqual(["e:t_FCT_REVENUE"]);
    const all = run.act(b, { kind: "showAllTypes" });
    expect(at(all.state, "e:t_FCT_REVENUE")).toEqual(at(b, "e:t_FCT_REVENUE"));
    const starts = new Map(all.starts);
    for (const id of ["ug_analytics", "ug_fin_admin", "u_0", "u_7", "u_12"])
      expect(starts.get(`e:${id}`)).toEqual(at(b, "e:t_FCT_REVENUE"));
    const exec = starts.get("e:ug_exec") as Point;
    expect(exec.x).toBeCloseTo(-14.6, 2);
    expect(exec.y).toBeCloseTo(13.37, 2);
    landsClear(run, b, all);
  });
});

const STAR_KEEP = ["e:tag_pii", "e:tg_class"];

describe("S20 and S21 Grouping 2 → Off → 2 (s-star)", () => {
  it.each(LAYOUTS)(
    "%s keeps the drawn nodes and places the members",
    (name) => {
      const run = world("s-star", name);
      const groups = run.view(run.state).nodes.filter((n) => "members" in n);
      vi.clearAllMocks();
      const fine = run.act(run.state, { kind: "grouping", grouping: "off" });
      unmoved(run.state, fine.state, STAR_KEEP);
      expect(fine.starts).toHaveLength(312);
      const spotOf = new Map(
        groups.flatMap((g) =>
          ("members" in g ? g.members : []).map((m) => [
            `e:${m}`,
            at(run.state, g.id),
          ]),
        ),
      );
      for (const [id, p] of fine.starts) expect(p).toEqual(spotOf.get(id));
      landsClear(run, run.state, fine);
      const coarse = run.act(fine.state, { kind: "grouping", grouping: 2 });
      unmoved(fine.state, coarse.state, STAR_KEEP);
      for (const g of groups) {
        const members =
          "members" in g ? g.members.map((m) => at(fine.state, `e:${m}`)) : [];
        const x = members.reduce((s, p) => s + p.x, 0) / members.length;
        const y = members.reduce((s, p) => s + p.y, 0) / members.length;
        expect(at(coarse.state, g.id)).toEqual({ x, y });
      }
      const kept = new Map(coarse.state.positions);
      for (const [id] of fine.starts) expect(kept.has(id)).toBe(false);
      for (const field of ["homes", "treeShifts", "nudges"] as const)
        expect(coarse.state[field]).toEqual(fine.state[field]);
      expect(spyCalls()).toBe(0);
    },
    SLOW,
  );
});

describe("S24 hide u_7 (s-access first view)", () => {
  it.each(LAYOUTS)("%s moves no node and keeps the position of u_7", (name) => {
    const run = world("s-access", name);
    vi.clearAllMocks();
    const hid = run.act(run.state, { kind: "hide", node: "e:u_7" });
    expect(run.view(hid.state).nodes.some((n) => n.id === "e:u_7")).toBe(false);
    expect(hid.state.positions).toEqual(
      expect.arrayContaining(run.state.positions),
    );
    expect(hid.state.positions).toHaveLength(run.state.positions.length);
    for (const field of ["homes", "treeShifts", "nudges"] as const)
      expect(hid.state[field]).toEqual(run.state[field]);
    expect(spyCalls()).toBe(0);
  });
});
