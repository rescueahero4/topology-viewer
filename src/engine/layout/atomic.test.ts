import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { CanvasState, Point } from "../state/canvasState";
import { frontier, type Frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { atomicCentre, atomicRoom } from "./atomic";
import { drawnOf, type IconMetrics } from "./drawn";
import { recenter, setLayout } from "./layout";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;

type Input = { view?: Record<string, unknown> };

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return {
    graph,
    vocab,
    first: firstView(graph, vocab, payload, hash),
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
  };
}

function componentOf(shown: Frontier): Map<string, number> {
  const label = new Map(shown.nodes.map((node, i) => [node.id, i]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const { subject, object } of shown.edges) {
      const low = Math.min(label.get(subject) ?? 0, label.get(object) ?? 0);
      for (const id of [subject, object])
        if ((label.get(id) ?? 0) > low) {
          label.set(id, low);
          changed = true;
        }
    }
  }
  return label;
}

describe("S6 s-islands in Atomic", () => {
  const run = load(loadFixture("s-islands").input);
  const shown = run.drawn(run.first);

  it("packs the components with no overlap", () => {
    const state = setLayout(run.first, shown, run.vocab, "atomic", METRICS);
    const laid = drawnOf(shown, run.vocab, METRICS).nodes;
    const where = new Map(state.positions);
    const comp = componentOf(shown);
    expect(new Set(comp.values()).size).toBeGreaterThan(1);
    for (const a of laid)
      for (const b of laid) {
        if (a.id >= b.id) continue;
        const p = where.get(a.id) as Point;
        const q = where.get(b.id) as Point;
        const gap = atomicRoom(a) + atomicRoom(b);
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(
          gap - 0.01,
        );
      }
  });

  it("centres on e:a3, also with a3 as the scope root", () => {
    expect(run.first.selection).toBeNull();
    expect(atomicCentre(run.first, shown)).toBe("e:a3");
    const rooted = { ...run.first, scope: { ...run.first.scope, root: "a3" } };
    expect(atomicCentre(rooted, shown)).toBe("e:a3");
  });

  it("breaks a degree tie by drawn-id code point", () => {
    const two = load({
      nodes: [{ id: "n1" }, { id: "n0" }],
      edges: [["n1", "relatedTo", "n0"]],
      view: { approach: "passive", budget: "all" },
    });
    expect(atomicCentre(two.first, two.drawn(two.first))).toBe("e:n0");
  });
});

describe("S7 the Atomic centre and recenter on s-access", () => {
  const input = loadFixture("s-access").input as Input;
  const run = load({ ...input, view: { ...input.view, approach: "passive" } });
  const first = run.first;
  const shown = run.drawn(first);
  const second = transition(
    first,
    { kind: "select", entity: "u_0" },
    run.graph,
    run.vocab,
  );

  it("centres on the scope root, then on the selection", () => {
    expect(shown.nodes).toHaveLength(7);
    expect(shown.nodes.every((node) => "entity" in node)).toBe(true);
    expect(first.selection).toBeNull();
    expect(atomicCentre(first, shown)).toBe("e:t_FCT_REVENUE");
    expect(atomicCentre(second, run.drawn(second))).toBe("e:u_0");
  });

  it("runs Atomic again around a drawn entity only in Atomic", () => {
    const after = run.drawn(second);
    const atomic = setLayout(second, after, run.vocab, "atomic", METRICS);
    const moved = recenter(
      atomic,
      after,
      run.graph,
      run.vocab,
      METRICS,
      "u_12",
    );
    const picked: CanvasState = { ...second, selection: { node: "e:u_12" } };
    const expected = setLayout(picked, after, run.vocab, "atomic", METRICS);
    expect(moved.positions).toStrictEqual(expected.positions);
    expect(moved.positions).not.toStrictEqual(atomic.positions);
    expect(recenter(atomic, after, run.graph, run.vocab, METRICS, "nope")).toBe(
      atomic,
    );
    const force = setLayout(second, after, run.vocab, "force", METRICS);
    expect(recenter(force, after, run.graph, run.vocab, METRICS, "u_12")).toBe(
      force,
    );
  });
});
