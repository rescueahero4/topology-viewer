import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { setLayout } from "./layout";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;

function accessInForce() {
  const result = normalize(loadFixture("s-access").input, {
    now: "2026-10-14",
  });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const first = firstView(graph, vocab, payload, hash);
  const drawn = (state: CanvasState) => frontier(state, graph, vocab);
  const force = setLayout(first, drawn(first), vocab, "force", METRICS);
  const act = (state: CanvasState, action: Action) =>
    transition(state, action, graph, vocab);
  return { first, force, vocab, drawn, act };
}

describe("S20 explore runs no layout", () => {
  it("keeps the layout and every cached position", () => {
    const run = accessInForce();
    expect(run.first.layout).toBe("force");
    const before = run.drawn(run.force);
    expect(before.nodes.some((node) => node.id === "e:u_12")).toBe(true);
    const after = run.act(run.force, { kind: "explore", id: "u_12" });
    expect(run.drawn(after).nodes.length).toBeGreaterThan(before.nodes.length);
    expect(after.layout).toBe("force");
    const cached = new Map(after.positions);
    for (const [id, p] of run.force.positions)
      expect(cached.get(id)).toStrictEqual(p);
    expect(after.positions).toStrictEqual(run.force.positions);
  });
});

describe("S21 a request of the same layout", () => {
  it("runs again from the cache", () => {
    const run = accessInForce();
    const shown = run.drawn(run.force);
    const again = setLayout(run.force, shown, run.vocab, "force", METRICS);
    const twice = setLayout(run.force, shown, run.vocab, "force", METRICS);
    expect(again.positions).toStrictEqual(twice.positions);
    expect(again.positions).not.toStrictEqual(run.force.positions);
    expect(again.positions.map(([id]) => id)).toEqual(
      run.force.positions.map(([id]) => id),
    );
  });
});

describe("S22 another layout", () => {
  it("runs the tree-v layout for every drawn node", () => {
    const run = accessInForce();
    const shown = run.drawn(run.force);
    const tree = setLayout(run.force, shown, run.vocab, "tree-v", METRICS);
    expect(tree.layout).toBe("tree-v");
    expect(tree.positions.map(([id]) => id)).toEqual(
      shown.nodes.map(({ id }) => id),
    );
    for (const [, p] of tree.positions)
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(tree.treeRows?.vertical).toBe(true);
  });
});

type Input = { view?: Record<string, unknown> };

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("the layout state of a first view", () => {
  it.each([
    [undefined, "force"],
    ["tree-v", "tree-v"],
    ["bogus", "force"],
    [7, "force"],
  ])("view.layout %s gives %s with no positions", (sent, name) => {
    const input = loadFixture("s-access").input as Input;
    const result = normalize(
      { ...input, view: { ...input.view, layout: sent } },
      { now: "2026-10-14" },
    );
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { graph, payload, hash } = result;
    const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
    const state = firstView(graph, vocab, payload, hash);
    expect(state.layout).toBe(name);
    expect(state.positions).toEqual([]);
    expect(state.treeRows).toBeNull();
  });
});

describe("pure functions over frozen inputs", () => {
  it.each(["force", "atomic", "bubbles", "tree-h", "tree-v"] as const)(
    "%s changes no input",
    (name) => {
      const run = accessInForce();
      const state = deepFreeze(run.force);
      const shown = deepFreeze(run.drawn(state));
      const snapshot = JSON.stringify([state, shown]);
      const next = setLayout(state, shown, run.vocab, name, METRICS);
      expect(JSON.stringify([state, shown])).toBe(snapshot);
      expect(next.layout).toBe(name);
    },
  );
});
