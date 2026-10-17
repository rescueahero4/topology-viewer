import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { datasets, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import { place } from "../layout/place";
import type {
  Action,
  CanvasState,
  DrawnId,
  LayoutName,
  Point,
} from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { exitAround } from "./exit";
import {
  aroundInfo,
  collapseAround,
  expandAround,
  fadeSet,
  groupAround,
} from "./focus";
import { frontier } from "./frontier";
import { onCanvas } from "./hidden";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const ROOT = "e:t_FCT_REVENUE";

function world(input: unknown, name: LayoutName) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const first = firstView(graph, vocab, payload, hash);
  const state = setLayout(first, view(first), vocab, name, METRICS);
  const act = (s: CanvasState, action: Action) => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    const kind = action.kind;
    if (kind === "explore" || kind === "expandGroup")
      return expandAround(next, change, vocab, METRICS).state;
    if (kind === "collapse" || kind === "collapseGroup")
      return collapseAround(next, change, vocab, METRICS).state;
    return place(next, change, vocab, METRICS).state;
  };
  const group = (s: CanvasState, id: DrawnId) =>
    groupAround(s, view(s), id, METRICS);
  const off = (s: CanvasState) =>
    exitAround(s, { kind: "off" }, view(s), graph, vocab, METRICS).state;
  return { graph, vocab, state, view, act, group, off };
}

const access = (name: LayoutName = "force") =>
  world(loadFixture("s-access").input, name);
const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;
const ids = (
  run: { view: (s: CanvasState) => { nodes: { id: string }[] } },
  s: CanvasState,
) => run.view(s).nodes.map((n) => n.id);
const NEAR = ["e:u_0", "e:u_7", "e:u_12", "e:ug_fin_admin", "e:ug_analytics"];

describe("S9 Group around t_FCT_REVENUE on, then off", () => {
  it.each(["force", "atomic", "bubbles"] as const)("%s", (name) => {
    const run = access(name);
    const S = run.state;
    const on = run.group(S, ROOT);
    expect(at(on, ROOT)).toEqual(at(S, ROOT));
    const typeOf = new Map(run.view(on).nodes.map((n) => [n.id, n.type]));
    const centre = (type: string | null | undefined) => {
      const list = NEAR.filter((id) => typeOf.get(id) === type).map((id) =>
        at(on, id),
      );
      const n = list.length;
      return {
        x: list.reduce((s, p) => s + p.x, 0) / n,
        y: list.reduce((s, p) => s + p.y, 0) / n,
      };
    };
    for (const id of NEAR) {
      const own = centre(typeOf.get(id));
      const other = centre(typeOf.get(id) === "user" ? "user_group" : "user");
      const d = (q: Point) =>
        Math.hypot(at(on, id).x - q.x, at(on, id).y - q.y);
      expect(d(own)).toBeLessThan(d(other));
    }
    expect(on.around?.shown).toEqual(
      ids(run, on).filter((id) => [ROOT, ...NEAR].includes(id)),
    );
    expect(fadeSet(on, run.view(on))).toEqual([
      { id: "e:ug_exec", noPointer: true },
    ]);
    expect(on.hidden).toEqual(S.hidden);
    const back = run.off(on);
    expect(back.positions).toEqual(S.positions);
    expect(back.around).toBeNull();
    expect(ids(run, back)).toEqual(ids(run, S));
    expect(back.hidden).toEqual(S.hidden);
  });
});

describe("S10 aroundInfo, onCanvas and more while grouped", () => {
  it("counts one faded entity and the faded neighbour of u_12", () => {
    const run = access();
    const on = run.group(run.state, ROOT);
    const view = run.view(on);
    const info = aroundInfo(on, view);
    expect(info).toMatchObject({ id: ROOT, type: "table" });
    expect(info?.total).toBe(view.nodes.length);
    expect((info?.total ?? 0) - (info?.shown ?? 0)).toBe(1);
    expect(onCanvas(on, run.graph, run.vocab, "ug_exec")).toBe("faded");
    expect(onCanvas(on, run.graph, run.vocab, "u_12")).toBe("drawn");
    const u12 = view.nodes.find((n) => n.id === "e:u_12");
    expect(u12?.more).toBe(4);
    const plain = run.view(run.state).nodes.find((n) => n.id === "e:u_12");
    expect(plain?.more).toBe(3);
  });
});

// why: memo item — the STORY-002-07 S6 catalog view, whose explore of t_FCT_REVENUE shifts rows
const ROOTED = {
  ...datasets.catalog.graph,
  view: { root: "t_FCT_REVENUE", reveal: ["sc_MARTS", "u_aiko", "ag_finance"] },
};

describe("S20 tree-h refuses the grouping and keeps its row shifts", () => {
  it("returns the same state, and the collapse shifts the rows back", () => {
    const run = world(ROOTED, "tree-h");
    const out = run.act(run.state, { kind: "explore", id: "t_FCT_REVENUE" });
    expect(out.treeShifts).toHaveLength(1);
    expect(run.group(out, ROOT)).toBe(out);
    const back = run.act(out, { kind: "collapse", id: "t_FCT_REVENUE" });
    expect(back.positions).toEqual(run.state.positions);
    expect(back.treeRows).toEqual(run.state.treeRows);
  });
});

describe("S21 explore a shown neighbour while grouped around ug_fin_admin", () => {
  it("brings its faded neighbour into shown with no move", () => {
    const run = access();
    const on = run.group(run.state, "e:ug_fin_admin");
    expect(fadeSet(on, run.view(on)).map((f) => f.id)).toEqual([
      "e:ug_analytics",
      "e:ug_exec",
    ]);
    const out = run.act(on, { kind: "explore", id: "t_FCT_REVENUE" });
    const shown = new Set(out.around?.shown);
    expect(shown.has("e:ug_analytics")).toBe(true);
    expect(at(out, "e:ug_analytics")).toEqual(at(on, "e:ug_analytics"));
    expect(shown.has("e:ug_exec")).toBe(false);
    const born = ids(run, out).filter((id) => !ids(run, on).includes(id));
    expect(born.length).toBeGreaterThan(0);
    for (const id of born) expect(shown.has(id)).toBe(true);
    expect(fadeSet(out, run.view(out)).map((f) => f.id)).toEqual(["e:ug_exec"]);
  });
});

describe("S24 refused groupings, the same root twice, no exit", () => {
  it("leaves the state unchanged or ends the grouping as exit 1", () => {
    const run = access();
    const S = run.state;
    const hid = run.act(S, { kind: "hide", node: "e:u_0" });
    expect(run.group(S, "e:nope")).toBe(S);
    expect(run.group(S, "e:ug_fin_read")).toBe(S);
    expect(run.group(hid, "e:u_0")).toBe(hid);
    const once = run.group(S, ROOT);
    const twice = run.group(once, ROOT);
    const exit = exitAround(
      once,
      { kind: "off" },
      run.view(once),
      run.graph,
      run.vocab,
      METRICS,
    );
    expect(twice).toEqual(exit.state);
    const none = exitAround(
      S,
      { kind: "off" },
      run.view(S),
      run.graph,
      run.vocab,
      METRICS,
    );
    expect(none).toEqual({ steps: [], state: S, placed: null });
    expect(none.state).toBe(S);
  });
});

describe("S25 a second root, then off", () => {
  it("returns every node to the positions before the first grouping", () => {
    const run = access();
    const S = run.state;
    const two = run.group(run.group(S, ROOT), "e:ug_fin_admin");
    expect(two.around?.root).toBe("e:ug_fin_admin");
    expect(two.around?.saved).toEqual(run.group(S, ROOT).around?.saved);
    expect(run.off(two).positions).toEqual(S.positions);
  });
});

describe("S29 the around JSON holds no payload text", () => {
  it("keeps seq0 across a second root and computes the label", () => {
    const input = structuredClone(loadFixture("s-access").input) as {
      nodes: { label?: string }[];
    };
    for (const node of input.nodes)
      if (typeof node.label === "string")
        node.label = `ZZ-TEXT-ZZ${node.label}`;
    const run = world(input, "force");
    const s = run.state.seq;
    const one = run.group(run.state, ROOT);
    const explored = run.act(one, { kind: "explore", id: "u_7" });
    const S = run.group(explored, "e:ug_fin_admin");
    const json = JSON.stringify(S);
    expect(json).not.toContain("ZZ-TEXT-ZZ");
    expect(Object.keys(S.around ?? {})).toEqual([
      "root",
      "saved",
      "shown",
      "events",
      "seq0",
    ]);
    expect(S.around?.events).toEqual([["e:u_7", true]]);
    expect(S.around?.seq0).toBe(s);
    expect(S.seq).toBe(s + 1);
    expect(aroundInfo(S, run.view(S))?.label?.startsWith("ZZ-TEXT-ZZ")).toBe(
      true,
    );
  });
});
