import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { IconMetrics } from "../layout/drawn";
import { setLayout } from "../layout/layout";
import { place } from "../layout/place";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { exitAround, type AroundExit, type ExitResult } from "./exit";
import { expandAround, groupAround } from "./focus";
import { frontier } from "./frontier";
import { firstView, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const ROOT = "e:t_FCT_REVENUE";

function load(key: string) {
  const result = normalize(loadFixture(key).input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return { graph, payload, hash, vocab };
}

const A = load("s-access");
const view = (s: CanvasState) => frontier(s, A.graph, A.vocab);
const first = firstView(A.graph, A.vocab, A.payload, A.hash);
const START = setLayout(first, view(first), A.vocab, "force", METRICS);
const act = (s: CanvasState, action: Action) => {
  const next = transition(s, action, A.graph, A.vocab);
  const change = { action, before: view(s), after: view(next) };
  return place(next, change, A.vocab, METRICS).state;
};
const group = (s: CanvasState, id = ROOT) =>
  groupAround(s, view(s), id, METRICS);
const exit = (s: CanvasState, a: AroundExit) =>
  exitAround(s, a, view(s), A.graph, A.vocab, METRICS);
const drawn = (s: CanvasState) => view(s).nodes.map((n) => n.id);

// why: the Given of each row and its exit; `before` is the state before the grouping
const ROWS: Record<string, () => { before: CanvasState; r: ExitResult }> = {
  S11: () => ({ before: START, r: exit(group(START), { kind: "off" }) }),
  S12: () => {
    const before = act(START, { kind: "select", node: ROOT });
    return { before, r: exit(group(before), { kind: "off" }) };
  },
  S12b: () => ({
    before: START,
    r: exit(group(START), { kind: "focus", id: "e:ug_exec" }),
  }),
  S13: () => ({
    before: START,
    r: exit(group(START), {
      kind: "action",
      action: { kind: "toggleType", type: "user", on: false },
    }),
  }),
  S13b: () => {
    const before = act(START, { kind: "toggleType", type: "user", on: false });
    const action: Action = { kind: "showAllTypes" };
    return { before, r: exit(group(before), { kind: "action", action }) };
  },
  S13c: () => ({
    before: START,
    r: exit(group(START), {
      kind: "action",
      action: { kind: "grouping", grouping: 5 },
    }),
  }),
  S14: () => {
    const before = act(START, { kind: "hide", node: "e:u_7" });
    const action: Action = { kind: "restore", keys: ["e:u_7"] };
    return { before, r: exit(group(before), { kind: "action", action }) };
  },
  S15: () => ({
    before: START,
    r: exit(group(START), {
      kind: "action",
      action: { kind: "showMany", ids: ["u_2", "u_3"] },
    }),
  }),
  S16: () => ({
    before: START,
    r: exit(group(START), {
      kind: "action",
      action: { kind: "hide", node: ROOT },
    }),
  }),
  S17: () => {
    const before = act(START, { kind: "explore", id: "ug_fin_admin" });
    const S = group(before, "e:t_FCT_PIPELINE");
    const action: Action = { kind: "collapse", id: "ug_fin_admin" };
    return { before, r: exit(S, { kind: "action", action }) };
  },
  S18: () => ({
    before: START,
    r: exit(group(START), { kind: "layout", name: "force" }),
  }),
  S18b: () => ({
    before: START,
    r: exit(group(START), { kind: "layout", name: "atomic" }),
  }),
  S18c: () => {
    const L = load("s-lineage");
    const data: AroundExit = { kind: "data", ...L };
    return { before: START, r: exit(group(START), data) };
  },
};

function homeFirst(row: string) {
  const { before, r } = ROWS[row]();
  expect(r.steps[0].positions).toEqual(before.positions);
  expect(r.steps[0].around).toBeNull();
  expect(r.state).toBe(r.steps[r.steps.length - 1]);
  return { before, r };
}

describe("S11-S12b exits 1, 2 and 3", () => {
  it("S11 the toggle gives [home]", () => {
    const { r } = homeFirst("S11");
    expect(r.steps).toHaveLength(1);
  });
  it("S12 the pill keeps the selection", () => {
    const { before, r } = homeFirst("S12");
    expect(r.steps).toHaveLength(1);
    expect(r.state.selection).toEqual(before.selection);
    expect(r.state.selection).toEqual({ node: ROOT });
  });
  it("S12b focus on ug_exec selects it after the glide home", () => {
    const { r } = homeFirst("S12b");
    expect(r.steps).toHaveLength(2);
    expect(r.steps[1].selection).toEqual({ node: "e:ug_exec" });
    expect(r.steps[1].positions).toEqual(r.state.positions);
  });
});

describe("S13-S17 exits 4 to 10", () => {
  // why: SA §6 row 10 — the effect applies to `home`, which is the state before the grouping, so
  // it equals the same action on that state
  const same = (row: string, action: Action) => {
    const { before, r } = homeFirst(row);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[1]).toEqual(act(before, action));
    return r;
  };
  it("S13 type user off", () => {
    const r = same("S13", { kind: "toggleType", type: "user", on: false });
    expect(view(r.steps[1]).nodes.some((n) => n.type === "user")).toBe(false);
  });
  it("S13b Show all types", () => {
    const r = same("S13b", { kind: "showAllTypes" });
    for (const id of ["e:u_0", "e:u_7", "e:u_12"]) {
      expect(drawn(r.steps[1])).toContain(id);
      expect(new Map(r.steps[1].positions).has(id)).toBe(true);
    }
  });
  it("S13c Grouping 2 to 5", () => {
    const r = same("S13c", { kind: "grouping", grouping: 5 });
    const groups = (s: CanvasState) =>
      view(s).nodes.filter((n) => "members" in n);
    const want = groups(
      transition(START, { kind: "grouping", grouping: 5 }, A.graph, A.vocab),
    );
    expect(groups(r.steps[1])).toEqual(want);
    expect(want).toEqual([]);
  });
  it("S14 restore from Hidden", () => {
    const r = same("S14", { kind: "restore", keys: ["e:u_7"] });
    expect(r.steps[0].hidden.map((e) => e.key)).toEqual(["e:u_7"]);
    expect(r.steps[1].hidden).toEqual([]);
  });
  it("S15 bulk Show of u_2, u_3", () => {
    const r = same("S15", { kind: "showMany", ids: ["u_2", "u_3"] });
    expect(drawn(r.steps[1])).toEqual(
      expect.arrayContaining(["e:u_2", "e:u_3"]),
    );
  });
  it("S16 hide the root", () => {
    const r = same("S16", { kind: "hide", node: ROOT });
    expect(r.steps[1].hidden).toEqual([
      { key: ROOT, members: ["t_FCT_REVENUE"], stranded: [], seq: START.seq },
    ]);
    expect(drawn(r.steps[1])).not.toContain(ROOT);
  });
  it("S17 collapse the origin of the root", () => {
    const { before, r } = homeFirst("S17");
    const gone = drawn(before).filter((id) => !drawn(START).includes(id));
    expect(gone).toContain("e:t_FCT_PIPELINE");
    expect(r.steps[1]).toEqual(
      act(before, { kind: "collapse", id: "ug_fin_admin" }),
    );
    for (const id of gone) expect(drawn(r.steps[1])).not.toContain(id);
    expect(r.steps[1].hidden).toEqual(before.hidden);
    const spot = new Map(r.steps[0].positions).get("e:ug_fin_admin");
    expect(r.placed?.retractTo).toEqual(gone.map((id) => [id, spot]));
  });
});

describe("S18-S18c exits 11 and 12 in place", () => {
  it.each(["force", "atomic"] as const)("S18 a layout request %s", (name) => {
    const S = group(START);
    const r = exit(S, { kind: "layout", name });
    const s = { ...S, around: null };
    expect(r.steps).toEqual([setLayout(s, view(s), A.vocab, name, METRICS)]);
    expect(r.state.around).toBeNull();
    expect(r.state).toBe(r.steps[0]);
  });
  it("S18c new data s-lineage", () => {
    const { r } = ROWS.S18c();
    const L = load("s-lineage");
    const f = firstView(L.graph, L.vocab, L.payload, L.hash);
    const want = setLayout(
      f,
      frontier(f, L.graph, L.vocab),
      L.vocab,
      "force",
      METRICS,
    );
    expect(r.steps).toEqual([want]);
    expect(r.state.around).toBeNull();
  });
});

describe("S27 the last step is the state; placed by exit", () => {
  it.each(Object.keys(ROWS))("%s", (row) => {
    const { r } = ROWS[row]();
    expect(r.steps[r.steps.length - 1].positions).toEqual(r.state.positions);
    if (["S11", "S12", "S12b", "S18", "S18b", "S18c"].includes(row))
      expect(r.placed).toBeNull();
    else
      expect(Object.keys(r.placed ?? {})).toEqual([
        "starts",
        "retractTo",
        "crowded",
      ]);
  });
});

describe("S42 an explore that puts the root into a group node is exit 10 (D100 (a))", () => {
  it.each(["force", "atomic", "bubbles"] as const)("%s", (name) => {
    const before = setLayout(first, view(first), A.vocab, name, METRICS);
    const S = group(before, "e:ug_exec");
    const action: Action = { kind: "explore", id: "u_12" };
    const r = exit(S, { kind: "action", action });
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].positions).toEqual(before.positions);
    expect(r.steps[0].around).toBeNull();
    expect(r.steps[1]).toEqual(act(before, action));
    expect(r.state).toBe(r.steps[1]);
    expect(drawn(r.state)).not.toContain("e:ug_exec");
    expect(drawn(r.state)).toContain('g:["u_12","memberOf",">","user_group"]');
    const next = transition(S, action, A.graph, A.vocab);
    const change = { action, before: view(S), after: view(next) };
    expect(() => expandAround(next, change, A.vocab, METRICS)).toThrow(
      "exitAround",
    );
  });
});
