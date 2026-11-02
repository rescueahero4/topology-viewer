import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type { Action, CanvasState } from "../state/canvasState";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { drawnIdOf, frontier, type GroupNode } from "./frontier";
import { onCanvas } from "./hidden";
import { firstView, transition } from "./story";

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
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
  };
}

const groups = (nodes: { id: string }[]) =>
  nodes.filter((node): node is GroupNode => "members" in node);

type Edge = [string, string, string];

function graphOf(nodes: [string, string?][], edges: Edge[]) {
  return {
    nodes: nodes.map(([id, type]) => (type ? { id, type } : { id })),
    edges: edges.map(([subject, predicate, object]) => ({
      subject,
      predicate,
      object,
    })),
    view: { budget: "all" },
  };
}

describe("S11, S12 s-star", () => {
  const run = load(loadFixture("s-star").input);
  const first = run.first();

  it("S11 draws 4 nodes with groups of 300 and 12", () => {
    const { nodes } = run.drawn(first);
    expect(nodes).toHaveLength(4);
    expect(nodes.map((node) => node.id).slice(0, 2)).toEqual([
      "e:tag_pii",
      "e:tg_class",
    ]);
    expect(groups(nodes).map((node) => node.count)).toEqual([300, 12]);
    expect(first.selection).toEqual({ node: "e:tag_pii" });
  });

  it("S12 Grouping 5 and 10 keep the 2 groups; Off draws 314", () => {
    const ids = groups(run.drawn(first).nodes).map((node) => node.id);
    for (const grouping of [5, 10] as const)
      expect(
        groups(run.drawn({ ...first, grouping }).nodes).map((node) => node.id),
      ).toEqual(ids);
    expect(run.drawn({ ...first, grouping: "off" }).nodes).toHaveLength(314);
  });

  it("S16 expand then collapse the table group", () => {
    const table = groups(run.drawn(first).nodes)[0];
    const open = run.act(first, { kind: "expandGroup", group: table.id });
    expect(run.drawn(open).nodes).toHaveLength(303);
    const back = run.act(open, { kind: "collapseGroup", group: table.id });
    expect(run.drawn(back).nodes).toHaveLength(4);
    expect(run.drawn(back)).toStrictEqual(run.drawn(first));
  });

  it("S19 path to a member of a collapsed group opens the group", () => {
    const table = groups(run.drawn(first).nodes)[0];
    const member = table.members[7];
    const next = run.act(first, { kind: "path", id: member });
    expect(next.expandedGroups).toEqual([table.id.slice(2)]);
    expect(drawnIdOf(next, run.graph, run.vocab, member)).toBe(`e:${member}`);
  });

  it("S24 a selected member goes to its group; a dropped node to null", () => {
    const table = groups(run.drawn(first).nodes)[0];
    const open = run.act(first, { kind: "expandGroup", group: table.id });
    const picked = run.act(open, { kind: "select", entity: table.members[0] });
    expect(picked.selection).toEqual({ node: `e:${table.members[0]}` });
    const shut = run.act(picked, { kind: "collapseGroup", group: table.id });
    expect(shut.selection).toEqual({ node: table.id });
    const root = load(loadFixture("s-root-only").input);
    const wide = root.act(root.first(), {
      kind: "explore",
      id: "t_FCT_REVENUE",
    });
    const alone = root
      .drawn(wide)
      .nodes.find(
        (node) => "entity" in node && node.entity !== "t_FCT_REVENUE",
      );
    const newcomer = alone && "entity" in alone ? alone.entity : "";
    const chosen = root.act(wide, { kind: "select", entity: newcomer });
    expect(chosen.selection).toEqual({ node: `e:${newcomer}` });
    const gone = root.act(chosen, { kind: "collapse", id: "t_FCT_REVENUE" });
    expect(gone.selection).toBeNull();
  });
});

describe("S13 bucket boundaries at Grouping 2", () => {
  it("groups by anchor, predicate, direction and type", () => {
    const run = load(
      graphOf(
        [
          ["a", "t0"],
          ["x1", "t1"],
          ["b", "t0"],
          ["c", "t0"],
          ["h", "t0"],
        ],
        [
          ["a", "p", "x1"],
          ["a", "r", "b"],
          ["b", "r", "c"],
          ["a", "r", "h"],
        ],
      ),
    );
    expect(groups(run.drawn(run.first()).nodes)).toEqual([]);
    const pairs = load(
      graphOf(
        [
          ["a", "t0"],
          ["y1", "t1"],
          ["y2", "t1"],
          ["m1", "t1"],
          ["m2", "t1"],
          ["d1", "t1"],
          ["d2", "t1"],
          ["v1", "t2"],
          ["v2", "t2"],
        ],
        [
          ["a", "p", "y1"],
          ["a", "p", "y2"],
          ["a", "q", "m1"],
          ["a", "q", "m2"],
          ["d1", "p", "a"],
          ["d2", "p", "a"],
          ["a", "p", "v1"],
          ["a", "p", "v2"],
        ],
      ),
    );
    expect(
      groups(pairs.drawn(pairs.first()).nodes).map((node) => [
        node.id,
        node.members,
      ]),
    ).toEqual([
      ['g:["a","p",">","t1"]', ["y1", "y2"]],
      ['g:["a","q",">","t1"]', ["m1", "m2"]],
      ['g:["a","p","<","t1"]', ["d1", "d2"]],
      ['g:["a","p",">","t2"]', ["v1", "v2"]],
    ]);
  });
});

describe("S26 model ids that look like drawn ids", () => {
  it("keep every drawn id distinct", () => {
    const fake = 'g:["a","p",">","t"]';
    const run = load(
      graphOf(
        [
          ["a", "t0"],
          ["x1", "t"],
          ["x2", "t"],
          ["grp:x", "t0"],
          [fake, "t0"],
        ],
        [
          ["a", "p", "x1"],
          ["a", "p", "x2"],
          ["a", "q", "grp:x"],
          ["a", "r", fake],
        ],
      ),
    );
    const state = run.first();
    const ids = run.drawn(state).nodes.map((node) => node.id);
    expect(ids).toEqual(["e:a", fake, "e:grp:x", `e:${fake}`]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(onCanvas(state, run.graph, run.vocab, "grp:x")).toBe("drawn");
    expect(drawnIdOf(state, run.graph, run.vocab, "grp:x")).toBe("e:grp:x");
    expect(drawnIdOf(state, run.graph, run.vocab, fake)).toBe(`e:${fake}`);
  });
});

describe("S36 undeclared and missing types", () => {
  it("gives one group per type name and one for no type", () => {
    const run = load(
      graphOf(
        [
          ["a", "t0"],
          ["x1", "widget"],
          ["x2", "widget"],
          ["y1", "gadget"],
          ["y2", "gadget"],
          ["z1"],
          ["z2"],
        ],
        ["x1", "x2", "y1", "y2", "z1", "z2"].map((id): Edge => ["a", "p", id]),
      ),
    );
    const found = groups(run.drawn(run.first()).nodes);
    expect(found.map((node) => [node.id, node.count, node.type])).toEqual([
      ['g:["a","p",">","widget"]', 2, "widget"],
      ['g:["a","p",">","gadget"]', 2, "gadget"],
      ['g:["a","p",">",null]', 2, null],
    ]);
  });
});
