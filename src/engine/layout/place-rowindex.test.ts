import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { describe, expect, it, vi } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState } from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { setLayout } from "./layout";
import { place } from "./place";
import { rowIndex, undoRows } from "./undo";

vi.mock("./undo", async (load) => {
  const mod = await load<typeof import("./undo")>();
  return {
    ...mod,
    rowIndex: vi.fn(mod.rowIndex),
    undoRows: vi.fn(mod.undoRows),
  };
});

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const COUNT = 3;

// why: rule (h)(7), QA P25 — the S33 tree-h world at 3 records: `h` brought every leaf, every
// group expand has a row-shift record, and the collapse of `h` undoes them all
function world() {
  const nodes = [{ id: "h", type: "a" }];
  const edges: { subject: string; predicate: string; object: string }[] = [];
  for (let i = 0; i < COUNT; i++) {
    nodes.push({ id: `a${i}`, type: "a" });
    edges.push({ subject: "h", predicate: "p", object: `a${i}` });
    if (i > 0)
      edges.push({ subject: `a${i - 1}`, predicate: "s", object: `a${i}` });
    for (const k of [0, 1]) {
      nodes.push({ id: `l${i}_${k}`, type: "l" });
      edges.push({ subject: `a${i}`, predicate: "q", object: `l${i}_${k}` });
    }
  }
  const result = normalize(
    { nodes, edges, view: { budget: "all" } },
    { now: "2026-10-14" },
  );
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const grouped: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping: 2,
    revealed: nodes.map((n) => n.id),
  };
  const groups = view(grouped).nodes.filter((n) => "members" in n);
  const open: CanvasState = {
    ...grouped,
    expandedGroups: groups.map((n) => n.id.slice(2)),
    seq: COUNT,
    origins: nodes
      .filter((n) => n.type === "l")
      .map((n): [string, string] => [n.id, "h"]),
    homes: groups.map((n) => [n.id, 0, 0, 0, 0]),
    treeShifts: groups.map((n, i) => [
      n.id,
      i + 1,
      { vertical: false, shiftOf: [], inserted: [], moved: [] },
    ]),
  };
  const state = setLayout(open, view(open), vocab, "tree-h", METRICS);
  const action = { kind: "collapse", id: "h" } as const;
  const next = transition(state, action, graph, vocab);
  return {
    groups,
    next,
    change: { action, before: view(state), after: view(next) },
    vocab,
  };
}

describe("a collapse makes the row index one time (rule (h)(7), QA P25)", () => {
  it("undoes 3 row-shift records with one row index", () => {
    const run = world();
    expect(run.groups).toHaveLength(COUNT);
    vi.mocked(rowIndex).mockClear();
    vi.mocked(undoRows).mockClear();
    const out = place(run.next, run.change, run.vocab, METRICS);
    expect(out.state.treeShifts).toEqual([]);
    expect(vi.mocked(undoRows).mock.calls).toHaveLength(COUNT);
    expect(vi.mocked(rowIndex).mock.calls).toHaveLength(1);
  });
});
