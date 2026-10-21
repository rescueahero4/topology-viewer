import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import {
  canvasColor,
  canvasLookup,
  collapseAround,
  drawnIdOf,
  entityType,
  exitAround,
  expandAround,
  firstView,
  frontier,
  groupAround,
  groupDrawnId,
  hiddenOf,
  normalize,
  onCanvas,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type CanvasState,
  type EntityNode,
  type Frontier,
  type GroupNode,
  type Hex,
  type IconMetrics,
} from "../index";
import { seeded } from "../layout/random";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const RUNS = 40;
const STEPS = 25;
const SLOW = 300_000;

// why: D99 (1), D100 — while grouped, `exitAround` first; a change that is no exit then goes to
// `expandAround` or `collapseAround`, as `view/focus-random.test.ts` does
function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-20" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const act = (s: CanvasState, action: Action): CanvasState => {
    if (s.around !== null) {
      const kind = { kind: "action", action } as const;
      const exit = exitAround(s, kind, view(s), graph, vocab, METRICS);
      if (exit.steps.length > 0) return exit.state;
    }
    const next = transition(s, action, graph, vocab);
    if (next.around === null) return next;
    const change = { action, before: view(s), after: view(next) };
    if (action.kind === "explore")
      return expandAround(next, change, vocab, METRICS).state;
    if (action.kind === "collapse")
      return collapseAround(next, change, vocab, METRICS).state;
    return next;
  };
  const off = (s: CanvasState) =>
    exitAround(s, { kind: "off" }, view(s), graph, vocab, METRICS).state;
  const first = firstView(graph, vocab, payload, hash);
  const ids = [...new Set(graph.entities.flatMap((e) => [e.id, ...e.records]))];
  return {
    graph,
    vocab,
    view,
    act,
    off,
    ids,
    state: setLayout(first, view(first), vocab, first.layout, METRICS),
  };
}

type Run = ReturnType<typeof load>;

const entities = (f: Frontier) =>
  f.nodes.filter((n): n is EntityNode => !("members" in n));
const groups = (f: Frontier) =>
  f.nodes.filter((n): n is GroupNode => "members" in n);
const pick = <T>(list: T[], r: () => number): T | undefined =>
  list[Math.floor(r() * list.length)];

// why: LEARNINGS 26 — a hidden entity, an entity of a type that is off, a member of a collapsed
// group, or a faded entity; else any entity that is not drawn as an entity node
function notDrawn(run: Run, s: CanvasState, f: Frontier): string[] {
  const drawn = new Set(entities(f).map((n) => n.entity));
  const typesOff = new Set(s.filters.typesOff);
  const shown = new Set(s.around?.shown ?? []);
  const named = [
    ...groups(f).flatMap((n) => n.members),
    ...s.hidden.flatMap((entry) => entry.members),
    ...run.graph.entities
      .filter((e) => typesOff.has(entityType(run.vocab, e.id)))
      .map((e) => e.id),
  ].filter((id) => !drawn.has(id));
  const faded =
    s.around === null
      ? []
      : entities(f)
          .filter((n) => !shown.has(n.id))
          .map((n) => n.entity);
  const all = [...named, ...faded];
  if (all.length > 0) return all;
  return run.graph.entities.map((e) => e.id).filter((id) => !drawn.has(id));
}

const NODE_KINDS = [
  "explore",
  "collapse",
  "path",
  "hide",
  "hideMany",
  "showMany",
] as const;

function nodeAction(kind: (typeof NODE_KINDS)[number], id: string): Action {
  if (kind === "hide") return { kind, node: `e:${id}` };
  if (kind === "hideMany" || kind === "showMany") return { kind, ids: [id] };
  return { kind, id };
}

const GROUPINGS = [2, 5, 10, "off"] as const;
const BUDGETS = [10, 20, 50, "all"] as const;

// why: the actions of STORY-003-01 S8, plus Group around root on and off (STORY-004-01 S5)
function anyAction(run: Run, s: CanvasState, f: Frontier, r: () => number) {
  const all = run.graph.entities.map((e) => e.id);
  const ids = entities(f).map((n) => n.entity);
  const types = [...new Set(entities(f).map((n) => n.type)), null];
  const carried = [...new Set(entities(f).flatMap((n) => n.group ?? []))];
  const choices: (() => Action | "around" | undefined)[] = [
    ...NODE_KINDS.map((kind) => () => {
      const id = pick(kind === "path" || kind === "showMany" ? all : ids, r);
      return id === undefined ? undefined : nodeAction(kind, id);
    }),
    () => {
      const group = pick(groups(f), r)?.id;
      return group === undefined ? undefined : { kind: "expandGroup", group };
    },
    () => {
      const group =
        pick(carried, r) ?? pick(s.expandedGroups.map(groupDrawnId), r);
      return group === undefined ? undefined : { kind: "collapseGroup", group };
    },
    () => {
      const key = pick(s.hidden, r)?.key;
      return key === undefined ? undefined : { kind: "restore", keys: [key] };
    },
    () => ({
      kind: "toggleType",
      type: pick(types, r) as string | null,
      on: r() < 0.3,
    }),
    () => ({ kind: "showAllTypes" }),
    () => ({ kind: "grouping", grouping: pick([...GROUPINGS], r) ?? 2 }),
    () => ({ kind: "budget", budget: pick([...BUDGETS], r) ?? 20 }),
    () => ({ kind: "reset" }),
    () => "around",
    () => "around",
  ];
  return (pick(choices, r) as () => Action | "around" | undefined)();
}

function aroundStep(run: Run, s: CanvasState, r: () => number, log: string[]) {
  if (s.around !== null) {
    log.push("around off");
    return run.off(s);
  }
  const f = run.view(s);
  const root = pick(f.nodes, r)?.id;
  if (root === undefined) return s;
  log.push(`around on ${root}`);
  return groupAround(s, f, root, METRICS);
}

// why: S5 — each fourth step (k = 0, 4, …, 24) is a node action on a node that is not drawn; when
// every entity is drawn, the step hides one drawn entity first and then targets it
function offStep(run: Run, s: CanvasState, r: () => number, log: string[]) {
  let state = s;
  if (notDrawn(run, s, run.view(s)).length === 0) {
    const node = pick(entities(run.view(s)), r) as EntityNode;
    log.push(`hide ${node.id} first`);
    state = run.act(s, { kind: "hide", node: node.id });
  }
  const id = pick(notDrawn(run, state, run.view(state)), r);
  if (id === undefined) return { state, action: null };
  const kind = pick([...NODE_KINDS], r) as (typeof NODE_KINDS)[number];
  return { state, action: nodeAction(kind, id) };
}

function differences(run: Run, s: CanvasState) {
  const { graph, vocab } = run;
  const look = canvasLookup(s, graph, vocab);
  const found: string[] = [];
  const answers = new Map<string, number>();
  for (const id of run.ids) {
    const a = look.onCanvas(id);
    answers.set(a, (answers.get(a) ?? 0) + 1);
    if (a !== onCanvas(s, graph, vocab, id)) found.push(`onCanvas ${id}`);
    if (look.hiddenOf(id) !== hiddenOf(s, graph, id))
      found.push(`hiddenOf ${id}`);
    if (look.drawnIdOf(id) !== drawnIdOf(s, graph, vocab, id))
      found.push(`drawnIdOf ${id}`);
  }
  return { found, answers };
}

function walk(run: Run, seed: number, seen: Map<string, number>) {
  const r = seeded(seed);
  const log = [`seed ${seed}`];
  let s = run.state;
  let offTarget = 0;
  for (let k = 0; k < STEPS; k++) {
    let off: Action | null = null;
    if (k % 4 === 0) ({ state: s, action: off } = offStep(run, s, r, log));
    if (off !== null) offTarget++;
    const action = off ?? anyAction(run, s, run.view(s), r);
    if (action === "around") s = aroundStep(run, s, r, log);
    else if (action !== undefined) {
      log.push(JSON.stringify(action));
      s = run.act(s, action);
    }
    const { found, answers } = differences(run, s);
    expect(found, log.join("; ")).toEqual([]);
    for (const [answer, n] of answers)
      seen.set(answer, (seen.get(answer) ?? 0) + n);
  }
  return offTarget;
}

describe("S5 random steps: the lookup equals the per-call functions", () => {
  it.each(["s-access", "s-star", "s-islands"])(
    "%s: seeds 1 to 40, 25 steps each, 0 differences",
    (name) => {
      const run = load(loadFixture(name).input);
      const seen = new Map<string, number>();
      let offTarget = 0;
      for (let seed = 1; seed <= RUNS; seed++)
        offTarget += walk(run, seed, seen);
      expect(offTarget).toBe(RUNS * Math.ceil(STEPS / 4));
      for (const answer of ["drawn", "not-drawn", "hidden", "faded"])
        expect(seen.get(answer) ?? 0, answer).toBeGreaterThan(0);
    },
    SLOW,
  );
});
