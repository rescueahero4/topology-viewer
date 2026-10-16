import { profile } from "@qdic-topology/contract";
import { datasets, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { frontier } from "./frontier";
import { hiddenList, hiddenOf, onCanvas } from "./hidden";
import { firstView, hide, transition } from "./story";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return {
    graph,
    vocab,
    first: () => firstView(graph, vocab, payload, hash),
    act: (state: CanvasState, action: Action) =>
      transition(state, action, graph, vocab),
    run: (state: CanvasState, actions: Action[]) =>
      actions.reduce(
        (next, action) => transition(next, action, graph, vocab),
        state,
      ),
    hide: (state: CanvasState, action: Parameters<typeof hide>[1]) =>
      hide(state, action, graph, vocab),
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
    on: (state: CanvasState, id: string) => onCanvas(state, graph, vocab, id),
  };
}

function graphOf(ids: string[], pairs: string[]) {
  return load({
    nodes: ids.map((id) => [id, "t"]),
    edges: pairs.map((pair) => {
      const [subject, object] = pair.split("-");
      return [subject, "p", object];
    }),
  });
}

const G1_IDS = ["H", "A", "B", "C", "A1", "B1", "C1"];
const G1 = ["H-A", "H-B", "H-C", "A-A1", "B-B1", "C-C1", "C1-H"];
const g1 = (extra: string[] = []) => graphOf(G1_IDS, [...G1, ...extra]);
const g2 = () =>
  graphOf(
    ["H", "X1", "X2", "X3", "Y", "Z"],
    ["H-X1", "H-X2", "H-X3", "H-Y", "Y-Z"],
  );

const hideOf = (id: string): Action => ({ kind: "hide", node: `e:${id}` });
const list = (state: CanvasState) =>
  hiddenList(state).map((item) => [item.key, item.stranded]);

describe("S8 G1 hide, explore and hide again", () => {
  it("lists the entries newest first and drops them when explore draws them", () => {
    const run = g1();
    // why: PRD FR-CANVAS-1 — with Grouping 2 the explore puts the leaves A and B into one group,
    // so A is not drawn as itself and a canvas hide of A does nothing
    const ungrouped = run.act(run.first(), {
      kind: "grouping",
      grouping: "off",
    });
    const hidden = run.run(ungrouped, ["A", "B", "C"].map(hideOf));
    expect(list(hidden)).toEqual([
      ["e:C", 0],
      ["e:B", 1],
      ["e:A", 1],
    ]);
    expect(hidden.hidden.map((entry) => entry.stranded)).toEqual([
      ["A1"],
      ["B1"],
      [],
    ]);
    const explored = run.act(hidden, { kind: "explore", id: "H" });
    for (const id of ["A", "B", "C"])
      expect(run.on(explored, id)).toBe("drawn");
    expect(explored.hidden).toEqual([]);
    expect(run.on(explored, "A1")).toBe("not-drawn");
    expect(run.on(explored, "B1")).toBe("not-drawn");
    expect(list(run.act(explored, hideOf("A")))).toEqual([["e:A", 0]]);
  });
});

describe("S9 G2 hide H", () => {
  it("strands X1, X2, X3 and keeps Y", () => {
    const run = g2();
    const state = run.act(run.first(), hideOf("H"));
    expect(state.hidden).toStrictEqual([
      { key: "e:H", members: ["H"], stranded: ["X1", "X2", "X3"], seq: 0 },
    ]);
    expect(run.on(state, "Y")).toBe("drawn");
    for (const id of ["H", "X1", "X2", "X3"])
      expect(run.on(state, id)).toBe("hidden");
    expect(hiddenOf(state, run.graph, "X2")).toBe("e:H");
  });
});

describe("S10 G2 restore H", () => {
  it("brings H and its strands back from Y", () => {
    const run = g2();
    const hidden = run.act(run.first(), hideOf("H"));
    const back = run.act(hidden, { kind: "restore", keys: ["e:H"] });
    for (const id of ["H", "X1", "X2", "X3"])
      expect(run.on(back, id)).toBe("drawn");
    expect(back.origins).toEqual([
      ["H", "Y"],
      ["X1", "Y"],
      ["X2", "Y"],
      ["X3", "Y"],
    ]);
    expect(hiddenList(back)).toEqual([]);
    expect(hiddenOf(back, run.graph, "H")).toBeNull();
    expect(back.scope.mode).toBe("all");
  });
});

describe("S11 restore keeps a member of another entry off", () => {
  it("restores A and leaves A1 hidden by E2", () => {
    const run = g1();
    const state = JSON.parse(
      JSON.stringify({
        ...run.first(),
        revealed: ["H", "B", "C", "B1", "C1"],
        scope: { mode: "custom", root: null, hint: null },
        hidden: [
          { key: "e:A", members: ["A"], stranded: ["A1"], seq: 0 },
          { key: "e:A1", members: ["A1"], stranded: [], seq: 0 },
        ],
      }),
    ) as CanvasState;
    const back = run.act(state, { kind: "restore", keys: ["e:A"] });
    expect(run.on(back, "A")).toBe("drawn");
    expect(run.on(back, "A1")).toBe("hidden");
    expect(back.hidden.map((entry) => entry.key)).toEqual(["e:A1"]);
    expect(back.origins).toEqual([["A", "H"]]);
  });
});

describe("S12 s-star hide the column group", () => {
  it("hides 12 entities in one entry with no strand", () => {
    const run = load(loadFixture("s-star").input);
    const state = run.first();
    const group = run
      .drawn(state)
      .nodes.find((node) => "members" in node && node.type === "column");
    expect(group && "members" in group ? group.count : 0).toBe(12);
    const result = run.hide(state, { kind: "hide", node: group?.id ?? "" });
    expect(result.hidden).toBe(12);
    expect(result.state.hidden).toHaveLength(1);
    expect(result.state.hidden[0]).toMatchObject({
      key: group?.id,
      stranded: [],
    });
    expect(result.state.hidden[0].members).toHaveLength(12);
    expect(run.on(result.state, "tag_pii")).toBe("drawn");
  });
});

describe("S13 failure paths", () => {
  it("returns a deep-equal state and throws nothing", () => {
    const run = g1();
    const state = run.first();
    const copy = structuredClone(state);
    expect(run.act(state, hideOf("nope"))).toStrictEqual(copy);
    expect(run.act(state, { kind: "hide", node: "g:[]" })).toStrictEqual(copy);
    const strands = run.act(state, hideOf("A"));
    const strandsCopy = structuredClone(strands);
    expect(run.act(strands, hideOf("A1"))).toStrictEqual(strandsCopy);
    expect(run.act(strands, { kind: "restore", keys: ["e:B"] })).toStrictEqual(
      strandsCopy,
    );
    expect(run.act(strands, { kind: "restore", keys: [] })).toStrictEqual(
      strandsCopy,
    );
    expect(run.act(state, { kind: "restore", keys: ["e:A"] })).toStrictEqual(
      copy,
    );
  });
});

describe("S14 bulk Hide of every drawn node", () => {
  it("keeps the first listed id in s-star and hides nothing in a 1-entity graph", () => {
    const run = load(loadFixture("s-star").input);
    const state = run.first();
    const ids = run.graph.entities.map((entity) => entity.id);
    expect(ids).toHaveLength(314);
    const order = ["tag_pii", ...ids.filter((id) => id !== "tag_pii")];
    const result = run.hide(state, { kind: "hideMany", ids: order });
    expect(result.hidden).toBe(313);
    expect(result.state.revealed).toEqual(["tag_pii"]);
    expect(result.state.hidden).toHaveLength(313);
    const one = load({ nodes: [["x", "t"]], edges: [] });
    const alone = one.first();
    const none = one.hide(alone, { kind: "hideMany", ids: ["x"] });
    expect(none.hidden).toBe(0);
    expect(none.state).toBe(alone);
  });
});

describe("S15 bulk Show", () => {
  it("restores hidden ids and brings undrawn ids along their path", () => {
    const run = load({
      ...datasets.catalog.graph,
      view: { approach: "passive" },
    });
    const first = run.first();
    expect(first.revealed).toHaveLength(55);
    const one = run.act(first, hideOf("sc_SALESFORCE"));
    expect(one.hidden[0].stranded).toEqual(["db_RAW", "t_SF_CONTACT"]);
    const two = run.act(one, hideOf("t_DIM_CUSTOMER"));
    expect(two.hidden[1].stranded).toEqual(["db_customers"]);
    const ids = ["sc_SALESFORCE", "t_DIM_CUSTOMER", "c_STRIPE_CHARGES.ID"];
    const shown = run.act(two, { kind: "showMany", ids });
    const back = [...ids, "db_RAW", "t_SF_CONTACT", "db_customers"];
    for (const id of [...back, "t_STRIPE_CHARGES"])
      expect(run.on(shown, id)).not.toBe("hidden");
    for (const id of [...back, "t_STRIPE_CHARGES"])
      expect(shown.revealed).toContain(id);
    expect(hiddenList(shown)).toEqual([]);
    expect(shown.origins).toEqual(
      expect.arrayContaining([
        ["t_STRIPE_CHARGES", "t_STG_PAYMENTS"],
        ["c_STRIPE_CHARGES.ID", "t_STRIPE_CHARGES"],
      ]),
    );
  });

  it("brings a target within 4 hops with its path, and one 5 hops away alone", () => {
    const chain = load({
      ...(loadFixture("s-chain").input as object),
      view: { budget: 10 },
    });
    const first = chain.first();
    expect(first.revealed).not.toContain("t13");
    const shown = chain.act(first, { kind: "showMany", ids: ["t13"] });
    for (const id of ["t10", "t11", "t12", "t13"])
      expect(shown.revealed).toContain(id);
    const ids = ["a", "b", "c", "d", "e", "f"];
    const line = graphOf(ids, ["a-b", "b-c", "c-d", "d-e", "e-f"]);
    const start: CanvasState = {
      ...line.first(),
      revealed: ["a"],
      scope: { mode: "custom", root: null, hint: null },
    };
    const far = line.act(start, { kind: "showMany", ids: ["f"] });
    expect(far.revealed).toEqual(["a", "f"]);
    expect(far.origins).toEqual([]);
  });
});

describe("S16 bulk Hide of A and B on G1", () => {
  it("gives two entries, B newest, each with its own strand", () => {
    const run = g1();
    const state = run.act(run.first(), { kind: "hideMany", ids: ["A", "B"] });
    expect(hiddenList(state).map((item) => [item.key, item.stranded])).toEqual([
      ["e:B", 1],
      ["e:A", 1],
    ]);
  });
});

describe("S17 G1 hide C", () => {
  it("does not strand C1, which still links H", () => {
    const run = g1();
    const state = run.act(run.first(), hideOf("C"));
    expect(state.hidden[0].stranded).toEqual([]);
    expect(run.on(state, "C1")).toBe("drawn");
  });
});

describe("S18 hide of the only drawn node", () => {
  it("is refused and the state does not change", () => {
    const one = load({ nodes: [["x", "t"]], edges: [] });
    const state = one.first();
    expect(one.hide(state, { kind: "hide", node: "e:x" })).toStrictEqual({
      state,
      hidden: 0,
      refused: "last-drawn",
    });
    expect(one.act(state, { kind: "hide", node: "e:x" })).toBe(state);
  });

  it("is allowed for a group, because its anchor stays drawn", () => {
    const star = graphOf(["a", "l1", "l2"], ["a-l1", "a-l2"]);
    const state = star.first();
    const group = star.drawn(state).nodes.find((node) => "members" in node);
    const result = star.hide(state, { kind: "hide", node: group?.id ?? "" });
    expect(result.hidden).toBe(2);
    expect(result.state.revealed).toEqual(["a"]);
  });
});

describe("S20 bulk Hide of two neighbours", () => {
  it("takes both off first, then strands A1 and B1 and keeps H", () => {
    const run = g1(["A-B"]);
    const state = run.act(run.first(), { kind: "hideMany", ids: ["A", "B"] });
    expect(state.hidden).toStrictEqual([
      { key: "e:A", members: ["A"], stranded: ["A1"], seq: 0 },
      { key: "e:B", members: ["B"], stranded: ["B1"], seq: 0 },
    ]);
    expect(run.on(state, "H")).toBe("drawn");
    expect(hiddenList(state)[0].key).toBe("e:B");
  });
});

describe("record ids of a merged entity (STORY-002-04 Context rule)", () => {
  it("map to the entity in hide, bulk Hide, restore, bulk Show and hiddenOf", () => {
    const run = load(loadFixture("s-access").input);
    const state = run.first();
    const one = run.act(state, { kind: "hide", node: "e:u_20" });
    expect(one.hidden.map((entry) => entry.key)).toEqual(["e:u_0"]);
    expect(hiddenOf(one, run.graph, "u_40")).toBe("e:u_0");
    expect(run.on(one, "u_60")).toBe("hidden");
    const back = run.act(one, { kind: "showMany", ids: ["u_20", "u_40"] });
    expect(run.on(back, "u_0")).toBe("drawn");
    expect(back.hidden).toEqual([]);
    const bulk = run.act(state, { kind: "hideMany", ids: ["u_20", "u_0"] });
    expect(bulk.hidden).toStrictEqual([
      { key: "e:u_0", members: ["u_0"], stranded: [], seq: 0 },
    ]);
    const restored = run.act(bulk, { kind: "restore", keys: ["e:u_0"] });
    expect(restored.revealed).toEqual(state.revealed);
  });
});
