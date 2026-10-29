// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type {
  CellChange,
  Edit,
  Frontier,
  LayoutName,
} from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Open } from "./edit-reference";

// why: LEARNINGS 36, 64 — the clock comes before `d3-timer` loads
vi.useFakeTimers({
  toFake: [
    "performance",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "Date",
  ],
});
vi.resetModules();
const engine = await import("@qdic-topology/engine");
const { profile } = await import("@qdic-topology/contract");
const { datasets } = await import("@qdic-topology/fixtures");
const ref = await import("./edit-reference");
const { node, edge, spots } = ref;

// why: jsdom has no ResizeObserver and gives each element 0 × 0 (LEARNINGS 49)
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

afterEach(() => {
  vi.runOnlyPendingTimers();
  document.body.replaceChildren();
});

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// why: STORY-008-03 T5 — 1,000 steps for each layout; one step is about 10 ms idle (Implementer
// readiness (g)); the limit is above 2 × the time measured under full-suite load (LEARNINGS 24, 62)
const STEPS = 1000;
const LIMIT = 120_000;
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const PREDICATES = [
  "contains",
  "derivedFrom",
  "dependsOn",
  "mapsTo",
  "reviewedBy",
];
const SERVICES = ["snowflake", "tableau", "dbt", undefined];
const FACTS: [string, unknown][] = [
  ["isActive", true],
  ["isActive", false],
  ["valid_to", "2020-01-01"],
  ["valid_to", undefined],
];

const pick = <T>(rand: () => number, list: readonly T[]): T =>
  list[Math.floor(rand() * list.length)];
const idsOf = (f: Frontier) => f.nodes.map((n) => n.id).sort();

// why: S11 When — Name, Kind to a type that is on, Predicate, fact, System, Subject or Object to a
// drawn node; never a self-edge
function changeOf(o: Open, rand: () => number, i: number): CellChange {
  const { graph, vocab } = o.model;
  const record = pick(rand, graph.records).id;
  const triple = pick(rand, graph.triples);
  const drawn = o.log.settle[o.log.settle.length - 1].frontier.nodes.flatMap(
    (n) => ("entity" in n ? [n.entity] : n.members),
  );
  switch (Math.floor(rand() * 7)) {
    case 0:
      return node(record, "name", `name ${i}`);
    case 1:
      return node(record, "kind", pick(rand, [...vocab.types.keys(), "zone"]));
    case 2:
      return edge(triple.key, "predicate", pick(rand, PREDICATES));
    case 3: {
      const [fact, value] = pick(rand, FACTS);
      return edge(triple.key, { fact }, value);
    }
    case 4:
      return node(record, "system", pick(rand, SERVICES));
    default: {
      const column = rand() < 0.5 ? "subject" : "object";
      return edge(triple.key, column, pick(rand, drawn));
    }
  }
}

function valid(o: Open, edits: Edit[]): boolean {
  try {
    const { graph } = ref.edited(o, edits);
    return graph.triples.every((t) => t.subject !== t.object);
  } catch {
    return false;
  }
}

describe("S11 1,000 random edits move no drawn node", () => {
  for (const [n, layout] of LAYOUTS.entries())
    it(
      layout,
      async () => {
        const o = await ref.open(
          profile,
          structuredClone(datasets.catalog.graph),
        );
        if (layout !== "force") o.canvas.setLayout(layout);
        vi.advanceTimersByTime(3000);
        const rand = mulberry32(20261029 + n);
        let applied = 0;
        for (let i = 0; applied < STEPS; i++) {
          expect(i).toBeLessThan(STEPS * 20);
          const e: Edit = {
            changes: [changeOf(o, rand, i)],
            effect: { drew: [], undrew: [] },
          };
          const edits = [...o.edits, e];
          if (!valid(o, edits)) continue;
          const next = ref.edited(o, edits);
          const before = o.state();
          const ids = idsOf(o.log.settle[o.log.settle.length - 1].frontier);
          if (
            idsOf(engine.frontier(before, next.graph, next.vocab)).join() !==
            ids.join()
          )
            continue;
          const effect = o.canvas.applyEdit(next.graph, next.vocab, {
            draw: [],
            undraw: [],
          });
          o.edits.push(e);
          applied++;
          const label = `${layout} step ${applied}`;
          expect(effect, label).toEqual({ drew: [], undrew: [] });
          const after = o.state();
          expect(after.positions, label).toEqual(before.positions);
          expect([...spots(o.div).keys()].sort(), label).toEqual(ids);
        }
      },
      LIMIT,
    );
});
