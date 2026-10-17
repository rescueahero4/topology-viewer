import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { generate, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { beginDrag, dragStep, release, type DragCtx } from "../interact/drag";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import { place } from "../layout/place";
import type { Action, CanvasState, DrawnId, Point } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { exitAround } from "./exit";
import { collapseAround, expandAround, groupAround } from "./focus";
import { frontier } from "./frontier";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const LEAF = { w: 24, h: 24, tier: "leaf" } as const;
const METRICS: IconMetrics = {
  ...(JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
      "utf8",
    ),
  ) as IconMetrics),
  tl: LEAF,
};
const ROOT = "e:t_FCT_REVENUE";
const FIN = "e:ug_fin_admin";
const SLOW = 60_000;

function world(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action) => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    const kind = action.kind;
    if (kind === "explore" || kind === "expandGroup")
      return expandAround(next, change, vocab, METRICS).state;
    if (kind === "collapse" || kind === "collapseGroup")
      return collapseAround(next, change, vocab, METRICS).state;
    return place(next, change, vocab, METRICS).state;
  };
  const group = (s: CanvasState, id: DrawnId) =>
    groupAround(s, view(s), id, METRICS);
  const exit = (s: CanvasState, action: Action) =>
    exitAround(s, { kind: "action", action }, view(s), graph, vocab, METRICS);
  const off = (s: CanvasState) =>
    exitAround(s, { kind: "off" }, view(s), graph, vocab, METRICS).state;
  const drag = (s: CanvasState, id: DrawnId, by: Point) => {
    const ctx = beginDrag(s, view(s), id) as DragCtx;
    const p = new Map(s.positions).get(id) as Point;
    return release(dragStep(ctx, { x: p.x + by.x, y: p.y + by.y }).ctx).state;
  };
  const first = firstView(graph, vocab, payload, hash);
  return {
    graph,
    vocab,
    payload,
    hash,
    view,
    act,
    group,
    exit,
    off,
    drag,
    first,
  };
}

function access() {
  const run = world(loadFixture("s-access").input);
  const state = setLayout(
    run.first,
    run.view(run.first),
    run.vocab,
    "force",
    METRICS,
  );
  return { ...run, state };
}

const pos = (s: CanvasState) => new Map(s.positions);
const at = (s: CanvasState, id: string) => pos(s).get(id) as Point;
const drawn = (
  run: { view: (s: CanvasState) => { nodes: { id: string }[] } },
  s: CanvasState,
) => run.view(s).nodes.map((n) => n.id);
const entry = (s: CanvasState, id: string) => s.homes.find(([k]) => k === id);

describe("S19 an expand before the grouping survives a group / ungroup cycle", () => {
  it("collapses back to every position before the expand", () => {
    const run = access();
    const out = run.act(run.state, { kind: "explore", id: "ug_fin_admin" });
    expect(entry(out, FIN)).toBeDefined();
    const cycled = run.off(run.group(out, ROOT));
    expect(cycled.homes).toEqual(out.homes);
    const back = run.act(cycled, { kind: "collapse", id: "ug_fin_admin" });
    expect(pos(back)).toEqual(pos(run.state));
    expect(back.homes).toEqual([]);
  });
});

const GRID = generate.grid(27, 45);
const G = 'g:["n607","relatedTo",">","tl"]';

// why: STORY-002-07 S22 Given — the 27 × 45 grid at (80·(i − 13), 50·(j − 22)), three leaves of
// `n607` in the group node at (40, 25), Force, Grouping 2
function s22() {
  const leaves = [0, 1, 2].map((k) => ({ id: `l${k}`, type: "tl" }));
  const run = world({
    nodes: [...GRID.nodes, ...leaves],
    edges: leaves.map((l) => ({
      subject: "n607",
      predicate: "relatedTo",
      object: l.id,
    })),
    view: { budget: "all" },
  });
  const cells = GRID.cells.map(([id, i, j]): [DrawnId, Point] => [
    `e:${id}`,
    { x: 80 * (i - 13), y: 50 * (j - 22) },
  ]);
  const state: CanvasState = {
    ...run.first,
    grouping: 2,
    revealed: run.graph.entities.map((e) => e.id),
    positions: [...cells, [G, { x: 40, y: 25 }]],
  };
  return { ...run, state };
}

describe("S19b a group expand before the grouping, then on, off and the group collapse", () => {
  it(
    "keeps the records and collapses back to every position",
    () => {
      const run = s22();
      const open = run.act(run.state, { kind: "expandGroup", group: G });
      expect(open.nudges.find(([k]) => k === G)?.[2].length).toBeGreaterThan(0);
      expect(entry(open, G)).toBeDefined();
      const on = run.group(open, "e:n607");
      expect(on.around?.events).toEqual([]);
      const cycled = run.off(on);
      expect(cycled.nudges).toEqual(open.nudges);
      expect(cycled.homes).toEqual(open.homes);
      const shut = run.act(cycled, { kind: "collapseGroup", group: G });
      expect(pos(shut)).toEqual(pos(run.state));
      expect(at(shut, G)).toEqual({ x: 40, y: 25 });
      expect(shut.nudges).toEqual([]);
      expect(shut.homes).toEqual([]);
    },
    SLOW,
  );
});

describe("S22 newcomers born while grouped move with their origin at the exit", () => {
  it("glides u_0 home and moves both explores by the vector of ug_fin_admin", () => {
    const run = access();
    const on = run.group(run.state, ROOT);
    const dragged = run.drag(on, "e:u_0", { x: 100, y: 0 });
    const one = run.act(dragged, { kind: "explore", id: "ug_fin_admin" });
    const two = run.act(one, { kind: "explore", id: "t_FCT_PIPELINE" });
    expect(two.around?.events).toEqual([
      [FIN, true],
      ["e:t_FCT_PIPELINE", true],
    ]);
    const saved = new Map(on.around?.saved);
    const S = two;
    const done = run.off(S);
    expect(at(done, "e:u_0")).toEqual(saved.get("e:u_0"));
    const v = {
      x: (saved.get(FIN) as Point).x - at(S, FIN).x,
      y: (saved.get(FIN) as Point).y - at(S, FIN).y,
    };
    const born = drawn(run, S).filter((id) => !drawn(run, on).includes(id));
    expect(born).toContain("e:t_FCT_PIPELINE");
    expect(born.length).toBeGreaterThan(2);
    for (const id of born)
      expect(at(done, id)).toEqual({
        x: at(S, id).x + v.x,
        y: at(S, id).y + v.y,
      });
    expect(entry(done, FIN)).toBeUndefined();
    const [, x0, y0, x1, y1] = entry(S, "e:t_FCT_PIPELINE") ?? [];
    expect(entry(done, "e:t_FCT_PIPELINE")).toEqual([
      "e:t_FCT_PIPELINE",
      (x0 as number) + v.x,
      (y0 as number) + v.y,
      (x1 as number) + v.x,
      (y1 as number) + v.y,
    ]);
    const [, , , sx, sy] = entry(done, "e:t_FCT_PIPELINE") ?? [];
    expect(at(done, "e:t_FCT_PIPELINE")).toEqual({ x: sx, y: sy });
  });
});

function s30() {
  const run = access();
  const on = run.group(run.state, ROOT);
  expect(run.view(on).nodes.find((n) => n.id === FIN)?.more).toBe(8);
  const S = run.act(on, { kind: "explore", id: "ug_fin_admin" });
  expect(S.around?.events).toEqual([[FIN, true]]);
  const spot = at(on, FIN);
  expect(entry(S, FIN)).toEqual([
    FIN,
    spot.x,
    spot.y,
    at(S, FIN).x,
    at(S, FIN).y,
  ]);
  return { run, on, S };
}

describe("S30 an explore while grouped, toggle off, then the collapse", () => {
  it("returns every node to its position before the grouping", () => {
    const { run, S } = s30();
    const done = run.off(S);
    expect(entry(done, FIN)).toBeUndefined();
    expect(done.around).toBeNull();
    const back = run.act(done, { kind: "collapse", id: "ug_fin_admin" });
    expect(pos(back)).toEqual(pos(run.state));
    expect(drawn(run, back)).toEqual(drawn(run, run.state));
    expect(back.homes).toEqual([]);
  });
});

describe("S31 a collapse while grouped, then toggle off", () => {
  it("is not an exit, deletes its pair and glides ug_fin_admin home", () => {
    const { run, on, S } = s30();
    const action: Action = { kind: "collapse", id: "ug_fin_admin" };
    expect(run.exit(S, action)).toEqual({ steps: [], state: S, placed: null });
    const shut = run.act(S, action);
    expect(shut.around?.events).toEqual([]);
    expect(shut.around?.root).toBe(ROOT);
    expect(entry(shut, FIN)).toBeUndefined();
    expect(at(shut, FIN)).toEqual(at(on, FIN));
    expect(drawn(run, shut)).toEqual(drawn(run, run.state));
    const done = run.off(shut);
    expect(pos(done)).toEqual(pos(run.state));
    expect(done.homes).toEqual([]);
    expect(done.around).toBeNull();
  });
});

// why: S32 and S35 Given (the Implementer (round 7) sequence) up to and with the drag
function s32() {
  const run = access();
  const A1 = run.act(run.state, { kind: "explore", id: "ug_analytics" });
  const came = drawn(run, A1).filter(
    (id) => !drawn(run, run.state).includes(id),
  );
  expect(came).toEqual(expect.arrayContaining(["e:u_2", "e:u_3", "e:u_5"]));
  const x0 = at(A1, FIN);
  const A2 = run.act(A1, { kind: "explore", id: "ug_fin_admin" });
  const before = entry(A2, FIN);
  expect(before?.slice(0, 3)).toEqual([FIN, x0.x, x0.y]);
  const on = run.group(A2, ROOT);
  expect(on.around?.shown).toEqual(
    expect.arrayContaining([FIN, "e:ug_analytics"]),
  );
  const A3 = run.act(on, { kind: "collapse", id: "ug_analytics" });
  expect(run.view(A3).nodes.find((n) => n.id === FIN)?.more).toBe(7);
  const A4 = run.act(A3, { kind: "explore", id: "ug_fin_admin" });
  expect(A4.around?.events).toEqual([[FIN, false]]);
  expect(entry(A4, FIN)).toBe(before);
  // why: memo item — the grouped spot of ug_fin_admin is clear, so the second `moveOut` keeps it
  // there (C2 = g, d = 0) and STORY-002-07 writes no move item for a zero move (D70)
  expect(at(A4, FIN)).toEqual(at(A3, FIN));
  expect(A4.nudges.filter(([, seq]) => seq > (on.around?.seq0 ?? 0))).toEqual(
    [],
  );
  const S = run.drag(A4, FIN, { x: 100, y: 0 });
  return { run, x0, before, on, A3, S };
}

describe("S32 a second explore while grouped of a node explored before", () => {
  it("drops the grouped moves and collapses back to the first view", () => {
    const { run, x0, before, on, A3, S } = s32();
    expect(at(A3, "e:ug_analytics")).toEqual(at(on, "e:ug_analytics"));
    const done = run.off(S);
    expect(at(done, FIN)).toEqual(new Map(S.around?.saved).get(FIN));
    expect(entry(done, FIN)).toEqual(before);
    expect(done.nudges.some(([k]) => k === FIN)).toBe(false);
    expect(at(done, "e:ug_analytics")).toEqual(at(run.state, "e:ug_analytics"));
    const back = run.act(done, { kind: "collapse", id: "ug_fin_admin" });
    expect(at(back, FIN)).toEqual(x0);
    expect(pos(back)).toEqual(pos(run.state));
    expect(back.homes).toEqual([]);
    expect(drawn(run, back)).toEqual(drawn(run, run.state));
  });
});

describe("S35 case K: the collapse while grouped of a key with events on both sides of seq0", () => {
  it("undoes each event in its own frame", () => {
    const { run, x0, S } = s32();
    const shut = run.act(S, { kind: "collapse", id: "ug_fin_admin" });
    expect(shut.around?.events).toEqual([]);
    expect(shut.homes).toEqual([]);
    expect(shut.nudges).toEqual([]);
    expect(drawn(run, shut)).toEqual(drawn(run, run.state));
    expect(new Map(shut.around?.saved).get(FIN)).toEqual(x0);
    const done = run.off(shut);
    expect(at(done, FIN)).toEqual(x0);
    expect(pos(done)).toEqual(pos(run.state));
    expect(done.around).toBeNull();
  });
});
