import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { datasets, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { beginDrag, dragStep, release, type DragCtx } from "../interact/drag";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import { place } from "../layout/place";
import { seeded } from "../layout/random";
import type {
  Action,
  CanvasState,
  LayoutName,
  Point,
} from "../state/canvasState";
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
  ...Object.fromEntries(["t0", "r", "p", "q", "l", "m"].map((t) => [t, LEAF])),
};
const RUNS = 40;
const STEPS = 8;
const SLOW = 120_000;

function world(input: unknown, name: LayoutName, spots?: [string, Point][]) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action) => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    if (action.kind === "explore")
      return expandAround(next, change, vocab, METRICS).state;
    if (action.kind === "collapse")
      return collapseAround(next, change, vocab, METRICS).state;
    return place(next, change, vocab, METRICS).state;
  };
  const off = (s: CanvasState) =>
    exitAround(s, { kind: "off" }, view(s), graph, vocab, METRICS).state;
  const first = firstView(graph, vocab, payload, hash);
  const state: CanvasState =
    spots === undefined
      ? setLayout(first, view(first), vocab, name, METRICS)
      : {
          ...first,
          grouping: "off",
          layout: name,
          revealed: spots.map(([id]) => id),
          positions: spots.map(([id, p]) => [`e:${id}`, p]),
        };
  return { view, act, off, state };
}

const rel = (subject: string, object: string) => ({
  subject,
  predicate: "relatedTo",
  object,
});
const leaves = (hub: string, prefix: string, type: string) =>
  Array.from({ length: 100 }, (_, k) => ({ id: `${prefix}${k}`, type, hub }));

// why: the STORY-002-08 S34 lattice, where explores are crowded and nudge (rule (b))
function lattice() {
  const spots: [string, Point][] = [];
  for (let i = 0; i <= 24; i++)
    for (let j = 0; j <= 24; j++)
      if (i !== 12 || j !== 12)
        spots.push([`g${i}_${j}`, { x: 300 * (i - 12), y: 300 * (j - 12) }]);
  const out = [...leaves("T", "l", "l"), ...leaves("Y", "m", "m")];
  const input = {
    nodes: [
      ...spots.map(([id]) => ({ id, type: "t0" })),
      ...["R:r", "T:p", "Y:p", "u:q"].map((s) => {
        const [id, type] = s.split(":");
        return { id, type };
      }),
      ...out.map(({ id, type }) => ({ id, type })),
    ],
    edges: [
      ...[
        ["R", "T"],
        ["R", "Y"],
        ["Y", "u"],
        ["T", "u"],
      ].map(([a, b]) => rel(a, b)),
      ...out.map(({ id, hub }) => rel(hub, id)),
    ],
  };
  const drawn: [string, Point][] = [
    ...spots,
    ["R", { x: -150, y: 0 }],
    ["T", { x: 0, y: 0 }],
    ["Y", { x: -150, y: 150 }],
  ];
  return world(input, "force", drawn);
}

type World = ReturnType<typeof world>;

const pick = <T>(list: T[], r: () => number) =>
  list[Math.floor(r() * list.length)];

const drawnIds = (run: World, s: CanvasState) =>
  run.view(s).nodes.map((n) => n.id);

// why: one random step while grouped — an explore of a shown entity, the collapse of the last
// explore that is still open (SA §6 row 2 pairs an expand with its collapse, as STORY-002-07
// `place-random.test.ts` does), or a drag of a drawn node
function stepOf(
  run: World,
  s: CanvasState,
  r: () => number,
  { open, log }: { open: string[]; log: string[] },
) {
  const nodes = run.view(s).nodes;
  const shown = new Set(s.around?.shown);
  const roll = r();
  if (roll < 0.25 && open.length > 0) {
    const id = open.pop() as string;
    log.push(`collapse ${id}`);
    return run.act(s, { kind: "collapse", id });
  }
  if (roll < 0.6) {
    const ids = nodes.flatMap((n) =>
      "entity" in n && n.more > 0 && shown.has(n.id) ? [n.entity] : [],
    );
    if (ids.length === 0) return s;
    const id = pick(ids, r);
    log.push(`explore ${id}`);
    const next = run.act(s, { kind: "explore", id });
    if (drawnIds(run, next).join() !== drawnIds(run, s).join()) open.push(id);
    return next;
  }
  const node = pick(nodes, r);
  const ctx = beginDrag(s, run.view(s), node.id) as DragCtx;
  const p = new Map(s.positions).get(node.id) as Point;
  const to = { x: p.x + 400 * (r() - 0.5), y: p.y + 400 * (r() - 0.5) };
  log.push(`drag ${node.id}`);
  return release(dragStep(ctx, to).ctx).state;
}

// why: up to 2 explores before the grouping, so that a collapse while grouped can undo an event
// made before it (story Context rule (3), D78)
function ahead(
  run: World,
  r: () => number,
  path: { open: string[]; log: string[] },
) {
  let s = run.state;
  for (let k = Math.floor(r() * 3); k > 0; k--) {
    const ids = run
      .view(s)
      .nodes.flatMap((n) => ("entity" in n && n.more > 0 ? [n.entity] : []));
    if (ids.length === 0) break;
    const id = pick(ids, r);
    path.log.push(`explore ${id} before`);
    const next = run.act(s, { kind: "explore", id });
    if (drawnIds(run, next).join() !== drawnIds(run, s).join())
      path.open.push(id);
    s = next;
  }
  return s;
}

function runOnce(run: World, seed: number, roots?: string[]) {
  const r = seeded(seed);
  const S0 = run.state;
  const path = { open: [] as string[], log: [`seed ${seed}`] };
  const A = ahead(run, r, path);
  const root = pick(roots ?? run.view(A).nodes.map((n) => n.id), r);
  let s = groupAround(A, run.view(A), root, METRICS);
  path.log.push(`root ${s.around?.root}`);
  for (let k = 0; k < STEPS; k++) s = stepOf(run, s, r, path);
  // why: story Context rule (3) (D76) — a collapse while grouped changes `saved`
  const saved = new Map(s.around?.saved);
  const why = path.log.join("; ");
  const home = run.off(s);
  expect(home.around).toBeNull();
  expect(home.hidden).toEqual(S0.hidden);
  for (const [id, p] of home.positions) {
    const spot = saved.get(id);
    if (spot !== undefined) expect(p, `${why}; ${id}`).toEqual(spot);
  }
  let end = home;
  const opened = path.log.filter((step) => step.startsWith("explore")).length;
  while (path.open.length > 0)
    end = run.act(end, { kind: "collapse", id: path.open.pop() as string });
  const ids = drawnIds(run, S0);
  expect(drawnIds(run, end), why).toEqual(ids);
  // why: SA §6 row 2 is about the drawn nodes, as STORY-002-07 `place-random.test.ts` reads it; a
  // node that is not drawn can keep a cached spot (mockup line 2216)
  const was = new Map(S0.positions);
  const now = new Map(end.positions);
  for (const id of ids)
    expect(now.get(id), `${why}; ${id}`).toEqual(was.get(id));
  return opened;
}

describe("SA §6 rows 2, 9: random steps while grouped, off, then the collapses", () => {
  it.each([
    ["s-access", "force"],
    ["s-access", "atomic"],
    ["s-access", "bubbles"],
    ["catalog", "force"],
  ] as const)(
    "%s in %s gives every position of the state before the grouping",
    (key, name) => {
      const input =
        key === "catalog" ? datasets.catalog.graph : loadFixture(key).input;
      const run = world(input, name);
      let explores = 0;
      for (let k = 0; k < RUNS; k++) explores += runOnce(run, 1 + k);
      expect(explores).toBeGreaterThan(RUNS);
    },
    SLOW,
  );

  it(
    "the S34 lattice in force, with crowded explores, gives every position before the grouping",
    () => {
      const run = lattice();
      let explores = 0;
      for (let k = 0; k < RUNS; k++)
        explores += runOnce(run, 1 + k, ["e:R", "e:T", "e:Y"]);
      expect(explores).toBeGreaterThan(RUNS);
    },
    SLOW,
  );
});
