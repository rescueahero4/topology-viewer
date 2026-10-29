// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Edit, Point } from "@qdic-topology/engine";
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
const { profile } = await import("@qdic-topology/contract");
const { datasets } = await import("@qdic-topology/fixtures");
const { endsToDraw } = await import("./index");
const ref = await import("./edit-reference");
const { node, edge, save, undo, spots, positions, drawnIds, far, keeps } = ref;

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
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  document.body.replaceChildren();
});

const catalog = () =>
  ref.open(profile, structuredClone(datasets.catalog.graph));

// why: the drawn `A p B` of S18
const MOVED = '["t_FCT_PIPELINE","derivedFrom","t_DIM_CUSTOMER"]';
const A = "e:t_FCT_PIPELINE";
const AB = '["e:t_FCT_PIPELINE","derivedFrom","e:t_DIM_CUSTOMER"]';

const GROUP = 'g:["etl_dbt_staging","dependsOn",">","etl"]';
const R0 = "db_revenue_r0";
const NAME_EDGE = '["t_STG_ACCOUNTS","contains","c_STG_ACCOUNTS.ACCOUNT_NAME"]';

type Case = {
  given: (o: Open) => void;
  change: () => Parameters<typeof save>[1];
  drew: string[];
  undrew: string[];
};

// why: S17 (b) — no drawn node of `datasets.catalog` sits next to a group of another type (every
// first view and every explore checked), so a set-up save moves the edge of a group member to
// the lone report `db_revenue_r0`, which is drawn next to `t_STG_ACCOUNTS` (rule 3)
function besideColumns(o: Open) {
  const e: Edit = {
    changes: [edge(NAME_EDGE, "object", R0)],
    effect: { drew: [], undrew: [] },
  };
  const next = ref.edited(o, [e]);
  const draw = endsToDraw(e, next.graph, (id) => o.canvas.onCanvas(id));
  expect(draw).toEqual([R0]);
  save(o, e.changes as never, draw);
  vi.advanceTimersByTime(3000);
}

const CASES: Record<string, Case> = {
  "(a) a group member leaves its group": {
    given: () => {},
    change: () => [node("etl_fivetran_sf", "kind", "view")],
    drew: ["e:etl_fivetran_sf", "e:etl_fivetran_stripe"],
    undrew: [GROUP],
  },
  "(b) a drawn node joins a group of its new type": {
    given: besideColumns,
    change: () => [node(R0, "kind", "column")],
    drew: [],
    undrew: [`e:${R0}`],
  },
  "(c) a drawn table gets a type that is off": {
    given: (o) => {
      o.canvas.setFilters({ kind: "toggleType", type: "view", on: false });
      vi.advanceTimersByTime(3000);
    },
    change: () => [node("t_STG_PAYMENTS", "kind", "view")],
    drew: [],
    undrew: ["e:t_STG_PAYMENTS"],
  },
};

// why: QA build note (a) — the spot that `place` alone gives an `undrew` id on Undo (no `draw`),
// so the test proves that the OLD position is not that spot
async function placeSpot(c: Case, id: string): Promise<Point | undefined> {
  const o = await catalog();
  c.given(o);
  save(o, c.change());
  vi.advanceTimersByTime(3000);
  const { graph, vocab } = ref.edited(o, o.edits.slice(0, -1));
  o.canvas.applyEdit(graph, vocab, { draw: [], undraw: [] });
  vi.advanceTimersByTime(3000);
  return positions(o.state()).get(id);
}

describe("S17 the canvas follows group and type changes; Undo and Redo", () => {
  for (const [name, c] of Object.entries(CASES))
    it(name, async () => {
      const o = await catalog();
      c.given(o);
      const before = o.state();
      const ids = drawnIds(o);
      o.clear();
      const done = save(o, c.change());
      expect(done.effect).toEqual({ drew: c.drew, undrew: c.undrew });
      const left = (id: string) => !c.undrew.includes(id);
      const old = positions(before);
      for (const id of c.drew)
        expect(spots(o.div).get(id)).toEqual(old.get(GROUP));
      vi.advanceTimersByTime(3000);
      const edited = o.state();
      for (const id of c.drew)
        expect(
          far(positions(edited).get(id) as Point, old.get(GROUP) as Point),
        ).toBeLessThan(150);
      keeps(before, edited, ids.filter(left));
      expect(drawnIds(o)).toEqual([...ids.filter(left), ...c.drew].sort());
      for (const id of c.undrew) expect(spots(o.div).has(id)).toBe(false);
      expect(o.log.notice).toEqual([]);
      undo(o);
      vi.advanceTimersByTime(3000);
      expect(drawnIds(o)).toEqual(ids);
      keeps(before, o.state(), ids);
      for (const id of c.undrew) {
        const spot = await placeSpot(c, id);
        expect(spot, id).toBeDefined();
        expect(spot, id).not.toEqual(old.get(id));
      }
      const redo = o.canvas.applyEdit(done.graph, done.vocab, {
        draw: [],
        undraw: [],
      });
      vi.advanceTimersByTime(3000);
      expect(redo).toEqual(done.effect);
      expect(drawnIds(o)).toEqual([...ids.filter(left), ...c.drew].sort());
      keeps(edited, o.state(), drawnIds(o));
    });
});

describe("S18 the selection follows an edited edge", () => {
  it("follows the new key, then goes to the anchor node when the edge is not drawn", async () => {
    const o = await catalog();
    o.canvas.hide(["e:db_customers"]);
    o.canvas.select(A);
    o.canvas.select(AB);
    vi.advanceTimersByTime(3000);
    expect(o.state().selection).toEqual({ edge: AB, anchor: A });
    o.clear();
    save(o, [edge(MOVED, "predicate", "reviewedBy")]);
    vi.advanceTimersByTime(3000);
    const key = '["e:t_FCT_PIPELINE","reviewedBy","e:t_DIM_CUSTOMER"]';
    expect(o.state().selection).toEqual({ edge: key, anchor: A });
    expect(o.log.select).toEqual([]);
    save(o, [edge(MOVED, "object", "db_customers")]);
    vi.advanceTimersByTime(3000);
    expect(o.canvas.onCanvas("db_customers")).toBe("hidden");
    expect(o.state().selection).toEqual({ node: A });
    expect(o.log.select).toEqual([]);
  });

  it("takes the subject as the anchor when the old anchor is not an end (engine selectEdge)", async () => {
    const o = await catalog();
    o.canvas.select("e:t_DIM_CUSTOMER");
    o.canvas.select(AB);
    vi.advanceTimersByTime(3000);
    expect(o.state().selection).toEqual({
      edge: AB,
      anchor: "e:t_DIM_CUSTOMER",
    });
    save(o, [edge(MOVED, "object", "t_STG_PAYMENTS")]);
    expect(o.state().selection).toEqual({
      edge: '["e:t_FCT_PIPELINE","derivedFrom","e:t_STG_PAYMENTS"]',
      anchor: A,
    });
  });

  it("hands a node selection to its new group, and clears it when the node leaves (D90)", async () => {
    const o = await catalog();
    besideColumns(o);
    o.canvas.select(`e:${R0}`);
    save(o, [node(R0, "kind", "column")]);
    expect(o.state().selection).toEqual({
      node: 'g:["t_STG_ACCOUNTS","contains",">","column"]',
    });
    o.canvas.setFilters({ kind: "toggleType", type: "view", on: false });
    o.canvas.select("e:t_STG_PAYMENTS");
    save(o, [node("t_STG_PAYMENTS", "kind", "view")]);
    expect(o.state().selection).toBeNull();
    expect(o.log.select.length).toBe(2);
  });
});
