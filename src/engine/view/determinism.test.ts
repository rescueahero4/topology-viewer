import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it, vi } from "vitest";
import { normalize } from "../data/normalize";
import {
  beginDrag,
  dragBubble,
  dragStep,
  release,
  type DragCtx,
} from "../interact/drag";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import type {
  Action,
  CanvasState,
  LayoutName,
  Point,
} from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { exitAround } from "./exit";
import { expandAround, groupAround } from "./focus";
import { frontier, type Frontier } from "./frontier";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function steps(key: string) {
  const result = normalize(loadFixture(key).input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const drawn = (state: CanvasState) => frontier(state, graph, vocab);
  const actions: ((state: CanvasState) => Action)[] = [
    () => ({ kind: "explore", id: "t_FCT_REVENUE" }),
    (state) => ({
      kind: "expandGroup",
      group: drawn(state).nodes.find((node) => "members" in node)?.id ?? "",
    }),
    (state) => ({
      kind: "select",
      node: drawn(state).nodes.find((node) => "entity" in node)?.id ?? null,
    }),
    () => ({ kind: "budget", budget: 10 }),
    () => ({ kind: "reset" }),
  ];
  let state = firstView(graph, vocab, payload, hash);
  const out: { state: CanvasState; frontier: Frontier }[] = [
    { state, frontier: drawn(state) },
  ];
  for (const make of actions) {
    state = transition(state, make(state), graph, vocab);
    out.push({ state, frontier: drawn(state) });
  }
  return out;
}

describe("S28 same input, same states and frontiers", () => {
  it("runs s-access twice to equal results", () => {
    const first = steps("s-access");
    const second = steps("s-access");
    expect(second).toStrictEqual(first);
    expect(first[2].state.expandedGroups).toHaveLength(1);
    expect(first[3].state.selection).not.toBeNull();
  });
});

const S19: Action[] = [
  { kind: "hide", node: "e:u_12" },
  { kind: "toggleType", type: "user", on: false },
  { kind: "toggleFamily", family: "Ownership & Access", on: false },
  { kind: "togglePredicate", predicate: "memberOf", on: false },
  { kind: "hide", node: "e:ug_fin_admin" },
  { kind: "restore", keys: ["e:u_12"] },
  { kind: "showAllTypes" },
  { kind: "hideMany", ids: ["u_0", "u_7"] },
  { kind: "grouping", grouping: "off" },
];

function filtersAndHidden() {
  const result = normalize(loadFixture("s-access").input, {
    now: "2026-10-14",
  });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const states = [firstView(graph, vocab, payload, hash)];
  for (const action of S19)
    states.push(transition(states[states.length - 1], action, graph, vocab));
  return {
    states,
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
  };
}

describe("S19 filters and the Hidden list are deterministic", () => {
  it("gives the same states, entries and seq values twice, with no clock", () => {
    const clocks = [vi.spyOn(Date, "now"), vi.spyOn(performance, "now")];
    const first = filtersAndHidden();
    const second = filtersAndHidden();
    for (const clock of clocks) {
      expect(clock).not.toHaveBeenCalled();
      clock.mockRestore();
    }
    expect(second.states).toStrictEqual(first.states);
    const [, hidden, , , , kept, restored, , bulk] = first.states;
    expect(hidden.hidden).toStrictEqual([
      { key: "e:u_12", members: ["u_12"], stranded: ["ug_exec"], seq: 0 },
    ]);
    // why: with `user` off, Grouping 2 puts ug_fin_admin and ug_analytics into one group of
    // t_FCT_REVENUE, so ug_fin_admin is not drawn as itself and its hide changes nothing
    const group = first
      .drawn(first.states[4])
      .nodes.find((node) => "members" in node);
    expect(group && "members" in group ? group.members : []).toContain(
      "ug_fin_admin",
    );
    expect(kept).toBe(first.states[4]);
    expect(restored.hidden).toEqual([]);
    expect(bulk.hidden.map((entry) => entry.key)).toEqual(["e:u_0", "e:u_7"]);
    expect(first.states[9].grouping).toBe("off");
  });
});

const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;

// why: STORY-002-08 S26 When — drags, Group around root, an explore while grouped, the exit and
// two layout requests, run on s-access from the Force first view
function dragsAndGrouping() {
  const result = normalize(loadFixture("s-access").input, {
    now: "2026-10-14",
  });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const drag = (s: CanvasState, id: string, dx: number) => {
    const ctx = beginDrag(s, view(s), id) as DragCtx;
    const p = new Map(s.positions).get(id) as Point;
    return release(dragStep(ctx, { x: p.x + dx, y: p.y }).ctx).state;
  };
  const lay = (s: CanvasState, name: LayoutName) =>
    setLayout(s, view(s), vocab, name, METRICS);
  const group = (s: CanvasState) =>
    groupAround(s, view(s), "e:t_FCT_REVENUE", METRICS);
  const states = [lay(firstView(graph, vocab, payload, hash), "force")];
  const step = (next: (s: CanvasState) => CanvasState) =>
    states.push(next(states[states.length - 1]));
  step((s) => drag(s, "e:u_0", 200));
  step(group);
  step((s) => drag(s, "e:ug_analytics", 150));
  step((s) => {
    const action = { kind: "explore", id: "ug_fin_admin" } as const;
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return expandAround(next, change, vocab, METRICS).state;
  });
  step(
    (s) => exitAround(s, { kind: "off" }, view(s), graph, vocab, METRICS).state,
  );
  step((s) => lay(s, "atomic"));
  step((s) => drag(s, "e:u_7", 300));
  step((s) => lay(s, "bubbles"));
  step((s) => dragBubble(s, view(s), "user", { x: 40, y: -25 }));
  step(group);
  return states;
}

describe("STORY-002-08 S26 drags and Group around root are deterministic", () => {
  it("gives equal positions and states twice", () => {
    const first = dragsAndGrouping();
    expect(dragsAndGrouping()).toStrictEqual(first);
    expect(first[first.length - 1].around?.root).toBe("e:t_FCT_REVENUE");
    expect(first[4].around?.events).toEqual([["e:ug_fin_admin", true]]);
  });
});
