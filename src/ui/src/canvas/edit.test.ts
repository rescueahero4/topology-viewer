// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Edit, Point } from "@qdic-topology/engine";
import { afterEach, describe, expect, it, vi } from "vitest";

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
const {
  edge,
  save,
  undo,
  camera,
  spots,
  positions,
  drawnIds,
  edgeKeys,
  far,
  keeps,
  moved,
} = ref;

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
// why: the drawn `A p B` of S7; the new end `X` is a table with no drawn neighbour
const MOVED = '["t_FCT_PIPELINE","derivedFrom","t_DIM_CUSTOMER"]';
const A = "e:t_FCT_PIPELINE";
const X = "t_STRIPE_CUSTOMERS";
const AX = '["e:t_FCT_PIPELINE","derivedFrom","e:t_STRIPE_CUSTOMERS"]';
const AB = '["e:t_FCT_PIPELINE","derivedFrom","e:t_DIM_CUSTOMER"]';

describe("S7 a moved edge draws its not-drawn new end", () => {
  it("draws X next to A; drew names X; no drawn node moves; settle has X", async () => {
    const o = await catalog();
    const before = o.state();
    const ids = drawnIds(o);
    const cam = camera(o.div);
    expect(o.canvas.onCanvas(X)).toBe("not-drawn");
    o.clear();
    const { draw, done } = moved(o, MOVED, "object", X);
    expect(draw).toEqual([X]);
    expect(done.effect).toEqual({ drew: [`e:${X}`], undrew: [] });
    const a = positions(before).get(A) as Point;
    expect(spots(o.div).get(`e:${X}`)).toEqual(a);
    vi.advanceTimersByTime(3000);
    const after = o.state();
    const at = positions(after).get(`e:${X}`) as Point;
    expect(spots(o.div).get(`e:${X}`)).toEqual(at);
    expect(far(at, a)).toBeGreaterThan(0);
    expect(far(at, a)).toBeLessThan(150);
    expect(after.origins).toContainEqual([X, "t_FCT_PIPELINE"]);
    keeps(before, after, ids);
    expect(drawnIds(o)).toEqual([...ids, `e:${X}`].sort());
    expect(edgeKeys(o)).toContain(AX);
    expect(edgeKeys(o)).not.toContain(AB);
    expect(camera(o.div)).toBe(cam);
    expect(o.log.settle).toHaveLength(1);
    const f = o.log.settle[0].frontier;
    expect(f.nodes.some((n) => n.id === `e:${X}`)).toBe(true);
    expect([o.log.explore, o.log.select, o.log.notice]).toEqual([[], [], []]);
    expect(o.canvas.onCanvas(X)).toBe("drawn");
  });
});

describe("S8 Undo takes X back; Redo draws it again", () => {
  it("undraws X, puts A p B back, keeps every other position; Redo places X again", async () => {
    const o = await catalog();
    const before = o.state();
    const ids = drawnIds(o);
    const { draw, done } = moved(o, MOVED, "object", X);
    vi.advanceTimersByTime(3000);
    const first = positions(o.state()).get(`e:${X}`);
    const last = undo(o);
    vi.advanceTimersByTime(3000);
    expect(o.canvas.onCanvas(X)).toBe("not-drawn");
    expect(drawnIds(o)).toEqual(ids);
    expect(edgeKeys(o)).toContain(AB);
    expect(edgeKeys(o)).not.toContain(AX);
    keeps(before, o.state(), ids);
    expect(o.state().revealed).toEqual(before.revealed);
    expect(o.state().origins).toEqual(before.origins);
    expect(positions(o.state())).toEqual(positions(before));
    o.edits.push(last);
    const redo = o.canvas.applyEdit(done.graph, done.vocab, {
      draw,
      undraw: [],
    });
    vi.advanceTimersByTime(3000);
    expect(redo.drew).toEqual([`e:${X}`]);
    expect(positions(o.state()).get(`e:${X}`)).toEqual(first);
    keeps(before, o.state(), ids);
  });
});

describe("S9 a hidden new end stays hidden", () => {
  it("gives [] and keeps Y hidden; a restore of Y draws A p Y", async () => {
    const o = await catalog();
    const Y = "db_customers";
    o.canvas.hide([`e:${Y}`]);
    vi.advanceTimersByTime(3000);
    expect(o.canvas.onCanvas(Y)).toBe("hidden");
    const ids = drawnIds(o);
    const e: Edit = {
      changes: [edge(MOVED, "object", Y)],
      effect: { drew: [], undrew: [] },
    };
    const next = ref.edited(o, [e]);
    const draw = endsToDraw(e, next.graph, (id) => o.canvas.onCanvas(id));
    expect(draw).toEqual([]);
    const done = save(o, e.changes as never, [Y]);
    expect(done.effect).toEqual({ drew: [], undrew: [] });
    expect(o.canvas.onCanvas(Y)).toBe("hidden");
    expect(drawnIds(o)).toEqual(ids);
    o.canvas.restore([`e:${Y}`]);
    vi.advanceTimersByTime(3000);
    expect(edgeKeys(o)).toContain(
      '["e:t_FCT_PIPELINE","derivedFrom","e:db_customers"]',
    );
  });
});

describe("S10 neither end drawn: nothing is drawn", () => {
  it("gives [] and keeps the frontier", async () => {
    const o = await catalog();
    const before = o.state();
    const key = '["sc_STRIPE","contains","t_STRIPE_CHARGES"]';
    const e: Edit = {
      changes: [edge(key, "object", "t_STRIPE_INVOICES")],
      effect: { drew: [], undrew: [] },
    };
    expect(o.canvas.onCanvas("sc_STRIPE")).toBe("not-drawn");
    const next = ref.edited(o, [e]);
    expect(endsToDraw(e, next.graph, (id) => o.canvas.onCanvas(id))).toEqual(
      [],
    );
    const done = save(o, e.changes as never, ["t_STRIPE_INVOICES"]);
    expect(done.effect).toEqual({ drew: [], undrew: [] });
    expect(o.state().revealed).toEqual(before.revealed);
    expect(o.state().positions).toEqual(before.positions);
  });
});

describe("S14 reduced motion shows the new end at once", () => {
  it("puts X at its final position in the first frame", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const o = await catalog();
    moved(o, MOVED, "object", X);
    const at = positions(o.state()).get(`e:${X}`);
    expect(spots(o.div).get(`e:${X}`)).toEqual(at);
    expect(o.log.settle.length).toBeGreaterThan(0);
  });
});

describe("rule 3 a new end that joins a drawn group", () => {
  it("names its own drawn id in drew, so Undo takes it off", async () => {
    const o = await catalog();
    const ids = drawnIds(o);
    const end = "c_STRIPE_CHARGES.ID";
    const group = 'g:["t_STG_ACCOUNTS","contains",">","column"]';
    const key = '["t_STG_ACCOUNTS","contains","c_STG_ACCOUNTS.ACCOUNT_ID"]';
    const e: Edit = {
      changes: [edge(key, "object", end)],
      effect: { drew: [], undrew: [] },
    };
    const next = ref.edited(o, [e]);
    const draw = endsToDraw(e, next.graph, (id) => o.canvas.onCanvas(id));
    expect(draw).toEqual([end]);
    const done = save(o, e.changes as never, draw);
    expect(done.effect).toEqual({ drew: [`e:${end}`], undrew: [] });
    expect(drawnIds(o)).toEqual(ids);
    expect(o.canvas.onCanvas(end)).toBe("drawn");
    const members = o.log.settle
      .at(-1)
      ?.frontier.nodes.find((n) => n.id === group);
    expect(members && "members" in members && members.members).toContain(end);
    undo(o);
    expect(o.canvas.onCanvas(end)).toBe("not-drawn");
    expect(drawnIds(o)).toEqual(ids);
  });
});

const R0 = "db_revenue_r0";

describe("rule 6 a new end of a type that is off is not drawn", () => {
  it("keeps the drawn set and the revealed list", async () => {
    const o = await catalog();
    o.canvas.setFilters({ kind: "toggleType", type: "report", on: false });
    vi.advanceTimersByTime(3000);
    const before = o.state();
    const done = save(o, [edge(MOVED, "object", R0)], [R0]);
    expect(done.effect.drew).toEqual([]);
    expect(o.state().revealed).toEqual(before.revealed);
    expect(o.canvas.onCanvas(R0)).toBe("not-drawn");
    expect(o.canvas.onCanvas("t_FCT_PIPELINE")).toBe("drawn");
  });
});
