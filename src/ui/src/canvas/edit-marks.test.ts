// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { FitOptions, Renderer } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

// why: pass-through spy; `fits` records each camera fit call (S1: no `fit`)
const spy = vi.hoisted(() => ({ fits: [] as (FitOptions | undefined)[] }));
vi.mock("@qdic-topology/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@qdic-topology/renderer")>();
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
const { profile } = await import("@qdic-topology/contract");
const { datasets, loadFixture } = await import("@qdic-topology/fixtures");
const { spriteColours } = await import("@qdic-topology/renderer");
const { guarded, edgeStyles } = await import("./index");
const { middleCut } = await import("./labels");
const ref = await import("./edit-reference");
const { node, edge, save, spots, camera, nodeEl, datum } = ref;

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

type SceneNode = import("@qdic-topology/renderer").SceneNode;
type SceneEdge = import("@qdic-topology/renderer").SceneEdge;

afterEach(() => {
  vi.runOnlyPendingTimers();
  spy.fits = [];
  document.body.replaceChildren();
});

const catalog = () =>
  ref.open(profile, structuredClone(datasets.catalog.graph));
const children = (div: HTMLElement) =>
  new Map(
    [...div.querySelectorAll("g.qt-node")].map((g) => [
      datum<SceneNode>(g).id,
      [...g.children],
    ]),
  );
const textOf = (div: HTMLElement, id: string, cls: string) =>
  nodeEl(div, id)?.querySelector(`text.${cls}`)?.textContent;
const pill = (div: HTMLElement, key: string) =>
  [...div.querySelectorAll("g.qt-elabel")].find(
    (g) => datum<SceneEdge>(g).key === key,
  );
const pathOf = (div: HTMLElement, key: string) =>
  [...div.querySelectorAll("path.qt-edge")].find(
    (p) => datum<SceneEdge>(p).key === key,
  );
const paths = (div: HTMLElement) =>
  new Map(
    [...div.querySelectorAll("path.qt-edge")].map((p) => [
      datum<SceneEdge>(p).key,
      p,
    ]),
  );
// why: the `<symbol>` that the `use` of a node points to, with its id left out
function symbolOf(div: HTMLElement, id: string): string {
  const href = nodeEl(div, id)?.querySelector("use")?.getAttribute("href");
  const symbol = div.querySelector(`symbol[id="${(href ?? "#").slice(1)}"]`);
  const copy = symbol?.cloneNode(true) as Element;
  copy.removeAttribute("id");
  return copy.outerHTML;
}

const DIM = "e:t_DIM_CUSTOMER";
const LONG = "customer dimension table, conformed for every revenue mart";

describe("S1 a Name change patches one label", () => {
  it("changes the label (cut), keeps every other node, position, camera; one settle", async () => {
    const o = await catalog();
    expect(o.div.querySelectorAll("g.qt-node")).toHaveLength(20);
    const was = children(o.div);
    const at = spots(o.div);
    const cam = camera(o.div);
    o.clear();
    const effect = save(o, [node("t_DIM_CUSTOMER", "name", LONG)]);
    expect(effect.effect).toEqual({ drew: [], undrew: [] });
    expect(textOf(o.div, DIM, "qt-name")).toBe(middleCut(LONG));
    expect(middleCut(LONG)).not.toBe(LONG);
    for (const [id, list] of children(o.div)) {
      if (id === DIM) continue;
      expect(list, id).toHaveLength((was.get(id) as Element[]).length);
      list.forEach((child, i) => expect(child, id).toBe(was.get(id)?.[i]));
    }
    expect(spots(o.div)).toEqual(at);
    vi.advanceTimersByTime(3000);
    expect(spy.fits).toHaveLength(0);
    expect(camera(o.div)).toBe(cam);
    expect(o.log.settle).toHaveLength(1);
    expect([o.log.explore, o.log.select, o.log.notice]).toEqual([[], [], []]);
    expect(new Map(o.state().positions)).toEqual(at);
  });
});

describe("S2 a System change patches the subtitle", () => {
  it("reads Tableau · <type label>; the label and the icon stay", async () => {
    const o = await catalog();
    const name = textOf(o.div, DIM, "qt-name");
    const use = nodeEl(o.div, DIM)?.querySelector("use")?.getAttribute("href");
    const mark = symbolOf(o.div, DIM);
    save(o, [node("t_DIM_CUSTOMER", "system", "tableau")]);
    const label = o.model.vocab.types.get("table")?.label;
    expect(textOf(o.div, DIM, "qt-sub")).toBe(`Tableau · ${label}`);
    expect(textOf(o.div, DIM, "qt-name")).toBe(name);
    expect(nodeEl(o.div, DIM)?.querySelector("use")?.getAttribute("href")).toBe(
      use,
    );
    expect(symbolOf(o.div, DIM)).toBe(mark);
  });
});

describe("S3 a Kind change patches the mark and its colour", () => {
  it("takes the view look, then the custom fallback look; no position change", async () => {
    const o = await catalog();
    const id = "e:t_STG_PAYMENTS";
    const at = spots(o.div);
    const table = symbolOf(o.div, id);
    const view = save(o, [node("t_STG_PAYMENTS", "kind", "view")]);
    const d1 = datum<SceneNode>(nodeEl(o.div, id) as Element);
    expect(d1.visual).toEqual({ icon: "view" });
    expect(d1.colour).toBe(guarded(spriteColours.get("view"), o.model.canvas));
    expect(symbolOf(o.div, id)).not.toBe(table);
    expect(view.vocab.types.get("view")?.provenance).toBe("system");
    const custom = save(o, [node("t_STG_PAYMENTS", "kind", "data_contract")]);
    const type = custom.vocab.types.get("data_contract");
    expect(type?.provenance).toBe("custom");
    const d2 = datum<SceneNode>(nodeEl(o.div, id) as Element);
    expect(d2.visual).toEqual(type?.visual);
    expect(d2.colour).toBe((type?.visual as { color: string }).color);
    const fresh = await ref.open(
      profile,
      structuredClone(datasets.catalog.graph),
    );
    fresh.canvas.applyEdit(custom.graph, custom.vocab, {
      draw: [],
      undraw: [],
    });
    expect(symbolOf(o.div, id)).toBe(symbolOf(fresh.div, id));
    expect(spots(o.div)).toEqual(at);
  });
});

const STAGING = '["sc_STAGING","contains","t_STG_PAYMENTS"]';
const OLD_KEY = '["e:sc_STAGING","contains","e:t_STG_PAYMENTS"]';
const NEW_KEY = '["e:sc_STAGING","reviewedBy","e:t_STG_PAYMENTS"]';

describe("S4 a Predicate change patches the pill", () => {
  it("shows reviewedBy in the Custom colour; the old key goes; other paths stay", async () => {
    const o = await catalog();
    o.canvas.select("e:t_STG_PAYMENTS");
    vi.advanceTimersByTime(3000);
    expect(pill(o.div, OLD_KEY)?.textContent).toBe("contains");
    const was = paths(o.div);
    const done = save(o, [edge(STAGING, "predicate", "reviewedBy")]);
    vi.advanceTimersByTime(3000);
    expect(done.vocab.predicates.get("reviewedBy")?.family).toBe("Custom");
    const style = edgeStyles(done.vocab, o.model.canvas).get("reviewedBy");
    const g = pill(o.div, NEW_KEY);
    expect(g?.textContent).toBe("reviewedBy");
    expect(g?.querySelector("rect")?.getAttribute("fill")).toBe(style?.colour);
    expect(pill(o.div, OLD_KEY)).toBeUndefined();
    expect(pathOf(o.div, OLD_KEY)).toBeUndefined();
    const now = paths(o.div);
    expect(now.size).toBe(was.size);
    for (const [key, p] of now)
      if (key !== NEW_KEY) expect(p, key).toBe(was.get(key));
  });
});

const ARCHIVE = '["tbl-orders","contains","clmn-order-id"]';
const ARCHIVE_EDGE = '["e:tbl-orders","contains","e:clmn-order-id"]';

describe("S5 an isActive change switches the retired look", () => {
  it("draws the retired look and pill text, then the normal look again", async () => {
    const o = await ref.open(profile, loadFixture("q-full-vocabulary").input);
    o.canvas.select("e:clmn-order-id");
    vi.advanceTimersByTime(3000);
    const on = () =>
      pathOf(o.div, ARCHIVE_EDGE)?.classList.contains("qt-retired");
    expect(on()).toBe(false);
    save(o, [edge(ARCHIVE, { fact: "isActive" }, false)]);
    vi.advanceTimersByTime(3000);
    expect(on()).toBe(true);
    expect(pill(o.div, ARCHIVE_EDGE)?.textContent).toBe("contains (retired)");
    save(o, [edge(ARCHIVE, { fact: "isActive" }, true)]);
    vi.advanceTimersByTime(3000);
    expect(on()).toBe(false);
    expect(pill(o.div, ARCHIVE_EDGE)?.textContent).toBe("contains");
  });
});

describe("S6 two triples with the same ends draw one edge", () => {
  it("draws A p B with count 2", async () => {
    const o = await catalog();
    const key = '["e:etl_dbt_marts","dependsOn","e:t_STG_ACCOUNTS"]';
    const at = spots(o.div);
    save(o, [
      edge(
        '["etl_dbt_marts","dependsOn","t_STG_PAYMENTS"]',
        "object",
        "t_STG_ACCOUNTS",
      ),
    ]);
    const list = [...o.div.querySelectorAll("path.qt-edge")].filter(
      (p) => datum<SceneEdge>(p).key === key,
    );
    expect(list).toHaveLength(1);
    expect(datum<SceneEdge>(list[0]).count).toBe(2);
    expect(
      pathOf(o.div, '["e:etl_dbt_marts","dependsOn","e:t_STG_PAYMENTS"]'),
    ).toBeUndefined();
    expect(spots(o.div)).toEqual(at);
  });
});
