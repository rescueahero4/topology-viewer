// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Edit, Point } from "#engine";
import type { FitOptions, Renderer } from "#renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Open } from "./edit-reference";

// why: pass-through spy; `fits` records each camera fit call (the group fit of the grouping)
const spy = vi.hoisted(() => ({ fits: [] as (FitOptions | undefined)[] }));
vi.mock("#renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("#renderer")>();
  return {
    ...mod,
    createRenderer: (...args: Parameters<typeof mod.createRenderer>) => {
      const r = mod.createRenderer(...args);
      return {
        ...r,
        fit: (options) => {
          spy.fits.push(options);
          r.fit(options);
        },
      } satisfies Renderer;
    },
  };
});

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
const engine = await import("#engine");
const { profile } = await import("#contract");
const { loadFixture } = await import("#fixtures");
const { endsToDraw } = await import("./index");
const ref = await import("./edit-reference");
const { node, edge, save, spots, nodeEl, positions } = ref;

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
  spy.fits = [];
  document.body.replaceChildren();
});

// why: `around.test.ts` S1 — on the `s-access` first view the grouping around the root fades
// `e:ug_exec`
const ROOT = "e:t_FCT_REVENUE";
const FADED = "e:ug_exec";

async function grouped(motion: boolean): Promise<Open> {
  const o = await ref.open(profile, loadFixture("s-access").input);
  o.canvas.groupAroundRoot(true);
  if (!motion) vi.advanceTimersByTime(3000);
  return o;
}
const nameOf = (o: Open, id: string) =>
  nodeEl(o.div, id)?.querySelector("text.qt-name")?.textContent;
const faded = (o: Open, id: string) =>
  nodeEl(o.div, id)?.classList.contains("qt-off");
const info = (o: Open) => {
  const { state, frontier } = o.log.settle[o.log.settle.length - 1];
  return engine.aroundInfo(state, frontier);
};

describe("S12 an edit during the grouping motion waits for its end", () => {
  it("changes the label when the motion ends; the grouping and its pill stay", async () => {
    const o = await grouped(true);
    o.clear();
    const was = nameOf(o, "e:u_0");
    const done = save(o, [node("u_0", "name", "renamed user")]);
    expect(done.effect).toEqual({ drew: [], undrew: [] });
    expect(nameOf(o, "e:u_0")).toBe(was);
    expect(o.log.settle).toEqual([]);
    expect(spy.fits).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(nameOf(o, "e:u_0")).toBe(was);
    vi.advanceTimersByTime(3000);
    expect(nameOf(o, "e:u_0")).toBe("renamed user");
    expect(o.state().around?.root).toBe(ROOT);
    expect(info(o)?.id).toBe(ROOT);
    expect(spy.fits).toHaveLength(1);
    expect(o.log.settle.length).toBeGreaterThan(0);
    expect([o.log.explore, o.log.select, o.log.notice]).toEqual([[], [], []]);
    expect(faded(o, FADED)).toBe(true);
  });

  it("keeps the last of two waiting edits and draws both names", async () => {
    const o = await grouped(true);
    save(o, [node("u_0", "name", "first")]);
    save(o, [node("u_7", "name", "second")]);
    vi.advanceTimersByTime(3000);
    expect([nameOf(o, "e:u_0"), nameOf(o, "e:u_7")]).toEqual([
      "first",
      "second",
    ]);
    expect(o.state().around?.root).toBe(ROOT);
  });
});

describe("S13 a Name change of a faded node after the motion", () => {
  it("changes the label; the node stays faded; no position changes", async () => {
    const o = await grouped(false);
    const at = spots(o.div);
    const before = o.state();
    save(o, [node("ug_exec", "name", "Executives (renamed)")]);
    expect(nameOf(o, FADED)).toBe("Executives (renamed)");
    expect(faded(o, FADED)).toBe(true);
    expect(o.canvas.onCanvas("ug_exec")).toBe("faded");
    expect(spots(o.div)).toEqual(at);
    expect(o.state().positions).toEqual(before.positions);
    expect(o.state().around).toEqual(before.around);
  });
});

describe("S19 a new end is drawn next to its faded other end", () => {
  it("draws X next to B; C keeps its state; nothing else moves; the grouping stays", async () => {
    const o = await grouped(false);
    const before = o.state();
    const ids = [...spots(o.div).keys()];
    const X = "t_FCT_PIPELINE";
    const C = "ag_exec";
    expect([o.canvas.onCanvas("ug_exec"), o.canvas.onCanvas(C)]).toEqual([
      "faded",
      "not-drawn",
    ]);
    expect(o.canvas.onCanvas(X)).toBe("not-drawn");
    const e: Edit = {
      changes: [edge('["ug_exec","permissionedTo","ag_exec"]', "object", X)],
      effect: { drew: [], undrew: [] },
    };
    const next = ref.edited(o, [e]);
    const draw = endsToDraw(e, next.graph, (id) => o.canvas.onCanvas(id));
    expect(draw).toEqual([X]);
    const done = save(o, e.changes as never, draw);
    vi.advanceTimersByTime(3000);
    expect(done.effect.drew).toEqual([`e:${X}`]);
    const was = positions(before);
    const now = positions(o.state());
    for (const id of ids) expect(now.get(id), id).toEqual(was.get(id));
    const at = now.get(`e:${X}`) as Point;
    const b = was.get(FADED) as Point;
    expect(Math.hypot(at.x - b.x, at.y - b.y)).toBeLessThan(150);
    expect(o.state().origins).toContainEqual([X, "ug_exec"]);
    expect(o.canvas.onCanvas(C)).toBe("not-drawn");
    expect(o.state().around?.root).toBe(ROOT);
  });
});
